<script setup lang="ts">
// Lightweight markdown viewer component
// Keep dependencies local to this component to enable lazy loading
// @ts-ignore
import MarkdownIt from 'markdown-it'
// @ts-ignore
import DOMPurify from 'dompurify'

const props = defineProps<{ message: string }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const renderMarkdown = (message: string) => {
  const unsafe = md.render(message || '')
  return DOMPurify.sanitize(unsafe)
}
</script>

<template>
  <div class="markdown-message" v-html="renderMarkdown(props.message)"></div>
</template>

<style scoped>
.markdown-message :deep(pre) {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9rem;
}
</style>
