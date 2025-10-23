<script setup lang="ts">
import {ref, onMounted, onUnmounted, nextTick, computed, h, watch} from 'vue'
import {useModeSwitch} from '@/composables/useModeSwitch'
import {UIMessage, MessageType, EventType} from '@/types/events'
import {AgentType} from '@/types/session'
import {useChatStore} from '@/stores/chatStore'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import CollapsibleThinking from '@/components/messages/CollapsibleThinking.vue'
import EnhancedToolApprovalCard from '@/components/EnhancedToolApprovalCard.vue'
import InkModeButton from '@/components/InkModeButton.vue'
import InkTransition from '@/components/InkTransition.vue'
import {NeonModeButton, GeekModeButton} from '@/components/button'
import {useSSE} from '@/composables/useSSE'
import {notification} from 'ant-design-vue'
import {
  SendOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  ArrowDownOutlined,
  SettingOutlined,
  MoreOutlined,
  MenuOutlined,
  CloseOutlined
} from '@ant-design/icons-vue'
import {Attachment} from '@/types/attachment'
import {TemplateItem} from '@/types/template'
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
// GSAP动画库
import {gsap} from 'gsap'
// 样式引入
import 'highlight.js/styles/atom-one-light.css'
import 'katex/dist/katex.min.css'
import {NotificationType} from '@/types/notification'
import {useMessageConfig} from '@/composables/useMessageConfig'
import TerminalContainer from '@/components/terminal/TerminalContainer.vue'
import {MessageStyle} from '@/types/messageConfig'
import {ProgressInfo} from "@/types/status";
import {useRoute, useRouter} from "vue-router";

// 共享状态（会话/Agent 选择）
const chat = useChatStore()
const inputMessage = ref('')
const attachments = ref<Attachment[]>([])
const router = useRouter()
const route = useRoute()
// 🎭 模式切换功能
const {
  currentMode,
  currentModeConfig,
  currentThemeClass,
  isGeekMode,
  isMultimodalMode,
  isCommandMode,
  switchMode
} = useModeSwitch()

// 🖥️ 终端界面状态管理
const terminalRef = ref<InstanceType<typeof TerminalContainer>>()
const terminalReady = ref(false)

// 终端事件处理
const handleTerminalReady = (terminal: any) => {
  terminalReady.value = true
  console.log('Terminal ready:', terminal)
}

const handleTerminalData = (data: string) => {
  // 处理终端输入数据
  console.log('Terminal data:', data)
  // 这里可以处理终端命令，发送到后端等
}

const handleTerminalKey = (event: { key: string; domEvent: KeyboardEvent }) => {
  // 处理特殊按键
  console.log('Terminal key:', event)
}

// 消息配置 - 使用 ChatGPT 风格
const {getMessageConfig, shouldCollapse} = useMessageConfig(MessageStyle.CHATGPT)

// 工具审批状态管理
const pendingApprovals = ref<Map<string, any>>(new Map())
const approvalResults = ref<Map<string, any>>(new Map())

// UI状态管理
const isLoading = computed(() => taskStatus.value.is('running'))
const chatContent = ref<HTMLElement>()
const showScrollButton = ref(false)
const rightPanelCollapsed = ref(false)

const inkTransitionTrigger = ref(false)
const inkOrigin = ref({x: 0, y: 0})

// DOM引用
const appContainer = ref<HTMLElement>()
const messageElements = ref<HTMLElement[]>([])

// 发送可用状态
const canSend = computed(() => inputMessage.value.trim().length > 0 && !isLoading.value)

// 附件约束
const MAX_FILES = 4
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB
const allowedExts = new Set([
  '.txt', '.md', '.markdown', '.java', '.kt', '.scala', '.py', '.go', '.js', '.mjs', '.cjs', '.ts', '.tsx',
  '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.scss', '.less', '.vue', '.svelte', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rs', '.php', '.rb', '.swift', '.m', '.mm', '.sql', '.sh', '.bat', '.ps1', '.ini', '.conf', '.log', '.pdf'
])

const isAllowedFile = (f: File) => {
  if (f.type.startsWith('image/')) return true
  if (f.type === 'application/pdf' || f.type === 'text/plain' || f.type === 'application/json' || f.type === 'text/markdown') return true
  const dot = f.name.lastIndexOf('.')
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
  return allowedExts.has(ext)
}

const bytes = (n: number) => Math.round(n / 1024)
const totalSize = () => attachments.value.reduce((s, a) => s + a.size, 0)

const pushFilesWithValidation = (files: File[]) => {
  // 数量限制
  if (attachments.value.length + files.length > MAX_FILES) {
    notification.error({message: '超出附件数量上限', description: `最多支持 ${MAX_FILES} 个附件`})
    return
  }
  // 校验每个文件
  let added: Attachment[] = []
  for (const f of files) {
    if (!isAllowedFile(f)) {
      notification.error({message: '不支持的文件类型', description: `${f.name}`})
      continue
    }
    if (f.size > MAX_FILE_SIZE) {
      notification.error({
        message: '文件过大',
        description: `${f.name} 大小 ${bytes(f.size)}KB，单个上限为 ${bytes(MAX_FILE_SIZE)}KB`
      })
      continue
    }
    const after = totalSize() + added.reduce((s, a) => s + a.size, 0) + f.size
    if (after > MAX_TOTAL_SIZE) {
      notification.error({message: '超过总大小限制', description: `当前合计将超过 ${bytes(MAX_TOTAL_SIZE)}KB`})
      continue
    }
    added.push(new Attachment(f.name, f.size, f))
  }
  if (added.length) attachments.value.push(...added)
}

// 滚动相关
const scrollToBottom = () => {
  if (!chatContent.value) return
  chatContent.value.scrollTo({top: chatContent.value.scrollHeight, behavior: 'smooth'})
}

const updateScrollButtonVisibility = () => {
  if (!chatContent.value) return
  const el = chatContent.value
  const threshold = 80
  const distance = el.scrollHeight - (el.scrollTop + el.clientHeight)
  showScrollButton.value = distance > threshold
}

// 增强的通知处理
const handleDoneNotice = (node: {
  text: string;
  timestamp: Date;
  title: string;
  nodeId?: string,
  type: NotificationType
}) => {
  const key = `done-${node.timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`

  const onClick = () => locateByNode(node.nodeId)

  const notificationConfig = {
    message: node.text,
    key,
    duration: 5,
    onClick,
    style: {
      borderRadius: '8px',
      backdropFilter: 'blur(10px)',
    }
  }

  switch (node.type) {
    case NotificationType.SUCCESS:
      notification.success({...notificationConfig, message: `✅ ${node.text}`})
      break
    case NotificationType.ERROR:
      notification.error({...notificationConfig, message: `❌ ${node.text}`})
      break
    case NotificationType.WARNING:
      notification.warning({...notificationConfig, message: `⚠️ ${node.text}`})
      break
    case NotificationType.INFO:
      notification.info({...notificationConfig, message: `ℹ️ ${node.text}`})
      break
    default:
      notification.info({...notificationConfig, message: `🔔 ${node.text}`})
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

let {messages, nodeIndex, connectionStatus, taskStatus, progress, executeReAct, handleEvent} = useSSE({
  onDoneNotice: handleDoneNotice
})
// 工具审批处理函数
const handleToolApproved = (approvalId: string, result: any) => {
  approvalResults.value.set(approvalId, {status: 'approved', result, timestamp: new Date()})
  pendingApprovals.value.delete(approvalId)

  notification.success({
    message: '工具执行已批准',
    description: '工具将继续执行，请等待结果...',
    duration: 3
  })
}

const handleToolRejected = (approvalId: string, reason: string) => {
  approvalResults.value.set(approvalId, {status: 'rejected', reason, timestamp: new Date()})
  pendingApprovals.value.delete(approvalId)

  notification.warning({
    message: '工具执行已拒绝',
    description: reason,
    duration: 3
  })
}

const handleToolError = (approvalId: string, error: Error) => {
  approvalResults.value.set(approvalId, {status: 'error', error: error.message, timestamp: new Date()})

  notification.error({
    message: '工具执行失败',
    description: error.message,
    duration: 5
  })
}

const handleToolRetryRequested = (approvalId: string, params: any) => {
  approvalResults.value.set(approvalId, {status: 'retry-requested', params, timestamp: new Date()})
  pendingApprovals.value.delete(approvalId)

  notification.info({
    message: '🔄 工具重新执行请求',
    description: `正在重新分析 ${params.toolName} 工具调用...`,
    duration: 4
  })

  // 这里可以触发重新执行工具的逻辑
  console.log('🔄 重新执行工具请求:', params)

  // TODO: 实现重新执行工具的后端API调用
  // 可以调用类似 executeReAct 但是专门用于重试工具的API
}

const handleToolTerminateRequested = (approvalId: string, reason: string) => {
  approvalResults.value.set(approvalId, {status: 'terminated', reason, timestamp: new Date()})
  pendingApprovals.value.delete(approvalId)

  notification.warning({
    message: '🛑 对话已终止',
    description: reason,
    duration: 6
  })

  // 终止当前任务和连接
  if (taskStatus.value.is('running')) {
    taskStatus.value.set('completed')
  }
  connectionStatus.value.set('disconnected')

  // 添加系统消息通知用户对话已终止
  messages.value.push({
    type: MessageType.System,
    sender: 'System',
    message: `🛑 **对话已终止**

${reason}

您可以开始新的对话或选择其他会话继续。`,
    timestamp: new Date(),
    nodeId: `terminate-${Date.now()}`
  })

  // 滚动到底部显示终止消息
  nextTick(() => {
    scrollToBottom()
  })
}

const locateByNode = (nodeId?: string) => {
  if (nodeId && chatContent.value) {
    const target = document.getElementById('msg-' + nodeId)
    if (target) {
      const container = chatContent.value
      const top = (target as HTMLElement).offsetTop
      container.scrollTo({top: Math.max(0, top - 12), behavior: 'smooth'})
      return
    }
  }
  scrollToBottom()
}

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
    // 出错时手动设置任务状态
    taskStatus.value.set('error')
  } finally {
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
watch(messages, (val, oldVal) => {
  chat.setSessionMessages(sessionId.value, val)
  chat.touchSession(sessionId.value)

  // 🐉 GSAP: 为新添加的消息应用入场动画
  if (val.length > oldVal.length) {
    nextTick(() => {
      const messageElements = document.querySelectorAll('.message-wrapper')
      const newMessage = messageElements[messageElements.length - 1] as HTMLElement
      if (newMessage) {
        animateMessageEntry(newMessage)
      }
    })
  }
}, {deep: true})

// 根据当前路由设置模式状态
const syncModeFromRoute = () => {
  const path = route.path
  const queryMode = route.query.mode as InputMode

  // 优先使用 URL 查询参数中的模式
  if (queryMode && ['geek', 'multimodal', 'command'].includes(queryMode)) {
    currentMode.value = queryMode
    return
  }

  // 根据路径推断模式
  if (path === '/chat/geek') {
    currentMode.value = 'geek'
  } else if (path === '/chat') {
    currentMode.value = 'multimodal'
  } else {
    currentMode.value = 'multimodal' // 默认
  }
}

// 监听路由变化同步模式
watch(route, () => {
  syncModeFromRoute()
}, { immediate: true })

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

// 渲染Markdown
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
        const out = hljs.highlight(code, {language: lang}).value
        return `<pre class="hljs"><code>${out}</code></pre>`
      } catch {
      }
    }
    const escaped = md.utils.escapeHtml(code)
    return `<pre class="hljs"><code>${escaped}</code></pre>`
  }
})
    .use(resolvePlugin(emoji))
    .use(resolvePlugin(taskLists), {label: true, labelAfter: true})
    .use(resolvePlugin(container), 'info')
    .use(resolvePlugin(container), 'warning')
    .use(resolvePlugin(container), 'success')
    .use(resolvePlugin(anchor))
    .use(resolvePlugin(mkatex))

// 🐉 GSAP 动画系统 - 性能优化版
const initGSAPAnimations = () => {
  // ========== 1. 页面初始化动画 ==========
  if (appContainer.value) {
    // 页面淡入效果 - 只在初始化时执行一次
    gsap.fromTo(appContainer.value,
        {opacity: 0, y: 20},
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out"
        }
    )
  }

  // ========== 2. 进度指示器 - 优化版 ==========
  const pulseRings = document.querySelectorAll('.pulse-ring')
  const pulseDots = document.querySelectorAll('.pulse-dot')

  // 如果元素存在才执行动画，避免无效的查询
  if (pulseRings.length > 0) {
    pulseRings.forEach(ring => {
      gsap.to(ring, {
        scale: 1.01,
        rotation: 2,
        duration: 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true
      })
    })
  }

  if (pulseDots.length > 0) {
    pulseDots.forEach(dot => {
      gsap.to(dot, {
        scale: 1.02,
        rotation: -1,
        duration: 3.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true
      })
    })
  }
}

// ========== 3. 消息出现动画 - 青龙升腾 ==========
const animateMessageEntry = (element: HTMLElement) => {
  gsap.fromTo(element,
      {
        opacity: 0.9,
        y: 20,
        scale: 0.98
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: "back.out(1.2)",  // 青龙腾飞效果
        clearProps: "all"  // 动画完成后清除内联样式
      }
  )
}

// ========== 4. 消息 Hover - 青瓷釉光扫过 ==========
const setupMessageHoverEffects = () => {
  const messages = document.querySelectorAll('.message')

  messages.forEach(message => {
    const glazeEffect = message.querySelector('::before')

    message.addEventListener('mouseenter', () => {
      // 消息轻微上浮
      gsap.to(message, {
        x: 4,
        duration: 0.3,
        ease: "power2.out"
      })

      // 发送者下划线展开
      const sender = message.querySelector('.sender')
      if (sender) {
        const underline = window.getComputedStyle(sender, '::after')
        gsap.to(sender, {
          '--underline-width': '100%',
          duration: 0.3,
          ease: "power2.out"
        })
      }
    })

    message.addEventListener('mouseleave', () => {
      gsap.to(message, {
        x: 0,
        duration: 0.3,
        ease: "power2.out"
      })

      const sender = message.querySelector('.sender')
      if (sender) {
        gsap.to(sender, {
          '--underline-width': '0%',
          duration: 0.3,
          ease: "power2.out"
        })
      }
    })
  })
}

// ========== 5. 输入框聚焦动效 - 已移除，使用高级版本 ==========
// 已合并到 setupInputContainerAdvancedAnimations() 和 setupTextareaAdvancedAnimations()

// ========== 6. 发送按钮动效 - 已移除，使用高级版本 ==========
// 已合并到 setupSendButtonAdvancedAnimations()

// ========== 8. 滚动到底部按钮 - 简化版 ==========
const setupScrollButtonAnimation = () => {
  const scrollButton = document.querySelector('.scroll-to-bottom button')

  if (!scrollButton) return

  // 简化的呼吸效果
  gsap.to(scrollButton, {
    scale: 1.02,
    duration: 2,
    ease: "sine.inOut",
    repeat: -1,
    yoyo: true
  })

  // 简化的 Hover 效果
  scrollButton.addEventListener('mouseenter', () => {
    gsap.to(scrollButton, {
      scale: 1.05,
      y: -2,
      duration: 0.3,
      ease: "power2.out"
    })
  })

  scrollButton.addEventListener('mouseleave', () => {
    gsap.to(scrollButton, {
      scale: 1.02,
      y: 0,
      duration: 0.3,
      ease: "power2.out"
    })
  })
}

// ========== 10. 加载点动画 - 简化版 ==========
const setupLoadingDotsAnimation = () => {
  const loadingDots = document.querySelectorAll('.loading-dots span')

  // 简化的加载点动画
  loadingDots.forEach((dot, index) => {
    gsap.to(dot, {
      y: -4,
      duration: 0.6,
      ease: "power2.inOut",
      repeat: -1,
      yoyo: true,
      delay: index * 0.2
    })
  })
}


// ========== 🎨 高级 GSAP 动画系统 - 替代 CSS keyframes ==========

/**
 * 输入容器简化动画
 * 移除复杂的背景位置动画，保留基本的聚焦效果
 */
const setupInputContainerAdvancedAnimations = () => {
  const inputContainer = document.querySelector('.input-container')
  if (!inputContainer) return

  const textarea = inputContainer.querySelector('textarea')
  if (textarea) {
    let focusAnimation: gsap.core.Tween | null = null

    textarea.addEventListener('focus', () => {
      // 简化的聚焦效果
      focusAnimation = gsap.to(inputContainer, {
        borderColor: "rgba(107, 154, 152, 0.3)",
        y: -1,
        duration: 0.3,
        ease: 'power2.out'
      })
    })

    textarea.addEventListener('blur', () => {
      if (focusAnimation) {
        focusAnimation.kill()
      }

      gsap.to(inputContainer, {
        borderColor: "rgba(107, 154, 152, 0.15)",
        y: 0,
        duration: 0.3,
        ease: 'power2.out'
      })
    })
  }
}

/**
 * Textarea 简化动画
 * 移除复杂的光晕效果，保留基本交互反馈
 */
const setupTextareaAdvancedAnimations = () => {
  const textarea = document.querySelector('.input-area textarea')
  if (!textarea) return

  let focusAnimation: gsap.core.Tween | null = null

  textarea.addEventListener('focus', () => {
    // 简化的聚焦效果
    focusAnimation = gsap.to(textarea, {
      scale: 1.001,
      duration: 0.2,
      ease: 'power2.out'
    })
  })

  textarea.addEventListener('blur', () => {
    if (focusAnimation) {
      focusAnimation.kill()
    }

    gsap.to(textarea, {
      scale: 1,
      duration: 0.2,
      ease: 'power2.out'
    })
  })
}

/**
 * 发送按钮简化动画 - 添加防抖优化
 * 移除复杂的呼吸和流光效果，保持简洁的交互反馈
 */
const setupSendButtonAdvancedAnimations = () => {
  const sendButton = document.querySelector('.send-button')
  if (!sendButton) return

  let hoverAnimation: gsap.core.Tween | null = null
  let isAnimating = false

  sendButton.addEventListener('mouseenter', () => {
    // 防抖：如果正在动画中，不重复执行
    if (isAnimating) return

    isAnimating = true
    // 简化的发送按钮悬浮效果
    hoverAnimation = gsap.to(sendButton, {
      y: -1,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => { isAnimating = false }
    })
  })

  sendButton.addEventListener('mouseleave', () => {
    if (hoverAnimation) hoverAnimation.kill()

    gsap.to(sendButton, {
      y: 0,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => { isAnimating = false }
    })
  })
}

/**
 * 工具栏按钮简化动画 - 添加防抖优化
 * 移除复杂的涟漪创建，使用简单的缩放效果
 */
const setupToolbarAdvancedAnimations = () => {
  const toolbarButtons = document.querySelectorAll('.input-toolbar button')

  toolbarButtons.forEach(button => {
    let isAnimating = false

    button.addEventListener('mouseenter', () => {
      if (isAnimating) return

      isAnimating = true
      // 简化的悬浮效果
      gsap.to(button, {
        scale: 1.05,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => { isAnimating = false }
      })
    })

    button.addEventListener('mouseleave', () => {
      gsap.to(button, {
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => { isAnimating = false }
      })
    })

    button.addEventListener('click', () => {
      // 简化的点击反馈 - 只在不是动画中时执行
      if (!isAnimating) {
        isAnimating = true
        gsap.to(button, {
          scale: 0.95,
          duration: 0.1,
          ease: 'power2.in',
          onComplete: () => {
            gsap.to(button, {
              scale: 1.05,
              duration: 0.1,
              ease: 'power2.out',
              onComplete: () => { isAnimating = false }
            })
          }
        })
      }
    })
  })
}

/**
 * 附件卡片简化动画
 * 移除复杂的光泽流动，使用简单的悬浮效果
 */
const setupAttachmentAdvancedAnimations = () => {
  const attachmentChips = document.querySelectorAll('.attachment-chip')

  attachmentChips.forEach(chip => {
    chip.addEventListener('mouseenter', () => {
      // 简化的悬浮效果
      gsap.to(chip, {
        y: -2,
        scale: 1.02,
        duration: 0.2,
        ease: 'power2.out'
      })
    })

    chip.addEventListener('mouseleave', () => {
      gsap.to(chip, {
        y: 0,
        scale: 1,
        duration: 0.2,
        ease: 'power2.out'
      })
    })
  })
}



// 组件挂载
onMounted(() => {
  // 加载当前会话已存在的消息
  const existing = chat.getSessionMessages(sessionId.value)
  if (existing && existing.length > 0) {
    messages.value = [...existing]
  } else {
    // 全面的测试数据 - 覆盖所有渲染情况
    const testMessages: UIMessage[] = [
      // 1. 系统欢迎消息
      {
        type: MessageType.System,
        sender: 'ReAct+ Assistant',
        message: `🚀 **欢迎使用 ReAct+ 智能体！**

我是新一代增强版 ReAct 助手，具备以下能力：

✨ **智能工具审批** - 执行工具前会请求您的确认
🧠 **深度推理** - 多层次思考和分析
🔧 **工具链协作** - 智能选择和组合使用工具
📊 **结果验证** - 自动验证和优化执行结果
🎯 **目标导向** - 始终聚焦于解决您的核心问题

现在，请告诉我您希望我帮您解决什么问题？`,
        timestamp: new Date(Date.now() - 300000),
        nodeId: 'welcome-msg'
      },

      // 2. 用户消息
      {
        type: MessageType.User,
        sender: '用户',
        message: '请帮我分析一下当前项目的代码结构，并给出优化建议',
        timestamp: new Date(Date.now() - 250000),
        nodeId: 'user-msg-1'
      },

      // 3. Assistant 思考消息
      {
        type: MessageType.Assistant,
        eventType: EventType.THINKING,
        sender: 'ReAct+ Assistant',
        message: `我需要分析您的项目结构。让我先思考一下分析的步骤：

1. 首先查看项目的文件结构和架构
2. 分析代码质量和组织方式
3. 识别潜在的优化点
4. 提供具体的改进建议

让我开始执行这个任务...`,
        timestamp: new Date(Date.now() - 240000),
        nodeId: 'thinking-msg-1'
      },

      // 4. Assistant 行动消息
      {
        type: MessageType.Assistant,
        eventType: EventType.ACTION,
        sender: 'ReAct+ Assistant',
        message: `正在执行代码结构分析：

🔍 **步骤 1**: 扫描项目文件结构
- 分析 src/ 目录组织
- 检查配置文件完整性
- 评估依赖管理情况

🔧 **步骤 2**: 代码质量检查
- TypeScript 类型覆盖率
- 组件复用性分析
- API 设计一致性检查`,
        timestamp: new Date(Date.now() - 220000),
        nodeId: 'action-msg-1'
      },

      // 5. 工具调用消息
      {
        type: MessageType.Tool,
        sender: 'File System Tool',
        message: '扫描项目文件结构',
        data: {
          toolName: 'file_scanner',
          args: {path: './src', recursive: true},
          result: {
            totalFiles: 45,
            directories: ['components', 'pages', 'stores', 'types', 'styles'],
            largestFiles: [
              {name: 'ReActPlus.vue', size: '15KB', lines: 882},
              {name: 'MessageItem.vue', size: '8KB', lines: 170},
              {name: 'react-plus.css', size: '12KB', lines: 791}
            ]
          }
        },
        timestamp: new Date(Date.now() - 200000),
        nodeId: 'tool-msg-1'
      },

      // 6. Assistant 观察消息
      {
        type: MessageType.Assistant,
        eventType: EventType.OBSERVING,
        sender: 'ReAct+ Assistant',
        message: `通过文件扫描工具的分析结果，我观察到：

📊 **项目规模**: 45个文件，结构清晰
📁 **目录组织**: 采用 Vue 3 + TypeScript + Vite 现代化技术栈
📝 **代码量**: 主要组件代码量适中，可维护性良好

现在让我进行更深入的代码质量分析...`,
        timestamp: new Date(Date.now() - 180000),
        nodeId: 'observing-msg-1'
      },

      // 7. 工具审批消息
      {
        type: MessageType.ToolApproval,
        sender: 'System',
        message: '需要您的审批才能执行工具',
        timestamp: new Date(Date.now() - 160000),
        nodeId: 'approval-msg-1',
        approval: {
          toolName: 'code_analyzer',
          args: {
            target: './src',
            depth: 'deep',
            includePrivate: true
          },
          riskLevel: 'medium',
          expectedResult: '分析代码质量指标和潜在问题',
          nodeId: 'approval-msg-1'
        }
      },

      // 8. 另一个工具调用消息（JSON数据）
      {
        type: MessageType.Tool,
        sender: 'Code Quality Tool',
        message: 'TypeScript 类型检查完成',
        data: {
          toolName: 'typescript_checker',
          result: {
            errors: 0,
            warnings: 3,
            typeCoverage: 94.5,
            issues: [
              {
                file: 'src/components/ToolBox.vue',
                line: 23,
                message: 'Implicit any type',
                severity: 'warning'
              },
              {
                file: 'src/pages/chat/ReAct.vue',
                line: 156,
                message: 'Unused import',
                severity: 'warning'
              }
            ],
            suggestions: [
              '添加更严格的 TypeScript 配置',
              '使用 ESLint 规则自动修复未使用的导入',
              '考虑添加 Prettier 格式化工具'
            ]
          }
        },
        timestamp: new Date(Date.now() - 140000),
        nodeId: 'tool-msg-2'
      },

      // 9. 错误消息
      {
        type: MessageType.Error,
        eventType: EventType.ERROR,
        sender: 'System Error',
        message: `❌ **网络连接超时**

无法连接到代码质量检查服务。请检查：

1. 网络连接是否正常
2. 服务器是否可访问
3. API 密钥是否有效

**错误详情**: Connection timeout after 30s
**错误代码**: NET_TIMEOUT_001`,
        timestamp: new Date(Date.now() - 120000),
        nodeId: 'error-msg-1'
      },

      // 10. 带警告的完成消息
      {
        type: MessageType.Assistant,
        eventType: EventType.DONEWITHWARNING,
        sender: 'ReAct+ Assistant',
        message: `⚠️ **分析已完成（有警告）**

虽然遇到了网络问题，但基于已收集的数据，我可以给出以下分析结果：

## 📋 项目结构分析报告

### ✅ 优势
- **架构清晰**: 采用 Vue 3 + TypeScript + Vite 现代化技术栈
- **组件化**: 良好的组件拆分和复用设计
- **类型安全**: 94.5% TypeScript 覆盖率

### ⚠️ 改进建议
1. **代码规范**: 添加 ESLint + Prettier 统一代码风格
2. **类型完善**: 修复 3 个类型警告，提升类型安全性
3. **测试覆盖**: 建议添加单元测试和端到端测试
4. **性能优化**: 考虑使用 lazy loading 和 tree shaking

### 🎯 下一步行动
- 建议优先修复 TypeScript 警告
- 可以考虑引入代码质量工具链`,
        timestamp: new Date(Date.now() - 100000),
        nodeId: 'done-warning-msg-1'
      },

      // 11. 用户回复
      {
        type: MessageType.User,
        sender: '用户',
        message: '感谢分析！请帮我生成一个改进代码质量的具体执行计划',
        timestamp: new Date(Date.now() - 80000),
        nodeId: 'user-msg-2'
      },

      // 12. 复杂的 Markdown 消息（代码块、表格、列表）
      {
        type: MessageType.Assistant,
        sender: 'ReAct+ Assistant',
        message: `# 🚀 代码质量改进执行计划

基于刚才的分析，我为您制定了一个系统化的改进计划：

## 📅 阶段一：基础设施完善（预计 2-3 天）

### 1. 代码格式化工具链
\`\`\`bash
# 安装 ESLint 和 Prettier
npm install -D eslint @vue/eslint-config-typescript prettier
npm install -D @vue/eslint-config-prettier eslint-plugin-vue

# 创建 .eslintrc.js 配置
echo "module.exports = { extends: ['@vue/typescript/recommended'] }" > .eslintrc.js
\`\`\`

### 2. TypeScript 配置优化
\`\`\`json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
\`\`\`

## 📊 阶段二：代码质量提升（预计 3-4 天）

| 优先级 | 任务 | 预计时间 | 负责人 |
|--------|------|----------|---------|
| 🔴 高 | 修复 TypeScript 警告 | 0.5天 | 开发者 |
| 🟡 中 | 添加 ESLint 规则 | 1天 | 开发者 |
| 🟢 低 | 统一代码风格 | 1天 | 全团队 |

### 具体修复清单：
- [ ] **src/components/ToolBox.vue:23** - 添加明确类型注解
- [ ] **src/pages/chat/ReAct.vue:156** - 移除未使用的导入
- [ ] **全局** - 启用严格模式检查

## 🧪 阶段三：测试体系建设（预计 1-2 周）

### 单元测试框架
\`\`\`bash
# 安装 Vitest 测试框架
npm install -D vitest @vue/test-utils jsdom

# 创建测试配置
npm run test:unit
\`\`\`

### 测试覆盖率目标
- **组件测试**: 达到 80% 覆盖率
- **工具函数**: 达到 95% 覆盖率
- **核心业务逻辑**: 达到 90% 覆盖率

## 📈 阶段四：性能优化（持续进行）

### 代码分割策略
\`\`\`typescript
// 路由级别的懒加载
const ReActPlus = () => import('@/pages/chat/ReActPlus.vue')

// 组件级别的异步加载
const MessageItem = defineAsyncComponent(() => import('@/components/MessageItem.vue'))
\`\`\`

---

**💡 提示**: 这个计划可以根据团队情况和项目优先级进行调整。建议从阶段一开始，循序渐进地实施。

您希望我详细说明哪个阶段的具体实施步骤？`,
        timestamp: new Date(Date.now() - 60000),
        nodeId: 'complex-markdown-msg'
      },

      // 13. 系统状态消息
      {
        type: MessageType.System,
        sender: 'ReAct+ Assistant',
        message: `🔄 **系统状态更新**

当前会话统计：
- 消息总数: 13 条
- 工具调用: 2 次
- 代码分析: 已完成
- 优化建议: 已生成

系统运行正常，随时准备为您提供更多帮助。`,
        timestamp: new Date(Date.now() - 40000),
        nodeId: 'system-status-msg'
      }
    ]

    messages.value = testMessages
  }

  // 🐉 初始化 GSAP 动画系统 - 简化版
  nextTick(() => {
    // 1. 页面初始化 + 进度指示器
    initGSAPAnimations()

    // 2. 消息 hover 效果
    setupMessageHoverEffects()

    // 3. 输入相关动画（合并基础和高级动画）
    setupInputContainerAdvancedAnimations()
    setupTextareaAdvancedAnimations()

    // 4. 发送按钮动画（只使用高级版本，避免重复）
    setupSendButtonAdvancedAnimations()

    // 5. 工具栏和附件动画
    setupToolbarAdvancedAnimations()
    setupAttachmentAdvancedAnimations()

    // 6. 滚动按钮动画
    setupScrollButtonAnimation()

    // 7. 加载点动画
    setupLoadingDotsAnimation()

    // 监听滚动，控制下滑按钮显隐
    chatContent.value?.addEventListener('scroll', updateScrollButtonVisibility)
    updateScrollButtonVisibility()
  })
})

onUnmounted(() => {
  chatContent.value?.removeEventListener('scroll', updateScrollButtonVisibility)
})
</script>

<template>
  <div ref="appContainer" :class="['react-plus-app', currentThemeClass]">
    <!-- 🖥️ 极客模式：终端界面 -->
    <template v-if="isGeekMode">

      <div class="geek-mode-wrapper">
        <!-- 快速模式切换栏 -->
        <div class="geek-mode-header">
          <div class="mode-info">
            <span class="mode-label">🤖 极客模式</span>
            <span class="session-info">Session: {{ sessionId }}</span>
          </div>
          <div class="mode-actions">
            <button
              class="exit-geek-btn"
              @click="() => switchMode('multimodal')"
              title="退出极客模式"
            >
              ⚡ 多模态模式
            </button>
          </div>
        </div>

        <TerminalContainer
          ref="terminalRef"
          :title="`Real Agent Terminal - Session ${sessionId}`"
          :session-id="sessionId"
          :enable-geek-mode="true"
          :show-header="true"
          :show-controls="true"
          @terminal-ready="handleTerminalReady"
          @data="handleTerminalData"
          @key="handleTerminalKey"
          class="geek-terminal-interface"
        />
      </div>
    </template>

    <!-- ⚡ 多模态模式：正常界面 -->
    <template v-else>
    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 顶部状态栏 -->
      <div class="top-status-bar">
          <StatusIndicator status='running'/>
      </div>

      <!-- 对话区域 -->
      <div class="chat-container" ref="chatContent">
        <div class="messages-wrapper">
          <div
              v-for="(message, index) in messages"
              :key="index"
              :id="message.nodeId ? 'msg-' + message.nodeId : undefined"
              class="message-wrapper"
          >
            <!-- 工具审批消息 -->
            <EnhancedToolApprovalCard
                v-if="message.type === MessageType.ToolApproval && message.approval"
                :approval="message.approval"
                :session-id="sessionId"
                @approved="handleToolApproved(message.nodeId!, $event)"
                @rejected="handleToolRejected(message.nodeId!, $event)"
                @error="handleToolError(message.nodeId!, $event)"
                @retryRequested="handleToolRetryRequested(message.nodeId!, $event)"
                @terminateRequested="handleToolTerminateRequested(message.nodeId!, $event)"
                class="message-item"
            />
            <!-- Thinking 消息 - 使用折叠组件 -->
            <CollapsibleThinking
                v-else-if="message.eventType === EventType.THINKING && shouldCollapse(message)"
                :content="message.message"
                :sender="message.sender"
                :timestamp="message.timestamp"
                :is-thinking="!message.endTime"
                class="message-item"
            />
            <!-- 普通消息 -->
            <MessageItem v-else :message="message" class="message-item"/>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading" class="loading-indicator">
            <div class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="loading-text">智能分析中...</span>
          </div>
        </div>

        <!-- 滚动到底部按钮 -->
        <Transition name="fade">
          <div v-show="showScrollButton" class="scroll-to-bottom" @click="scrollToBottom">
            <a-button type="primary" shape="circle" :icon="h(ArrowDownOutlined)"/>
          </div>
        </Transition>
      </div>

      <div
          class="input-container"
          @dragover.prevent
          @drop="onDropFiles"
      >
        <!-- 🎭 模式选择器 -->
        <div class="mode-selector">
          <!-- 📎 附件预览 -->
          <div v-if="attachments.length" class="attachments-preview">
            <div v-for="attachment in attachments" :key="attachment.name" class="attachment-chip">
              <FileTextOutlined class="attachment-icon"/>
              <span class="attachment-name">{{ attachment.name }}</span>
              <span class="attachment-size">{{ bytes(attachment.size) }}KB</span>
              <button
                  size="small"
                  @click="removeAttachment(attachment.name)"
                  class="remove-btn"
              >×
              </button>
            </div>
          </div>
          <GeekModeButton
              :active="currentMode === 'geek'"
              :icon="RobotOutlined"
              label="极客模式"
              @click="() => switchMode('geek')"
          />
          <NeonModeButton
              :active="currentMode === 'multimodal'"
              :icon="ThunderboltOutlined"
              label="多模态模式"
              variant="multimodal"
              @click="() => switchMode('multimodal')"
          />
        </div>



        <!-- ✍️ 输入区域（textarea + 发送按钮 + 工具栏） -->
        <div class="input-area">
          <a-textarea
              v-model:value="inputMessage"
              :maxlength="4000"
              :auto-size="{ minRows: 1, maxRows: 8 }"
              placeholder="请输入您的问题..."
              :disabled="isLoading"
              :bordered="false"
              @pressEnter="onPressEnter"
              @paste="onPaste"
          />
          <a-button
              :disabled="!canSend"
              :loading="isLoading"
              @click="sendMessage"
              class="send-button"
          >
            <SendOutlined v-if="!isLoading"/>
            <span>{{ isLoading ? '处理中...' : '发送' }}</span>
          </a-button>

          <!-- 🛠️ 工具按钮组 -->
          <div class="input-toolbar">
            <a-button type="text" size="large" @click="handleUploadClick" :icon="h(PaperClipOutlined)"/>
            <a-button type="text" size="large" @click="insertCodeBlock" :icon="h(BulbOutlined)"/>
            <a-dropdown placement="topLeft" trigger="click">
              <a-button type="text" size="large" :icon="h(ThunderboltOutlined)"/>
              <template #overlay>
                <a-menu @click="({ key }) => insertTemplate((templates.find(t=>t.label=== key ) as any).text)">
                  <a-menu-item v-for="t in templates" :key="t.label">
                    {{ t.label }}
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>
      </div>


    </div>

    <!-- 隐藏文件输入 -->
    <input
        type="file"
        ref="fileInput"
        style="display: none"
        multiple
        accept=".txt,.md,.markdown,.java,.kt,.scala,.py,.go,.js,.mjs,.cjs,.ts,.tsx,.json,.yml,.yaml,.xml,.html,.css,.scss,.less,.vue,.svelte,.c,.cpp,.h,.hpp,.cs,.rs,.php,.rb,.swift,.m,.mm,.sql,.sh,.bat,.ps1,.ini,.conf,.log,.pdf,image/*"
        @change="onFileChange"
    />
    </template>

  </div>
</template>

<style scoped lang="scss">

/* ============= 🖥️ 极客模式终端界面样式 ============= */
.geek-mode-wrapper {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #000000;
}

/* 极客模式快速切换头部 */
.geek-mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%);
  border-bottom: 1px solid rgba(0, 255, 0, 0.3);
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  min-height: 40px;
  z-index: 100;

  .mode-info {
    display: flex;
    align-items: center;
    gap: 16px;

    .mode-label {
      font-weight: bold;
      text-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
      letter-spacing: 1px;
    }

    .session-info {
      color: rgba(0, 255, 0, 0.7);
      font-size: 12px;
      opacity: 0.8;
    }
  }

  .mode-actions {
    .exit-geek-btn {
      background: transparent;
      border: 1px solid rgba(0, 255, 0, 0.4);
      color: #00ff00;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      transition: all 0.3s ease;
      letter-spacing: 0.5px;

      &:hover {
        background: rgba(0, 255, 0, 0.1);
        border-color: rgba(0, 255, 0, 0.8);
        box-shadow: 0 0 12px rgba(0, 255, 0, 0.4);
        text-shadow: 0 0 8px rgba(0, 255, 0, 0.8);
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(0);
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
      }
    }
  }
}

.geek-terminal-interface {
  flex: 1;
  position: relative;

  /* 确保终端占据剩余空间 */
  :deep(.terminal-container) {
    height: 100%;
    border-radius: 0;

    /* 强化极客模式的视觉效果 */
    &.terminal-geek-mode {
      border: 2px solid rgba(0, 255, 0, 0.4);
      box-shadow:
        0 0 30px rgba(0, 255, 0, 0.15),
        inset 0 0 30px rgba(0, 255, 0, 0.08);

      /* 增强矩阵背景效果 */
      &::before {
        background:
          radial-gradient(circle at 20% 80%, rgba(0, 255, 0, 0.04) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(0, 255, 0, 0.02) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(0, 255, 0, 0.01) 0%, transparent 70%);
      }
    }
  }

  /* 终端头部增强 */
  :deep(.terminal-header) {
    background: linear-gradient(135deg, #0a1a0a 0%, #1a2f1a 50%, #0f1f0f 100%);
    border-bottom: 2px solid rgba(0, 255, 0, 0.4);
    padding: 12px 20px;

    .terminal-title {
      .title-text {
        font-size: 16px;
        font-weight: bold;
        text-shadow: 0 0 12px rgba(0, 255, 0, 0.7);
      }
    }

    .status-indicator {
      .status-text {
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
      }
    }
  }
}

/* ============= CSSVARIABLES - Design Tokens ============= */
.react-plus-app {
  /* 🎨 青花瓷配色系统 - Celadon Color System */
  /* 背景 - 素雅瓷白 */
  --bg-primary: #F8F9FA; /* 瓷器底色 - 素雅米白 */
  --bg-secondary: #FEFEFE; /* 主体瓷白 - 纯净如玉 */
  --bg-tertiary: #F0F4F4; /* 淡青瓷面 - 青白相间 */
  --bg-hover: #E8F0F0; /* 悬浮态 - 青影浮动 */

  /* 文字 - 墨色系统 */
  --text-primary: #2C3E3E; /* 主墨色 - 深邃内敛 */
  --text-secondary: #5B7373; /* 次墨色 - 典雅沉稳 */
  --text-tertiary: #8B9D9D; /* 淡墨色 - 水墨晕染 */
  --text-inverse: #FFFFFF; /* 反白色 */

  /* 边框 - 青瓷轮廓 */
  --border-subtle: #E0E8E8; /* 微妙青边 */
  --border-light: #C8D8D8; /* 淡青边框 */
  --border-medium: #A0B8B8; /* 中青边框 */

  /* 品牌色 - 青龙之色 */
  --brand-primary: #5B8A8A; /* 主青瓷色 - 青龙本色 */
  --brand-hover: #3A5F5F; /* 悬浮深青 - 龙威显现 */
  --brand-light: #D8E8E8; /* 淡青光晕 - 龙息扩散 */
  --brand-glow: rgba(91, 138, 138, 0.2); /* 青光晕染 */

  /* 辅助色 - 水墨点缀 */
  --accent-jade: #6B9A98; /* 翠玉青 */
  --accent-jade-light: #E0F0F0;
  --accent-ink: #4A6868; /* 墨青色 */
  --accent-ink-light: #D0E0E0;

  /* 状态色 - 东方意境 */
  --success: #52A885; /* 翠竹绿 */
  --success-light: #D8F0E8;
  --warning: #D0A048; /* 秋叶金 */
  --warning-light: #F8F0D8;
  --error: #C85A5A; /* 朱砂红 */
  --error-light: #F8E0E0;
  --info: #5B8A8A; /* 青瓷信息色 */
  --info-light: #D8E8E8;

  /* 间距 */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;
  --space-4xl: 5rem;
  --space-5xl: 6rem;

  /* 字体 */
  --font-sans: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;

  /* 圆角 - 瓷器圆润 */
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-xl: 1.125rem;
  --radius-full: 9999px;

  /* 阴影 - 青瓷质感 */
  --shadow-subtle: 0 1px 3px rgba(91, 138, 138, 0.06), 0 1px 2px rgba(91, 138, 138, 0.03);
  --shadow-soft: 0 2px 8px rgba(91, 138, 138, 0.08), 0 2px 4px rgba(91, 138, 138, 0.04);
  --shadow-medium: 0 4px 16px rgba(91, 138, 138, 0.12), 0 2px 6px rgba(91, 138, 138, 0.06);
  --shadow-large: 0 8px 32px rgba(91, 138, 138, 0.16), 0 4px 12px rgba(91, 138, 138, 0.08);
  --shadow-glow: 0 0 24px var(--brand-glow);

  /* 过渡 - 如水流云转 */
  --transition-fast: 180ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 600ms cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹簧效果 - 龙腾之态 */

  /* ========== MessageItem 青花瓷主题变量 ========== */

  /* 基础消息样式 */
  --message-spacing: 1.2rem;
  --message-padding: 1.25rem;
  --message-radius: 0.875rem;
  --message-bg: #FEFEFE; /* 瓷白背景 */
  --message-shadow: rgba(91, 138, 138, 0.08);
  --message-text: #2C3E3E; /* 主墨色 */
  --message-border-width: 3px;

  /* 消息头部 */
  --message-header-text: #5B7373; /* 次墨色 */
  --message-sender-text: #3A5F5F; /* 深青色 */

  /* 用户消息 - 淡青瓷 */
  --message-user-bg: #F8FCFC;
  --message-user-border: #C8D8D8;
  --message-user-text: #5B8A8A;

  /* Thinking 消息 - 琥珀青 */
  --message-thinking-bg: #F8F8F0;
  --message-thinking-border: #D0A048; /* 秋叶金 */
  --message-thinking-text: #8B7536;

  /* Action 消息 - 翠竹青 */
  --message-action-bg: #F0F8F4;
  --message-action-border: #52A885; /* 翠竹绿 */
  --message-action-text: #3A7860;

  /* Observing 消息 - 紫砂青 */
  --message-observing-bg: #F4F0F8;
  --message-observing-border: #8B7BA8;
  --message-observing-text: #5B4B78;

  /* Tool 消息 - 湖水青 */
  --message-tool-bg: #F0F8FC;
  --message-tool-border: #6B9AB8;
  --message-tool-text: #4A6878;

  /* Error 消息 - 朱砂红 */
  --message-error-bg: #FCF0F0;
  --message-error-border: #C85A5A;
  --message-error-text: #A03838;

  /* Progress 消息 - 蜜蜡黄 */
  --message-progress-bg: #FCF8F0;
  --message-progress-border: #D8B870;
  --message-progress-text: #A08850;

  /* Warning 消息 - 琥珀黄 */
  --message-warning-bg: #FCF4E8;
  --message-warning-border: #D0A048;
  --message-warning-text: #A08038;
}


/* ============= BASE LAYOUT ============= */
.react-plus-app {
  /* 青花瓷底纹背景 */
  background: linear-gradient(180deg,
      var(--bg-primary) 0%,
      #F0F4F4 50%,
      var(--bg-primary) 100%
  );
  font-family: var(--font-sans);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  transition: background-color var(--transition-normal);
  position: relative;

  overflow: auto;
  /* 青花瓷纹理叠加 */
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: radial-gradient(circle at 20% 30%, rgba(91, 138, 138, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(91, 138, 138, 0.03) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  .main-content {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 100%;
    margin: 0 auto;
    width: 100%;
  }
}

/* ============= TOP STATUS BAR ============= */
.react-plus-app {
  .top-status-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-subtle);
    padding-top: var(--space-md);
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(12px);
    transition: all var(--transition-normal);
  }



  .agent-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }


  .action-btn {
    position: relative;
    color: var(--text-secondary) !important;
    transition: all var(--transition-normal) !important;
    border-radius: var(--radius-sm) !important;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, transparent 30%, var(--brand-glow) 50%, transparent 70%);
      background-size: 200% 100%;
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    &:hover {
      color: var(--brand-primary) !important;
      background: var(--bg-hover) !important;
      transform: translateY(-1px);
      box-shadow: var(--shadow-subtle);

      &::before {
        animation: shimmer 1.5s ease-in-out infinite;
        opacity: 1;
      }
    }

    &:active {
      transform: translateY(0) scale(0.98);
      transition: all 100ms cubic-bezier(0.4, 0, 0.2, 1);
    }
  }
}

/* ============= PROGRESS INDICATOR ============= */
.react-plus-app {
  .global-progress {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-subtle);
    animation: slideDown var(--transition-normal);
  }

  .progress-content {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .progress-icon {
    position: relative;
  }

  .progress-indicator {
    position: relative;
    width: 24px;
    height: 24px;
  }

  .pulse-ring {
    position: absolute;
    inset: -8px;
    border: 2px solid var(--brand-primary);
    border-radius: 50%;
    opacity: 0.8;
    box-shadow: 0 0 12px var(--brand-glow);
  }

  .pulse-dot {
    position: absolute;
    inset: -10px;
    z-index: 99;
    background: var(--brand-primary);
    border-radius: 50%;
    box-shadow: 0 0 16px var(--brand-primary),
    0 0 32px var(--brand-glow);
  }

  .progress-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
  }
}

/* 🐉 以下动画已由 GSAP 接管 */
/* slideDown - 由 GSAP 页面初始化实现 */
/* dragonRing - 由 setupPulseAnimation() 实现 */
/* dragonCore - 由 setupPulseAnimation() 实现 */

/* ============= CHAT CONTAINER ============= */
.react-plus-app {
  .chat-container {
    position: relative;
    flex: 1;

    overflow-y: auto;

    padding: var(--space-2xl) var(--space-lg);
    scroll-behavior: smooth;
    /* 半透明青瓷背景 */
    background: rgba(248, 252, 252, 0.6);
    backdrop-filter: blur(20px);

    /* Custom scrollbar - 青瓷色 */
    scrollbar-width: thin;
    scrollbar-color: var(--brand-primary) transparent;

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg,
          var(--brand-primary),
          var(--brand-hover)
      );
      border-radius: var(--radius-full);
      transition: all var(--transition-fast);
      box-shadow: 0 0 6px var(--brand-glow);

      &:hover {
        background: var(--brand-hover);
        box-shadow: 0 0 12px var(--brand-glow);
      }
    }
  }

  .messages-wrapper {
    width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }


  .message-item {
    transition: all var(--transition-normal);
  }
}

/* ============= 🎨 MESSAGE 青花瓷增强样式 ============= */
.react-plus-app {
  /* 为所有消息添加青瓷质感 */
  :deep(.message) {
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(8px);
    transition: all var(--transition-normal);

    /* 青瓷釉光效果 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 50%;
      height: 100%;
      background: linear-gradient(90deg,
          transparent,
          rgba(91, 138, 138, 0.08),
          transparent
      );
      transition: left var(--transition-slow);
      pointer-events: none;
    }

    &:hover::before {
      left: 100%;
    }

    /* 不同类型消息的青龙光晕 */
    &.thinking:hover {
      box-shadow: 0 4px 16px rgba(208, 160, 72, 0.2),
      0 2px 8px rgba(208, 160, 72, 0.1);
    }

    &.action:hover {
      box-shadow: 0 4px 16px rgba(82, 168, 133, 0.2),
      0 2px 8px rgba(82, 168, 133, 0.1);
    }

    &.observing:hover {
      box-shadow: 0 4px 16px rgba(139, 123, 168, 0.2),
      0 2px 8px rgba(139, 123, 168, 0.1);
    }

    &.tool:hover {
      box-shadow: 0 4px 16px rgba(107, 154, 184, 0.2),
      0 2px 8px rgba(107, 154, 184, 0.1);
    }

    &.error:hover {
      box-shadow: 0 4px 16px rgba(200, 90, 90, 0.2),
      0 2px 8px rgba(200, 90, 90, 0.1);
    }

    &.user:hover {
      box-shadow: 0 4px 16px rgba(91, 138, 138, 0.15),
      0 2px 8px rgba(91, 138, 138, 0.08);
    }

    /* 发送者名称下划线动效 */
    &:hover .sender::after {
      width: 100%;
    }
  }

  /* 消息头部优化 */
  :deep(.message-header) {
    font-family: var(--font-sans);
  }

  :deep(.sender) {
    position: relative;
    display: inline-block;

    &::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 0;
      height: 2px;
      background: var(--brand-primary);
      transition: width var(--transition-normal);
    }
  }
}

/* ============= LOADING INDICATOR ============= */
.react-plus-app {
  .loading-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: dragonRise var(--transition-slow);
  }

  .loading-dots {
    display: flex;
    gap: var(--space-sm);
    position: relative;
  }

  /* 青花瓷加载点 */
  .loading-dots span {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand-primary);
    box-shadow: 0 0 8px var(--brand-glow);
  }

  .loading-dots span::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid var(--brand-primary);
    opacity: 0;
    animation: dragonDotRing 1.6s ease-in-out infinite;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: 0s;
  }

  .loading-dots span:nth-child(1)::after {
    animation-delay: 0s;
  }

  .loading-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .loading-dots span:nth-child(2)::after {
    animation-delay: 0.2s;
  }

  .loading-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  .loading-dots span:nth-child(3)::after {
    animation-delay: 0.4s;
  }

  .loading-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
    background: linear-gradient(90deg,
        var(--text-secondary),
        var(--brand-primary),
        var(--text-secondary)
    );
    background-size: 200% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 2s ease-in-out infinite;
  }

  /* ============= SCROLL TO BOTTOM BUTTON ============= */
  .scroll-to-bottom {
    position: fixed;
    bottom: 200px;
    right: var(--space-xl);
    z-index: 40;
    animation: dragonRise var(--transition-slow) cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .scroll-to-bottom button {
    position: relative;
    background: var(--bg-secondary) !important;
    border: 2px solid var(--border-light) !important;
    box-shadow: var(--shadow-medium) !important;
    transition: all var(--transition-spring) !important;
    overflow: visible;
  }

  /* 青龙光环 */
  .scroll-to-bottom button::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: conic-gradient(
            from 0deg,
            var(--brand-primary),
            var(--accent-jade),
            var(--brand-primary)
    );
    opacity: 0;
    animation: spinRipple 3s linear infinite;
    transition: opacity var(--transition-normal);
  }

  .scroll-to-bottom button:hover {
    background: var(--brand-primary) !important;
    border-color: var(--brand-primary) !important;
    transform: translateY(-4px) scale(1.1) !important;
    box-shadow: var(--shadow-large), var(--shadow-glow) !important;
  }

  .scroll-to-bottom button:hover::before {
    opacity: 0.6;
  }

  .scroll-to-bottom button:active {
    transform: translateY(-2px) scale(1.05) !important;
    transition: all 100ms !important;
  }

  /* Vue Transition 动效增强 */
  .fade-enter-active {
    animation: dragonRise var(--transition-slow) cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .fade-leave-active {
    transition: all var(--transition-normal);
  }

  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }

  /* ============= INPUT AREA - 汉白玉龙泉青瓷输入区域 ============= */
  .input-container {
    position: sticky;
    bottom: 5px;
    z-index: 30;
    width: 1000px;
    margin: 0 auto;
    /* 汉白玉底纹 - 温润如玉的渐变 */
    background: linear-gradient(180deg,
        rgba(230, 245, 245, 0.90) 0%,
        rgba(220, 240, 240, 0.95) 20%,
        rgba(245, 250, 250, 0.98) 40%,
        rgba(255, 255, 255, 1) 50%,
        rgba(240, 248, 248, 1) 60%,
        rgba(225, 238, 238, 0.95) 80%,
        rgba(215, 232, 232, 0.90) 100%
    );

    /* 使用 border + box-shadow 替代 border-image（兼容圆角） */
    border: 2px solid rgba(107, 154, 152, 0.15);
    border-radius: var(--radius-2xl, 1.5rem);
    backdrop-filter: blur(24px) saturate(1.3) contrast(1.1);

    /* 龙泉青瓷上缘光晕（模拟 border-image）+ 汉白玉深层质感阴影 */
    box-shadow: /* 顶部青瓷光晕（模拟渐变边框） */
        0 -2px 0 0 rgba(107, 154, 152, 0.4),
        0 -4px 0 0 rgba(91, 138, 138, 0.2),
          /* 深层阴影 */
        0 -12px 48px rgba(91, 138, 138, 0.06),
        0 -8px 32px rgba(91, 138, 138, 0.08),
        0 -4px 16px rgba(255, 255, 255, 0.5),
        0 -2px 8px rgba(255, 255, 255, 0.3),
          /* 内部高光 */
        inset 0 2px 0 rgba(255, 255, 255, 0.9),
        inset 0 1px 0 rgba(255, 255, 255, 0.7),
        inset 0 -1px 0 rgba(107, 154, 152, 0.08),
        inset 0 -2px 0 rgba(107, 154, 152, 0.02);

    overflow: hidden;
  }


  /* ============= ATTACHMENTS PREVIEW - 汉白玉雕琢 ============= */
  .attachments-preview {
    max-width: 800px;
    margin: 0 auto var(--space-lg);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    padding: var(--space-md);

    /* 汉白玉底座 */
    background: linear-gradient(135deg,
        rgba(255, 255, 255, 0.9) 0%,
        rgba(250, 254, 254, 0.95) 50%,
        rgba(255, 255, 255, 0.9) 100%
    );
    border-radius: var(--radius-xl);
    border: 1px solid rgba(107, 154, 152, 0.15);
    backdrop-filter: blur(12px);

    /* 龙泉青瓷光晕 */
    box-shadow: 0 4px 16px rgba(91, 138, 138, 0.06),
    0 2px 8px rgba(255, 255, 255, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);

    transition: all var(--transition-spring);

    /* 玉石纹理 */
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;

      pointer-events: none;
      z-index: -1;
    }

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(91, 138, 138, 0.12),
      0 4px 12px rgba(255, 255, 255, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      0 0 24px rgba(107, 154, 152, 0.1);
    }
  }

  .attachment-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);

    /* 汉白玉切片质感 */
    background: linear-gradient(145deg,
        rgba(255, 255, 255, 0.95) 0%,
        rgba(248, 254, 254, 0.9) 30%,
        rgba(250, 252, 252, 0.95) 70%,
        rgba(255, 255, 255, 0.9) 100%
    );

    /* 使用 border + box-shadow 替代 border-image（兼容圆角） */
    border: 1px solid rgba(107, 154, 152, 0.2);
    border-radius: var(--radius-lg);
    font-size: var(--font-size-sm);
    transition: all var(--transition-spring);
    overflow: hidden;

    /* 龙泉青瓷边框光晕（模拟 border-image）+ 玉石内光 */
    box-shadow: /* 渐变边框效果 */
        0 0 0 1px rgba(91, 138, 138, 0.15),
          /* 基础阴影 */
        0 2px 8px rgba(91, 138, 138, 0.08),
        0 1px 4px rgba(255, 255, 255, 0.4),
          /* 内部高光 */
        inset 0 1px 0 rgba(255, 255, 255, 0.7),
        inset 0 -1px 0 rgba(91, 138, 138, 0.05);

    /* 龙泉青瓷釉质流光 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg,
          transparent,
          rgba(107, 154, 152, 0.15),
          rgba(91, 138, 138, 0.1),
          transparent
      );
      transition: left var(--transition-slow);
      pointer-events: none;
    }

    /* 汉白玉微妙纹理 */
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 1.25em;

      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-normal);
    }

    &:hover {
      transform: translateY(-3px) scale(1.02) rotateY(2deg);
      border-color: var(--brand-primary);

      /* 龙泉青瓷光华绽放 */
      box-shadow: 0 8px 24px rgba(91, 138, 138, 0.15),
      0 4px 12px rgba(255, 255, 255, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      inset 0 -1px 0 rgba(91, 138, 138, 0.1),
      0 0 32px rgba(107, 154, 152, 0.2);

      &::before {
        left: 100%;
      }

      &::after {
        opacity: 1;
      }
    }

    &:active {
      transform: translateY(-1px) scale(0.98);
      transition: all 120ms cubic-bezier(0.4, 0, 0.2, 1);
    }
  }

  .attachment-icon {
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }

  .attachment-name {
    color: var(--text-primary);
    font-weight: 500;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-size {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
  }

  .remove-btn {
    color: var(--text-tertiary) !important;
    padding: 0 !important;
    min-width: 20px !important;
    height: 20px !important;
    border-radius: 50% !important;
    transition: all var(--transition-fast) !important;
  }

  .remove-btn:hover {
    color: var(--error) !important;
    background: var(--bg-hover) !important;
  }

  /* ============= INPUT CONTAINER - 汉白玉龙泉青瓷极致融合 ============= */


  /* ============= INPUT TOOLBAR FLOATING - 浮动工具栏（绝对定位于输入框左下角外部）============= */


  /* ============= MODE SELECTOR - 模式选择器 ============= */
  .mode-selector {
    display: flex;
    align-items: center; /* 确保按钮垂直对齐 */
    gap: var(--space-lg); /* 增加按钮间距 */
    padding: var(--space-lg) var(--space-xl);
    background: linear-gradient(180deg,
        rgba(255, 255, 255, 0.9) 0%,
        rgba(248, 252, 252, 0.85) 100%
    );
    border-bottom: 1px solid rgba(107, 154, 152, 0.08);
    /* 确保按钮不被遮挡 */
    z-index: 10;
    position: relative;

    /* 确保按钮可以接收点击事件 */
    > * {
      pointer-events: auto;
      z-index: 11;
    }

    span {
      white-space: nowrap;
    }
  }

  /* ============= INPUT AREA - 汉白玉龙泉青瓷输入区域 ============= */
  .input-area {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: var(--space-lg) 150px var(--space-md) var(--space-xl);

    /* 汉白玉书写面 - 温润如玉 */
    background: linear-gradient(145deg,
        rgba(255, 255, 255, 0.98) 0%,
        rgba(250, 254, 254, 0.95) 30%,
        rgba(248, 252, 252, 0.98) 70%,
        rgba(255, 255, 255, 0.98) 100%
    );

    /* 边框与圆角 */
    border-top: 1px solid rgba(107, 154, 152, 0.08);
    width: 100%;

    /* 平滑过渡 */
    transition: all var(--transition-spring);


    /* 悬浮时的汉白玉温润感 */
    &:hover:not(:focus-within) {
      border-top-color: rgba(107, 154, 152, 0.16);
      background: linear-gradient(145deg,
          rgba(255, 255, 255, 0.99) 0%,
          rgba(250, 254, 254, 0.97) 35%,
          rgba(248, 252, 252, 0.99) 70%,
          rgba(255, 255, 255, 0.99) 100%
      );
    }

    /* ===== Textarea 样式 ===== */
    textarea {
      width: 100%;
      flex: 1;
      height: 100%;
      min-height: 52px;

      /* 继承父容器背景，实现视觉统一 */
      background: transparent;

      /* 文本样式 */
      color: var(--text-primary) !important;
      font-size: var(--font-size-base) !important;
      line-height: var(--line-height-relaxed) !important;
      font-family: var(--font-sans) !important;
      font-weight: 500 !important;

      /* 移除所有默认样式，让焦点效果完全由父容器控制 */
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      resize: none !important;

      /* Placeholder 样式 */
      &::placeholder {
        color: rgba(139, 157, 157, 0.6);
        opacity: 0.8;
        font-weight: 400;
        font-style: italic;
      }
    }

    /* 🎨 焦点效果已由父容器 :focus-within 统一控制 */

    /* ===== Send Button 样式 ===== */
    .send-button {
      display: flex;
      align-items: center;
      position: absolute;
      right: var(--space-2xl);
      top: 50%;
      transform: translateY(-50%);
      height: 44px;
      min-width: 100px;
      padding: 0 var(--space-lg) !important;
      border-radius: var(--radius-lg) !important;
      font-weight: 600 !important;
      font-size: var(--font-size-sm) !important;
      letter-spacing: 0.5px;
      overflow: hidden;
      border: none !important;
      outline: none !important;

      /* 汉白玉龙泉青瓷按钮主体 - 深度质感 */
      background: linear-gradient(145deg,
          rgba(91, 138, 138, 0.98) 0%,
          rgba(107, 154, 152, 0.95) 15%,
          rgba(91, 138, 138, 1) 30%,
          rgba(107, 154, 152, 0.97) 45%,
          rgba(91, 138, 138, 0.99) 55%,
          rgba(107, 154, 152, 0.96) 70%,
          rgba(91, 138, 138, 0.98) 85%,
          rgba(107, 154, 152, 0.95) 100%
      ) !important;

      color: rgba(255, 255, 255, 0.98) !important;

      /* 使用 box-shadow 模拟渐变边框（兼容圆角）+ 汉白玉按钮深层阴影系统 */
      box-shadow: /* 青瓷边缘光晕（模拟 border-image） */
          0 0 0 1px rgba(255, 255, 255, 0.3),
          0 0 0 2px rgba(107, 154, 152, 0.4),
            /* 深层阴影 */
          0 8px 32px rgba(91, 138, 138, 0.35),
          0 4px 16px rgba(91, 138, 138, 0.25),
          0 2px 8px rgba(255, 255, 255, 0.4),
            /* 内部高光 */
          inset 0 2px 0 rgba(255, 255, 255, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.3),
          inset 0 -1px 0 rgba(58, 95, 95, 0.2),
          inset 0 -2px 0 rgba(58, 95, 95, 0.15) !important;

      transition: all var(--transition-spring) !important;


      /* 汉白玉外围能量环 */
      &::after {
        content: '';
        position: absolute;
        inset: -4px;
        background: conic-gradient(
                from 0deg,
                rgba(91, 138, 138, 0.4) 0deg,
                rgba(107, 154, 152, 0.2) 60deg,
                rgba(255, 255, 255, 0.3) 120deg,
                rgba(107, 154, 152, 0.25) 180deg,
                rgba(91, 138, 138, 0.3) 240deg,
                rgba(255, 255, 255, 0.2) 300deg,
                rgba(91, 138, 138, 0.4) 360deg
        );
        z-index: -1;
        opacity: 0;
        transform: scale(0.95);
        transition: all var(--transition-normal);
        filter: blur(1px);
      }

      &:hover:not(:disabled) {
        transform: translateY(-50%) scale(1.05) !important;

        /* 龙泉青瓷觉醒状态 */
        background: linear-gradient(145deg,
            rgba(89, 126, 126, 1) 0%,
            rgba(105, 135, 135, 0.98) 15%,
            rgba(89, 126, 126, 1) 30%,
            rgba(105, 135, 135, 0.99) 45%,
            rgba(89, 126, 126, 1) 55%,
            rgba(105, 135, 135, 0.98) 70%,
            rgba(89, 126, 126, 1) 85%,
            rgba(105, 135, 135, 0.98) 100%
        ) !important;

        /* 使用 box-shadow 模拟龙泉青瓷觉醒边缘（兼容圆角）+ 汉白玉龙泉青瓷神韵四射 */
        box-shadow: /* 青瓷觉醒边缘光晕（模拟 border-image） */
            0 0 0 1px rgba(255, 255, 255, 0.5),
            0 0 0 2px rgba(107, 154, 152, 0.6),
            0 0 0 3px rgba(255, 255, 255, 0.3),
              /* 深层阴影加强 */
            0 16px 48px rgba(91, 138, 138, 0.45),
            0 12px 32px rgba(91, 138, 138, 0.35),
            0 8px 24px rgba(91, 138, 138, 0.25),
            0 4px 16px rgba(255, 255, 255, 0.5),
              /* 内部高光 */
            inset 0 2px 0 rgba(255, 255, 255, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.4),
            inset 0 -1px 0 rgba(58, 95, 95, 0.3),
            inset 0 -2px 0 rgba(58, 95, 95, 0.2),
              /* 青瓷光晕 */
            0 0 48px rgba(107, 154, 152, 0.3),
            0 0 24px rgba(91, 138, 138, 0.4) !important;

        /* 动画已迁移至 GSAP: setupSendButtonAdvancedAnimations() */

      }

      &:active:not(:disabled) {
        transform: translateY(-2px) scale(1.01) !important;
        transition: all 120ms cubic-bezier(0.4, 0, 0.2, 1) !important;

        /* 汉白玉按压深度质感 */
        box-shadow: 0 6px 24px rgba(91, 138, 138, 0.3),
        0 3px 12px rgba(91, 138, 138, 0.2),
        inset 0 3px 6px rgba(58, 95, 95, 0.4),
        inset 0 2px 4px rgba(58, 95, 95, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;

        animation: none !important;
      }

      &:disabled {
        background: linear-gradient(145deg,
            rgba(139, 157, 157, 0.4) 0%,
            rgba(155, 175, 175, 0.3) 25%,
            rgba(139, 157, 157, 0.35) 50%,
            rgba(155, 175, 175, 0.3) 75%,
            rgba(139, 157, 157, 0.4) 100%
        ) !important;
        color: rgba(139, 157, 157, 0.7) !important;
        cursor: not-allowed !important;
        transform: none !important;
        animation: none !important;

        /* 使用 box-shadow 模拟边框（兼容圆角） */
        box-shadow: /* 灰色边缘 */
            0 0 0 1px rgba(155, 175, 175, 0.15),
              /* 基础阴影 */
            0 2px 8px rgba(139, 157, 157, 0.15),
              /* 内部高光 */
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      }
    }

    /* ===== Input Toolbar 样式 ===== */
    .input-toolbar {
      display: flex;
      align-self: self-start;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);

      /* 汉白玉雕刻质感 */
      background: linear-gradient(180deg,
          rgba(248, 252, 252, 0.98) 0%,
          rgba(250, 254, 254, 0.95) 50%,
          rgba(255, 255, 255, 0.98) 100%
      );

      border-radius: var(--space-lg);
      border: 1px solid rgba(107, 154, 152, 0.12);

      box-shadow: /* 汉白玉内光 */
          inset 0 1px 0 rgba(255, 255, 255, 0.8),
          inset 0 -1px 0 rgba(107, 154, 152, 0.05),
            /* 外部阴影 */
          0 4px 12px rgba(91, 138, 138, 0.08),
          0 2px 6px rgba(0, 0, 0, 0.04);

      transition: all var(--transition-normal);
      backdrop-filter: blur(8px);

      button {
        position: relative;
        color: var(--text-secondary) !important;
        transition: all var(--transition-spring) !important;
        border-radius: var(--radius-lg) !important;
        overflow: hidden;

        /* 汉白玉按钮质感 */
        background: linear-gradient(145deg,
            rgba(255, 255, 255, 0.8) 0%,
            rgba(250, 254, 254, 0.7) 50%,
            rgba(255, 255, 255, 0.8) 100%
        ) !important;

        border: 1px solid rgba(107, 154, 152, 0.1) !important;

        box-shadow: 0 2px 6px rgba(91, 138, 138, 0.05),
        0 1px 3px rgba(255, 255, 255, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.6) !important;

        /* 龙泉青瓷内光 */
        &::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at center,
              rgba(107, 154, 152, 0.1) 0%,
              transparent 60%
          );
          opacity: 0;
          transform: scale(0);
          transition: all var(--transition-normal);
        }

        /* 汉白玉光晕扩散 */
        &::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: linear-gradient(135deg,
              rgba(255, 255, 255, 0.4),
              rgba(107, 154, 152, 0.05),
              rgba(255, 255, 255, 0.4)
          );
          opacity: 0;
          transition: all var(--transition-normal);
        }

        &:hover {
          color: var(--brand-primary) !important;
          transform: translateY(-2px) scale(1.05) !important;

          /* 龙泉青瓷光华绽放 */
          background: linear-gradient(145deg,
              rgba(255, 255, 255, 0.95) 0%,
              rgba(248, 254, 254, 0.9) 30%,
              rgba(250, 252, 252, 0.95) 70%,
              rgba(255, 255, 255, 0.95) 100%
          ) !important;

          border-color: rgba(91, 138, 138, 0.2) !important;

          box-shadow: 0 6px 18px rgba(91, 138, 138, 0.12),
          0 3px 9px rgba(255, 255, 255, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.8),
          0 0 20px rgba(107, 154, 152, 0.15) !important;

          &::before {
            opacity: 1;
            transform: scale(1);
          }

          &::after {
            opacity: 0.6;
          }
        }

        &:active {
          transform: translateY(-1px) scale(1.02) !important;
          transition: all 100ms cubic-bezier(0.4, 0, 0.2, 1) !important;

          /* 汉白玉按压质感 */
          box-shadow: 0 2px 8px rgba(91, 138, 138, 0.08),
          inset 0 2px 4px rgba(91, 138, 138, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.5) !important;
        }
      }
    }
  }

  /* ============= RESPONSIVE - 响应式适配 ============= */
  @media (max-width: 768px) {
    .react-plus-app .top-status-bar {
      padding: var(--space-md) var(--space-lg);
    }

    .react-plus-app .chat-container {
      padding: var(--space-xl) var(--space-md);
    }

    .react-plus-app .input-container {
      padding: var(--space-lg) var(--space-md);
    }

    .react-plus-app .scroll-to-bottom {
      right: var(--space-lg);
      bottom: 180px;
    }

    /* .react-plus-app .right-panel {
    width: 100%;
  } */

    .react-plus-app .quick-actions {
      flex-direction: column;
    }


  }

  @media (max-width: 480px) {
    .react-plus-app .chat-container {
      padding: var(--space-lg) var(--space-sm);
    }

    .react-plus-app .input-container {
      padding: var(--space-md);
    }

    .react-plus-app .send-button {
      height: 40px !important;
      min-width: 80px !important;
      font-size: var(--font-size-xs) !important;
      padding: 0 var(--space-md) !important;
      right: var(--space-md);
    }

    .react-plus-app .input-area textarea {
      padding: var(--space-md) 100px var(--space-md) var(--space-md) !important;
    }

    .react-plus-app .mode-btn span {
      display: none;
    }

    .react-plus-app .attachments-preview {
      flex-direction: column;
    }

    .react-plus-app .attachment-chip {
      width: 100%;
    }
  }

  /* ============= ACCESSIBILITY ============= */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Focus visible for keyboard navigation */
  .react-plus-app *:focus-visible {
    outline: 2px solid var(--brand-primary);
    outline-offset: 2px;
  }

  /* High contrast mode support */
  @media (prefers-contrast: more) {
    .react-plus-app .input-container,
    .react-plus-app .attachment-chip {
      border-width: 2px;
    }
  }
}


</style>
