<script setup lang="ts">
import { computed } from 'vue'
import type { UIMessage } from '@/types/events'
import { UserOutlined, RobotOutlined } from '@ant-design/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getRandomGlassColor } from '@/utils/colorUtils'

const props = defineProps<{ message: UIMessage }>()

// 判断是否来自用户（根据项目实际 sender 命名，备用：'USER' | 'ASSISTANT'）
const isUser = computed(() => {
  const s: any = (props.message as any)?.sender
  if (typeof s === 'string') return s.toLowerCase() === 'user'
  // 兼容对象或枚举，尽量降噪
  return s === 1 || s === 'USER'
})

// 渲染 markdown 为安全的 HTML
const htmlContent = computed(() => {
  const raw = props.message?.message ?? ''
  const md = marked.parse(raw || '') as string
  return DOMPurify.sanitize(md)
})

// 头像圆形背景（玻璃浅色）
const avatarBg = getRandomGlassColor()
</script>

<template>
  <!-- 无背景的普通消息，参考 ChatGPT/Gemini：左侧头像 + 右侧富文本 -->
  <div class="flex items-start gap-3 py-1">
    <span class="inline-flex items-center justify-center w-7 h-7 rounded-full select-none" :style="{ backgroundColor: avatarBg }">
      <component :is="isUser ? UserOutlined : RobotOutlined" />
    </span>
    <div class="flex-1 min-w-0">
      <div class="prose prose-sm max-w-none leading-7 text-slate-800" v-html="htmlContent"></div>
    </div>
  </div>
</template>

<style scoped>
:deep(pre) {
  border: 0;
  background: transparent;
}
:deep(code) {
  background: transparent;
}
</style>
