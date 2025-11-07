# ReActPlus 折叠思考功能使用指南

## 📋 概述

ReActPlus 页面已成功集成 `CollapsibleThinking` 组件，实现 ChatGPT 风格的可折叠思考过程显示。

## ✅ 已完成的集成

### 1. 导入相关依赖

```typescript
import CollapsibleThinking from '@/components/messages/ThinkingMessage.vue'
import { useMessageConfig } from '@/composables/useMessageConfig'
import { MessageStyle } from '@/types/messageConfig'
```

### 2. 配置 ChatGPT 风格

```typescript
// 使用 ChatGPT 风格配置
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.CHATGPT)
```

**ChatGPT 风格特点**：
- Thinking 消息默认折叠
- 超过 2 行内容自动折叠
- 不显示预览内容
- 流畅的展开/收起动画

### 3. 条件渲染逻辑

```vue
<!-- Thinking 消息 - 使用折叠组件 -->
<CollapsibleThinking
  v-else-if="message.eventType === EventType.THINKING && shouldCollapse(message)"
  :content="message.message"
  :sender="message.sender"
  :timestamp="message.timestamp"
  class="message-item"
/>

<!-- 普通消息 - 使用标准组件 -->
<MessageItem v-else :message="message" class="message-item" />
```

**判断逻辑**：
- 如果消息是 `THINKING` 事件类型
- 且 `shouldCollapse()` 返回 `true`（内容超过配置的行数阈值）
- 则使用 `CollapsibleThinking` 组件
- 否则使用标准的 `MessageItem` 组件

## 🎨 视觉效果

### 折叠状态
```
┌─────────────────────────────────────┐
│ 🔄 思考过程        [展开查看 ▼]     │
└─────────────────────────────────────┘
```

### 展开状态
```
┌─────────────────────────────────────┐
│ 🔄 思考过程        [收起 ▲]        │
├─────────────────────────────────────┤
│ 首先，我需要分析用户的问题...       │
│                                     │
│ 然后，我会考虑可能的解决方案...     │
│                                     │
│ 最后，我会综合以上信息给出答案。     │
└─────────────────────────────────────┘
```

## 🔧 自定义配置

### 切换其他风格

如果想使用其他预设风格，只需修改配置：

```typescript
// 豆包风格 - 折叠时显示预览
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.DOUBAO)

// Claude 风格 - 默认展开
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.CLAUDE)

// 紧凑风格 - 超过 1 行就折叠
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.COMPACT)
```

### 自定义折叠阈值

如果想自定义折叠行为，可以修改 `messageStyles.ts`：

```typescript
// src/configs/messageStyles.ts
export const chatGPTConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,     // 默认折叠
      collapseThreshold: 3,       // 改为 3 行：超过 3 行才折叠
      showPreview: true,          // 改为 true：折叠时显示预览
      previewLines: 2,            // 预览 2 行
    },
    // ... 其他配置
  },
}
```

## 🎯 主题适配

`CollapsibleThinking` 组件已适配 ReActPlus 的主题系统：

### 传统主题（theme-react）
- 浅色背景
- 柔和边框
- 传统色彩

### 赛博朋克主题（theme-react-plus）
- 暗色透明背景
- 霓虹色边框
- 发光效果

组件会自动读取当前主题的 CSS 变量：

```css
/* 主题变量示例 */
.theme-react-plus .collapsible-thinking {
  background: rgba(0, 255, 255, 0.05);
  border-color: rgba(0, 255, 255, 0.2);
}

.theme-react-plus .thinking-label {
  color: #00ffff;
}

.theme-react-plus .spinner {
  border-top-color: #00ffff;
}
```

## 📊 使用效果

### 优势

1. **节省空间**：长篇思考内容默认折叠，界面更整洁
2. **按需查看**：用户可以选择性地查看感兴趣的思考过程
3. **流畅体验**：平滑的动画过渡，提升用户体验
4. **一致性**：与 ChatGPT/豆包等主流 AI 产品保持一致的交互模式

### 适用场景

- ✅ 长篇思考过程（推理链）
- ✅ 复杂问题分析
- ✅ 多步骤推理
- ✅ Debug 信息
- ❌ 简短的状态提示（会自动使用 MessageItem）
- ❌ 工具调用结果（有专门的 ToolBox 组件）

## 🚀 进阶用法

### 动态切换风格

如果需要让用户在界面上切换消息风格：

```vue
<script setup>
import { ref } from 'vue'
import { MessageStyle } from '@/types/messageConfig'

const currentStyle = ref(MessageStyle.CHATGPT)
const { setStyle } = useMessageConfig(currentStyle.value)

const handleStyleChange = (newStyle: MessageStyle) => {
  currentStyle.value = newStyle
  setStyle(newStyle)
}
</script>

<template>
  <div class="style-selector">
    <a-radio-group v-model:value="currentStyle" @change="handleStyleChange">
      <a-radio-button :value="MessageStyle.CHATGPT">ChatGPT</a-radio-button>
      <a-radio-button :value="MessageStyle.DOUBAO">豆包</a-radio-button>
      <a-radio-button :value="MessageStyle.CLAUDE">Claude</a-radio-button>
    </a-radio-group>
  </div>
</template>
```

### 只对特定消息使用折叠

如果只想对特定条件的消息启用折叠：

```vue
<CollapsibleThinking
  v-else-if="
    message.eventType === EventType.THINKING && 
    shouldCollapse(message) &&
    message.message.length > 500  <!-- 额外条件：内容长度 > 500 -->
  "
  :content="message.message"
/>
```

## 🐛 故障排除

### Q: 折叠组件不显示？

**A**: 检查以下几点：
1. 消息的 `eventType` 是否为 `EventType.THINKING`
2. 消息内容是否超过折叠阈值（默认 2 行）
3. 配置中 `collapsible.enabled` 是否为 `true`

### Q: 样式不对？

**A**: 确保：
1. 已引入主题 CSS：`import '@/styles/themes/theme-react-plus.css'`
2. 根元素有正确的主题类名：`class="react-plus-app theme-react-plus"`
3. 清除浏览器缓存

### Q: 想禁用折叠功能？

**A**: 有两种方法：

**方法 1**：使用 DEFAULT 风格（不折叠）
```typescript
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.DEFAULT)
```

**方法 2**：直接使用 MessageItem
```vue
<!-- 移除条件判断，全部使用 MessageItem -->
<MessageItem :message="message" class="message-item" />
```

## 📝 总结

通过集成 `CollapsibleThinking` 组件，ReActPlus 页面现在支持：

- ✅ ChatGPT 风格的可折叠思考过程
- ✅ 自动判断是否需要折叠
- ✅ 主题适配（传统/赛博朋克）
- ✅ 可配置的折叠行为
- ✅ 流畅的用户体验

下一步可以考虑：
- 为 Action、Observing 等其他事件类型添加专门的展示组件
- 实现拖拽排序功能
- 添加消息搜索和过滤
- 支持消息导出

---

**更新日期**：2025年  
**版本**：v1.0
