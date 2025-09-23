<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import { UIMessage, MessageType } from '@/types/events'
import { AgentType } from '@/types/agents'
import { getAgentUIConfig } from '@/agent-ui/registry'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import { useSSE } from '@/composables/useSSE'
// Markdown 渲染相关
// @ts-ignore
import MarkdownIt from 'markdown-it'
// @ts-ignore
import hljs from 'highlight.js'
// @ts-ignore
import * as emoji from 'markdown-it-emoji'
// @ts-ignore
import * as taskLists from 'markdown-it-task-lists'
// @ts-ignore
import * as container from 'markdown-it-container'
// @ts-ignore
import * as anchor from 'markdown-it-anchor'
// @ts-ignore
import * as mkatex from 'markdown-it-katex'
// @ts-ignore
import DOMPurify from 'dompurify'
// 样式引入
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import '@/styles/chat.css'
import '@/styles/agents/react.css'
import '@/styles/agents/coding.css'

// 响应式数据
const selectedTag = ref<AgentType>(AgentType.ReAct)
const renderMode = ref('markdown')
const inputMessage = ref('')
const isLoading = ref(false)
const chatContent = ref<HTMLElement>()

// 滚动到底部（供 composable 回调使用）
const scrollToBottom = () => {
  if (chatContent.value) {
    chatContent.value.scrollTop = chatContent.value.scrollHeight
  }
}

// 使用可复用的 SSE 组合式函数
const { messages, nodeIndex, connectionStatus, taskStatus, executeReAct, executeCoding } = useSSE({ onScrollToBottom: scrollToBottom })

// 根据所选 Agent 获取 UI 配置（主题/渲染/交互）
const agentUI = computed(() => getAgentUIConfig(selectedTag.value))

// Agent类型标签（可来自 registry，也可按需定制）
const agentTags = [
  { label: 'ReAct', value: AgentType.ReAct, description: '推理-行动-观察框架' },
  { label: '代码编写', value: AgentType.Coding, description: '专业代码生成助手', disabled: true },
]

// 会话ID
const sessionId = ref(`session-${Date.now()}`)

// 选择标签
const selectTag = (tag: AgentType) => {
  if (tag === AgentType.Coding) {
    // 暂未实现
    alert('代码编写功能即将上线，敬请期待！')
    return
  }
  selectedTag.value = tag
}

// 渲染方式改变
const onRenderModeChange = () => {
  console.log('渲染方式切换为:', renderMode.value)
}

// 发送消息
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMessage: UIMessage = {
    type: MessageType.User,
    sender: '用户',
    message: inputMessage.value,
    timestamp: new Date()
  }

  messages.value.push(userMessage)
  const currentMessage = inputMessage.value
  inputMessage.value = ''
  isLoading.value = true

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  try {
    // 直接根据 AgentType 派发对应执行函数（1对1映射）
    switch (selectedTag.value) {
      case AgentType.ReAct:
        await executeReAct(currentMessage, sessionId.value)
        break
      case AgentType.Coding:
        await executeCoding(currentMessage, sessionId.value)
        break
      default:
        // 未实现的 Agent，临时回退
        await executeReAct(currentMessage, sessionId.value)
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    messages.value.push({
      type: MessageType.Error,
      sender: 'System',
      message: '发送失败: ' + (error as Error).message,
      timestamp: new Date()
    })
  } finally {
    isLoading.value = false
    connectionStatus.value = 'disconnected'
    if (taskStatus.value === 'running') {
      taskStatus.value = 'error'
    }
    await nextTick()
    scrollToBottom()
  }
}

// 清空对话
const clearChat = () => {
  if (confirm('确定要清空所有对话记录吗？')) {
    messages.value = []
    nodeIndex.value = {}
    sessionId.value = `session-${Date.now()}`
  }
}

// 导出对话
const exportChat = () => {
  const chatData = {
    sessionId: sessionId.value,
    agentType: selectedTag.value,
    messages: messages.value,
    exportTime: new Date().toISOString()
  }

  const blob = new Blob([JSON.stringify(chatData, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-${sessionId.value}.json`
  a.click()
  URL.revokeObjectURL(url)
}


// 格式化时间
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取状态图标
const getStatusIcon = (status: string): string => {
  const iconMap = {
    'running': 'icon-running',
    'completed': 'icon-completed',
    'error': 'icon-error',
    'idle': ''
  }
  return iconMap[status as keyof typeof iconMap] || ''
}

// 获取状态文本
const getStatusText = (status: string): string => {
  const textMap = {
    'running': 'ReAct任务执行中...',
    'completed': '任务执行完成',
    'error': '任务执行失败',
    'idle': '等待中'
  }
  return textMap[status as keyof typeof textMap] || ''
}

// 渲染Markdown
// 兼容 Vite 对 CommonJS/ESM 插件的导入：有的为 default，有的为命名空间对象
const resolvePlugin = (p: any) => {
  if (!p) return p
  // 优先 default
  const cand = (p as any).default ?? p
  if (typeof cand === 'function') return cand
  // 若仍为对象，尝试在其键里找到函数导出
  for (const key of Object.keys(p)) {
    const v = (p as any)[key]
    if (typeof v === 'function') return v
  }
  return cand
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, lang?: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(code, { language: lang }).value
        return `<pre class="hljs"><code>${out}</code></pre>`
      } catch {}
    }
    const escaped = md.utils.escapeHtml(code)
    return `<pre class="hljs"><code>${escaped}</code></pre>`
  }
})
  .use(resolvePlugin(emoji))
  .use(resolvePlugin(taskLists), { label: true, labelAfter: true })
  .use(resolvePlugin(container), 'info')
  .use(resolvePlugin(container), 'warning')
  .use(resolvePlugin(container), 'success')
  .use(resolvePlugin(anchor))
  .use(resolvePlugin(mkatex))

const renderMarkdown = (content: string) => {
  const unsafe = md.render(content || '')
  return DOMPurify.sanitize(unsafe)
}

// 组件挂载
onMounted(() => {
  // 添加欢迎消息
  messages.value.push({
    type: MessageType.System,
    sender: 'AI Assistant',
    message: `欢迎使用 ${selectedTag.value} Agent！我可以帮助您解决各种问题。请输入您的问题开始对话。`,
    timestamp: new Date()
  })
})
</script>
<template>
  <div class="chat-container" :class="agentUI.themeClass">
    <!-- 头部区域 -->
    <div class="chat-header">
      <div class="header-left">
        <h2>AI Agent 对话</h2>
        <!-- Agent类型标签选择 -->
        <div class="agent-tags">
          <button
              v-for="tag in agentTags"
              :key="tag.value"
              :class="['tag-btn', { active: selectedTag === tag.value }]"
              @click="selectTag(tag.value)"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- 右上角渲染方式选择 -->
      <div class="header-right">
        <div class="render-mode-selector">
          <label>渲染方式:</label>
          <select v-model="renderMode" @change="onRenderModeChange">
            <option value="stream">流式显示</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON格式</option>
            <option value="timeline">时间线</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 对话区域 -->
    <div class="chat-content" ref="chatContent">
      <!-- 状态指示器 -->
      <StatusIndicator :status="taskStatus" />

      <div class="messages-container">
        <!-- 消息列表 -->
        <div v-for="(message, index) in messages" :key="index">
          <MessageItem :message="message" :renderMode="renderMode" />
        </div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-message">
          <div class="loading-spinner"></div>
          <span>AI正在思考中...</span>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input">
      <div class="input-container">
        <textarea
            v-model="inputMessage"
            @keydown.enter.prevent="sendMessage"
            @keydown.shift.enter="inputMessage += '\n'"
            placeholder="请输入您的问题... (Enter发送，Shift+Enter换行)"
            rows="3"
            :disabled="isLoading"
        ></textarea>
        <button
            @click="sendMessage"
            :disabled="!inputMessage.trim() || isLoading"
            class="send-btn"
        >
          <i class="icon-send"></i>
          发送
        </button>
      </div>

      <!-- 快捷操作 -->
      <div class="quick-actions">
        <button @click="clearChat" class="action-btn">
          <i class="icon-clear"></i>
          清空对话
        </button>
        <button @click="exportChat" class="action-btn">
          <i class="icon-export"></i>
          导出对话
        </button>
      </div>
    </div>
  </div>
</template>


<style>
/* Styles moved to src/styles/chat.css; component-specific styles live in each component */
</style>
