import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('@/pages/Dashboard.vue') },
  { path: '/tools', component: () => import('@/pages/Tools.vue') },
  { path: '/agents', component: () => import('@/pages/Agents.vue') },
  { path: '/workflows', component: () => import('@/pages/Workflows.vue') },
  { path: '/config', component: () => import('@/pages/Config.vue') },
  { path: '/logs', component: () => import('@/pages/Logs.vue') },
  { path: '/playground', component: () => import('@/pages/Playground.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router