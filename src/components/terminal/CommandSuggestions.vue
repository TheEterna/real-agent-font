<script setup lang="ts">
import { computed } from 'vue'
import type { CommandSuggestion } from '@/types/terminal/commands'

interface Props {
  suggestions: CommandSuggestion[]
  selectedIndex?: number
  maxDisplay?: number
}

const props = withDefaults(defineProps<Props>(), {
  selectedIndex: -1,
  maxDisplay: 5
})

interface Emits {
  select: [index: number]
}

const emit = defineEmits<Emits>()

// 计算属性：限制显示数量
const displaySuggestions = computed(() => {
  return props.suggestions.slice(0, props.maxDisplay)
})

// 获取匹配类型显示文本
const getMatchTypeText = (matchType: string): string => {
  const typeMap: Record<string, string> = {
    exact: '精确',
    prefix: '前缀',
    fuzzy: '模糊',
    alias: '别名'
  }
  return typeMap[matchType] || matchType
}

// 获取匹配类型样式类
const getMatchTypeClass = (matchType: string): string => {
  return `match-type-${matchType}`
}

// 获取分类图标
const getCategoryIcon = (category: string): string => {
  const iconMap: Record<string, string> = {
    system: '⚙️',
    ai: '🤖',
    file: '📁',
    project: '📦',
    connection: '🔌'
  }
  return iconMap[category] || '📋'
}

// 处理点击
const handleClick = (index: number) => {
  emit('select', index)
}
</script>

<template>
  <div v-if="displaySuggestions.length > 0" class="command-suggestions">
    <div class="suggestions-header">
      <span class="suggestions-title">可用命令</span>
      <span class="suggestions-count">{{ suggestions.length }} 条匹配</span>
    </div>

    <div class="suggestions-list">
      <div
        v-for="(suggestion, index) in displaySuggestions"
        :key="suggestion.command.name"
        class="suggestion-item"
        :class="{
          'suggestion-selected': index === selectedIndex,
          'suggestion-disabled': !suggestion.command.enabled
        }"
        @click="handleClick(index)"
      >
        <!-- 左侧：命令信息 -->
        <div class="suggestion-main">
          <!-- 分类图标 -->
          <span class="category-icon">
            {{ getCategoryIcon(suggestion.command.category) }}
          </span>

          <!-- 命令名称 -->
          <div class="command-info">
            <div class="command-name">
              <span class="command-prefix">/</span>
              <span class="command-text">{{ suggestion.command.name }}</span>
              <span
                v-if="suggestion.command.aliases && suggestion.command.aliases.length > 0"
                class="command-aliases"
              >
                ({{ suggestion.command.aliases.join(', ') }})
              </span>
            </div>

            <!-- 命令描述 -->
            <div class="command-description">
              {{ suggestion.command.description }}
            </div>
          </div>
        </div>

        <!-- 右侧：匹配信息 -->
        <div class="suggestion-meta">
          <!-- 匹配类型 -->
          <span
            class="match-type"
            :class="getMatchTypeClass(suggestion.matchType)"
          >
            {{ getMatchTypeText(suggestion.matchType) }}
          </span>

          <!-- 匹配分数 -->
          <div class="match-score">
            <div class="score-bar">
              <div
                class="score-fill"
                :style="{ width: `${suggestion.score * 100}%` }"
              ></div>
            </div>
          </div>

          <!-- 使用提示 -->
          <div class="usage-hint">
            <span class="hint-text">Tab补全</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部提示 -->
    <div class="suggestions-footer">
      <div class="footer-hint">
        <span class="hint-key">↑↓</span> 选择
        <span class="hint-key">Tab</span> 补全
        <span class="hint-key">Enter</span> 执行
        <span class="hint-key">Esc</span> 关闭
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.command-suggestions {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  box-shadow:
    0 -4px 20px rgba(0, 255, 0, 0.2),
    inset 0 0 20px rgba(0, 255, 0, 0.05);
  overflow: hidden;
  z-index: 100;
  animation: slideUp 0.2s ease-out;
}

// 头部
.suggestions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(0, 50, 0, 0.3) 0%, rgba(0, 30, 0, 0.3) 100%);
  border-bottom: 1px solid rgba(0, 255, 0, 0.2);
  font-size: 12px;
  color: #00ff00;

  .suggestions-title {
    font-weight: bold;
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
  }

  .suggestions-count {
    opacity: 0.7;
  }
}

// 建议列表
.suggestions-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 255, 0, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 0, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(0, 255, 0, 0.5);
    }
  }
}

// 建议项
.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;

  &:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.3);
  }

  &.suggestion-selected {
    background: rgba(0, 255, 0, 0.2);
    border-color: rgba(0, 255, 0, 0.5);
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
  }

  &.suggestion-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// 主要信息
.suggestion-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.category-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.command-info {
  flex: 1;
  min-width: 0;
}

.command-name {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 14px;
  color: #00ff00;
  font-weight: bold;
  margin-bottom: 4px;

  .command-prefix {
    color: rgba(0, 255, 0, 0.6);
  }

  .command-text {
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
  }

  .command-aliases {
    font-size: 11px;
    color: rgba(0, 255, 0, 0.6);
    font-weight: normal;
  }
}

.command-description {
  font-size: 12px;
  color: rgba(0, 255, 0, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 元信息
.suggestion-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 12px;
}

.match-type {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: bold;
  text-transform: uppercase;

  &.match-type-exact {
    background: rgba(0, 255, 0, 0.3);
    color: #00ff00;
  }

  &.match-type-prefix {
    background: rgba(0, 200, 255, 0.3);
    color: #00c8ff;
  }

  &.match-type-fuzzy {
    background: rgba(255, 200, 0, 0.3);
    color: #ffc800;
  }

  &.match-type-alias {
    background: rgba(255, 0, 200, 0.3);
    color: #ff00c8;
  }
}

.match-score {
  width: 60px;

  .score-bar {
    height: 3px;
    background: rgba(0, 255, 0, 0.2);
    border-radius: 2px;
    overflow: hidden;

    .score-fill {
      height: 100%;
      background: linear-gradient(90deg, #00ff00 0%, #00ff88 100%);
      box-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
      transition: width 0.3s ease;
    }
  }
}

.usage-hint {
  font-size: 10px;
  color: rgba(0, 255, 0, 0.5);

  .hint-text {
    font-style: italic;
  }
}

// 底部提示
.suggestions-footer {
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(0, 30, 0, 0.3) 0%, rgba(0, 20, 0, 0.3) 100%);
  border-top: 1px solid rgba(0, 255, 0, 0.2);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 255, 0, 0.7);

  .hint-key {
    display: inline-block;
    padding: 2px 6px;
    background: rgba(0, 255, 0, 0.2);
    border: 1px solid rgba(0, 255, 0, 0.3);
    border-radius: 3px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    color: #00ff00;
    margin-right: 4px;
  }
}

// 动画
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 响应式
@media (max-width: 768px) {
  .command-suggestions {
    max-height: 250px;
  }

  .suggestion-item {
    padding: 6px 8px;
  }

  .command-name {
    font-size: 12px;
  }

  .command-description {
    font-size: 11px;
  }
}
</style>
