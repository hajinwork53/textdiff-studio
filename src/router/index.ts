import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'FilePicker',
    component: () => import('../views/FilePickerView.vue'),
  },
  {
    path: '/diff',
    name: 'DiffViewer',
    component: () => import('../views/DiffViewerView.vue'),
  },
  {
    path: '/snapshots',
    name: 'Snapshots',
    component: () => import('../views/SnapshotsView.vue'),
  },
]

export const router = createRouter({
  // Electron file:// 호환을 위해 hash 모드 사용
  history: createWebHashHistory(),
  routes,
})
