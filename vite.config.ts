import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import path from 'node:path'

const monacoEditor = (monacoEditorPlugin as any).default ?? monacoEditorPlugin

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    monacoEditor({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html', 'css'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
