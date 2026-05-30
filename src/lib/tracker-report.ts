/**
 * Day 8.5 hotfix v2: 출력 텍스트 역추적 결과 → 독립 MD 리포트
 *
 * 사용자 의견 반영:
 *   "검색 결과는 비교 MD 와 합치지 말고 항상 별도 문서로 저장.
 *    AI 분석 시 맥락이 섞이지 않아야 한다."
 *
 * 비교 MD (md-serializer.ts) 와 완전 분리된 독립 문서:
 *   - YAML frontmatter (kind: tracker)
 *   - 검색 메타 (검색어/루트/옵션/결과 수/skip 수)
 *   - 결과 위치 목록 + vscode:// 점프 링크
 *   - skip 된 파일 목록 (비치명적 액세스 실패)
 *   - AI 활용 프롬프트 예시 (텍스트 추적 전용)
 *   - Machine-readable JSON 블록
 */

import type { EditorConfig } from './editor-url'
import { buildEditorUrl } from './editor-url'
import { sanitizeFilename } from './sanitize-filename'

export const TRACKER_SCHEMA_VERSION = 1

export interface TrackerHit {
  path: string
  relpath: string
  line: number
  column: number
  text: string
}

export interface TrackerSkipped {
  path: string
  reason: string
}

export interface TrackerReportInput {
  query: string
  root: string
  optionsLabel: string
  hits: TrackerHit[]
  skipped: TrackerSkipped[]
  truncated: boolean
  durationMs: number | null
  generatedAt: Date
  editor: EditorConfig
  appVersion: string
}

export function generateTrackerReport(input: TrackerReportInput): string {
  const sections = [
    renderFrontmatter(input),
    renderTitle(input),
    renderSummary(input),
    renderHits(input),
    renderSkipped(input),
    renderAiGuide(input),
    renderMachineData(input),
  ]
  return sections.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * 추천 파일명: tracker-YYYY-MM-DD_HHmm_<query>.md
 */
export function suggestTrackerFilename(input: TrackerReportInput): string {
  const d = input.generatedAt
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
  // query 의 줄바꿈/특수문자 제거 + 너무 길면 자름
  const safeQuery = input.query.replace(/[\r\n\t]+/g, ' ').trim().substring(0, 40)
  return sanitizeFilename(`tracker-${dateStr}_${safeQuery}.md`)
}

// ============================================================
// 섹션 렌더러
// ============================================================

function renderFrontmatter(input: TrackerReportInput): string {
  const lines = [
    '---',
    'tool: TextDiff Studio',
    `tool_version: ${input.appVersion}`,
    'kind: tracker',
    `schema_version: ${TRACKER_SCHEMA_VERSION}`,
    `generated_at: ${formatIso8601(input.generatedAt)}`,
    `editor_protocol: ${input.editor.scheme}`,
    '',
    'search:',
    `  query: ${yamlString(input.query)}`,
    `  root: ${yamlString(input.root)}`,
    `  options: ${yamlString(input.optionsLabel)}`,
    `  hit_count: ${input.hits.length}`,
    `  skipped_count: ${input.skipped.length}`,
    `  truncated: ${input.truncated}`,
    `  duration_ms: ${input.durationMs ?? 0}`,
    '---',
  ]
  return lines.join('\n')
}

function renderTitle(input: TrackerReportInput): string {
  return [
    `# 텍스트 추적 리포트 — "${input.query}"`,
    '',
    `> **생성**: ${formatHumanDate(input.generatedAt)}`,
    `> **도구**: TextDiff Studio v${input.appVersion}`,
    `> **편집기 프로토콜**: \`${input.editor.scheme}://\``,
  ].join('\n')
}

function renderSummary(input: TrackerReportInput): string {
  const lines = [
    '## 📋 검색 요약',
    '',
    `- **검색어**: \`${input.query}\``,
    `- **루트**: \`${input.root}\``,
    `- **옵션**: ${input.optionsLabel}`,
    `- **결과**: **${input.hits.length}개 위치**${input.truncated ? ' (상한 도달 — 더 좁혀서 다시 검색 권장)' : ''}`,
  ]
  if (input.skipped.length > 0) {
    lines.push(`- **Skip된 파일**: ${input.skipped.length}개 (잠긴 파일/권한 없음 등)`)
  }
  if (input.durationMs !== null) {
    lines.push(`- **소요 시간**: ${input.durationMs}ms`)
  }
  return lines.join('\n')
}

function renderHits(input: TrackerReportInput): string {
  if (input.hits.length === 0) {
    return [
      '## 🔍 결과',
      '',
      `결과 없음.${input.skipped.length > 0 ? ' (skip된 파일에는 매치가 있었을 수 있음)' : ''}`,
    ].join('\n')
  }

  // 파일별 그룹핑 (같은 파일 여러 라인 매치 깔끔하게)
  const byFile = new Map<string, TrackerHit[]>()
  for (const h of input.hits) {
    const key = h.relpath
    const arr = byFile.get(key) ?? []
    arr.push(h)
    byFile.set(key, arr)
  }

  const out: string[] = ['## 🔍 결과 — 파일별 그룹']
  out.push('')
  out.push('> 각 항목의 `[Lxx]` 링크 클릭 시 외부 에디터로 점프.')
  out.push('')

  for (const [relpath, hits] of byFile) {
    out.push(`### \`${relpath}\` — ${hits.length}곳`)
    out.push('')
    for (const h of hits) {
      const url = buildEditorUrl(h.path, h.line, input.editor)
      const safeText = h.text.replace(/\r?\n/g, ' ').substring(0, 200)
      out.push(`- [L${h.line}:${h.column}](${url}) — ${safeText}`)
    }
    out.push('')
  }

  return out.join('\n').trimEnd()
}

function renderSkipped(input: TrackerReportInput): string {
  if (input.skipped.length === 0) return ''
  const out: string[] = ['## ⚠ Skip된 파일']
  out.push('')
  out.push('> 다음 파일은 잠겨있거나 권한이 없어 검색하지 못함. 결과에 누락되었을 수 있음.')
  out.push('')
  out.push('| 파일 | 이유 |')
  out.push('|------|------|')
  for (const s of input.skipped) {
    const safePath = (s.path || '(경로 없음)').replace(/\|/g, '\\|')
    const safeReason = s.reason.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
    out.push(`| \`${safePath}\` | ${safeReason} |`)
  }
  return out.join('\n')
}

function renderAiGuide(input: TrackerReportInput): string {
  return [
    '## 🤖 AI 활용 가이드 (텍스트 추적)',
    '',
    '이 문서는 **사람과 AI 모두** 읽을 수 있도록 설계된 텍스트 추적 결과입니다.',
    '비교 리포트와 별개의 독립 문서 — AI 에게 검색 결과만 보여줄 때 맥락 오염 없음.',
    '',
    '### 활용 가능한 프롬프트 예시',
    '',
    `1. **UI 텍스트의 출처 분석**:`,
    `   > "위 \`"${input.query}"\` 가 사용된 ${input.hits.length}개 위치를 분석해 줘. UI 라벨인지, i18n 키인지, 주석인지 분류해 줘."`,
    '',
    '2. **중복 제거 제안**:',
    `   > "같은 텍스트가 여러 파일에 하드코딩되어 있다면, i18n 으로 추출할 후보를 제안해 줘."`,
    '',
    '3. **참조 그래프 작성**:',
    `   > "각 위치의 함수/컴포넌트 이름을 추출해서 '이 텍스트가 어떤 화면에서 보이는지' 트리로 그려 줘."`,
    '',
    '4. **테스트 케이스 제안**:',
    `   > "이 텍스트가 표시되는 사용자 시나리오를 추정하고 e2e 테스트 케이스 작성해 줘."`,
    '',
    '5. **변경 영향 분석**:',
    `   > "이 텍스트를 다른 표현으로 바꿀 경우 영향받는 파일 목록과 변경 작업의 위험도를 평가해 줘."`,
    '',
    '### 점프 링크',
    '',
    `- 각 결과의 \`[Lxx]\` 링크는 \`${input.editor.scheme}://\` 프로토콜.`,
    '- Obsidian / VS Code 마크다운 프리뷰 / 브라우저에서 클릭 가능.',
    '',
    '### 호환성',
    '',
    `- frontmatter 의 \`kind: tracker\` + \`schema_version: ${TRACKER_SCHEMA_VERSION}\` 로 향후 호환성 보장.`,
    '- 비교 리포트 (`kind` 없음 또는 다른 값) 와 구분됨.',
  ].join('\n')
}

function renderMachineData(input: TrackerReportInput): string {
  const payload = {
    schema_version: TRACKER_SCHEMA_VERSION,
    kind: 'tracker',
    generated_at: formatIso8601(input.generatedAt),
    search: {
      query: input.query,
      root: input.root,
      options: input.optionsLabel,
      truncated: input.truncated,
      duration_ms: input.durationMs ?? 0,
    },
    hits: input.hits.map((h) => ({
      relpath: h.relpath,
      path: h.path,
      line: h.line,
      column: h.column,
      text: h.text,
    })),
    skipped: input.skipped.map((s) => ({ path: s.path, reason: s.reason })),
  }
  return [
    '## 📦 Machine-Readable Data',
    '',
    '> AI 가 정확하게 파싱할 수 있는 구조화 데이터.',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
}

// ============================================================
// 유틸 (md-serializer.ts 와 동일 — 중복 허용. 향후 공통 모듈로 추출 가능)
// ============================================================

function formatIso8601(d: Date): string {
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const tzAbs = Math.abs(tz)
  const tzh = String(Math.floor(tzAbs / 60)).padStart(2, '0')
  const tzm = String(tzAbs % 60).padStart(2, '0')
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${tzh}:${tzm}`
  )
}

function formatHumanDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function yamlString(s: string): string {
  if (s === '') return '""'
  if (/[:#&*?!|>'"%@`{}\[\]]/.test(s) || /^\s|\s$/.test(s)) {
    const escaped = s.replace(/"/g, '\\"')
    return `"${escaped}"`
  }
  return s
}
