<script setup lang="ts">
import { ref } from 'vue'
import MarkdownViewer from '@/components/MarkdownViewer.vue'

const props = defineProps<{
  content: string
  sender?: string
  timestamp?: Date | string
}>()

const isExpanded = ref(false)

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="collapsible-thinking">
    <!-- 折叠头部 -->
    <div 
      class="thinking-header"
      @click="toggleExpand"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
    >
      <div class="thinking-indicator">
        <div class="spinner" :class="{ paused: isExpanded }"></div>
        <span class="thinking-label">思考过程</span>
      </div>
      
      <div class="header-right">
        <span class="toggle-hint">{{ isExpanded ? '收起' : '展开查看' }}</span>
        <span class="toggle-icon" :class="{ expanded: isExpanded }">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path 
              d="M4 6L8 10L12 6" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
    
    <!-- 可展开的内容 -->
    <Transition name="expand">
      <div v-show="isExpanded" class="thinking-content">
        <div class="content-wrapper">
          <MarkdownViewer :message="content" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.collapsible-thinking {
  background: var(--thinking-collapsed-bg, #f7f7f8);
  border: 1px solid var(--thinking-collapsed-border, #e5e5e5);
  border-radius: 8px;
  overflow: hidden;
  margin: 12px 0;
  transition: all 0.3s ease;
}

.collapsible-thinking:hover {
  border-color: var(--thinking-hover-border, #d4d4d4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* 头部 */
.thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.thinking-header:hover {
  background: var(--thinking-hover-bg, #ebebeb);
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 旋转动画 */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e5e5e5;
  border-top-color: var(--thinking-spinner-color, #10a37f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner.paused {
  animation-play-state: paused;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.thinking-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--thinking-label-color, #666);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-hint {
  font-size: 13px;
  color: var(--thinking-hint-color, #999);
}

.toggle-icon {
  display: flex;
  align-items: center;
  color: var(--thinking-icon-color, #999);
  transition: transform 0.3s ease;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

/* 内容区域 */
.thinking-content {
  border-top: 1px solid var(--thinking-divider, #e5e5e5);
  overflow: hidden;
}

.content-wrapper {
  padding: 16px;
  color: var(--thinking-content-color, #333);
  font-size: 14px;
  line-height: 1.6;
}

/* 展开/收起动画 */
.expand-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to {
  max-height: 1000px;
  opacity: 1;
}

.expand-leave-from {
  max-height: 1000px;
  opacity: 1;
}

/* 主题适配 */
.theme-react-plus .collapsible-thinking {
  background: rgba(0, 255, 255, 0.05);
  border-color: rgba(0, 255, 255, 0.2);
}

.theme-react-plus .thinking-header:hover {
  background: rgba(0, 255, 255, 0.1);
}

.theme-react-plus .thinking-label {
  color: #00ffff;
}

.theme-react-plus .spinner {
  border-color: rgba(0, 255, 255, 0.3);
  border-top-color: #00ffff;
}

.theme-react-plus .thinking-content {
  border-top-color: rgba(0, 255, 255, 0.2);
}

.theme-react-plus .content-wrapper {
  color: #e0e6ed;
}
</style>
