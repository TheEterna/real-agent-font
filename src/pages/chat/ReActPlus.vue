<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, h, watch } from 'vue'
import { UIMessage, MessageType, EventType } from '@/types/events'
import { AgentType } from '@/types/session'
import { useChatStore } from '@/stores/chatStore'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import CollapsibleThinking from '@/components/messages/CollapsibleThinking.vue'
import EnhancedToolApprovalCard from '@/components/EnhancedToolApprovalCard.vue'
import { useSSE } from '@/composables/useSSE'
import { notification } from 'ant-design-vue'
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
import { Attachment } from '@/types/attachment'
import { TemplateItem } from '@/types/template'
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
import { gsap } from 'gsap'
// 样式引入
import 'highlight.js/styles/atom-one-light.css'
import 'katex/dist/katex.min.css'
import { NotificationType } from '@/types/notification'
import { useMessageConfig } from '@/composables/useMessageConfig'
import { MessageStyle } from '@/types/messageConfig'

// 共享状态（会话/Agent 选择）
const chat = useChatStore()
const inputMessage = ref('')
const attachments = ref<Attachment[]>([])

// 消息配置 - 使用 ChatGPT 风格
const { getMessageConfig, shouldCollapse } = useMessageConfig(MessageStyle.CHATGPT)

// 工具审批状态管理
const pendingApprovals = ref<Map<string, any>>(new Map())
const approvalResults = ref<Map<string, any>>(new Map())

// UI状态管理
const isLoading = ref(false)
const chatContent = ref<HTMLElement>()
const showScrollButton = ref(false)
const rightPanelCollapsed = ref(false)

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

// 滚动相关
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

// 增强的通知处理
const handleDoneNotice = (node: { text: string; timestamp: Date; title: string; nodeId?: string, type: NotificationType }) => {
  const key = `done-${node.timestamp.getTime()}-${Math.random().toString(36).slice(2,8)}`

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

const locateByNode = (nodeId?: string) => {
  if (nodeId && chatContent.value) {
    const target = document.getElementById('msg-' + nodeId)
    if (target) {
      const container = chatContent.value
      const top = (target as HTMLElement).offsetTop
      container.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
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

// 优雅的GSAP动画初始化
const initGSAPAnimations = () => {
  // 页面淡入动画 - 更加柔和
  if (appContainer.value) {
    gsap.fromTo(appContainer.value,
      { opacity: 0 },
      { opacity: 1, duration: 0.6, ease: "power2.out" }
    )
  }
}

// 右侧面板切换动画
const toggleRightPanel = () => {
  rightPanelCollapsed.value = !rightPanelCollapsed.value
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
          args: { path: './src', recursive: true },
          result: {
            totalFiles: 45,
            directories: ['components', 'pages', 'stores', 'types', 'styles'],
            largestFiles: [
              { name: 'ReActPlus.vue', size: '15KB', lines: 882 },
              { name: 'MessageItem.vue', size: '8KB', lines: 170 },
              { name: 'react-plus.css', size: '12KB', lines: 791 }
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

  // 初始化 GSAP 动画
  nextTick(() => {
    initGSAPAnimations()
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
  <div ref="appContainer" class="react-plus-app theme-react-plus">
    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 顶部状态栏 -->
      <div class="top-status-bar">
        <div class="status-left">
          <StatusIndicator :status="taskStatus.value" />
        </div>
        <div class="status-right">
          <a-button
            type="text"
            size="small"
            :icon="h(SettingOutlined)"
            @click="toggleRightPanel"
            class="action-btn"
          />
        </div>
      </div>

      <!-- 全局进度指示器 -->
      <div v-if="progress" class="global-progress">
        <div class="progress-content">
          <div class="progress-icon">
            <div class="pulse-ring"></div>
            <div class="pulse-dot"></div>
          </div>
          <div class="progress-text">{{ progress.text }}</div>
        </div>
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
              class="message-item"
            />
            <!-- Thinking 消息 - 使用折叠组件 -->
            <CollapsibleThinking
              v-else-if="message.eventType === EventType.THINKING && shouldCollapse(message)"
              :content="message.message"
              :sender="message.sender"
              :timestamp="message.timestamp"
              class="message-item"
            />
            <!-- 普通消息 -->
            <MessageItem v-else :message="message" class="message-item" />
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
            <a-button type="primary" shape="circle" :icon="h(ArrowDownOutlined)" />
          </div>
        </Transition>
      </div>

      <!-- 输入区域 -->
      <div class="input-zone">
        <!-- 附件预览 -->
        <div v-if="attachments.length" class="attachments-preview">
          <div v-for="attachment in attachments" :key="attachment.name" class="attachment-chip">
            <FileTextOutlined class="attachment-icon" />
            <span class="attachment-name">{{ attachment.name }}</span>
            <span class="attachment-size">{{ bytes(attachment.size) }}KB</span>
            <a-button
              type="text"
              size="small"
              @click="removeAttachment(attachment.name)"
              class="remove-btn"
            >×</a-button>
          </div>
        </div>

        <!-- 输入容器 -->
        <div
          class="input-container"
          :class="{ 'input-focused': canSend }"
          @dragover.prevent
          @drop="onDropFiles"
        >
          <div class="input-toolbar">
            <a-button type="text" size="small" @click="handleUploadClick" :icon="h(PaperClipOutlined)" />
            <a-button type="text" size="small" @click="insertCodeBlock" :icon="h(BulbOutlined)" />
            <a-dropdown placement="topLeft" trigger="click">
              <a-button type="text" size="small" :icon="h(ThunderboltOutlined)" />
              <template #overlay>
                <a-menu @click="({ key }) => insertTemplate((templates.find(t=>t.label=== key ) as any).text)">
                  <a-menu-item v-for="t in templates" :key="t.label">
                    {{ t.label }}
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>

          <div class="input-field">
            <a-textarea
              v-model:value="inputMessage"
              :auto-size="{ minRows: 1, maxRows: 8 }"
              :maxlength="4000"
              placeholder="请输入您的问题..."
              :disabled="isLoading"
              :bordered="false"
              @pressEnter="onPressEnter"
              @paste="onPaste"
            />
            <a-button
              type="primary"
              :disabled="!canSend"
              :loading="isLoading"
              @click="sendMessage"
              class="send-button"
            >
              <template #icon v-if="!isLoading">
                <SendOutlined />
              </template>
              {{ isLoading ? '处理中...' : '发送' }}
            </a-button>
          </div>
        </div>

        <!-- 快速操作 -->
        <div v-if="!isLoading && messages.length <= 1" class="quick-actions">
          <div
            v-for="(template, index) in templates.slice(0, 3)"
            :key="template.label"
            class="quick-action-btn"
            @click="insertTemplate(template.text)"
          >
            <ThunderboltOutlined v-if="index === 0" />
            <BulbOutlined v-else-if="index === 1" />
            <FileTextOutlined v-else />
            <span>{{ template.label.replace('🧠 ', '').replace('🔧 ', '').replace('📊 ', '') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧面板（可收起） - 暂时不需要 -->
    <!-- <div class="right-panel" :class="{ collapsed: rightPanelCollapsed }">
      <div class="panel-header">
        <h4>工具面板</h4>
        <a-button
          type="text"
          size="small"
          :icon="h(CloseOutlined)"
          @click="toggleRightPanel"
        />
      </div>
      <div class="panel-content">
        <div class="tool-section">
          <h5>常用模板</h5>
          <div class="template-list">
            <div
              v-for="template in templates"
              :key="template.label"
              class="template-item"
              @click="insertTemplate(template.text)"
            >
              {{ template.label }}
            </div>
          </div>
        </div>
      </div>
    </div> -->

    <!-- 隐藏文件输入 -->
    <input
      ref="fileInput"
      type="file"
      style="display: none"
      multiple
      accept=".txt,.md,.markdown,.java,.kt,.scala,.py,.go,.js,.mjs,.cjs,.ts,.tsx,.json,.yml,.yaml,.xml,.html,.css,.scss,.less,.vue,.svelte,.c,.cpp,.h,.hpp,.cs,.rs,.php,.rb,.swift,.m,.mm,.sql,.sh,.bat,.ps1,.ini,.conf,.log,.pdf,image/*"
      @change="onFileChange"
    />
  </div>
</template>

<style scoped lang="scss">
/* =================================================================
   🐉 "碧池藏龙" 青花瓷主题 - CELADON PORCELAIN THEME
   Design Philosophy: 表面如碧水般宁静典雅，交互如青龙般蕴含力量
   ================================================================= */

/* ============= CSS VARIABLES - Design Tokens ============= */
.react-plus-app {
  /* 🎨 青花瓷配色系统 - Celadon Color System */
  /* 背景 - 素雅瓷白 */
  --bg-primary: #F8F9FA;           /* 瓷器底色 - 素雅米白 */
  --bg-secondary: #FEFEFE;         /* 主体瓷白 - 纯净如玉 */
  --bg-tertiary: #F0F4F4;          /* 淡青瓷面 - 青白相间 */
  --bg-hover: #E8F0F0;             /* 悬浮态 - 青影浮动 */

  /* 文字 - 墨色系统 */
  --text-primary: #2C3E3E;         /* 主墨色 - 深邃内敛 */
  --text-secondary: #5B7373;       /* 次墨色 - 典雅沉稳 */
  --text-tertiary: #8B9D9D;        /* 淡墨色 - 水墨晕染 */
  --text-inverse: #FFFFFF;         /* 反白色 */

  /* 边框 - 青瓷轮廓 */
  --border-subtle: #E0E8E8;        /* 微妙青边 */
  --border-light: #C8D8D8;         /* 淡青边框 */
  --border-medium: #A0B8B8;        /* 中青边框 */

  /* 品牌色 - 青龙之色 */
  --brand-primary: #5B8A8A;        /* 主青瓷色 - 青龙本色 */
  --brand-hover: #3A5F5F;          /* 悬浮深青 - 龙威显现 */
  --brand-light: #D8E8E8;          /* 淡青光晕 - 龙息扩散 */
  --brand-glow: rgba(91, 138, 138, 0.2); /* 青光晕染 */

  /* 辅助色 - 水墨点缀 */
  --accent-jade: #6B9A98;          /* 翠玉青 */
  --accent-jade-light: #E0F0F0;
  --accent-ink: #4A6868;           /* 墨青色 */
  --accent-ink-light: #D0E0E0;

  /* 状态色 - 东方意境 */
  --success: #52A885;              /* 翠竹绿 */
  --success-light: #D8F0E8;
  --warning: #D0A048;              /* 秋叶金 */
  --warning-light: #F8F0D8;
  --error: #C85A5A;                /* 朱砂红 */
  --error-light: #F8E0E0;
  --info: #5B8A8A;                 /* 青瓷信息色 */
  --info-light: #D8E8E8;

  /* 间距 */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;

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
  --message-bg: #FEFEFE;                    /* 瓷白背景 */
  --message-shadow: rgba(91, 138, 138, 0.08);
  --message-text: #2C3E3E;                  /* 主墨色 */
  --message-border-width: 3px;

  /* 消息头部 */
  --message-header-text: #5B7373;           /* 次墨色 */
  --message-sender-text: #3A5F5F;           /* 深青色 */

  /* 用户消息 - 淡青瓷 */
  --message-user-bg: #F8FCFC;
  --message-user-border: #C8D8D8;
  --message-user-text: #5B8A8A;

  /* Thinking 消息 - 琥珀青 */
  --message-thinking-bg: #F8F8F0;
  --message-thinking-border: #D0A048;        /* 秋叶金 */
  --message-thinking-text: #8B7536;

  /* Action 消息 - 翠竹青 */
  --message-action-bg: #F0F8F4;
  --message-action-border: #52A885;          /* 翠竹绿 */
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

/* ============= 🐉 青龙动效关键帧 - Dragon Animations ============= */

/* 涟漪扩散 - 水面波纹 */
@keyframes dragonRipple {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.4;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}

/* 青光脉动 - 龙息律动 */
@keyframes dragonPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 var(--brand-glow),
                var(--shadow-soft);
  }
  50% {
    box-shadow: 0 0 0 8px transparent,
                var(--shadow-medium);
  }
}

/* 柔和升起 - 云雾缭绕 */
@keyframes dragonRise {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 弹性缩放 - 龙腾之态 */
@keyframes dragonScale {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

/* 波光粼粼 - 水面反光 */
@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

/* 旋转涟漪 */
@keyframes spinRipple {
  0% {
    transform: rotate(0deg) scale(1);
    opacity: 0.6;
  }
  100% {
    transform: rotate(360deg) scale(1.3);
    opacity: 0;
  }
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
    background-image:
      radial-gradient(circle at 20% 30%, rgba(91, 138, 138, 0.03) 0%, transparent 50%),
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
    padding: var(--space-md) var(--space-xl);
    display: flex;
    justify-content: space-between;
    align-items: center;
    backdrop-filter: blur(12px);
    transition: all var(--transition-normal);
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .agent-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .status-right {
    display: flex;
    gap: var(--space-sm);
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

  .progress-indicator {
    position: relative;
    width: 24px;
    height: 24px;
  }

  .pulse-ring {
    position: absolute;
    inset: -4px;
    border: 2px solid var(--brand-primary);
    border-radius: 50%;
    animation: dragonRing 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    opacity: 0.8;
    box-shadow: 0 0 12px var(--brand-glow);
  }

  .pulse-dot {
    position: absolute;
    inset: 6px;
    background: var(--brand-primary);
    border-radius: 50%;
    animation: dragonCore 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    box-shadow: 0 0 16px var(--brand-primary),
                0 0 32px var(--brand-glow);
  }

  .progress-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes dragonRing {
  0%, 100% {
    transform: scale(0.85) rotate(0deg);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.25) rotate(180deg);
    opacity: 0.2;
  }
}

@keyframes dragonCore {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.85);
  }
}

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

  .message-wrapper {
    animation: dragonRise var(--transition-slow) cubic-bezier(0.16, 1, 0.3, 1);
    transition: all var(--transition-normal);

    &:hover {
      transform: translateX(4px);

      .message-item {
        box-shadow: var(--shadow-medium), -4px 0 12px var(--brand-glow);
      }
    }
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
.react-plus-app .loading-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  animation: dragonRise var(--transition-slow);
}

.react-plus-app .loading-dots {
  display: flex;
  gap: var(--space-sm);
  position: relative;
}

/* 青花瓷加载点 */
.react-plus-app .loading-dots span {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand-primary);
  animation: dragonDotPulse 1.6s ease-in-out infinite;
  box-shadow: 0 0 8px var(--brand-glow);
}

.react-plus-app .loading-dots span::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--brand-primary);
  opacity: 0;
  animation: dragonDotRing 1.6s ease-in-out infinite;
}

.react-plus-app .loading-dots span:nth-child(1) {
  animation-delay: 0s;
}

.react-plus-app .loading-dots span:nth-child(1)::after {
  animation-delay: 0s;
}

.react-plus-app .loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.react-plus-app .loading-dots span:nth-child(2)::after {
  animation-delay: 0.2s;
}

.react-plus-app .loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

.react-plus-app .loading-dots span:nth-child(3)::after {
  animation-delay: 0.4s;
}

@keyframes dragonDotPulse {
  0%, 60%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  30% {
    transform: scale(1.2);
    opacity: 1;
  }
}

@keyframes dragonDotRing {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

.react-plus-app .loading-text {
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
.react-plus-app .scroll-to-bottom {
  position: fixed;
  bottom: 200px;
  right: var(--space-xl);
  z-index: 40;
  animation: dragonRise var(--transition-slow) cubic-bezier(0.34, 1.56, 0.64, 1);
}

.react-plus-app .scroll-to-bottom button {
  position: relative;
  background: var(--bg-secondary) !important;
  border: 2px solid var(--border-light) !important;
  box-shadow: var(--shadow-medium) !important;
  transition: all var(--transition-spring) !important;
  overflow: visible;
}

/* 青龙光环 */
.react-plus-app .scroll-to-bottom button::before {
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

.react-plus-app .scroll-to-bottom button:hover {
  background: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
  transform: translateY(-4px) scale(1.1) !important;
  box-shadow: var(--shadow-large), var(--shadow-glow) !important;
}

.react-plus-app .scroll-to-bottom button:hover::before {
  opacity: 0.6;
}

.react-plus-app .scroll-to-bottom button:active {
  transform: translateY(-2px) scale(1.05) !important;
  transition: all 100ms !important;
}

/* Vue Transition 动效增强 */
.react-plus-app .fade-enter-active {
  animation: dragonRise var(--transition-slow) cubic-bezier(0.34, 1.56, 0.64, 1);
}

.react-plus-app .fade-leave-active {
  transition: all var(--transition-normal);
}

.react-plus-app .fade-enter-from,
.react-plus-app .fade-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

/* ============= INPUT ZONE ============= */
.react-plus-app .input-zone {
  position: sticky;
  bottom: 0;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-subtle);
  padding: var(--space-xl) var(--space-lg);
  z-index: 30;
  transition: all var(--transition-normal);
}

/* ============= ATTACHMENTS PREVIEW ============= */
.react-plus-app .attachments-preview {
  max-width: 800px;
  margin: 0 auto var(--space-md);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.react-plus-app .attachment-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  transition: all var(--transition-normal);
  animation: dragonScale var(--transition-spring);
  overflow: hidden;
}

/* 青瓷纹理 */
.react-plus-app .attachment-chip::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    transparent 30%,
    var(--brand-glow) 50%,
    transparent 70%
  );
  background-size: 200% 200%;
  opacity: 0;
  transition: opacity var(--transition-normal);
}

.react-plus-app .attachment-chip:hover {
  border-color: var(--brand-primary);
  box-shadow: var(--shadow-soft), 0 0 16px var(--brand-glow);
  transform: translateY(-2px) scale(1.02);
}

.react-plus-app .attachment-chip:hover::before {
  opacity: 1;
  animation: shimmer 2s ease-in-out infinite;
}

.react-plus-app .attachment-icon {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

.react-plus-app .attachment-name {
  color: var(--text-primary);
  font-weight: 500;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.react-plus-app .attachment-size {
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.react-plus-app .remove-btn {
  color: var(--text-tertiary) !important;
  padding: 0 !important;
  min-width: 20px !important;
  height: 20px !important;
  border-radius: 50% !important;
  transition: all var(--transition-fast) !important;
}

.react-plus-app .remove-btn:hover {
  color: var(--error) !important;
  background: var(--bg-hover) !important;
}

/* ============= INPUT CONTAINER ============= */
.react-plus-app .input-container {
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  background: var(--bg-secondary);
  border: 2px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-spring);
  box-shadow: var(--shadow-soft);
}

/* 青瓷釉质光泽 */
.react-plus-app .input-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg,
    transparent,
    var(--brand-primary),
    var(--accent-jade),
    transparent
  );
  transition: left var(--transition-slow);
}

.react-plus-app .input-container:hover {
  border-color: var(--border-medium);
  box-shadow: var(--shadow-medium);
  transform: translateY(-2px);
}

.react-plus-app .input-container:hover::before {
  left: 100%;
}

.react-plus-app .input-focused {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 4px var(--brand-light),
              var(--shadow-large),
              0 0 32px var(--brand-glow);
  transform: translateY(-3px) scale(1.01);
  animation: dragonPulse 3s ease-in-out infinite;
}

/* 聚焦时的青龙气息 */
.react-plus-app .input-focused::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: conic-gradient(
    from 0deg,
    var(--brand-primary) 0deg,
    var(--accent-jade) 90deg,
    var(--brand-primary) 180deg,
    var(--accent-jade) 270deg,
    var(--brand-primary) 360deg
  );
  z-index: -1;
  opacity: 0.15;
  animation: spinRipple 4s linear infinite;
}

/* ============= INPUT TOOLBAR ============= */
.react-plus-app .input-toolbar {
  display: flex;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(to right, transparent, var(--brand-glow), transparent);
  background-size: 200% 100%;
  background-position: 0% center;
  transition: background-position var(--transition-slow);
}

.react-plus-app .input-container:hover .input-toolbar {
  background-position: 100% center;
}

.react-plus-app .input-toolbar button {
  position: relative;
  color: var(--text-secondary) !important;
  transition: all var(--transition-normal) !important;
  border-radius: var(--radius-sm) !important;
  overflow: hidden;
}

.react-plus-app .input-toolbar button::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: radial-gradient(circle at center, var(--brand-light) 0%, transparent 70%);
  transform: scale(0);
  transition: all var(--transition-normal);
}

.react-plus-app .input-toolbar button:hover {
  color: var(--brand-primary) !important;
  background: var(--bg-hover) !important;
  transform: scale(1.08);
  box-shadow: 0 0 12px var(--brand-glow);
}

.react-plus-app .input-toolbar button:hover::after {
  opacity: 1;
  transform: scale(1);
  animation: dragonRipple 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.react-plus-app .input-toolbar button:active {
  transform: scale(0.95);
  transition: all 100ms;
}

/* ============= INPUT FIELD ============= */
.react-plus-app .input-field {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
  padding: var(--space-md);
}

.react-plus-app .input-field textarea {
  flex: 1;
  background: var(--bg-secondary) !important;  /* 修复：使用瓷白背景，不透明 */
  border: none !important;
  color: var(--text-primary) !important;
  font-size: var(--font-size-base) !important;
  line-height: var(--line-height-relaxed) !important;
  resize: none !important;
  outline: none !important;
  font-family: var(--font-sans) !important;
  padding: var(--space-xs) 0 !important;      /* 添加适当内边距 */
}

.react-plus-app .input-field textarea::placeholder {
  color: var(--text-tertiary) !important;
  opacity: 0.6;
}

.react-plus-app .send-button {
  position: relative;
  flex-shrink: 0;
  height: 40px;
  padding: 0 var(--space-lg) !important;
  background: var(--brand-primary) !important;
  border: none !important;
  border-radius: var(--radius-md) !important;
  color: var(--text-inverse) !important;
  font-weight: 600 !important;
  font-size: var(--font-size-sm) !important;
  transition: all var(--transition-normal) !important;
  box-shadow: var(--shadow-subtle) !important;
  overflow: hidden;
}

/* 青龙气息环绕 */
.react-plus-app .send-button::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  padding: 2px;
  background: linear-gradient(45deg,
    var(--brand-primary),
    var(--accent-jade),
    var(--brand-primary),
    var(--accent-jade)
  );
  background-size: 300% 300%;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  animation: shimmer 3s ease-in-out infinite;
  transition: opacity var(--transition-normal);
}

/* 内部光晕 */
.react-plus-app .send-button::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%);
  opacity: 0;
  transform: scale(0);
  transition: all var(--transition-normal);
}

.react-plus-app .send-button:hover:not(:disabled) {
  background: var(--brand-hover) !important;
  transform: translateY(-2px) scale(1.02) !important;
  box-shadow: var(--shadow-large), var(--shadow-glow) !important;
  animation: dragonPulse 2s ease-in-out infinite;
}

.react-plus-app .send-button:hover:not(:disabled)::before {
  opacity: 1;
}

.react-plus-app .send-button:hover:not(:disabled)::after {
  opacity: 1;
  transform: scale(1);
  animation: dragonRipple 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.react-plus-app .send-button:active:not(:disabled) {
  transform: translateY(0) scale(0.98) !important;
  transition: all 120ms cubic-bezier(0.4, 0, 0.2, 1) !important;
  animation: none !important;
}

.react-plus-app .send-button:disabled {
  background: var(--bg-tertiary) !important;
  color: var(--text-tertiary) !important;
  cursor: not-allowed !important;
  opacity: 0.5 !important;
  transform: none !important;
  animation: none !important;
}

/* ============= QUICK ACTIONS ============= */
.react-plus-app .quick-actions {
  max-width: 800px;
  margin: var(--space-lg) auto 0;
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.react-plus-app .quick-action-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-normal);
  animation: dragonRise var(--transition-slow) cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

/* 青瓷釉光效果 */
.react-plus-app .quick-action-btn::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: var(--brand-glow);
  transform: translate(-50%, -50%);
  transition: width var(--transition-slow), height var(--transition-slow);
}

.react-plus-app .quick-action-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-light);
  transform: translateY(-3px) scale(1.02);
  box-shadow: var(--shadow-medium), 0 0 20px var(--brand-glow);
}

.react-plus-app .quick-action-btn:hover::before {
  width: 200%;
  height: 200%;
}

.react-plus-app .quick-action-btn:active {
  transform: translateY(-1px) scale(0.98);
  transition: all 120ms;
}

.react-plus-app .quick-action-btn .anticon {
  font-size: var(--font-size-base);
  transition: all var(--transition-normal);
  z-index: 1;
}

.react-plus-app .quick-action-btn:hover .anticon {
  transform: rotate(10deg) scale(1.15);
  filter: drop-shadow(0 0 8px var(--brand-primary));
}

/* 分批入场动画 */
.react-plus-app .quick-action-btn:nth-child(1) {
  animation-delay: 0ms;
}
.react-plus-app .quick-action-btn:nth-child(2) {
  animation-delay: 100ms;
}
.react-plus-app .quick-action-btn:nth-child(3) {
  animation-delay: 200ms;
}

/* ============= RIGHT PANEL - 暂时不需要 ============= */
/* .react-plus-app .right-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-subtle);
  transform: translateX(0);
  transition: transform var(--transition-normal);
  z-index: 40;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-large);
}

.react-plus-app .right-panel.collapsed {
  transform: translateX(100%);
}

.react-plus-app .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--border-subtle);
}

.react-plus-app .panel-header h4 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.react-plus-app .panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
}

.react-plus-app .tool-section {
  margin-bottom: var(--space-xl);
}

.react-plus-app .tool-section h5 {
  margin: 0 0 var(--space-md);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.react-plus-app .template-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.react-plus-app .template-item {
  padding: var(--space-md);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.react-plus-app .template-item:hover {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
  transform: translateX(4px);
} */

/* ============= RESPONSIVE DESIGN ============= */
/* @media (max-width: 1024px) {
  .react-plus-app .right-panel {
    width: 280px;
  }
} */

@media (max-width: 768px) {
  .react-plus-app .top-status-bar {
    padding: var(--space-md) var(--space-lg);
  }

  .react-plus-app .chat-container {
    padding: var(--space-xl) var(--space-md);
  }

  .react-plus-app .input-zone {
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

  .react-plus-app .quick-action-btn {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .react-plus-app .chat-container {
    padding: var(--space-lg) var(--space-sm);
  }

  .react-plus-app .input-zone {
    padding: var(--space-md);
  }

  .react-plus-app .input-field {
    flex-direction: column;
    align-items: stretch;
  }

  .react-plus-app .send-button {
    width: 100% !important;
    height: 44px !important;
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
  .react-plus-app .attachment-chip,
  .react-plus-app .quick-action-btn {
    border-width: 2px;
  }
}

/* ============= PRINT STYLES ============= */
@media print {
  .react-plus-app .top-status-bar,
  .react-plus-app .input-zone,
  .react-plus-app .scroll-to-bottom,
  .react-plus-app .right-panel {
    display: none !important;
  }

  .react-plus-app .chat-container {

    flex: 1;
    overflow-y: auto;
  }
}


</style>
