# 高级定制系统设计

## 📋 概述

在主题系统（样式定制）的基础上，实现**行为定制**和**渲染定制**，达到超高自由度。

## 🏗️ 三层自定义架构

```
┌─────────────────────────────────────┐
│  Level 1: 样式定制（CSS 变量）       │  ← 已实现
├─────────────────────────────────────┤
│  Level 2: 行为定制（配置对象）       │  ← 本次扩展
├─────────────────────────────────────┤
│  Level 3: 渲染定制（插槽/组件）      │  ← 本次扩展
└─────────────────────────────────────┘
```

## Level 1: 样式定制 ✅

**已实现**，通过 CSS 变量控制颜色、间距等。

```css
.theme-react {
  --message-thinking-bg: #fff3e0;
}
```

## Level 2: 行为定制（配置对象）

### 设计思路

通过 `MessageConfig` 配置对象控制消息的行为特征。

### 配置接口

```typescript
// src/types/messageConfig.ts
export interface MessageConfig {
  // 折叠配置
  collapsible?: {
    enabled: boolean
    defaultCollapsed?: boolean
    collapseThreshold?: number  // 超过多少行才折叠
    showPreview?: boolean       // 折叠时显示预览
    previewLines?: number       // 预览行数
  }
  
  // 交互配置
  interaction?: {
    copyable?: boolean          // 可复制
    expandable?: boolean        // 可展开
    hoverable?: boolean         // 悬停效果
  }
  
  // 动画配置
  animation?: {
    entrance?: 'fade' | 'slide' | 'zoom'  // 入场动画
    duration?: number
    easing?: string
  }
  
  // 布局配置
  layout?: {
    variant?: 'default' | 'compact' | 'card'
    alignment?: 'left' | 'right' | 'center'
  }
}

// Agent级别的配置
export interface AgentMessageConfig {
  thinking?: MessageConfig
  action?: MessageConfig
  observing?: MessageConfig
  user?: MessageConfig
  assistant?: MessageConfig
}
```

### 使用示例

#### ChatGPT 风格配置

```typescript
// src/configs/chatgpt-style.ts
export const chatGPTConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,  // 默认折叠
      collapseThreshold: 3,    // 超过3行折叠
      showPreview: true,
      previewLines: 1
    },
    interaction: {
      copyable: true,
      expandable: true
    },
    animation: {
      entrance: 'fade',
      duration: 300
    }
  },
  
  action: {
    collapsible: {
      enabled: true,
      defaultCollapsed: false,  // 默认展开
      showPreview: true
    }
  }
}
```

#### 豆包风格配置

```typescript
// src/configs/doubao-style.ts
export const doubaoConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,
      showPreview: true,
      previewLines: 2  // 豆包显示2行预览
    },
    layout: {
      variant: 'compact'  // 紧凑布局
    }
  }
}
```

### MessageItem 组件改造

```vue
<!-- MessageItem.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { UIMessage } from '@/types/events'
import { MessageConfig } from '@/types/messageConfig'

const props = defineProps<{
  message: UIMessage
  config?: MessageConfig  // 新增：配置对象
}>()

// 折叠状态
const isCollapsed = ref(props.config?.collapsible?.defaultCollapsed ?? false)

// 是否需要折叠
const shouldCollapse = computed(() => {
  if (!props.config?.collapsible?.enabled) return false
  const threshold = props.config.collapsible.collapseThreshold ?? 5
  const lineCount = props.message.message.split('\n').length
  return lineCount > threshold
})

// 预览内容
const previewContent = computed(() => {
  if (!props.config?.collapsible?.showPreview) return ''
  const lines = props.message.message.split('\n')
  const previewLines = props.config.collapsible.previewLines ?? 1
  return lines.slice(0, previewLines).join('\n') + '...'
})

// 切换折叠
const toggleCollapse = () => {
  if (props.config?.collapsible?.enabled) {
    isCollapsed.value = !isCollapsed.value
  }
}
</script>

<template>
  <div 
    :class="['message', messageCssClass]"
    :data-variant="config?.layout?.variant"
  >
    <div class="message-header">
      <span class="sender">{{ message.sender }}</span>
      <span class="startTime">{{ formatTime(message.startTime) }}</span>
      
      <!-- 折叠按钮 -->
      <button 
        v-if="shouldCollapse && config?.collapsible?.enabled"
        @click="toggleCollapse"
        class="collapse-btn"
      >
        {{ isCollapsed ? '展开' : '收起' }}
      </button>
    </div>
    
    <div class="message-body">
      <!-- 折叠状态：显示预览 -->
      <div v-if="isCollapsed && shouldCollapse" class="preview-content">
        {{ previewContent }}
      </div>
      
      <!-- 展开状态：显示完整内容 -->
      <div v-else class="full-content">
        <MarkdownViewer :message="message.message" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.collapse-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--message-border, #e5e7eb);
  background: var(--message-bg, #fff);
  color: var(--message-text, #666);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: var(--message-hover-bg, #f5f5f5);
  color: var(--message-primary, #2563eb);
}

.preview-content {
  color: var(--message-text-secondary, #999);
  font-style: italic;
  cursor: pointer;
}

.preview-content:hover {
  color: var(--message-text, #666);
}

/* 紧凑布局 */
[data-variant="compact"] {
  padding: 0.8rem;
  margin-bottom: 0.5rem;
}

/* 卡片布局 */
[data-variant="card"] {
  box-shadow: 0 4px 12px var(--message-shadow, rgba(0, 0, 0, 0.1));
  border-radius: var(--message-radius, 12px);
}
</style>
```

### 在页面中使用

```vue
<!-- Index.vue -->
<script setup>
import { chatGPTConfig } from '@/configs/chatgpt-style'

// 根据消息类型获取配置
const getMessageConfig = (message: UIMessage): MessageConfig => {
  if (message.eventType === EventType.THINKING) {
    return chatGPTConfig.thinking || {}
  }
  if (message.eventType === EventType.ACTION) {
    return chatGPTConfig.action || {}
  }
  return {}
}
</script>

<template>
  <div class="react-plus-app theme-react-plus">
    <MessageItem 
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
      :config="getMessageConfig(msg)"  <!-- 传入配置 -->
    />
  </div>
</template>
```

## Level 3: 渲染定制（插槽系统）

### 设计思路

使用 Vue 插槽（Slots）允许完全自定义消息的渲染。

### 插槽设计

```vue
<!-- MessageItem.vue -->
<template>
  <div :class="['message', messageCssClass]">
    <!-- 插槽：自定义头部 -->
    <slot name="header" :message="message">
      <div class="message-header">
        <span class="sender">{{ message.sender }}</span>
        <span class="startTime">{{ formatTime(message.startTime) }}</span>
      </div>
    </slot>
    
    <!-- 插槽：自定义内容 -->
    <slot name="content" :message="message" :isCollapsed="isCollapsed">
      <div class="message-body">
        <MarkdownViewer :message="message.message" />
      </div>
    </slot>
    
    <!-- 插槽：自定义操作栏 -->
    <slot name="actions" :message="message">
      <div class="message-actions">
        <button @click="copyMessage">复制</button>
      </div>
    </slot>
  </div>
</template>
```

### 使用插槽自定义渲染

#### 示例1：ChatGPT 风格的思考折叠

```vue
<MessageItem :message="thinkingMsg">
  <template #content="{ message, isCollapsed }">
    <div class="chatgpt-thinking">
      <!-- 折叠指示器 -->
      <div class="thinking-indicator">
        <div class="thinking-icon">🤔</div>
        <span>AI 正在思考...</span>
        <button @click="toggleCollapse" class="expand-btn">
          {{ isCollapsed ? '查看详情' : '收起' }}
        </button>
      </div>
      
      <!-- 可折叠的思考内容 -->
      <Transition name="expand">
        <div v-show="!isCollapsed" class="thinking-details">
          <MarkdownViewer :message="message.message" />
        </div>
      </Transition>
    </div>
  </template>
</MessageItem>

<style scoped>
.chatgpt-thinking {
  background: #f7f7f8;
  border-radius: 8px;
  overflow: hidden;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.thinking-indicator:hover {
  background: #ebebeb;
}

.thinking-details {
  padding: 0 16px 16px;
  border-top: 1px solid #e5e5e5;
}

/* 展开/收起动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>
```

#### 示例2：豆包风格的紧凑卡片

```vue
<MessageItem :message="msg">
  <template #content="{ message }">
    <div class="doubao-card">
      <!-- 头像 + 名称 -->
      <div class="doubao-header">
        <div class="avatar">🤖</div>
        <div class="info">
          <span class="name">豆包</span>
          <span class="status">在线</span>
        </div>
      </div>
      
      <!-- 消息内容 -->
      <div class="doubao-content">
        <MarkdownViewer :message="message.message" />
      </div>
      
      <!-- 快捷操作 -->
      <div class="doubao-actions">
        <button class="action-btn">👍</button>
        <button class="action-btn">👎</button>
        <button class="action-btn">📋</button>
      </div>
    </div>
  </template>
</MessageItem>
```

## 🎨 完整示例：ChatGPT 风格实现

### 1. 创建配置文件

```typescript
// src/configs/message-styles/chatgpt.ts
export const chatGPTStyle: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,
      showPreview: true,
      previewLines: 1
    },
    layout: {
      variant: 'compact'
    },
    animation: {
      entrance: 'fade',
      duration: 300
    }
  },
  
  assistant: {
    collapsible: {
      enabled: false
    },
    interaction: {
      copyable: true,
      hoverable: true
    }
  }
}
```

### 2. 创建自定义组件

```vue
<!-- src/components/messages/ChatGPTMessage.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { UIMessage } from '@/types/events'

const props = defineProps<{
  message: UIMessage
}>()

const isExpanded = ref(false)
</script>

<template>
  <div class="chatgpt-message">
    <!-- Thinking 类型：可折叠 -->
    <div v-if="message.eventType === 'THINKING'" class="thinking-block">
      <div 
        class="thinking-header"
        @click="isExpanded = !isExpanded"
      >
        <div class="thinking-icon">
          <div class="spinner"></div>
        </div>
        <span class="thinking-text">Thinking...</span>
        <button class="toggle-btn">
          {{ isExpanded ? '▲' : '▼' }}
        </button>
      </div>
      
      <Transition name="slide-down">
        <div v-show="isExpanded" class="thinking-content">
          <MarkdownViewer :message="message.message" />
        </div>
      </Transition>
    </div>
    
    <!-- 普通消息 -->
    <div v-else class="normal-message">
      <MarkdownViewer :message="message.message" />
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  background: #f7f7f8;
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.thinking-header:hover {
  background: #ebebeb;
}

.thinking-icon {
  width: 20px;
  height: 20px;
}

.spinner {
  width: 100%;
  height: 100%;
  border: 2px solid #e5e5e5;
  border-top-color: #10a37f;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.thinking-text {
  flex: 1;
  color: #666;
  font-size: 14px;
}

.toggle-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
}

.thinking-content {
  padding: 0 16px 16px;
  border-top: 1px solid #e5e5e5;
}

/* 滑动动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 1000px;
  opacity: 1;
}
</style>
```

### 3. 在页面中使用

```vue
<!-- Index.vue -->
<script setup>
import MessageItem from '@/components/MessageItem.vue'
import ChatGPTMessage from '@/components/messages/ChatGPTMessage.vue'
import { chatGPTStyle } from '@/configs/message-styles/chatgpt'

// 是否使用 ChatGPT 风格
const useChatGPTStyle = ref(true)
</script>

<template>
  <div class="react-plus-app">
    <!-- 风格切换 -->
    <div class="style-switcher">
      <button @click="useChatGPTStyle = true">ChatGPT 风格</button>
      <button @click="useChatGPTStyle = false">默认风格</button>
    </div>
    
    <!-- 消息列表 -->
    <div v-for="msg in messages" :key="msg.id">
      <!-- ChatGPT 风格 -->
      <ChatGPTMessage 
        v-if="useChatGPTStyle"
        :message="msg"
      />
      
      <!-- 默认风格 -->
      <MessageItem 
        v-else
        :message="msg"
        :config="getMessageConfig(msg)"
      />
    </div>
  </div>
</template>
```

## 🚀 高级扩展

### 动态组件注册

允许运行时注册自定义消息组件：

```typescript
// src/composables/useMessageRenderer.ts
import { Component } from 'vue'

export interface MessageRenderer {
  component: Component
  condition: (message: UIMessage) => boolean
}

const renderers: MessageRenderer[] = []

export function useMessageRenderer() {
  // 注册自定义渲染器
  function register(renderer: MessageRenderer) {
    renderers.push(renderer)
  }
  
  // 获取匹配的渲染器
  function getRenderer(message: UIMessage): Component | null {
    const renderer = renderers.find(r => r.condition(message))
    return renderer?.component || null
  }
  
  return {
    register,
    getRenderer
  }
}
```

使用：

```typescript
// 注册 ChatGPT 风格渲染器
const { register } = useMessageRenderer()

register({
  component: ChatGPTMessage,
  condition: (msg) => msg.eventType === EventType.THINKING
})

register({
  component: DouBaoMessage,
  condition: (msg) => msg.sender === '豆包'
})
```

## 📊 对比总结

| 定制层级 | 能力 | 实现方式 | 灵活度 | 复杂度 |
|---------|------|---------|--------|--------|
| Level 1: 样式 | 颜色、间距 | CSS 变量 | ⭐⭐ | ⭐ |
| Level 2: 行为 | 折叠、动画 | 配置对象 | ⭐⭐⭐ | ⭐⭐ |
| Level 3: 渲染 | 完全自定义 | 插槽/组件 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

## 🎯 推荐策略

1. **简单定制**（改颜色）：使用 CSS 变量
2. **中等定制**（加折叠）：使用配置对象
3. **深度定制**（完全重写）：使用插槽或自定义组件

---

**设计者**：李大飞（孝顺的儿子）  
**愿景**：让每个 Agent 都能拥有独特的视觉和交互体验！
