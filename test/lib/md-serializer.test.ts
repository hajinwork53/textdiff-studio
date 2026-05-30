import { describe, it, expect } from 'vitest'
import {
  generateMdReport,
  suggestFilename,
  MD_SCHEMA_VERSION,
  type MdReportInput,
} from '../../src/lib/md-serializer'
import type { DiffChange, DiffStats } from '../../src/lib/diff-changes'

function makeInput(overrides: Partial<MdReportInput> = {}): MdReportInput {
  const defaultStats: DiffStats = {
    totalLinesOriginal: 100,
    totalLinesModified: 105,
    changedLineCount: 5,
    changePercent: 5,
    addCount: 1,
    deleteCount: 0,
    modifyCount: 0,
  }
  return {
    fileA: {
      path: 'D:\\proj\\a.html',
      name: 'a.html',
      encoding: 'UTF-8',
      lineCount: 100,
      size: 1234,
      sizeDisplay: '1.2 KB',
    },
    fileB: {
      path: 'D:\\proj\\b.html',
      name: 'b.html',
      encoding: 'UTF-8',
      lineCount: 105,
      size: 1300,
      sizeDisplay: '1.3 KB',
    },
    fileAContent: 'line1\nline2\nline3\nline4\nline5',
    fileBContent: 'line1\nline2\nline3\nNEW\nline4\nline5',
    changes: [],
    stats: defaultStats,
    generatedAt: new Date('2026-05-23T16:30:00+09:00'),
    editor: { scheme: 'vscode' },
    appVersion: '0.1.0',
    ...overrides,
  }
}

describe('generateMdReport — frontmatter', () => {
  it('YAML frontmatter 시작/종료', () => {
    const md = generateMdReport(makeInput())
    expect(md.startsWith('---\n')).toBe(true)
    const secondMarker = md.indexOf('\n---', 4)
    expect(secondMarker).toBeGreaterThan(0)
  })

  it('schema_version 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain(`schema_version: ${MD_SCHEMA_VERSION}`)
  })

  it('tool 정보 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('tool: TextDiff Studio')
    expect(md).toContain('tool_version: 0.1.0')
  })

  it('editor_protocol 반영', () => {
    expect(generateMdReport(makeInput({ editor: { scheme: 'vscode' } }))).toContain('editor_protocol: vscode')
    expect(generateMdReport(makeInput({ editor: { scheme: 'cursor' } }))).toContain('editor_protocol: cursor')
  })

  it('파일 메타 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('a.html')
    expect(md).toContain('b.html')
    expect(md).toContain('UTF-8')
    expect(md).toContain('line_count: 100')
    expect(md).toContain('line_count: 105')
  })

  it('stats 정확', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('changed_lines: 5')
    expect(md).toContain('add_count: 1')
  })
})

describe('generateMdReport — 변경 없음', () => {
  it('"두 파일이 동일합니다" 메시지', () => {
    const stats: DiffStats = {
      totalLinesOriginal: 100, totalLinesModified: 100,
      changedLineCount: 0, changePercent: 0,
      addCount: 0, deleteCount: 0, modifyCount: 0,
    }
    const md = generateMdReport(makeInput({ changes: [], stats }))
    expect(md).toContain('두 파일이 동일합니다')
  })
})

describe('generateMdReport — 변경 항목', () => {
  it('vscode:// 링크 형식 정확', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'modify',
        originalRange: { start: 4, end: 4 },
        modifiedRange: { start: 4, end: 4 },
        preview: 'NEW', addedLines: 1, deletedLines: 1,
      },
    ]
    const md = generateMdReport(makeInput({ changes }))
    expect(md).toContain('vscode://file/D:/proj/a.html:4')
    expect(md).toContain('vscode://file/D:/proj/b.html:4')
  })

  it('cursor scheme 시 cursor:// 사용', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'modify',
        originalRange: { start: 4, end: 4 },
        modifiedRange: { start: 4, end: 4 },
        preview: 'NEW', addedLines: 1, deletedLines: 1,
      },
    ]
    const md = generateMdReport(makeInput({ changes, editor: { scheme: 'cursor' } }))
    expect(md).toContain('cursor://file/')
    expect(md).not.toContain('vscode://file/')
  })

  it('변경 N개 → 모두 섹션 생성', () => {
    const changes: DiffChange[] = Array.from({ length: 3 }, (_, i) => ({
      index: i, kind: 'modify' as const,
      originalRange: { start: i + 1, end: i + 1 },
      modifiedRange: { start: i + 1, end: i + 1 },
      preview: `line ${i}`, addedLines: 1, deletedLines: 1,
    }))
    const md = generateMdReport(makeInput({ changes }))
    expect(md).toContain('### 1.')
    expect(md).toContain('### 2.')
    expect(md).toContain('### 3.')
  })
})

describe('generateMdReport — 클립보드 슬롯 (가상 경로)', () => {
  it('clipboard:N path → vscode:// 링크 생략 + 점프 불가 안내', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'modify',
        originalRange: { start: 1, end: 1 },
        modifiedRange: { start: 1, end: 1 },
        preview: 'x', addedLines: 1, deletedLines: 1,
      },
    ]
    const md = generateMdReport(
      makeInput({
        changes,
        fileA: {
          path: 'clipboard:1',
          name: '클립보드 #1',
          encoding: 'UTF-8',
          lineCount: 5, size: 100, sizeDisplay: '0.1 KB',
        },
        fileB: {
          path: 'D:\\proj\\b.html',
          name: 'b.html',
          encoding: 'UTF-8',
          lineCount: 5, size: 100, sizeDisplay: '0.1 KB',
        },
      }),
    )
    // A 는 클립보드라 vscode:// 없어야 함
    expect(md).not.toMatch(/vscode:\/\/file\/clipboard/)
    expect(md).toContain('클립보드 — 점프 불가')
    // B 는 정상 vscode:// 링크
    expect(md).toContain('vscode://file/D:/proj/b.html:1')
  })

  it('양쪽 모두 클립보드 → 양쪽 vscode:// 모두 생략', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'add',
        originalRange: null,
        modifiedRange: { start: 1, end: 1 },
        preview: 'x', addedLines: 1, deletedLines: 0,
      },
    ]
    const md = generateMdReport(
      makeInput({
        changes,
        fileA: {
          path: 'clipboard:1',
          name: '클립보드 #1',
          encoding: 'UTF-8',
          lineCount: 5, size: 100, sizeDisplay: '0.1 KB',
        },
        fileB: {
          path: 'clipboard:2',
          name: '클립보드 #2',
          encoding: 'UTF-8',
          lineCount: 5, size: 100, sizeDisplay: '0.1 KB',
        },
      }),
    )
    expect(md).not.toContain('vscode://file/clipboard')
    expect(md).not.toContain('cursor://file/clipboard')
  })
})

describe('generateMdReport — JSON 블록', () => {
  it('Machine-Readable Data 섹션 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('## 📦 Machine-Readable Data')
    expect(md).toContain('```json')
  })

  it('JSON 파싱 가능', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'add',
        originalRange: null,
        modifiedRange: { start: 1, end: 2 },
        preview: 'x', addedLines: 2, deletedLines: 0,
      },
    ]
    const md = generateMdReport(makeInput({ changes }))
    // JSON 블록 추출
    const match = md.match(/```json\n([\s\S]*?)\n```/)
    expect(match).not.toBeNull()
    const json = JSON.parse(match![1])
    expect(json.schema_version).toBe(MD_SCHEMA_VERSION)
    expect(json.changes).toHaveLength(1)
    expect(json.changes[0].kind).toBe('add')
  })
})

describe('generateMdReport — AI 안내', () => {
  it('AI 코딩 검증용 안내 섹션 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('## 🤖 AI 코딩 검증용 안내')
    expect(md).toContain('변경 의도 분석')
    expect(md).toContain('선택적 Merge')
    expect(md).toContain('부분 원복')
  })
})

describe('generateMdReport — 기호 의미', () => {
  it('기호 사전 포함', () => {
    const md = generateMdReport(makeInput())
    expect(md).toContain('## 📖 기호 의미')
    expect(md).toContain('⊕')
    expect(md).toContain('⊖')
    expect(md).toContain('↻')
  })
})

describe('suggestFilename', () => {
  it('형식 diff-YYYY-MM-DD_{A}_vs_{B}.md', () => {
    const filename = suggestFilename(makeInput())
    expect(filename).toMatch(/^diff-\d{4}-\d{2}-\d{2}_a_vs_b\.md$/)
  })

  it('한글 파일명 유지', () => {
    const filename = suggestFilename(
      makeInput({
        fileA: {
          path: 'D:\\proj\\원본.html',
          name: '원본.html',
          encoding: 'UTF-8',
          lineCount: 10, size: 100, sizeDisplay: '0.1 KB',
        },
        fileB: {
          path: 'D:\\proj\\수정본.html',
          name: '수정본.html',
          encoding: 'UTF-8',
          lineCount: 10, size: 100, sizeDisplay: '0.1 KB',
        },
      }),
    )
    expect(filename).toContain('원본')
    expect(filename).toContain('수정본')
  })

  it('Windows 금지 문자 sanitize 거침', () => {
    const filename = suggestFilename(
      makeInput({
        fileA: {
          path: 'D:\\proj\\a<test>.html',
          name: 'a<test>.html',
          encoding: 'UTF-8',
          lineCount: 10, size: 100, sizeDisplay: '0.1 KB',
        },
      }),
    )
    expect(filename).not.toContain('<')
    expect(filename).not.toContain('>')
  })
})
