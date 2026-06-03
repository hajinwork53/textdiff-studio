/**
 * Day 10.5: @electron/packager 를 JS API 로 호출 (CLI 가 --asar.unpack sub-property 지원 안 함)
 *
 * 사용: node build/package.mjs
 */
import { packager } from '@electron/packager'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

// 현재 플랫폼/아키텍처 자동 (맥=darwin/arm64, 윈도우=win32/x64).
// 크로스플랫폼 유지: 어느 OS 에서 돌려도 그 OS 용 산출물을 만든다.
const platform = process.platform // 'darwin' | 'win32'
const arch = process.arch // 'arm64' | 'x64'

console.log(`Packaging ${pkg.name} v${pkg.version} for ${platform}/${arch} ...`)

const appPaths = await packager({
  dir: root,
  name: 'TextDiff Studio',
  platform,
  arch,
  out: path.join(root, 'release'),
  overwrite: true,
  asar: {
    // 현재 플랫폼 ripgrep native binary 만 asar 밖으로 (spawn 가능해야 함)
    unpack: `**/node_modules/@vscode/ripgrep-${platform}-${arch}/**`,
  },
  // source / test / plan / cli 등 dev 전용 폴더 제외 (dist/dist-electron 만 ship)
  ignore: [
    /^\/src($|\/)/,
    /^\/electron($|\/)/,
    /^\/test($|\/)/,
    /^\/plan($|\/)/,
    /^\/cli($|\/)/,
    /^\/build($|\/)/,
    /^\/release($|\/)/,
    /^\/public($|\/)/,
    /^\/dist-cli($|\/)/,
    /^\/\.(vscode|idea|git|claude|cursor)($|\/)/,
    /^\/[^/]+\.md$/,
    /^\/(vite|tsconfig|playwright|vitest)\.(config\.)?[tj]son?$/,
    /^\/tsconfig\..*\.json$/,
  ],
  prune: true, // devDeps 자동 제외
  appCopyright: `Copyright 2026 ${pkg.author}`,
  appVersion: pkg.version,
})

console.log(`✓ Done. Output:`)
for (const p of appPaths) console.log(`  ${p}`)
