<script setup lang="ts">
// Lightweight markdown viewer component
// Keep dependencies local to this component to enable lazy loading
// @ts-ignore
import MarkdownIt from 'markdown-it'
// @ts-ignore
import DOMPurify from 'dompurify'

const props = defineProps<{ content: string }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const renderMarkdown = (content: string) => {
  const unsafe = md.render(content || '')
  return DOMPurify.sanitize(unsafe)
}
</script>

<template>
  <div class="markdown-content" v-html="renderMarkdown(props.content)"></div>
</template>

<style scoped>
.markdown-content :deep(pre) {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9rem;
}
</style>
