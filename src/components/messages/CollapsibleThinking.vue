<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownViewer from '@/components/MarkdownViewer.vue'

const props = defineProps<{
  content: string
  sender?: string
  timestamp?: Date | string
  isThinking?: boolean  // 是否正在思考（默认false表示已完成）
}>()

// 计算是否显示 loading 动画
const showSpinner = computed(() => props.isThinking ?? false)

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
        <!-- 思考中：显示 spinner -->
        <div v-if="showSpinner" class="spinner" :class="{ paused: isExpanded }"></div>
        <!-- 思考完成：显示完成图标 -->
        <div v-else class="check-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none" />
            <path 
              d="M5 8L7 10L11 6" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <span class="thinking-label">{{ showSpinner ? '思考中...' : '思考过程' }}</span>
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
  border: 2px solid var(--thinking-spinner-bg, #e5e5e5);
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

/* 完成图标 */
.check-icon {
  width: 16px;
  height: 16px;
  color: var(--thinking-check-color, #10a37f);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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

/* ========== ReActPlus 青花瓷主题适配 ========== */
.theme-react-plus .collapsible-thinking {
  /* 使用青花瓷配色 - 淡雅的青瓷背景 */
  background: var(--message-thinking-bg, #F8F8F0);
  border-color: var(--message-thinking-border, rgba(91, 138, 138, 0.2));
  backdrop-filter: blur(8px);
}

.theme-react-plus .collapsible-thinking:hover {
  border-color: var(--brand-primary, #5B8A8A);
  box-shadow: 0 2px 12px var(--brand-glow, rgba(91, 138, 138, 0.15));
}

.theme-react-plus .thinking-header:hover {
  /* 悬浮时的青瓷光晕 */
  background: var(--bg-hover, rgba(232, 240, 240, 0.6));
}

.theme-react-plus .thinking-label {
  /* 使用深青色，优雅内敛 */
  color: var(--brand-hover, #3A5F5F);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.theme-react-plus .spinner {
  /* 青花瓷风格的旋转器 */
  border-color: var(--brand-light, rgba(216, 232, 232, 0.4));
  border-top-color: var(--brand-primary, #5B8A8A);
  box-shadow: 0 0 8px var(--brand-glow, rgba(91, 138, 138, 0.3));
}

.theme-react-plus .check-icon {
  /* 青花瓷风格的完成图标 */
  color: var(--brand-primary, #5B8A8A);
}

.theme-react-plus .toggle-hint {
  color: var(--text-tertiary, #8B9D9D);
}

.theme-react-plus .toggle-icon {
  color: var(--brand-primary, #5B8A8A);
}

.theme-react-plus .thinking-content {
  /* 分割线使用青瓷色 */
  border-top-color: var(--border-subtle, rgba(224, 232, 232, 0.6));
  background: var(--bg-secondary, rgba(254, 254, 254, 0.8));
}

.theme-react-plus .content-wrapper {
  /* 内容文字使用主墨色 */
  color: var(--message-thinking-text, #8B7536);
  background: linear-gradient(
    135deg,
    transparent 0%,
    var(--brand-glow, rgba(91, 138, 138, 0.02)) 50%,
    transparent 100%
  );
  border-radius: 6px;
}

/* 青花瓷风格的微妙装饰 */
.theme-react-plus .collapsible-thinking::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--brand-primary, #5B8A8A) 50%,
    transparent 100%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.theme-react-plus .collapsible-thinking:hover::before {
  opacity: 0.6;
}

/* 展开状态下的增强效果 */
.theme-react-plus .collapsible-thinking:has(.thinking-content:not([style*="display: none"])) {
  box-shadow:
    0 4px 16px var(--brand-glow, rgba(91, 138, 138, 0.12)),
    0 2px 6px var(--brand-glow, rgba(91, 138, 138, 0.06));
}
</style>
