<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import MarkdownIt from 'markdown-it'

interface Props {
  content: string
  open: boolean
  suggestedFilename?: string
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
}>()

// markdown-it 인스턴스 (html: false 로 XSS 방어)
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

// 모든 링크에 title 속성 자동 추가 (URL tooltip 표시) — Day 5 사용자 혼동 해소
const defaultLinkOpenRule = md.renderer.rules.link_open ?? function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const hrefIndex = token.attrIndex('href')
  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1]
    // title 이 이미 있으면 보존, 없으면 href 자체를 title 로
    const titleIndex = token.attrIndex('title')
    if (titleIndex < 0) {
      token.attrPush(['title', href])
    }
  }
  return defaultLinkOpenRule(tokens, idx, options, env, self)
}

const html = computed(() => (props.open ? md.render(props.content) : ''))

function close() {
  emit('close')
}

function save() {
  emit('save')
}

// 렌더된 HTML 내의 vscode:// 링크는 클릭 시 IPC 호출 (브라우저로 가지 않게)
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const anchor = target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') ?? ''
  // editor:// 스킴 가로채기
  if (/^(vscode|cursor|subl|file):/.test(href)) {
    e.preventDefault()
    window.textdiff.openInEditor(href).catch(() => {
      /* 무시 — IPC 실패해도 사용자에게는 토스트로 안내 */
    })
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="md-modal-backdrop" @click.self="close">
      <div class="md-modal" role="dialog" aria-labelledby="md-modal-title">
        <header class="md-header">
          <div class="md-title-wrap">
            <h2 id="md-modal-title" class="md-title">👁 MD 리포트 미리보기</h2>
            <span v-if="suggestedFilename" class="md-filename">{{ suggestedFilename }}</span>
          </div>
          <div class="md-actions">
            <button class="btn btn-default" @click="close">닫기 (Esc)</button>
            <button class="btn btn-primary" @click="save">💾 저장하기</button>
          </div>
        </header>
        <div class="md-body markdown-body" @click="onContentClick" v-html="html"></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.md-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: var(--space-4);
}

.md-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: 90vw;
  max-width: 1100px;
  height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.md-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  flex-shrink: 0;
}

.md-title-wrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
}

.md-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.md-filename {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-actions {
  display: flex;
  gap: var(--space-2);
}

.btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-default {
  background: var(--color-bg);
}

.btn-default:hover {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.md-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5) var(--space-6);
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text);
}
</style>

<style>
/* 비-scoped: v-html 내부의 markdown 컨텐츠 스타일 (Teleport 후 글로벌 영향 제한 위해 .markdown-body 네임스페이스) */
.markdown-body h1 {
  font-size: 1.8em;
  font-weight: 700;
  margin: 0.4em 0 0.6em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-border);
}
.markdown-body h2 {
  font-size: 1.4em;
  font-weight: 600;
  margin: 1.2em 0 0.5em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid var(--color-border);
}
.markdown-body h3 {
  font-size: 1.15em;
  font-weight: 600;
  margin: 1em 0 0.4em;
}
.markdown-body p { margin: 0.6em 0; }
.markdown-body ul, .markdown-body ol { padding-left: 1.5em; margin: 0.6em 0; }
.markdown-body li { margin: 0.2em 0; }
.markdown-body blockquote {
  border-left: 4px solid var(--color-border);
  padding-left: var(--space-3);
  margin: 0.6em 0;
  color: var(--color-text-muted);
}
.markdown-body code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--color-bg-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.markdown-body pre {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  overflow-x: auto;
  margin: 0.6em 0;
}
.markdown-body pre code {
  background: transparent;
  padding: 0;
  font-size: var(--text-sm);
}
.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.6em 0;
  font-size: var(--text-sm);
}
.markdown-body th, .markdown-body td {
  border: 1px solid var(--color-border);
  padding: 6px 10px;
  text-align: left;
}
.markdown-body th {
  background: var(--color-bg-subtle);
  font-weight: 600;
}
.markdown-body hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1.2em 0;
}
.markdown-body a {
  color: var(--color-text-link);
  text-decoration: none;
}
.markdown-body a:hover {
  text-decoration: underline;
}
</style>
