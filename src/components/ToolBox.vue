<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  content?: unknown
}>()

// 将 content 解析/美化为 JSON 字符串（当可行时）
const jsonPretty = computed<string | null>(() => {
  try {
    if (props.content == null) return null
    // 对象/数组：直接序列化
    if (typeof props.content === 'object') {
      return JSON.stringify(props.content, null, 2)
    }
    // 字符串：尝试判断并解析 JSON
    if (typeof props.content === 'string') {
      const trimmed = props.content.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const obj = JSON.parse(trimmed)
        return JSON.stringify(obj, null, 2)
      }
    }
    return null
  } catch (e) {
    return null
  }
})

// 非 JSON 的纯文本内容
const plainText = computed<string>(() => {
  if (typeof props.content === 'string') return props.content
  return ''
})
</script>

<template>
  <div class="tool-message">
    <i class="icon-tool"></i>
    <div class="message-text">
      <div class="tool-box">
        <div class="tool-box-header">
          <span class="tool-title">{{ props.title || '工具调用' }}</span>
        </div>
        <!-- JSON 优先渲染：当内容为合法 JSON 时进行缩进美化 -->
        <pre v-if="jsonPretty && props.content !== props.title" class="tool-content"><code class="language-json">{{ jsonPretty }}</code></pre>
        <!-- 非 JSON 情况下回退到原有的纯文本展示 -->
        <pre v-else-if="plainText && props.content !== props.title" class="tool-content">{{ plainText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-message { display: flex; align-items: flex-start; gap: 0.75rem; }
.icon-tool::before { content: '🛠️'; }
.message-text { flex: 1; }
.tool-box { background: #f7fbff; border: 1px solid #cfe8ff; border-radius: 8px; overflow: hidden; }
.tool-box-header { background: #e8f3ff; border-bottom: 1px solid #cfe8ff; padding: 6px 10px; }
.tool-title { font-size: 0.9rem; color: #1565c0; font-weight: 600; }
.tool-content { margin: 0; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.9rem; white-space: pre-wrap; word-break: break-word; }
</style>
