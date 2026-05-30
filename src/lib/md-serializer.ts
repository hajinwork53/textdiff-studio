/**
 * Diff 결과 → 풍부한 MD 리포트 직렬화
 *
 * 사람용 + AI 용 양쪽 만족:
 *  - YAML frontmatter (스키마 v1)
 *  - 기호/숫자 의미 사전
 *  - 변경별 전후 컨텍스트
 *  - AI 활용 프롬프트 예시
 *  - Machine-readable JSON 블록
 *
 * 출처: 13 Day4 RSD FR-1
 */

import type { DiffChange, DiffStats } from './diff-changes'
import { buildEditorUrl, type EditorConfig } from './editor-url'
import { sanitizeFilename, basenameWithoutExt } from './sanitize-filename'
import { isRealFilePath } from './slot-source'

export const MD_SCHEMA_VERSION = 1

export interface MdReportFile {
  path: string
  name: string
  encoding: string
  lineCount: number
  size: number
  sizeDisplay: string
}

export interface MdReportInput {
  fileA: MdReportFile
  fileB: MdReportFile
  /** A 의 원본 텍스트 — 컨텍스트 추출용 */
  fileAContent: string
  /** B 의 변경본 텍스트 */
  fileBContent: string
  changes: DiffChange[]
  stats: DiffStats
  generatedAt: Date
  editor: EditorConfig
  appVersion: string
}

const CONTEXT_LINES = 2
const MAX_CONTENT_LINES_PER_CHANGE = 30

// ============================================================
// 공개 API
// ============================================================

export function generateMdReport(input: MdReportInput): string {
  const sections = [
    renderFrontmatter(input),
    renderTitle(input),
    renderFileInfo(input),
    renderStats(input),
    renderLegend(),
    renderChangeList(input),
    renderAiGuide(input),
    renderMachineData(input),
  ]
  return sections.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * 추천 파일명: diff-YYYY-MM-DD_basenameA_vs_basenameB.md
 */
export function suggestFilename(input: MdReportInput): string {
  const date = formatDateShort(input.generatedAt)
  const a = basenameWithoutExt(input.fileA.path)
  const b = basenameWithoutExt(input.fileB.path)
  return sanitizeFilename(`diff-${date}_${a}_vs_${b}.md`)
}

// ============================================================
// 섹션 렌더러
// ============================================================

function renderFrontmatter(input: MdReportInput): string {
  const { fileA, fileB, stats, generatedAt, editor, appVersion } = input
  const lines = [
    '---',
    'tool: TextDiff Studio',
    `tool_version: ${appVersion}`,
    `schema_version: ${MD_SCHEMA_VERSION}`,
    `generated_at: ${formatIso8601(generatedAt)}`,
    `editor_protocol: ${editor.scheme}`,
    '',
    'files:',
    '  a:',
    `    path: ${yamlString(fileA.path)}`,
    `    name: ${yamlString(fileA.name)}`,
    `    encoding: ${fileA.encoding}`,
    `    line_count: ${fileA.lineCount}`,
    `    size_bytes: ${fileA.size}`,
    `    size_display: ${yamlString(fileA.sizeDisplay)}`,
    '  b:',
    `    path: ${yamlString(fileB.path)}`,
    `    name: ${yamlString(fileB.name)}`,
    `    encoding: ${fileB.encoding}`,
    `    line_count: ${fileB.lineCount}`,
    `    size_bytes: ${fileB.size}`,
    `    size_display: ${yamlString(fileB.sizeDisplay)}`,
    '',
    'stats:',
    `  changed_lines: ${stats.changedLineCount}`,
    `  total_lines: ${Math.max(stats.totalLinesOriginal, stats.totalLinesModified)}`,
    `  change_percent: ${stats.changePercent.toFixed(2)}`,
    `  add_count: ${stats.addCount}`,
    `  delete_count: ${stats.deleteCount}`,
    `  modify_count: ${stats.modifyCount}`,
    '---',
  ]
  return lines.join('\n')
}

function renderTitle(input: MdReportInput): string {
  const { fileA, fileB, generatedAt, appVersion, editor } = input
  return [
    `# Diff Report — ${fileA.name} ↔ ${fileB.name}`,
    '',
    `> **생성**: ${formatHumanDate(generatedAt)}`,
    `> **도구**: TextDiff Studio v${appVersion}`,
    `> **편집기 프로토콜**: \`${editor.scheme}://\``,
  ].join('\n')
}

function renderFileInfo(input: MdReportInput): string {
  const { fileA, fileB } = input
  return [
    '## 📑 파일 정보',
    '',
    '| | 파일명 | 경로 | 인코딩 | 라인 | 크기 |',
    '|---|--------|------|-------|-----|------|',
    `| **A** | \`${fileA.name}\` | \`${fileA.path}\` | ${fileA.encoding} | ${fileA.lineCount.toLocaleString()} | ${fileA.sizeDisplay} |`,
    `| **B** | \`${fileB.name}\` | \`${fileB.path}\` | ${fileB.encoding} | ${fileB.lineCount.toLocaleString()} | ${fileB.sizeDisplay} |`,
  ].join('\n')
}

function renderStats(input: MdReportInput): string {
  const s = input.stats
  const total = Math.max(s.totalLinesOriginal, s.totalLinesModified)
  return [
    '## 📊 통계',
    '',
    `- **변경 라인**: **${s.changedLineCount.toLocaleString()} / ${total.toLocaleString()} (${s.changePercent.toFixed(1)}%)** — 더 큰 파일 기준`,
    `- **변경 항목 수**: 총 ${(s.addCount + s.deleteCount + s.modifyCount).toLocaleString()}개`,
    `  - ⊕ **추가**: ${s.addCount}개 (B에만 있는 새 줄)`,
    `  - ⊖ **삭제**: ${s.deleteCount}개 (A에만 있던 줄, B에서 제거됨)`,
    `  - ↻ **수정**: ${s.modifyCount}개 (양쪽 모두 존재하지만 내용 다름)`,
  ].join('\n')
}

function renderLegend(): string {
  return [
    '## 📖 기호 의미',
    '',
    '| 기호 | 의미 | 설명 |',
    '|------|------|------|',
    '| `⊕` `+` | add | B에만 있는 새 줄. A에 없는 내용 |',
    '| `⊖` `-` | delete | A에만 있던 줄. B에서 제거됨 |',
    '| `↻` `~` | modify | 양쪽 모두 있지만 내용 다름 |',
    '| `L42` | 라인 단일 | 42번째 줄 (1부터 시작) |',
    '| `L42-45` | 라인 범위 | 42번부터 45번까지 |',
    '| `+N` | 추가 라인 수 | B에 N줄 추가됨 |',
    '| `-N` | 삭제 라인 수 | A의 N줄이 B에서 제거됨 |',
    '| `~N` | 수정 라인 수 | 양쪽 동일 라인 수가 수정됨 |',
    '| `+N -M` | 비대칭 수정 | A의 M줄이 B의 N줄로 교체됨 |',
    '| `[Lxx](vscode://...)` | 점프 링크 | 클릭 시 VS Code가 해당 줄로 이동 |',
  ].join('\n')
}

function renderChangeList(input: MdReportInput): string {
  if (input.changes.length === 0) {
    return [
      '## 🔍 변경 목록',
      '',
      '✓ **두 파일이 동일합니다.** 변경 없음.',
    ].join('\n')
  }

  const linesA = splitLines(input.fileAContent)
  const linesB = splitLines(input.fileBContent)

  const out: string[] = ['## 🔍 변경 목록']
  for (const change of input.changes) {
    out.push('')
    out.push(renderChangeItem(change, linesA, linesB, input))
    out.push('')
    out.push('---')
  }
  // 끝에 붙은 마지막 구분선 제거
  if (out[out.length - 1] === '---') out.pop()
  return out.join('\n')
}

function renderChangeItem(
  change: DiffChange,
  linesA: string[],
  linesB: string[],
  input: MdReportInput,
): string {
  const idx = change.index + 1
  const icon = change.kind === 'add' ? '⊕' : change.kind === 'delete' ? '⊖' : '↻'
  const kindLabel = change.kind === 'add' ? '추가' : change.kind === 'delete' ? '삭제' : '수정'
  const range = rangeLabel(change)
  const deltaLabel = formatDelta(change)

  // 클립보드 등 가상 경로는 vscode:// 링크 생성 시 "Path does not exist" 에러 → 링크 생략
  const aIsReal = isRealFilePath(input.fileA.path)
  const bIsReal = isRealFilePath(input.fileB.path)

  const linkA = !change.originalRange
    ? `[A · 해당 없음]`
    : aIsReal
      ? `[A · ${formatRange(change.originalRange)}](${buildEditorUrl(input.fileA.path, change.originalRange.start, input.editor)})`
      : `A · ${formatRange(change.originalRange)} *(클립보드 — 점프 불가)*`
  const linkB = !change.modifiedRange
    ? `[B · 해당 없음]`
    : bIsReal
      ? `[B · ${formatRange(change.modifiedRange)}](${buildEditorUrl(input.fileB.path, change.modifiedRange.start, input.editor)})`
      : `B · ${formatRange(change.modifiedRange)} *(클립보드 — 점프 불가)*`

  const parts: string[] = [
    `### ${idx}. ${icon} ${range} (${kindLabel}${deltaLabel ? ' ' + deltaLabel : ''})`,
    '',
    `- **점프**: ${linkA} ↔ ${linkB}`,
  ]

  // 컨텍스트 (A)
  if (change.originalRange) {
    parts.push('')
    parts.push('**A (원본) 전후 컨텍스트**:')
    parts.push('```' + (guessFence(input.fileA.path)))
    parts.push(renderContext(linesA, change.originalRange.start, change.originalRange.end))
    parts.push('```')
  }

  // 컨텍스트 (B)
  if (change.modifiedRange) {
    parts.push('')
    parts.push('**B (변경본) 전후 컨텍스트**:')
    parts.push('```' + (guessFence(input.fileB.path)))
    parts.push(renderContext(linesB, change.modifiedRange.start, change.modifiedRange.end))
    parts.push('```')
  }

  // 통합 diff 표시
  parts.push('')
  parts.push('**Diff**:')
  parts.push('```diff')
  parts.push(renderDiffBlock(change, linesA, linesB))
  parts.push('```')

  parts.push('')
  parts.push('**메모** (사용자/AI 작성용):')
  parts.push('```')
  parts.push('(여기에 변경 의도를 적거나, AI에게 작성 요청 가능)')
  parts.push('```')

  return parts.join('\n')
}

function renderContext(allLines: string[], start: number, end: number): string {
  // 1-based 라인 번호 → 0-based 인덱스
  const ctxStart = Math.max(1, start - CONTEXT_LINES)
  const ctxEnd = Math.min(allLines.length, end + CONTEXT_LINES)

  const out: string[] = []
  for (let i = ctxStart; i <= ctxEnd; i++) {
    const isChanged = i >= start && i <= end
    const marker = isChanged ? '▸' : ' '
    const num = String(i).padStart(4, ' ')
    const content = allLines[i - 1] ?? ''
    out.push(`${num} ${marker} ${content}`)
  }
  return out.join('\n')
}

function renderDiffBlock(
  change: DiffChange,
  linesA: string[],
  linesB: string[],
): string {
  const out: string[] = []

  // A 의 삭제된 줄들
  if (change.originalRange) {
    const { start, end } = change.originalRange
    const limited = Math.min(end, start + MAX_CONTENT_LINES_PER_CHANGE - 1)
    for (let i = start; i <= limited; i++) {
      out.push('- ' + (linesA[i - 1] ?? ''))
    }
    if (limited < end) {
      out.push(`- ... (생략 ${end - limited}줄)`)
    }
  }

  // B 의 추가된 줄들
  if (change.modifiedRange) {
    const { start, end } = change.modifiedRange
    const limited = Math.min(end, start + MAX_CONTENT_LINES_PER_CHANGE - 1)
    for (let i = start; i <= limited; i++) {
      out.push('+ ' + (linesB[i - 1] ?? ''))
    }
    if (limited < end) {
      out.push(`+ ... (생략 ${end - limited}줄)`)
    }
  }

  return out.join('\n') || '(변경 내용 없음)'
}

function renderAiGuide(input: MdReportInput): string {
  const fileBName = input.fileB.name
  const mergedExample = sanitizeFilename(
    `${basenameWithoutExt(fileBName)}_merged.${guessFence(fileBName) || 'txt'}`,
  )
  return [
    '## 🤖 AI 코딩 검증용 안내',
    '',
    '이 문서는 **사람과 AI 모두** 읽을 수 있도록 설계되었습니다.',
    '바이브 코딩으로 이 문서를 첨부하고 다음과 같이 요청할 수 있습니다.',
    '',
    '### 활용 가능한 프롬프트 예시',
    '',
    '1. **변경 의도 분석**:',
    '   > "위 변경 #3 의 의도를 분석해줘. 왜 이렇게 바꿨을까?"',
    '',
    '2. **선택적 Merge**:',
    `   > "변경 #1, #5 만 채택하고 나머지는 A 원본 유지하는 새 파일 만들어줘. 결과를 \`${mergedExample}\` 로 저장."`,
    '',
    '3. **부분 원복 (Restore)**:',
    '   > "변경 #3 만 되돌려서 A 의 해당 라인 내용으로 B 의 같은 위치 교체해줘. 나머지 변경은 그대로 유지."',
    '',
    '4. **변경 분류**:',
    '   > "각 변경을 [기능추가/버그픽스/리팩토링/주석/포맷팅] 중 하나로 분류해줘."',
    '',
    '5. **위험 평가**:',
    '   > "어떤 변경이 가장 위험한지 (함수 시그니처/로직/타입) 평가하고 우선순위 매겨줘."',
    '',
    '6. **요약**:',
    '   > "이 diff 를 한국어 1문단으로 요약해줘. 비개발자에게 설명한다고 가정."',
    '',
    '7. **테스트 케이스 제안**:',
    '   > "수정된 부분이 깨지지 않았는지 확인할 테스트 케이스 작성해줘."',
    '',
    '### 점프 링크 사용 안내',
    '',
    '각 변경의 `[Lxx]` 링크는 `vscode://` 프로토콜.',
    '- Obsidian, VS Code 마크다운 프리뷰, 브라우저에서 클릭 가능',
    '- 클릭 시 OS 가 VS Code 실행 (또는 이미 실행 중이면 reuse) + 정확한 줄 이동',
    '- VS Code 미설치 시 무반응 → TextDiff Studio 설정에서 다른 에디터 (Cursor 등) 변경 가능',
    '',
    '### 호환성',
    '',
    `- frontmatter 의 \`schema_version: ${MD_SCHEMA_VERSION}\` 으로 향후 호환성 보장`,
    '- 절대 경로 사용 — 파일 이동 시 링크 깨짐 주의 (이 경우 frontmatter 의 `path` 만 수정해서 재활용)',
  ].join('\n')
}

function renderMachineData(input: MdReportInput): string {
  const linesA = splitLines(input.fileAContent)
  const linesB = splitLines(input.fileBContent)

  const payload = {
    schema_version: MD_SCHEMA_VERSION,
    generated_at: formatIso8601(input.generatedAt),
    files: {
      a: { path: input.fileA.path, line_count: input.fileA.lineCount },
      b: { path: input.fileB.path, line_count: input.fileB.lineCount },
    },
    stats: input.stats,
    changes: input.changes.map((c) => ({
      id: c.index + 1,
      kind: c.kind,
      a: c.originalRange
        ? {
            start: c.originalRange.start,
            end: c.originalRange.end,
            content: sliceLines(linesA, c.originalRange.start, c.originalRange.end),
          }
        : null,
      b: c.modifiedRange
        ? {
            start: c.modifiedRange.start,
            end: c.modifiedRange.end,
            content: sliceLines(linesB, c.modifiedRange.start, c.modifiedRange.end),
          }
        : null,
    })),
  }

  return [
    '## 📦 Machine-Readable Data',
    '',
    '> AI 가 정확하게 파싱해서 merge/restore 수행할 수 있는 구조화 데이터.',
    '> 사람이 직접 읽을 필요는 없음.',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
}

// ============================================================
// 유틸
// ============================================================

function splitLines(content: string): string[] {
  // CRLF / LF 정규화
  return content.replace(/\r\n/g, '\n').split('\n')
}

function sliceLines(lines: string[], start: number, end: number): string[] {
  const limited = Math.min(end, start + MAX_CONTENT_LINES_PER_CHANGE - 1)
  const slice = lines.slice(start - 1, limited)
  if (limited < end) {
    slice.push(`... (생략 ${end - limited}줄)`)
  }
  return slice
}

function formatRange(r: { start: number; end: number }): string {
  return r.start === r.end ? `L${r.start}` : `L${r.start}-${r.end}`
}

function rangeLabel(change: DiffChange): string {
  if (change.kind === 'delete' && change.originalRange) {
    return formatRange(change.originalRange)
  }
  if (change.modifiedRange) {
    return formatRange(change.modifiedRange)
  }
  if (change.originalRange) {
    return formatRange(change.originalRange)
  }
  return 'L?'
}

function formatDelta(change: DiffChange): string {
  if (change.kind === 'add') return `+${change.addedLines}`
  if (change.kind === 'delete') return `-${change.deletedLines}`
  if (change.addedLines === change.deletedLines) return `~${change.addedLines}`
  return `+${change.addedLines} -${change.deletedLines}`
}

function formatIso8601(d: Date): string {
  // 'YYYY-MM-DDTHH:mm:ss+09:00'
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

function formatDateShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function yamlString(s: string): string {
  // YAML 의 안전한 인용
  if (s === '') return '""'
  if (/[:#&*?!|>'"%@`{}\[\]]/.test(s) || /^\s|\s$/.test(s)) {
    const escaped = s.replace(/"/g, '\\"')
    return `"${escaped}"`
  }
  return s
}

/** 코드 펜스 언어 추측 (Day 2 의 languageHint 와 유사하지만 fence 용) */
function guessFence(absolutePath: string): string {
  const ext = absolutePath.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    jsx: 'jsx',
    vue: 'vue',
    py: 'python',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss',
    xml: 'xml',
    sh: 'bash', bash: 'bash',
    sql: 'sql',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php',
    c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp',
  }
  return map[ext] ?? ''
}
