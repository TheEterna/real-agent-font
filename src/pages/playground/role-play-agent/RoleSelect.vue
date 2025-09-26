<template>
  <div class="role-select">
    <div class="topbar">
      <a-button type="default" shape="circle" @click="goBack" :title="'返回 Playground'">
        <template #icon>
          <ArrowLeftOutlined />
        </template>
      </a-button>
      <div class="title">选择一个角色</div>
    </div>

    <a-list :data-source="roles" :grid="{ gutter: 16, column: 4 }">
      <template #renderItem="{ item }">
        <a-list-item>
          <a-card hoverable @click="enter(item)" :title="item.name">
            <div class="role-item">
              <img :src="item.avatar" alt="avatar" />
              <div class="meta">{{ item.desc }}</div>
            </div>
          </a-card>
        </a-list-item>
      </template>
    </a-list>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'

const router = useRouter()
const goBack = () => router.push('/playground')

interface Role { id: string; name: string; avatar: string; desc: string }

const roles: Role[] = [
  {
    id: 'conan',
    name: '柯南',
    desc: '真相只有一个！冷静缜密的推理型角色',
    avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect rx="16" ry="16" width="96" height="96" fill="%23f5f7ff"/><g transform="translate(12,12)"><circle cx="36" cy="24" r="12" fill="%231677ff"/><rect x="18" y="42" width="48" height="24" rx="12" fill="%231677ff"/></g></svg>'
  },
  {
    id: 'detective',
    name: '福尔摩斯',
    desc: '观察入微、逻辑严密的侦探角色',
    avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect rx="16" ry="16" width="96" height="96" fill="%23fff5f0"/><g transform="translate(12,12)"><circle cx="36" cy="24" r="12" fill="%23ff7a45"/><rect x="18" y="42" width="48" height="24" rx="12" fill="%23ff7a45"/></g></svg>'
  },
]

function enter(role: Role) {
  router.push(`/playground/role-play-agent/${role.id}`)
}
</script>

<style scoped lang="scss">
.role-select { display:flex; flex-direction:column; gap:12px; width:100%; }
.topbar { display:flex; align-items:center; gap:8px; }
.title { font-weight:700; }
.role-item { display:flex; flex-direction:column; align-items:center; gap:8px; }
.role-item img { width:80px; height:80px; border-radius:16px; border:1px solid #eef2f7; object-fit:cover; }
.meta { color:#666; font-size:12px; text-align:center; }
</style>
