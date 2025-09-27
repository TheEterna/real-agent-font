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


    <a-empty v-if="roles.length === 0" description="暂无可用角色" />

    <a-list
        v-else
        :data-source="roles"
        :grid="{ gutter: [12, 16], column: column }"
        class="role-list"
    >
      <template #renderItem="{ item }">
        <a-list-item>
          <a-card
              hoverable
              class="clickable-card"
              @click="enter(item)"
              :aria-label="`选择角色：${item.name}`"
              tabindex="0"
              @keydown.enter="enter(item)"
          >
            <div class="role-item">
              <img
                  :src="item.avatar"
                  alt="角色头像"
                  @error="handleImgError"
              />
              <a-tooltip :title="item.desc" placement="top">
                <div class="meta">{{ item.desc }}</div>
              </a-tooltip>
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
import {computed} from "vue";
import useBreakpoint from "ant-design-vue/es/_util/hooks/useBreakpoint";

const router = useRouter()
const goBack = () => router.push('/playground')

const roleStore = useRoleStore()
const roles = roleStore.roles

// 更精细的响应式列数控制
const xs: boolean | undefined = useBreakpoint().value.xs
const sm: boolean | undefined = useBreakpoint().value.sm
const md: boolean | undefined = useBreakpoint().value.md
const column = computed(() => {
  if (xs) return 1   // < 576px (手机)
  if (sm) return 2   // < 768px (小平板)
  if (md) return 2   // < 992px (大平板)
  return 3                 // ≥ 992px (桌面)
})

function enter(role: Role) {
  router.push(`/playground/role-play-agent/${role.id}`)
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement
  target.src = '/default-avatar.png'
}
</script>

<style scoped lang="scss">
.role-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin: 0 auto;    /* 居中 */
  padding: 12px;     /* 改为更小的 padding，窄屏友好 */
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px; /* 减小左右 padding，避免按钮贴边 */
}

.title {
  font-weight: 700;
  flex: 1;
  font-size: 18px; /* 窄屏下稍小 */
}

.loading {
  margin: 40px auto;
}

.role-list {
  flex: 1;
}

.clickable-card {
  cursor: pointer;
  transition: transform 0.15s ease;
  height: 100%;
}

.role-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 8px; /* 减小水平 padding */
}

.role-item img {
  width: 64px;       /* 窄屏下缩小头像 */
  height: 64px;
  border-radius: 12px; /* 稍小圆角 */
  border: 1px solid #eef2f7;
  object-fit: cover;
}

.meta {
  color: #666;
  font-size: 13px;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  padding: 0 4px;
}

/* 超窄屏（< 360px）进一步优化 */
@media (max-width: 360px) {
  .role-select {
    padding: 8px;
  }
  .topbar {
    gap: 8px;
  }
  .title {
    font-size: 16px;
  }
  .role-item img {
    width: 56px;
    height: 56px;
  }
  .meta {
    font-size: 12px;
    padding: 0 2px;
  }
}
</style>
