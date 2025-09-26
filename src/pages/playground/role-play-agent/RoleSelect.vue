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
import { useRoleStore, type Role } from '@/stores/roleStore'

const router = useRouter()
const goBack = () => router.push('/playground')

const roleStore = useRoleStore()
const roles = roleStore.roles

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
