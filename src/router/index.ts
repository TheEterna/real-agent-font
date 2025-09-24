import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', components: { default: () => import('@/pages/Chat.vue'), sider: () => import('@/pages/chat/ChatSider.vue') } },
  { path: '/dashboard', component: () => import('@/pages/Dashboard.vue') },
  { path: '/tools', component: () => import('@/pages/Tools.vue') },
  { path: '/agents', component: () => import('@/pages/Agents.vue') },
  { path: '/workflows', component: () => import('@/pages/Workflows.vue') },
  { path: '/config', component: () => import('@/pages/Config.vue') },
  { path: '/logs', component: () => import('@/pages/Logs.vue') },
  { path: '/playground', component: () => import('@/pages/Playground.vue') },
  { path: '/playground/data-lab', component: () => import('@/pages/playground/DataLab.vue'), meta: { standalone: true } },
  { path: '/SseTest', component: () => import('@/pages/SseTest.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
