<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { buildEditorUrl, type EditorScheme } from '../lib/editor-url'

interface Props {
  open: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const settings = useSettingsStore()

const draftScheme = ref<EditorScheme>(settings.editor.scheme)
const draftTemplate = ref<string>(settings.editor.customTemplate ?? 'subl://{path}:{line}')

// 모달 열릴 때마다 현재 설정으로 초기화
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      draftScheme.value = settings.editor.scheme
      draftTemplate.value = settings.editor.customTemplate ?? 'subl://{path}:{line}'
    }
  },
)

// 미리보기 URL
const previewUrl = computed(() => {
  return buildEditorUrl(
    'D:\\example\\project\\sample.html',
    42,
    {
      scheme: draftScheme.value,
      customTemplate: draftScheme.value === 'custom' ? draftTemplate.value : undefined,
    },
  )
})

const customValid = computed(() => {
  if (draftScheme.value !== 'custom') return true
  return draftTemplate.value.includes('{path}') && draftTemplate.value.includes('{line}')
})

function save() {
  settings.setEditorScheme(draftScheme.value)
  if (draftScheme.value === 'custom') {
    settings.setCustomTemplate(draftTemplate.value)
  }
  emit('close')
}

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (customValid.value) save()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-backdrop" @click.self="close">
      <div class="settings-modal" role="dialog" aria-labelledby="settings-title">
        <header class="settings-header">
          <h2 id="settings-title" class="settings-title">⚙ 외부 에디터 설정</h2>
        </header>

        <div class="settings-body">
          <p class="hint">
            MD 리포트의 변경 항목 링크가 어떤 에디터로 열릴지 선택합니다.
            현재 비교 결과에는 영향 없음 — 다음 저장부터 적용.
          </p>

          <div class="option-list">
            <label class="option" :class="{ active: draftScheme === 'vscode' }">
              <input v-model="draftScheme" type="radio" name="scheme" value="vscode" />
              <div class="option-info">
                <div class="option-name">VS Code</div>
                <div class="option-detail">
                  <code>vscode://file/{path}:{line}</code> — Microsoft VS Code 표준 프로토콜
                </div>
              </div>
            </label>

            <label class="option" :class="{ active: draftScheme === 'cursor' }">
              <input v-model="draftScheme" type="radio" name="scheme" value="cursor" />
              <div class="option-info">
                <div class="option-name">Cursor</div>
                <div class="option-detail">
                  <code>cursor://file/{path}:{line}</code> — Cursor (AI 코딩 에디터)
                </div>
              </div>
            </label>

            <label class="option" :class="{ active: draftScheme === 'custom' }">
              <input v-model="draftScheme" type="radio" name="scheme" value="custom" />
              <div class="option-info">
                <div class="option-name">사용자 정의</div>
                <div class="option-detail">Sublime / IntelliJ 등 — 템플릿 직접 작성</div>
                <div v-if="draftScheme === 'custom'" class="custom-input">
                  <input
                    v-model="draftTemplate"
                    type="text"
                    placeholder="예: subl://{path}:{line}"
                    class="template-field"
                  />
                  <div v-if="!customValid" class="validation-error">
                    템플릿은 <code>&#123;path&#125;</code> 와 <code>&#123;line&#125;</code> 을 모두 포함해야 합니다.
                  </div>
                </div>
              </div>
            </label>
          </div>

          <section class="preview-section">
            <div class="preview-label">미리보기 URL</div>
            <code class="preview-url">{{ previewUrl }}</code>
            <div class="preview-hint">
              위 형식으로 모든 MD 리포트의 점프 링크가 생성됩니다.
            </div>
          </section>

          <p class="note">
            ⓘ 설정은 현재 세션 동안만 유지됩니다 (v1.1 에서 영구 저장 예정).
          </p>
        </div>

        <footer class="settings-actions">
          <button class="btn btn-default" @click="close">취소 (Esc)</button>
          <button
            class="btn btn-primary"
            :disabled="!customValid"
            @click="save"
          >
            저장 (Ctrl+Enter)
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.settings-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(560px, 92vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.settings-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.settings-body {
  padding: var(--space-4);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.1s ease, background 0.1s ease;
  background: var(--color-bg);
}

.option:hover {
  background: var(--color-bg-hover);
}

.option.active {
  border-color: var(--color-accent);
  background: rgba(9, 105, 218, 0.04);
}

.option input[type='radio'] {
  margin-top: 2px;
  cursor: pointer;
}

.option-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-name {
  font-weight: 600;
  font-size: var(--text-sm);
}

.option-detail {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.option-detail code {
  font-family: var(--font-mono);
  font-size: 0.95em;
  background: var(--color-bg-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.custom-input {
  margin-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.template-field {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--color-bg);
  color: var(--color-text);
}

.template-field:focus {
  outline: none;
  border-color: var(--color-accent);
}

.validation-error {
  font-size: var(--text-xs);
  color: var(--color-danger);
}

.validation-error code {
  font-family: var(--font-mono);
}

.preview-section {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.preview-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-url {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
  word-break: break-all;
  padding: var(--space-2);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.preview-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.btn {
  padding: 6px 16px;
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

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:disabled {
  background: var(--color-border);
  border-color: var(--color-border);
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
