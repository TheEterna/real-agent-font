<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, h, watch } from 'vue'
import { UIMessage, MessageType, EventType } from '@/types/events'
import { AgentType } from '@/types/agents'
import { useChatStore } from '@/stores/chatStore'
import { getAgentUIConfig } from '@/agent-ui/registry'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import EnhancedToolApprovalCard from '@/components/EnhancedToolApprovalCard.vue'
import { useSSE } from '@/composables/useSSE'
import { notification } from 'ant-design-vue'
import {
  SendOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  BulbOutlined
} from '@ant-design/icons-vue'
import { Attachment } from '@/models/attachment'
import { TemplateItem } from '@/models/template'
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
import '@/styles/agents/react-plus.css'
import { NotificationType } from '@/models/notification'
import { getRandomTooltipColor } from '@/utils/colorUtils'

// 共享状态（会话/Agent 选择）
const chat = useChatStore()
const inputMessage = ref('')
const attachments = ref<Attachment[]>([])

// 工具审批状态管理
const pendingApprovals = ref<Map<string, any>>(new Map())
const approvalResults = ref<Map<string, any>>(new Map())

// 附件约束
const MAX_FILES = 4
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB
const allowedExts = new Set([
  '.txt','.md','.markdown','.java','.kt','.scala','.py','.go','.js','.mjs','.cjs','.ts','.tsx',
  '.json','.yml','.yaml','.xml','.html','.css','.scss','.less','.vue','.svelte','.c','.cpp','.h','.hpp',
  '.cs','.rs','.php','.rb','.swift','.m','.mm','.sql','.sh','.bat','.ps1','.ini','.conf','.log','.pdf'
])

const isAllowedFile = (f: File) => {
  if (f.type.startsWith('image/')) return true
  if (f.type === 'application/pdf' || f.type === 'text/plain' || f.type === 'application/json' || f.type === 'text/markdown') return true
  const dot = f.name.lastIndexOf('.')
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
  return allowedExts.has(ext)
}

const bytes = (n: number) => Math.round(n/1024)
const totalSize = () => attachments.value.reduce((s,a)=>s+a.size,0)

const pushFilesWithValidation = (files: File[]) => {
  // 数量限制
  if (attachments.value.length + files.length > MAX_FILES) {
    notification.error({ message: '超出附件数量上限', description: `最多支持 ${MAX_FILES} 个附件` })
    return
  }
  // 校验每个文件
  let added: Attachment[] = []
  for (const f of files) {
    if (!isAllowedFile(f)) {
      notification.error({ message: '不支持的文件类型', description: `${f.name}` })
      continue
    }
    if (f.size > MAX_FILE_SIZE) {
      notification.error({ message: '文件过大', description: `${f.name} 大小 ${bytes(f.size)}KB，单个上限为 ${bytes(MAX_FILE_SIZE)}KB` })
      continue
    }
    const after = totalSize() + added.reduce((s,a)=>s+a.size,0) + f.size
    if (after > MAX_TOTAL_SIZE) {
      notification.error({ message: '超过总大小限制', description: `当前合计将超过 ${bytes(MAX_TOTAL_SIZE)}KB` })
      continue
    }
    added.push(new Attachment(f.name, f.size, f))
  }
  if (added.length) attachments.value.push(...added)
}

const isLoading = ref(false)
const chatContent = ref<HTMLElement>()
const showScrollButton = ref(false)

// 发送可用状态（控制"亮起"）
const canSend = computed(() => inputMessage.value.trim().length > 0 && !isLoading.value)
// 输入区 hover 状态（原子类控制）
const isInputHover = ref(false)

// 滚动到底部（供 composable 回调使用）
const scrollToBottom = () => {
  if (!chatContent.value) return
  chatContent.value.scrollTo({ top: chatContent.value.scrollHeight, behavior: 'smooth' })
}

const updateScrollButtonVisibility = () => {
  if (!chatContent.value) return
  const el = chatContent.value
  const threshold = 80
  const distance = el.scrollHeight - (el.scrollTop + el.clientHeight)
  showScrollButton.value = distance > threshold
}

// 增强的通知处理 - 包含更丰富的视觉效果
const handleDoneNotice = (node: { text: string; timestamp: Date; title: string; nodeId?: string, type: NotificationType }) => {
  const key = `done-${node.timestamp.getTime()}-${Math.random().toString(36).slice(2,8)}`
  const backgroundColor = getRandomTooltipColor()

  const onClick = () => locateByNode(node.nodeId)

  const desc = h('div', {
    style: 'max-width: 320px; background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border-radius: 8px; padding: 8px;'
  }, [
    h('div', { style: 'margin-top:4px; font-size:12px; color:#e5e7eb; display:flex; align-items:center; gap:8px;' }, [
      h('span', '🤖'),
      h('span', formatTime(node.timestamp as any)),
      h('span', '·'),
      h('span', { style: 'max-width: 180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight: 500;' }, node.title || '')
    ])
  ])

  const notificationConfig = {
    message: node.text,
    description: desc,
    key,
    duration: 10,
    onClick,
    style: {
      background: backgroundColor,
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '12px'
    }
  }

  switch(node.type) {
    case NotificationType.SUCCESS:
      notification.success({ ...notificationConfig, message: `✅ ${node.text}` })
      break
    case NotificationType.ERROR:
      notification.error({ ...notificationConfig, message: `❌ ${node.text}` })
      break
    case NotificationType.WARNING:
      notification.warning({ ...notificationConfig, message: `⚠️ ${node.text}` })
      break
    case NotificationType.INFO:
      notification.info({ ...notificationConfig, message: `ℹ️ ${node.text}` })
      break
    default:
      notification.info({ ...notificationConfig, message: `🔔 ${node.text}` })
      break
  }
}

// 自定义 SSE 处理，包含工具审批逻辑
const customHandleEvent = (event: any, source: any) => {
  // 检查是否为工具审批事件
  if (event.type === EventType.TOOL_APPROVAL) {
    const approvalId = event.nodeId || `approval-${Date.now()}`

    // 存储审批请求
    pendingApprovals.value.set(approvalId, {
      toolName: event.data?.toolName,
      args: event.data?.args,
      callId: event.data?.callId,
      riskLevel: event.data?.riskLevel || 'medium',
      expectedResult: event.data?.expectedResult,
      timestamp: new Date(),
      nodeId: approvalId
    })

    // 创建审批消息
    const approvalMessage: UIMessage = {
      nodeId: approvalId,
      sessionId: event.sessionId,
      type: MessageType.ToolApproval,
      eventType: EventType.TOOL_APPROVAL,
      sender: 'System',
      message: '需要您的审批才能执行工具',
      timestamp: new Date(),
      approval: pendingApprovals.value.get(approvalId),
      meta: event.meta
    }

    messages.value.push(approvalMessage)
    scrollToBottom()
    return
  }

  // 对于其他事件，使用默认处理
  handleEvent(event, source)
}

const { messages, nodeIndex, connectionStatus, taskStatus, progress, executeReAct, handleEvent } = useSSE({
  onDoneNotice: handleDoneNotice
})

// 工具审批处理函数
const handleToolApproved = (approvalId: string, result: any) => {
  approvalResults.value.set(approvalId, { status: 'approved', result, timestamp: new Date() })
  pendingApprovals.value.delete(approvalId)

  notification.success({
    message: '工具执行已批准',
    description: '工具将继续执行，请等待结果...',
    duration: 3
  })
}

const handleToolRejected = (approvalId: string, reason: string) => {
  approvalResults.value.set(approvalId, { status: 'rejected', reason, timestamp: new Date() })
  pendingApprovals.value.delete(approvalId)

  notification.warning({
    message: '工具执行已拒绝',
    description: reason,
    duration: 3
  })
}

const handleToolError = (approvalId: string, error: Error) => {
  approvalResults.value.set(approvalId, { status: 'error', error: error.message, timestamp: new Date() })

  notification.error({
    message: '工具执行失败',
    description: error.message,
    duration: 5
  })
}

const locateNotice = (n: { nodeId?: string }) => {
  if (n?.nodeId && chatContent.value) {
    const target = document.getElementById('msg-' + n.nodeId)
    if (target) {
      const container = chatContent.value
      const top = (target as HTMLElement).offsetTop
      container.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
      return
    }
  }
  // 兜底：滚动到底部
  scrollToBottom()
}

const locateByNode = (nodeId?: string) => locateNotice({ nodeId })

onUnmounted(() => {
  chatContent.value?.removeEventListener('scroll', updateScrollButtonVisibility)
})

// 根据所选 Agent 获取 UI 配置（主题/渲染/交互）
const agentUI = computed(() => getAgentUIConfig(AgentType.ReAct_Plus))

// 会话ID
const sessionId = chat.sessionId

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
    await executeReAct(currentMessage, sessionId.value)
  } catch (error) {
    console.error('发送消息失败:', error)
    messages.value.push({
      type: MessageType.Error,
      eventType: 'ERROR',
      sender: 'System',
      message: '发送失败: ' + (error as Error).message,
      timestamp: new Date()
    })
  } finally {
    isLoading.value = false
    connectionStatus.value.set('disconnected')
    if (taskStatus.value.is('running')) {
      taskStatus.value.set('error')
    }
    // 清空已发送的附件
    attachments.value = []
  }
}

// 会话切换：保存旧会话消息并加载新会话消息
watch(() => chat.sessionId.value, (newId, oldId) => {
  if (oldId) {
    chat.setSessionMessages(oldId, messages.value)
  }
  const next = chat.getSessionMessages(newId)
  messages.value = next && next.length ? [...next] : []
  nodeIndex.value = {}
  // 清理审批状态
  pendingApprovals.value.clear()
  approvalResults.value.clear()
})

// 消息变化时，更新当前会话的消息，并触碰更新时间
watch(messages, (val) => {
  chat.setSessionMessages(sessionId.value, val)
  chat.touchSession(sessionId.value)
}, { deep: true })

// 输入区工具栏
const fileInput = ref<HTMLInputElement | null>(null)
const handleUploadClick = () => fileInput.value?.click()
const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  pushFilesWithValidation(Array.from(files))
  input.value = ''
}

const insertCodeBlock = () => {
  const snippet = '\n```javascript\n// 请输入代码\nconsole.log("Hello ReAct+");\n```\n'
  inputMessage.value += snippet
}

const removeAttachment = (name: string) => {
  attachments.value = attachments.value.filter(a => a.name !== name)
}

const onDropFiles = (e: DragEvent) => {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  pushFilesWithValidation(Array.from(files))
}

const onPressEnter = (e: KeyboardEvent) => {
  if (e.shiftKey) return
  e.preventDefault()
  sendMessage()
}

const onPaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const it of items as any) {
    if (it.kind === 'file') {
      const f = it.getAsFile()
      if (f) files.push(f)
    }
  }
  if (files.length) {
    pushFilesWithValidation(files)
  }
}

// ReAct+ 专属模板
const templates: TemplateItem[] = [
  new TemplateItem('🧠 智能分析任务', '请对以下问题进行深度分析，包括：\n1. 问题拆解和关键要素识别\n2. 多角度思考和风险评估\n3. 制定执行策略和行动计划\n\n问题描述：\n[请在此处描述您的问题]'),
  new TemplateItem('🔧 工具链执行', '请使用相关工具完成以下任务，需要：\n1. 自动选择最适合的工具组合\n2. 按步骤执行并展示中间结果\n3. 对结果进行验证和优化\n\n任务要求：\n[请详细描述任务需求]'),
  new TemplateItem('📊 数据驱动决策', '基于以下数据和背景，帮助我做出最佳决策：\n\n背景信息：\n- 当前状况：\n- 目标期望：\n- 约束条件：\n- 风险考量：\n\n请提供详细的分析过程和建议方案'),
  new TemplateItem('🎯 目标导向规划', '请帮我制定实现以下目标的详细计划：\n\n目标：[具体目标]\n时间限制：[时间范围]\n资源情况：[可用资源]\n\n需要包括：里程碑设置、风险缓解、执行策略'),
]

const insertTemplate = (t: string) => {
  inputMessage.value = (inputMessage.value ? inputMessage.value + '\n\n' : '') + t
}

// 格式化时间
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 渲染Markdown - 与ReAct相同的配置
const resolvePlugin = (p: any) => {
  if (!p) return p
  const cand = (p as any).default ?? p
  if (typeof cand === 'function') return cand
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

// 组件挂载
onMounted(() => {
  // 优先加载当前会话已存在的消息
  const existing = chat.getSessionMessages(sessionId.value)
  if (existing && existing.length > 0) {
    messages.value = [...existing]
  } else {
    // 添加欢迎消息（ReAct+ 专属）
    messages.value.push({
      type: MessageType.System,
      sender: 'ReAct+ Assistant',
      message: `🚀 欢迎使用 ReAct+ 智能体！

我是新一代增强版 ReAct 助手，具备以下能力：

✨ **智能工具审批** - 执行工具前会请求您的确认
🧠 **深度推理** - 多层次思考和分析
🔧 **工具链协作** - 智能选择和组合使用工具
📊 **结果验证** - 自动验证和优化执行结果
🎯 **目标导向** - 始终聚焦于解决您的核心问题

现在，请告诉我您希望我帮您解决什么问题？`,
      timestamp: new Date()
    })
  }

  // 监听滚动，控制"下滑按钮"显隐
  chatContent.value?.addEventListener('scroll', updateScrollButtonVisibility)
  updateScrollButtonVisibility()
})
</script>

<template>
  <div class="chat-container" :class="agentUI.themeClass">
    <!-- 主对话区域（滚动） -->
    <div class="chat-content" ref="chatContent">
      <!-- 状态指示器 -->
      <StatusIndicator :status="taskStatus.value" />

      <!-- 全局唯一进度显示器 -->
      <div v-if="progress" class="global-progress">
        <div class="gp-icon pulse">🔄</div>
        <div class="gp-text">{{ progress.text }}</div>
        <div class="gp-time">{{ formatTime(progress.timestamp as any) }}</div>
      </div>

      <!-- 消息列表 -->
      <div class="messages-container">
        <div v-for="(message, index) in messages" :key="index" :id="message.nodeId ? 'msg-' + message.nodeId : undefined">
          <!-- 工具审批消息 -->
          <EnhancedToolApprovalCard
            v-if="message.type === MessageType.ToolApproval && message.approval"
            :approval="message.approval"
            :session-id="sessionId"
            @approved="handleToolApproved(message.nodeId!, $event)"
            @rejected="handleToolRejected(message.nodeId!, $event)"
            @error="handleToolError(message.nodeId!, $event)"
          />
          <!-- 普通消息 -->
          <MessageItem v-else :message="message" />
        </div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-message">
          <div class="loading-spinner"></div>
          <span>🧠 ReAct+ 正在深度思考...</span>
        </div>
      </div>

      <!-- 内联一键下滑按钮 -->
      <div v-show="showScrollButton" class="scroll-bottom-inline">
        <button class="scroll-bottom-btn" @click="scrollToBottom" title="滚动到底部">
          <span class="icon-arrow-down">⬇️</span>
          滚动到底部
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input">
      <!-- 增强工具栏 -->
      <div class="input-toolbar">
        <a-button size="small" class="toolbar-btn" @click="handleUploadClick">
          <template #icon><PaperClipOutlined /></template>
          上传文件
        </a-button>

        <a-button size="small" class="toolbar-btn" @click="insertCodeBlock">
          <template #icon><BulbOutlined /></template>
          代码块
        </a-button>

        <a-dropdown placement="topLeft" trigger="click">
          <a-button size="small" class="toolbar-btn">
            <template #icon><ThunderboltOutlined /></template>
            智能模板
          </a-button>
          <template #overlay>
            <a-menu @click="({ key }) => insertTemplate((templates.find(t=>t.label=== key ) as any).text)">
              <a-menu-item v-for="t in templates" :key="t.label">
                {{ t.label }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>

        <!-- Agent 信息显示 -->
        <div class="agent-info">
          <RobotOutlined />
          <span>ReAct+</span>
        </div>
      </div>

      <div
        class="input-surface"
        :class="{ 'input-surface--light': canSend, 'input-surface--hover': isInputHover }"
        @dragover.prevent
        @drop="onDropFiles"
        @mouseenter="isInputHover = true"
        @mouseleave="isInputHover = false"
      >
        <!-- 附件预览 -->
        <div v-if="attachments.length" class="attachments">
          <div class="att-chip" v-for="a in attachments" :key="a.name" :title="a.name">
            <FileTextOutlined />
            <span class="att-name">{{ a.name }}</span>
            <span class="att-size">{{ Math.round(a.size/1024) }} KB</span>
            <button class="att-remove" @click="removeAttachment(a.name)">✕</button>
          </div>
        </div>

        <div class="input-container">
          <a-textarea
            style="flex: 1;"
            v-model:value="inputMessage"
            :auto-size="{ minRows: 3, maxRows: 12 }"
            :maxlength="4000"
            :show-count="true"
            placeholder="🚀 请描述您的任务，ReAct+ 将为您智能分析并选择最佳工具链执行...（Enter 发送，Shift+Enter 换行）"
            :disabled="isLoading"
            :bordered="false"
            @pressEnter="onPressEnter"
            @paste="onPaste"
          />

          <a-button
            type="primary"
            size="large"
            :disabled="!canSend"
            :class="['send-btn', 'approval-btn-primary', { 'send-btn--light': canSend }]"
            @click="sendMessage"
            :loading="isLoading"
          >
            <template #icon v-if="!isLoading"><SendOutlined /></template>
            {{ isLoading ? '思考中...' : '发送' }}
          </a-button>

          <input
            ref="fileInput"
            type="file"
            style="display:none"
            multiple
            accept=".txt,.md,.markdown,.java,.kt,.scala,.py,.go,.js,.mjs,.cjs,.ts,.tsx,.json,.yml,.yaml,.xml,.html,.css,.scss,.less,.vue,.svelte,.c,.cpp,.h,.hpp,.cs,.rs,.php,.rb,.swift,.m,.mm,.sql,.sh,.bat,.ps1,.ini,.conf,.log,.pdf,image/*"
            @change="onFileChange"
          />
        </div>
      </div>

      <!-- 快速操作提示 -->
      <div class="quick-tips" v-if="!isLoading && messages.length <= 1">
        <div class="tip-item" @click="insertTemplate(templates[0].text)">
          <ThunderboltOutlined />
          <span>智能分析</span>
        </div>
        <div class="tip-item" @click="insertTemplate(templates[1].text)">
          <BulbOutlined />
          <span>工具链执行</span>
        </div>
        <div class="tip-item" @click="insertCodeBlock">
          <FileTextOutlined />
          <span>代码处理</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Styles moved to src/styles/chat.css; component-specific styles live in each component */
</style>
