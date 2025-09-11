<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
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
// SSE
import { SSE } from 'sse.js'

// 响应式数据
const selectedTag = ref('ReAct')
const renderMode = ref('stream')
const inputMessage = ref('')
const isLoading = ref(false)
// 对话渲染的主列表：按nodeId聚合显示
const messages = ref<any[]>([])
// nodeId -> messages数组中的索引，便于快速合并
const nodeIndex = ref<Record<string, number>>({})
const chatContent = ref<HTMLElement>()
// 连接状态
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
// 任务执行状态
const taskStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')

// Agent类型标签
const agentTags = [
  { label: 'ReAct', value: 'ReAct', description: '推理-行动-观察框架' },
  { label: '代码编写', value: 'coding', description: '专业代码生成助手', disabled: true }
]

// 会话ID
const sessionId = ref(`session-${Date.now()}`)

// 选择标签
const selectTag = (tag: string) => {
  if (tag === 'coding') {
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

  const userMessage = {
    type: 'user',
    sender: '用户',
    content: inputMessage.value,
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
    if (selectedTag.value === 'ReAct') {
      await executeReAct(currentMessage)
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    messages.value.push({
      type: 'error',
      sender: 'System',
      content: '发送失败: ' + (error as Error).message,
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

// 执行ReAct - 使用 sse.js 以 POST 方式处理 SSE 流
const executeReAct = async (message: string) => {
  return new Promise<void>((resolve, reject) => {
    const source = new SSE('/api/agent/chat/react/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      payload: JSON.stringify({
        message: message,
        userId: 'user-001',
        sessionId: sessionId.value,
        agentType: 'ReAct'
      })
    })

    const closeAndResolve = () => {
      try {
        if (source && typeof (source as any).close === 'function') {
          (source as any).close()
        }
      } catch (e) {
        console.warn('关闭SSE连接时出错:', e)
      }
      resolve()
    }

    source.addEventListener('open', () => {
      console.log('SSE连接已建立')
      connectionStatus.value = 'connected'
      taskStatus.value = 'running'
    })

    source.addEventListener('message', (evt: MessageEvent) => {
      console.log('收到SSE消息:', evt.data)
      if (!evt?.data) return
      try {
        const data = JSON.parse(evt.data)
        handleReActEvent(data)
        if (data.type === 'DONE') {
          taskStatus.value = 'completed'
          setTimeout(closeAndResolve, 100) // 延迟关闭，确保消息处理完成
        } else if (data.type === 'ERROR') {
          taskStatus.value = 'error'
          setTimeout(closeAndResolve, 100)
        }
      } catch (e) {
        console.warn('解析SSE数据失败:', evt.data, e)
        // 尝试直接处理原始数据
        handleReActEvent({
          type: 'OBSERVING',
          message: evt.data,
          timestamp: new Date().toISOString()
        })
      }
    })

    source.addEventListener('error', (err: any) => {
      console.error('SSE连接错误:', err);
      connectionStatus.value = 'error'
      taskStatus.value = 'error'

      try {
        if (source && typeof (source as any).close === 'function') {
          (source as any).close()
        }
      } catch {}

      messages.value.push({
        type: 'error',
        sender: 'System Error',
        content: '❌ 连接失败，请检查后端服务是否正常运行。\n错误详情: ' + (err?.message || err?.type || '未知错误'),
        timestamp: new Date()
      });
      nextTick(() => scrollToBottom());
      reject(new Error('SSE连接失败: ' + (err?.message || err?.type || '未知错误')))
    })

    // 启动SSE流
    try {
      (source as any).stream()
    } catch (e) {
      console.error('启动SSE流失败:', e)
      reject(new Error('启动SSE流失败: ' + (e as Error).message))
    }
  })
}

// 处理ReAct事件（基于nodeId聚合）
const handleReActEvent = (event: any) => {
  // 事件类型映射到前端样式
  const messageMap: Record<string, string> = {
    'STARTED': 'system',
    'PROGRESS': 'system',
    'THINKING': 'thinking',
    'ACTING': 'action',
    'OBSERVING': 'observing',
    'EXECUTING': 'executing',
    'DONE': 'completed',
    'ERROR': 'error'
  }

  // 关键ID：用于聚合
  const nodeId: string = event.nodeId || event.agentId || event.sessionId || 'react-node'
  const eventType = event.type
  const messageType = messageMap[eventType] || 'system'
  let content = (event.message || '').toString()
  const ts = new Date(event.timestamp || Date.now())

  // 跳过空内容的事件，但保留重要的状态事件
  // if (!content.trim() && !['STARTED', 'DONE', 'ERROR'].includes(eventType)) {
  //   return
  // }

  // 为空内容的状态事件提供默认消息
  // if (!content.trim()) {
  //   const defaultMessages = {
  //     'STARTED': '🚀 ReAct任务开始执行...',
  //     'DONE': '✅ 任务执行完成！',
  //     'ERROR': '❌ 任务执行出错'
  //   }
  //   content = defaultMessages[eventType as keyof typeof defaultMessages] || ''
  // }

  // 处理完成时间显示
  // if (eventType === 'DONE' && content.includes('结束时间:')) {
  //   content = formatCompletionMessage(content)
  // }

  // 如果该nodeId已存在，则合并内容；否则新增一个节点
  const idx = nodeIndex.value[nodeId]
  if (idx !== undefined) {
    const node = messages.value[idx]
    // 将新的内容附加在已有内容之后，便于阅读
    node.content = node.content ? `${node.content}${content}` : content
    node.type = messageType
    node.eventType = eventType
    node.timestamp = ts
    node.events?.push?.(event)
    node.isCompletion = eventType === 'DONE'
  } else {
    const node = {
      nodeId,
      sessionId: event.sessionId,
      agentId: event.agentId,
      type: messageType,
      eventType: eventType,
      sender: getSenderByEventType(eventType),
      content: content,
      timestamp: ts,
      events: [event],
      isCompletion: eventType === 'DONE'
    }
    messages.value.push(node)
    nodeIndex.value[nodeId] = messages.value.length - 1
  }

  nextTick(() => scrollToBottom())
}

// 根据事件类型获取发送者名称
const getSenderByEventType = (eventType: string): string => {
  const senderMap: Record<string, string> = {
    'STARTED': 'System',
    'PROGRESS': 'System',
    'THINKING': 'AI思考',
    'ACTING': 'AI行动',
    'OBSERVING': 'AI观察',
    'EXECUTING': 'AI执行',
    'DONE': 'Task Completed',
    'ERROR': 'System Error'
  }
  return senderMap[eventType] || 'Agent'
}

// 格式化完成消息
const formatCompletionMessage = (content: string): string => {
  // 提取时间信息
  const timeMatch = content.match(/结束时间:\s*([^,\n]+)/)
  if (timeMatch) {
    const endTime = timeMatch[1]
    const formattedTime = formatDateTime(endTime)
    return `✅ 任务执行完成！\n🕐 完成时间: ${formattedTime}`
  }
  return content
}

// 格式化日期时间
const formatDateTime = (dateTimeStr: string): string => {
  try {
    const date = new Date(dateTimeStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (e) {
    return dateTimeStr
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

// 滚动到底部
const scrollToBottom = () => {
  if (chatContent.value) {
    chatContent.value.scrollTop = chatContent.value.scrollHeight
  }
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
    type: 'system',
    sender: 'AI Assistant',
    content: `欢迎使用 ${selectedTag.value} Agent！我可以帮助您解决各种问题。请输入您的问题开始对话。`,
    timestamp: new Date()
  })
})
</script>
<template>
  <div class="chat-container">
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
      <div v-if="taskStatus !== 'idle'" class="status-indicator">
        <div :class="['status-badge', taskStatus]">
          <i :class="getStatusIcon(taskStatus)"></i>
          <span>{{ getStatusText(taskStatus) }}</span>
          <div v-if="taskStatus === 'running'" class="status-spinner"></div>
        </div>
      </div>

      <div class="messages-container">
        <!-- 消息列表 -->
        <div
            v-for="(message, index) in messages"
            :key="index"
            :class="['message', message.type]"
        >
          <div class="message-header">
            <span class="sender">{{ message.sender }}</span>
            <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
          </div>

          <!-- 根据渲染方式显示不同内容 -->
          <div class="message-content">
            <div v-if="renderMode === 'stream'" class="stream-content">
              <div v-if="message.type === 'thinking'" class="thinking-message">
                <i class="icon-thinking"></i>
                <div class="message-text">
                  <pre v-if="message.content.includes('\n')" class="formatted-content">{{ message.content }}</pre>
                  <span v-else>{{ message.content }}</span>
                </div>
              </div>
              <div v-else-if="message.type === 'action'" class="action-message">
                <i class="icon-action"></i>
                <div class="message-text">
                  <pre v-if="message.content.includes('\n')" class="formatted-content">{{ message.content }}</pre>
                  <span v-else>{{ message.content }}</span>
                </div>
              </div>
              <div v-else-if="message.type === 'observing'" class="observing-message">
                <i class="icon-observing"></i>
                <div class="message-text">
                  <pre v-if="message.content.includes('\n')" class="formatted-content">{{ message.content }}</pre>
                  <span v-else>{{ message.content }}</span>
                </div>
              </div>
              <div v-else-if="message.type === 'completed'" class="completion-message">
                <i class="icon-completed"></i>
                <div class="message-text completion-text">
                  <pre v-if="message.content.includes('\n')" class="formatted-content">{{ message.content }}</pre>
                  <span v-else>{{ message.content }}</span>
                </div>
              </div>
              <div v-else class="normal-message">
                <div class="message-text">
                  <pre v-if="message.content.includes('\n')" class="formatted-content">{{ message.content }}</pre>
                  <span v-else>{{ message.content }}</span>
                </div>
              </div>
            </div>

            <div v-else-if="renderMode === 'markdown'" class="markdown-content">
              <div v-html="renderMarkdown(message.content)"></div>
            </div>

            <div v-else-if="renderMode === 'json'" class="json-content">
              <pre>{{ JSON.stringify(message, null, 2) }}</pre>
            </div>

            <div v-else-if="renderMode === 'timeline'" class="timeline-content">
              <div class="timeline-item">
                <div class="timeline-marker"></div>
                <div class="timeline-content-inner">
                  <strong>{{ message.type.toUpperCase() }}</strong>
                  <p>{{ message.content }}</p>
                </div>
              </div>
            </div>
          </div>
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


<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-left h2 {
  margin: 0 0 0.5rem 0;
  color: #333;
  font-size: 1.5rem;
}

.agent-tags {
  display: flex;
  gap: 0.5rem;
}

.tag-btn {
  padding: 0.5rem 1rem;
  border: 2px solid #ddd;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
}

.tag-btn:hover {
  border-color: #007bff;
}

.tag-btn.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.tag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-right {
  display: flex;
  align-items: center;
}

.render-mode-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.render-mode-selector label {
  font-weight: 500;
  color: #666;
}

.render-mode-selector select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  position: relative;
}

.status-indicator {
  position: sticky;
  top: 0;
  z-index: 10;
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  backdrop-filter: blur(10px);
}

.status-badge.running {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  border: 1px solid rgba(33, 150, 243, 0.3);
}

.status-badge.completed {
  background: rgba(76, 175, 80, 0.1);
  color: #388e3c;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.status-badge.error {
  background: rgba(244, 67, 54, 0.1);
  color: #d32f2f;
  border: 1px solid rgba(244, 67, 54, 0.3);
}

.status-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.messages-container {
  max-width: 800px;
  margin: 0 auto;
}

.message {
  margin-bottom: 1rem;
  padding: 1rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.message.user {
  background: #e3f2fd;
  margin-left: 2rem;
}

.message.thinking {
  background: #fff3e0;
  border-left: 4px solid #ff9800;
}

.message.action {
  background: #e8f5e8;
  border-left: 4px solid #4caf50;
}

.message.observing {
  background: #f3e5f5;
  border-left: 4px solid #9c27b0;
}

.message.error {
  background: #ffebee;
  border-left: 4px solid #f44336;
}

.message.completed {
  background: #e8f5e8;
  border-left: 4px solid #4caf50;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: #666;
}

.sender {
  font-weight: 500;
}

.message-content {
  line-height: 1.6;
}

.stream-content .thinking-message,
.stream-content .action-message,
.stream-content .observing-message,
.stream-content .completion-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.message-text {
  flex: 1;
  line-height: 1.6;
}

.formatted-content {
  background: transparent;
  padding: 0;
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
  border: none;
}

.completion-text {
  font-weight: 500;
  color: #2e7d32;
}

.completion-message {
  animation: slideInUp 0.3s ease-out;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.json-content pre {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9rem;
}

.timeline-content {
  position: relative;
  padding-left: 2rem;
}

.timeline-marker {
  position: absolute;
  left: 0;
  top: 0.5rem;
  width: 12px;
  height: 12px;
  background: #007bff;
  border-radius: 50%;
}

.timeline-marker::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 2px;
  height: 2rem;
  background: #ddd;
  transform: translateX(-50%);
}

.loading-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.chat-input {
  padding: 1rem 1.5rem;
  background: white;
  border-top: 1px solid #e0e0e0;
}

.input-container {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.input-container textarea {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
}

.send-btn {
  padding: 0.75rem 1.5rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.3s;
}

.send-btn:hover:not(:disabled) {
  background: #0056b3;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  transition: background 0.3s;
}

.action-btn:hover {
  background: #e9ecef;
}

/* 图标样式 */
.icon-thinking::before { content: '🤔'; }
.icon-action::before { content: '⚡'; }
.icon-observing::before { content: '👁️'; }
.icon-completed::before { content: '✅'; }
.icon-running::before { content: '🔄'; }
.icon-error::before { content: '❌'; }
.icon-send::before { content: '📤'; }
.icon-clear::before { content: '🗑️'; }
.icon-export::before { content: '📥'; }
</style>
