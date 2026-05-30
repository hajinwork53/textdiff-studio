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

console.log(`Packaging ${pkg.name} v${pkg.version} ...`)

const appPaths = await packager({
  dir: root,
  name: 'TextDiff Studio',
  platform: 'win32',
  arch: 'x64',
  out: path.join(root, 'release'),
  overwrite: true,
  asar: {
    // ripgrep native binary 는 asar 밖으로 (spawn 가능해야 함)
    unpack: '**/node_modules/@vscode/ripgrep-{win32-x64,win32-arm64,win32-ia32}/**',
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
