import { describe, it, expect } from 'vitest'
import { buildEditorUrl, type EditorConfig } from '../../src/lib/editor-url'

const vscode: EditorConfig = { scheme: 'vscode' }
const cursor: EditorConfig = { scheme: 'cursor' }
const custom: EditorConfig = {
  scheme: 'custom',
  customTemplate: 'subl://{path}:{line}',
}

describe('buildEditorUrl', () => {
  describe('vscode scheme', () => {
    it('일반 Windows 경로', () => {
      expect(buildEditorUrl('D:\\proj\\file.py', 42, vscode)).toBe(
        'vscode://file/D:/proj/file.py:42',
      )
    })

    it('Unix 스타일 경로 (이미 슬래시)', () => {
      expect(buildEditorUrl('/home/user/file.py', 10, vscode)).toBe(
        'vscode://file//home/user/file.py:10',
      )
    })

    it('공백 포함 경로 → %20', () => {
      expect(buildEditorUrl('C:\\Program Files\\app.html', 100, vscode)).toBe(
        'vscode://file/C:/Program%20Files/app.html:100',
      )
    })

    it('한글 경로 → percent encoding', () => {
      const result = buildEditorUrl('D:\\프로젝트\\한글.txt', 1, vscode)
      expect(result).toBe('vscode://file/D:/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/%ED%95%9C%EA%B8%80.txt:1')
    })

    it('line < 1 → 최소 1 로 보정', () => {
      expect(buildEditorUrl('D:\\f.py', 0, vscode)).toBe('vscode://file/D:/f.py:1')
      expect(buildEditorUrl('D:\\f.py', -5, vscode)).toBe('vscode://file/D:/f.py:1')
    })

    it('line 소수점 → 내림', () => {
      expect(buildEditorUrl('D:\\f.py', 42.7, vscode)).toBe('vscode://file/D:/f.py:42')
    })
  })

  describe('cursor scheme', () => {
    it('vscode 와 같은 형식', () => {
      expect(buildEditorUrl('D:\\proj\\file.py', 42, cursor)).toBe(
        'cursor://file/D:/proj/file.py:42',
      )
    })
  })

  describe('custom scheme', () => {
    it('{path}, {line} 치환', () => {
      expect(buildEditorUrl('D:\\proj\\file.py', 42, custom)).toBe(
        'subl://D:/proj/file.py:42',
      )
    })

    it('customTemplate 없으면 vscode fallback', () => {
      expect(buildEditorUrl('D:\\f.py', 1, { scheme: 'custom' })).toBe(
        'vscode://file/D:/f.py:1',
      )
    })
  })
})
