/**
 * 외부 에디터 URL 생성 (vscode://, cursor://, custom)
 *
 * 출처: 13 Day4 RSD FR-2
 *
 * Windows 경로 변환 규칙:
 *   - 백슬래시(\) → 슬래시(/)
 *   - 공백/한글/특수문자 → percent encoding (encodeURI)
 *   - 콜론(:) 은 보존 (드라이브 + 라인 구분자)
 */

export type EditorScheme = 'vscode' | 'cursor' | 'custom'

export interface EditorConfig {
  scheme: EditorScheme
  /** custom 시 사용. {path}, {line} placeholder. 예: 'subl://{path}:{line}' */
  customTemplate?: string
}

/**
 * Windows 절대 경로 → URL-safe path
 *   D:\proj\한글.html → D:/proj/%ED%95%9C%EA%B8%80.html
 *
 * encodeURI 는 콜론(:) 과 슬래시(/) 는 인코딩 안 함 → 의도대로.
 */
function pathToUrl(absolutePath: string): string {
  const slashed = absolutePath.replace(/\\/g, '/')
  return encodeURI(slashed)
}

export function buildEditorUrl(
  absolutePath: string,
  line: number,
  config: EditorConfig,
): string {
  const urlPath = pathToUrl(absolutePath)
  const safeLine = Math.max(1, Math.floor(line))

  if (config.scheme === 'custom' && config.customTemplate) {
    return config.customTemplate
      .replace('{path}', urlPath)
      .replace('{line}', String(safeLine))
  }

  // vscode 와 cursor 가 동일한 file/{path}:{line} 형식 사용
  const protocol = config.scheme === 'cursor' ? 'cursor' : 'vscode'
  return `${protocol}://file/${urlPath}:${safeLine}`
}

/**
 * 디버그용 검증 — RSD 의 테스트 케이스 매핑
 */
export function _internalTestCases() {
  const vscode: EditorConfig = { scheme: 'vscode' }
  return [
    {
      input: ['D:\\proj\\file.py', 42, vscode],
      expected: 'vscode://file/D:/proj/file.py:42',
    },
    {
      input: ['D:\\프로젝트\\한글.txt', 1, vscode],
      expected: 'vscode://file/D:/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/%ED%95%9C%EA%B8%80.txt:1',
    },
    {
      input: ['C:\\Program Files\\app.html', 100, vscode],
      expected: 'vscode://file/C:/Program%20Files/app.html:100',
    },
  ]
}
