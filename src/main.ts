import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// Day 7: 앱 시작 시 Git 가용성 1회 검사 (settings 와 분리된 git store)
import { useGitStore } from './stores/git'
const gitStore = useGitStore(pinia)
gitStore.detect().catch(() => {
  /* git 미설치는 정상 케이스 — 무시 */
})
