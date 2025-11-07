<script setup lang="ts">
import {ref, onMounted, onUnmounted, nextTick, computed, h, watch} from 'vue'
import {InputMode, useModeSwitch} from '@/composables/useModeSwitch'
import {UIMessage, MessageType, EventType} from '@/types/events'
import {AgentType} from '@/types/session'
import {useChatStore} from '@/stores/chatStore'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import ThinkingMessage from '@/components/messages/ThinkingMessage.vue'
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
import Terminal from '@/components/terminal/Terminal.vue'
import {MessageStyle} from '@/types/messageConfig'
import {ProgressInfo} from "@/types/status";
import {useRoute, useRouter} from "vue-router";
import ToolBox from "@/components/ToolBox.vue";
import ToolMessage from "@/components/messages/ToolMessage.vue";

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
  switchMode
} = useModeSwitch()

// 🖥️ 终端界面状态管理
const terminalRef = ref<InstanceType<typeof Terminal>>()
const terminalReady = ref(false)




// 消息配置 - 使用 ChatGPT 风格
const {getMessageConfig, shouldCollapse} = useMessageConfig(MessageStyle.CHATGPT)

// 工具审批状态管理
const pendingApprovals = ref<Map<string, any>>(new Map())
const approvalResults = ref<Map<string, any>>(new Map())

// UI状态管理
const isLoading = computed(() => taskStatus.value.is('running'))
const chatContent = ref<HTMLElement>()
const showScrollButton = ref(false)


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

// 使用带自定义处理器的 useSSE
let {messages, nodeIndex, connectionStatus, taskStatus, progress, executeReAct, executeReActPlus, handleEvent, updateMessage} = useSSE({
  onDoneNotice: handleDoneNotice,
  enableDefaultHandlers: true,  // 启用默认处理器
  handlers: {
    // 自定义工具审批事件处理器
    onToolApproval: (event: any, context: any) => {
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
      context.scrollToBottom()

      // 返回 false 表示跳过默认处理器（我们已经自定义处理了）
      return false
    }
  }
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
    await executeReActPlus(currentMessage, sessionId.value)
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

  // fixme 根据路径推断模式
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
}, {immediate: true})

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
//  使用 GSAP Context 统一管理所有动画，确保正确清理
let gsapContext: gsap.Context | null = null

const initGSAPAnimations = () => {
  // 使用 GSAP Context 管理所有动画，避免内存泄漏
  if (gsapContext) {
    gsapContext.revert() // 清理旧的动画
  }

  gsapContext = gsap.context(() => {
    // ========== 1. 页面初始化动画 ==========
    if (appContainer.value) {
      // 页面淡入效果 - 只在初始化时执行一次
      gsap.fromTo(appContainer.value,
          {opacity: 0, y: 20},
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power3.out",
            clearProps: "opacity,y" // 动画完成后清除属性
          }
      )
    }

    // ========== 2. 进度指示器 - 优化版 ==========
    const pulseRings = document.querySelectorAll('.pulse-ring')
    const pulseDots = document.querySelectorAll('.pulse-dot')

    // 如果元素存在才执行动画，避免无效的查询
    if (pulseRings.length > 0) {
      gsap.to(pulseRings, {
        scale: 1.01,
        rotation: 2,
        duration: 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.1 // 添加交错效果，避免所有元素同时动画
      })
    }

    if (pulseDots.length > 0) {
      gsap.to(pulseDots, {
        scale: 1.02,
        rotation: -1,
        duration: 3.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.15
      })
    }
  })
}

// ========== 3. 消息出现动画 - 青龙升腾 ==========
const animateMessageEntry = (element: HTMLElement) => {
  // 先清理可能存在的旧动画
  gsap.killTweensOf(element)

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

// ========== 4. 消息 Hover - 青瓷釉光扫过（使用委托模式优化） ==========
const setupMessageHoverEffects = () => {
  // 使用事件委托，避免为每个消息单独绑定事件
  const chatContent = document.querySelector('.chat-content')
  if (!chatContent) return

  chatContent.addEventListener('mouseenter', (e) => {
    const message = (e.target as HTMLElement).closest('.message')
    if (!message) return

    // 清理旧动画
    gsap.killTweensOf(message)

    // 消息轻微上浮
    gsap.to(message, {
      x: 4,
      duration: 0.3,
      ease: "power2.out"
    })

    // 发送者下划线展开
    const sender = message.querySelector('.sender')
    if (sender) {
      gsap.killTweensOf(sender)
      gsap.to(sender, {
        '--underline-width': '100%',
        duration: 0.3,
        ease: "power2.out"
      })
    }
  }, true) // 使用捕获阶段

  chatContent.addEventListener('mouseleave', (e) => {
    const message = (e.target as HTMLElement).closest('.message')
    if (!message) return

    gsap.killTweensOf(message)

    gsap.to(message, {
      x: 0,
      duration: 0.3,
      ease: "power2.out"
    })

    const sender = message.querySelector('.sender')
    if (sender) {
      gsap.killTweensOf(sender)
      gsap.to(sender, {
        '--underline-width': '0%',
        duration: 0.3,
        ease: "power2.out"
      })
    }
  }, true)
}

// ========== 8. 滚动到底部按钮 - 简化版 ==========
const setupScrollButtonAnimation = () => {
  const scrollButton = document.querySelector('.scroll-to-bottom button')

  if (!scrollButton) return

  // 简化的呼吸效果
  const breathAnimation = gsap.to(scrollButton, {
    scale: 1.02,
    duration: 2,
    ease: "sine.inOut",
    repeat: -1,
    yoyo: true,
    paused: true // 初始暂停，hover 时再启动
  })

  // 简化的 Hover 效果
  scrollButton.addEventListener('mouseenter', () => {
    breathAnimation.pause()
    gsap.killTweensOf(scrollButton)
    gsap.to(scrollButton, {
      scale: 1.05,
      y: -2,
      duration: 0.3,
      ease: "power2.out"
    })
  })

  scrollButton.addEventListener('mouseleave', () => {
    gsap.killTweensOf(scrollButton)
    gsap.to(scrollButton, {
      scale: 1.02,
      y: 0,
      duration: 0.3,
      ease: "power2.out",
      onComplete: () => {
        breathAnimation.resume()
      }
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
      onComplete: () => {
        isAnimating = false
      }
    })
  })

  sendButton.addEventListener('mouseleave', () => {
    if (hoverAnimation) hoverAnimation.kill()

    gsap.to(sendButton, {
      y: 0,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => {
        isAnimating = false
      }
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
        onComplete: () => {
          isAnimating = false
        }
      })
    })

    button.addEventListener('mouseleave', () => {
      gsap.to(button, {
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => {
          isAnimating = false
        }
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
              onComplete: () => {
                isAnimating = false
              }
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
        nodeId: 'thinking-msg-1',
        endTime: new Date(Date.now() - 230000)
      },
      // 5. 工具调用消息
      {
        type: MessageType.Tool,
        sender: 'File System Tool',
        data: {
          name: "map_geocode", // 工具名称，对应图标映射中的键
          id: "tool_call_123456789", // 工具调用ID
          responseData: [
            {
              text: JSON.stringify({
                status: "success",
                results: [
                  {
                    formatted_address: "北京市朝阳区建国路88号",
                    location: {
                      lat: 39.9042,
                      lng: 116.4074
                    },
                    address_components: {
                      country: "中国",
                      province: "北京市",
                      city: "北京市",
                      district: "朝阳区",
                      street: "建国路",
                      street_number: "88号"
                    },
                    confidence: 0.95
                  }
                ],
                execution_time: 0.32 // 执行时间（秒）
              })
            }
          ]
        },
        message: "地理编码工具调用", // 备选工具名称
        meta: {
          arguments: JSON.stringify({
            address: "北京市朝阳区建国路88号",
            city: "北京市",
            output_format: "json",
            timeout: 5000,
            language: "zh-CN"
          })
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
const Index = () => import('@/pages/chat/Index.vue')

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

  // 清理所有 GSAP 动画，避免内存泄漏
  if (gsapContext) {
    gsapContext.revert()
    gsapContext = null
  }

  // 清理全局 GSAP 动画
  gsap.killTweensOf('*')
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
              退出
            </button>
          </div>
        </div>

        <Terminal
            ref="terminalRef"
            :session-id="sessionId"
            class="geek-terminal-interface"
        />
      </div>
    </template>

    <!-- 正常界面 -->
    <template v-else>
      <!-- 主要内容区域 -->
      <div class="main-content">

        <!-- 对话区域 -->
        <div class="chat-container" ref="chatContent">
            <div
                v-for="(message, index) in messages"
                :key="index"
                :id="message.nodeId ? 'msg-' + message.nodeId : undefined"
                class="message-wrapper"
            >
              <!-- Thinking 消息 - 使用折叠组件 -->
              <ThinkingMessage
                  v-if="message.eventType === EventType.THINKING"
                  :content="message.message"
                  :sender="message.sender"
                  :timestamp="message.timestamp"
                  :is-thinking="!message.endTime"
                  class="message-item"
              />
              <!-- 工具调用消息 -->
              <ToolMessage v-else-if="message.type === MessageType.Tool" :message="message"></ToolMessage>

              <!-- 工具审批消息 -->
              <EnhancedToolApprovalCard
                  v-else-if="message.type === MessageType.ToolApproval && message.approval"
                  :approval="message.approval"
                  :session-id="sessionId"
                  @approved="handleToolApproved(message.nodeId!, $event)"
                  @rejected="handleToolRejected(message.nodeId!, $event)"
                  @error="handleToolError(message.nodeId!, $event)"
                  @retryRequested="handleToolRetryRequested(message.nodeId!, $event)"
                  @terminateRequested="handleToolTerminateRequested(message.nodeId!, $event)"
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
              <span class="loading-text">
                {{ progress?.text || '任务执行...' }}
              </span>
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
@use './Index.scss' as *;
</style>
