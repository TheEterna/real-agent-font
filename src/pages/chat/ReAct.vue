<script setup lang="ts">
import {ref, onMounted, onUnmounted, nextTick, computed, h, watch} from 'vue'
import {UIMessage, MessageType, EventType} from '@/types/events'
import {AgentType} from '@/types/session'
import {useChatStore} from '@/stores/chatStore'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import {useSSE} from '@/composables/useSSE'
import {notification} from 'ant-design-vue'
import {SendOutlined, PaperClipOutlined, FileTextOutlined} from '@ant-design/icons-vue'
import {Attachment} from '@/types/attachment'
import {TemplateItem} from '@/types/template'
import { generateTestPlan, generateSimplePlan } from '@/utils/planTestData'
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
import '@/styles/themes/theme-react.css'
import {NotificationType} from '@/types/notification'

// 共享状态（会话/Agent 选择）
const chat = useChatStore()
const inputMessage = ref('')
const attachments = ref<Attachment[]>([])

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
const isLoading = computed(() => taskStatus.value.value === 'running')
const chatContent = ref<HTMLElement>()
const showScrollButton = ref(false)
// 发送可用状态（控制"亮起"）
const canSend = computed(() => inputMessage.value.trim().length > 0 && !isLoading.value)
// 输入区 hover 状态（原子类控制）
const isInputHover = ref(false)

// Ant Design Vue 通知：8s 自动关闭 + 悬停暂停 + 点击定位
const AUTOCLOSE_MS = 8000

// 滚动到底部（供 composable 回调使用）
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

// 使用可复用的 SSE 组合式函数（取消自动滚动，仅按钮手动触发）
const handleDoneNotice = (node: {
  text: string;
  startTime: any; // 改为 any 类型，支持字符串、Date等
  title: string;
  nodeId?: string,
  type: NotificationType
}) => {
  const safeDate = ensureDate(node.startTime)
  const key = `done-${safeDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`

  const onClick = () => locateByNode(node.nodeId)

  const desc = h('div', {style: 'max-width: 280px;'}, [
    h('div', {style: 'margin-top:4px; font-size:12px; color:#888; display:flex; align-items:center; gap:6px;'}, [
      h('span', formatTime(node.startTime)),
      h('span', '·'),
      h('span', {style: 'max-width: 180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'}, node.title || '')
    ])
  ])

  switch (node.type) {
    case NotificationType.SUCCESS:
      notification.success({
        message: node.text,
        description: desc,
        key,
        duration: 8,
        onClick,
      })
      break;
    case NotificationType.ERROR:
      notification.error({
        message: node.text,
        description: desc,
        key,
        duration: 8,
        onClick,
      })
      break;
    case NotificationType.WARNING:
      notification.warning({
        message: node.text,
        description: desc,
        key,
        duration: 8,
        onClick,
      })
      break;
    case NotificationType.INFO:
      notification.info({
        message: node.text,
        description: desc,
        key,
        duration: 8,
        onClick,
      })
      break;
    default:
      notification.info({
        message: node.text,
        description: desc,
        key,
        duration: 8,
        onClick,
      })
      break;
  }
}

const {
  messages,
  nodeIndex,
  connectionStatus,
  taskStatus,
  progress,
  executeReAct
} = useSSE({onDoneNotice: handleDoneNotice})

const locateNotice = (n: { nodeId?: string }) => {
  if (n?.nodeId && chatContent.value) {
    const target = document.getElementById('msg-' + n.nodeId)
    if (target) {
      const container = chatContent.value
      const top = (target as HTMLElement).offsetTop
      container.scrollTo({top: Math.max(0, top - 12), behavior: 'smooth'})
      return
    }
  }
  // 兜底：滚动到底部
  scrollToBottom()
}

const locateByNode = (nodeId?: string) => locateNotice({nodeId})

onUnmounted(() => {
  chatContent.value?.removeEventListener('scroll', updateScrollButtonVisibility)
})


// 根据所选 Agent 获取 UI 配置（主题/渲染/交互）
// 会话ID
const sessionId = chat.sessionId

// 发送消息
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMessage: UIMessage = {
    type: MessageType.User,
    sender: '用户',
    message: inputMessage.value,
    startTime: new Date()
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
      startTime: new Date()
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
})

// 消息变化时，更新当前会话的消息，并触碰更新时间
watch(messages, (val) => {
  chat.setSessionMessages(sessionId.value, val)
  chat.touchSession(sessionId.value)
}, {deep: true})

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
  const snippet = '\n```java\npublic class Demo {\n  public static void main(String[] args) {\n    System.out.println("Hello Agent");\n  }\n}\n```\n'
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
const templatesOpen = ref(false)
const templates: TemplateItem[] = [
  new TemplateItem('分析并列出问题清单', '请分析以下需求并输出一份可执行的问题清单：\n- 背景：\n- 目标：\n- 约束：\n- 风险：'),
  new TemplateItem('生成单元测试', '为以下代码生成JUnit5单元测试，包含边界与异常用例：\n``java\n// 粘贴代码\n```'),
  new TemplateItem('优化说明文档', '请根据以下变更生成简洁明了的更新说明（变更点/影响范围/回滚方式）：\n- 变更点：\n- 影响范围：\n- 回滚方式：'),
]
const insertTemplate = (t: string) => {
  inputMessage.value = (inputMessage.value ? inputMessage.value + '\n' : '') + t
  templatesOpen.value = false
}

// 安全的日期转换函数
const ensureDate = (date: any): Date => {
  if (date instanceof Date) return date
  if (typeof date === 'string' || typeof date === 'number') {
    const parsed = new Date(date)
    return isNaN(parsed.getTime()) ? new Date() : parsed
  }
  return new Date()
}

// 格式化时间
const formatTime = (date: any) => {
  const safeDate = ensureDate(date)
  return safeDate.toLocaleTimeString('zh-CN', {
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

// 开发模式测试功能
const isDevelopment = import.meta.env.DEV

const testInitPlan = () => {
  const plan = generateTestPlan()
  chat.setSessionPlan(sessionId.value, plan)
  chat.setPlanWidgetMode('ball')
  notification.success({
    message: '测试计划已创建',
    description: '已生成测试计划数据，状态球已显示'
  })
}

const testSimplePlan = () => {
  const plan = generateSimplePlan()
  chat.setSessionPlan(sessionId.value, plan)
  chat.setPlanWidgetMode('ball')
  notification.success({
    message: '简单计划已创建',
    description: '已生成简单测试计划数据，状态球已显示'
  })
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


// 组件挂载
// onMounted(() => {
//   // 加载当前会话已存在的消息
//   const existing = chat.getSessionMessages(sessionId.value)
//   if (existing && existing.length > 0) {
//     messages.value = [...existing]
//   } else {
//     // 全面的测试数据 - 覆盖所有渲染情况
//     const testMessages: UIMessage[] = [
//       // 1. 系统欢迎消息
//       {
//         type: MessageType.System,
//         sender: 'ReAct+ Assistant',
//         message: `🚀 **欢迎使用 ReAct+ 智能体！**
//
// 我是新一代增强版 ReAct 助手，具备以下能力：
//
// ✨ **智能工具审批** - 执行工具前会请求您的确认
// 🧠 **深度推理** - 多层次思考和分析
// 🔧 **工具链协作** - 智能选择和组合使用工具
// 📊 **结果验证** - 自动验证和优化执行结果
// 🎯 **目标导向** - 始终聚焦于解决您的核心问题
//
// 现在，请告诉我您希望我帮您解决什么问题？`,
//         startTime: new Date(Date.now() - 300000),
//         nodeId: 'welcome-msg'
//       },
//
//       // 2. 用户消息
//       {
//         type: MessageType.User,
//         sender: '用户',
//         message: '请帮我分析一下当前项目的代码结构，并给出优化建议',
//         startTime: new Date(Date.now() - 250000),
//         nodeId: 'user-msg-1'
//       },
//
//       // 3. Assistant 思考消息
//       {
//         type: MessageType.Assistant,
//         eventType: EventType.THINKING,
//         sender: 'ReAct+ Assistant',
//         message: `我需要分析您的项目结构。让我先思考一下分析的步骤：
//
// 1. 首先查看项目的文件结构和架构
// 2. 分析代码质量和组织方式
// 3. 识别潜在的优化点
// 4. 提供具体的改进建议
//
// 让我开始执行这个任务...`,
//         startTime: new Date(Date.now() - 240000),
//         nodeId: 'thinking-msg-1'
//       },
//
//       // 4. Assistant 行动消息
//       {
//         type: MessageType.Assistant,
//         eventType: EventType.ACTION,
//         sender: 'ReAct+ Assistant',
//         message: `正在执行代码结构分析：
//
// 🔍 **步骤 1**: 扫描项目文件结构
// - 分析 src/ 目录组织
// - 检查配置文件完整性
// - 评估依赖管理情况
//
// 🔧 **步骤 2**: 代码质量检查
// - TypeScript 类型覆盖率
// - 组件复用性分析
// - API 设计一致性检查`,
//         startTime: new Date(Date.now() - 220000),
//         nodeId: 'action-msg-1'
//       },
//
//       // 5. 工具调用消息
//       {
//         type: MessageType.Tool,
//         sender: 'File System Tool',
//         message: '扫描项目文件结构',
//         data: {
//           toolName: 'file_scanner',
//           args: { path: './src', recursive: true },
//           result: {
//             totalFiles: 45,
//             directories: ['components', 'pages', 'stores', 'types', 'styles'],
//             largestFiles: [
//               { name: 'Index.vue', size: '15KB', lines: 882 },
//               { name: 'MessageItem.vue', size: '8KB', lines: 170 },
//               { name: 'react-plus.css', size: '12KB', lines: 791 }
//             ]
//           }
//         },
//         startTime: new Date(Date.now() - 200000),
//         nodeId: 'tool-msg-1'
//       },
//
//       // 6. Assistant 观察消息
//       {
//         type: MessageType.Assistant,
//         eventType: EventType.OBSERVING,
//         sender: 'ReAct+ Assistant',
//         message: `通过文件扫描工具的分析结果，我观察到：
//
// 📊 **项目规模**: 45个文件，结构清晰
// 📁 **目录组织**: 采用 Vue 3 + TypeScript + Vite 现代化技术栈
// 📝 **代码量**: 主要组件代码量适中，可维护性良好
//
// 现在让我进行更深入的代码质量分析...`,
//         startTime: new Date(Date.now() - 180000),
//         nodeId: 'observing-msg-1'
//       },
//
//       // 7. 工具审批消息
//       {
//         type: MessageType.ToolApproval,
//         sender: 'System',
//         message: '需要您的审批才能执行工具',
//         startTime: new Date(Date.now() - 160000),
//         nodeId: 'approval-msg-1',
//         approval: {
//           toolName: 'code_analyzer',
//           args: {
//             target: './src',
//             depth: 'deep',
//             includePrivate: true
//           },
//           riskLevel: 'medium',
//           expectedResult: '分析代码质量指标和潜在问题',
//           nodeId: 'approval-msg-1'
//         }
//       },
//
//       // 8. 另一个工具调用消息（JSON数据）
//       {
//         type: MessageType.Tool,
//         sender: 'Code Quality Tool',
//         message: 'TypeScript 类型检查完成',
//         data: {
//           toolName: 'typescript_checker',
//           result: {
//             errors: 0,
//             warnings: 3,
//             typeCoverage: 94.5,
//             issues: [
//               {
//                 file: 'src/components/ToolBox.vue',
//                 line: 23,
//                 message: 'Implicit any type',
//                 severity: 'warning'
//               },
//               {
//                 file: 'src/pages/chat/ReAct.vue',
//                 line: 156,
//                 message: 'Unused import',
//                 severity: 'warning'
//               }
//             ],
//             suggestions: [
//               '添加更严格的 TypeScript 配置',
//               '使用 ESLint 规则自动修复未使用的导入',
//               '考虑添加 Prettier 格式化工具'
//             ]
//           }
//         },
//         startTime: new Date(Date.now() - 140000),
//         nodeId: 'tool-msg-2'
//       },
//
//       // 9. 错误消息
//       {
//         type: MessageType.Error,
//         eventType: EventType.ERROR,
//         sender: 'System Error',
//         message: `❌ **网络连接超时**
//
// 无法连接到代码质量检查服务。请检查：
//
// 1. 网络连接是否正常
// 2. 服务器是否可访问
// 3. API 密钥是否有效
//
// **错误详情**: Connection timeout after 30s
// **错误代码**: NET_TIMEOUT_001`,
//         startTime: new Date(Date.now() - 120000),
//         nodeId: 'error-msg-1'
//       },
//
//       // 10. 带警告的完成消息
//       {
//         type: MessageType.Assistant,
//         eventType: EventType.DONEWITHWARNING,
//         sender: 'ReAct+ Assistant',
//         message: `⚠️ **分析已完成（有警告）**
//
// 虽然遇到了网络问题，但基于已收集的数据，我可以给出以下分析结果：
//
// ## 📋 项目结构分析报告
//
// ### ✅ 优势
// - **架构清晰**: 采用 Vue 3 + TypeScript + Vite 现代化技术栈
// - **组件化**: 良好的组件拆分和复用设计
// - **类型安全**: 94.5% TypeScript 覆盖率
//
// ### ⚠️ 改进建议
// 1. **代码规范**: 添加 ESLint + Prettier 统一代码风格
// 2. **类型完善**: 修复 3 个类型警告，提升类型安全性
// 3. **测试覆盖**: 建议添加单元测试和端到端测试
// 4. **性能优化**: 考虑使用 lazy loading 和 tree shaking
//
// ### 🎯 下一步行动
// - 建议优先修复 TypeScript 警告
// - 可以考虑引入代码质量工具链`,
//         startTime: new Date(Date.now() - 100000),
//         nodeId: 'done-warning-msg-1'
//       },
//
//       // 11. 用户回复
//       {
//         type: MessageType.User,
//         sender: '用户',
//         message: '感谢分析！请帮我生成一个改进代码质量的具体执行计划',
//         startTime: new Date(Date.now() - 80000),
//         nodeId: 'user-msg-2'
//       },
//
//       // 12. 复杂的 Markdown 消息（代码块、表格、列表）
//       {
//         type: MessageType.Assistant,
//         sender: 'ReAct+ Assistant',
//         message: `# 🚀 代码质量改进执行计划
//
// 基于刚才的分析，我为您制定了一个系统化的改进计划：
//
// ## 📅 阶段一：基础设施完善（预计 2-3 天）
//
// ### 1. 代码格式化工具链
// \`\`\`bash
// # 安装 ESLint 和 Prettier
// npm install -D eslint @vue/eslint-config-typescript prettier
// npm install -D @vue/eslint-config-prettier eslint-plugin-vue
//
// # 创建 .eslintrc.js 配置
// echo "module.exports = { extends: ['@vue/typescript/recommended'] }" > .eslintrc.js
// \`\`\`
//
// ### 2. TypeScript 配置优化
// \`\`\`json
// {
//   "compilerOptions": {
//     "strict": true,
//     "noImplicitAny": true,
//     "noUnusedLocals": true,
//     "noUnusedParameters": true
//   }
// }
// \`\`\`
//
// ## 📊 阶段二：代码质量提升（预计 3-4 天）
//
// | 优先级 | 任务 | 预计时间 | 负责人 |
// |--------|------|----------|---------|
// | 🔴 高 | 修复 TypeScript 警告 | 0.5天 | 开发者 |
// | 🟡 中 | 添加 ESLint 规则 | 1天 | 开发者 |
// | 🟢 低 | 统一代码风格 | 1天 | 全团队 |
//
// ### 具体修复清单：
// - [ ] **src/components/ToolBox.vue:23** - 添加明确类型注解
// - [ ] **src/pages/chat/ReAct.vue:156** - 移除未使用的导入
// - [ ] **全局** - 启用严格模式检查
//
// ## 🧪 阶段三：测试体系建设（预计 1-2 周）
//
// ### 单元测试框架
// \`\`\`bash
// # 安装 Vitest 测试框架
// npm install -D vitest @vue/test-utils jsdom
//
// # 创建测试配置
// npm run test:unit
// \`\`\`
//
// ### 测试覆盖率目标
// - **组件测试**: 达到 80% 覆盖率
// - **工具函数**: 达到 95% 覆盖率
// - **核心业务逻辑**: 达到 90% 覆盖率
//
// ## 📈 阶段四：性能优化（持续进行）
//
// ### 代码分割策略
// \`\`\`typescript
// // 路由级别的懒加载
// const Index = () => import('@/pages/chat/Index.vue')
//
// // 组件级别的异步加载
// const MessageItem = defineAsyncComponent(() => import('@/components/MessageItem.vue'))
// \`\`\`
//
// ---
//
// **💡 提示**: 这个计划可以根据团队情况和项目优先级进行调整。建议从阶段一开始，循序渐进地实施。
//
// 您希望我详细说明哪个阶段的具体实施步骤？`,
//         startTime: new Date(Date.now() - 60000),
//         nodeId: 'complex-markdown-msg'
//       },
//
//       // 13. 系统状态消息
//       {
//         type: MessageType.System,
//         sender: 'ReAct+ Assistant',
//         message: `🔄 **系统状态更新**
//
// 当前会话统计：
// - 消息总数: 13 条
// - 工具调用: 2 次
// - 代码分析: 已完成
// - 优化建议: 已生成
//
// 系统运行正常，随时准备为您提供更多帮助。`,
//         startTime: new Date(Date.now() - 40000),
//         nodeId: 'system-status-msg'
//       }
//     ]
//
//     messages.value = testMessages
//   }
//
//
//   // 监听滚动，控制"下滑按钮"显隐
//   chatContent.value?.addEventListener('scroll', updateScrollButtonVisibility)
//   updateScrollButtonVisibility()
// })


</script>

<template>
  <div class="chat-container theme-react">
    <!-- 主对话区域（滚动） -->
    <div class="chat-content" ref="chatContent">
      <!-- 状态指示器 -->
      <StatusIndicator :status="taskStatus.value"/>
      <!-- 全局唯一进度显示器 -->
      <div v-if="progress" class="global-progress">
        <div class="gp-icon" aria-hidden></div>
        <div class="gp-text">{{ progress.text }}</div>
        <div class="gp-time">{{ formatTime(progress.startTime) }}</div>
      </div>

      <!-- 消息列表 -->
      <div class="messages-container">
        <div v-for="(message, index) in messages" :key="index"
             :id="message.nodeId ? 'msg-' + message.nodeId : undefined">
          <MessageItem :message="message"/>
        </div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-message">
          <div class="loading-spinner"></div>
          <span>AI正在思考中...</span>
        </div>
      </div>

      <!-- 内联一键下滑按钮（非固定，随内容滚动） -->
      <div v-show="showScrollButton" class="scroll-bottom-inline">
        <button class="scroll-bottom-btn" @click="scrollToBottom" title="滚动到底部">
          <span class="icon-arrow-down"></span>
          滚动到底部
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input">
      <div class="input-toolbar">
        <a-button size="middle" class="toolbar-btn" @click="handleUploadClick">
          <template #icon>
            <PaperClipOutlined/>
          </template>
          上传
        </a-button>
        <a-button size="middle" class="toolbar-btn" @click="insertCodeBlock">🧩 代码块</a-button>
        <a-dropdown placement="topLeft">
          <a-button size="middle" class="toolbar-btn">🧰 模板</a-button>
          <template #overlay>
            <a-menu @click="({ key }) => insertTemplate((templates.find(t=>t.label=== key ) as any).text)">
              <a-menu-item v-for="t in templates" :key="t.label">{{ t.label }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <!-- 计划侧边栏切换按钮 -->
        <a-button
          size="middle"
          class="toolbar-btn plan-toggle-btn"
          :type="chat.planVisible.value ? 'primary' : 'default'"
          @click="chat.togglePlanVisibility"
          :disabled="!chat.getCurrentPlan()"
        >
          <template #icon>📋</template>
          {{ chat.planVisible.value ? '隐藏计划' : '显示计划' }}
        </a-button>
        <!-- 开发模式测试按钮 -->
        <template v-if="isDevelopment">
          <a-divider type="vertical" />
          <a-button
            size="small"
            type="dashed"
            @click="testInitPlan"
            class="dev-test-btn"
          >
            🧪 测试计划
          </a-button>
          <a-button
            size="small"
            type="dashed"
            @click="testSimplePlan"
            class="dev-test-btn"
          >
            📝 简单计划
          </a-button>
        </template>
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
            <FileTextOutlined/>
            <span class="att-name">{{ a.name }}</span>
            <span class="att-size">{{ Math.round(a.size / 1024) }} KB</span>
            <button class="att-remove" @click="removeAttachment(a.name)">✕</button>
          </div>
        </div>

        <div class="input-container">
          <a-textarea
              style="flex: 1;"
              v-model:value="inputMessage"
              :auto-size="{ minRows: 3, maxRows: 10 }"
              :maxlength="4000"
              :show-count="true"
              placeholder="请输入您的问题...（Enter 发送，Shift+Enter 换行，支持拖拽文件、粘贴图片/文本）"
              :disabled="isLoading"
              :bordered="false"
              @pressEnter="onPressEnter"
              @paste="onPaste"
          />
          <a-button
              type="primary"
              :disabled="!canSend"
              :class="['send-btn', { 'send-btn--light': canSend }]"
              @click="sendMessage"
          >
            <template #icon>
              <SendOutlined/>
            </template>
            发送
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
    </div>

  </div>
</template>

<style scoped lang="scss">
/* Page layout */
.chat-container {
  display: flex;
  flex-direction: column;
  padding: 16px;
  flex: 1;
  background: linear-gradient(180deg, #f7f9fc, #f5f5f5);
  position: relative;
  transition: margin-right 0.3s ease;
}

/* 当计划侧边栏显示时，调整主内容区域 */
.chat-container:has(+ .plan-sidebar) {
  margin-right: 380px;
}

@media (max-width: 768px) {
  .chat-container:has(+ .plan-sidebar) {
    margin-right: 0;
  }
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #eceff3;
  box-shadow: 0 6px 24px rgba(15,23,42,0.04);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left h2 {
  margin: 0 0 0.5rem 0;
  color: #333;
  font-size: 1.5rem;
}

.agent-tags { display: flex; gap: 0.5rem; }
.tag-btn {
  padding: 0.5rem 1rem;
  border: 2px solid #ddd;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
}
.tag-btn:hover { border-color: #007bff; }
.tag-btn.active { background: #007bff; color: white; border-color: #007bff; }
.tag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.header-right { display: flex; align-items: center; }
.render-mode-selector { display: flex; align-items: center; gap: 0.5rem; }
.render-mode-selector label { font-weight: 500; color: #666; }
.render-mode-selector select { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: white; }

.chat-content { flex: 1; overflow-y: auto; padding: 0; position: relative; }

/* Three-column layout inside content */
.chat-body {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  gap: 0;
  height: 100%;
}
.sidebar-left, .sidebar-right { background: #fff; border-right: 1px solid #eceff3; display: flex; flex-direction: column; }
.sidebar-right { border-right: none; border-left: 1px solid #eceff3; }
.chat-center { overflow-y: auto; padding: 1.25rem; }


/* Right sidebar content */
.sr-header { padding: 12px 14px; border-bottom: 1px solid #f0f3f7; }
.sr-section { padding: 12px 14px; border-bottom: 1px solid #f5f7fb; }
.sr-title { font-weight: 600; font-size: 13px; color: #445; margin-bottom: 8px; }
.sr-box { background: #fafbff; border: 1px dashed #e1e6f0; padding: 10px; border-radius: 10px; font-size: 13px; color: #555; }

/* Global progress indicator (sticky chat status) */
.global-progress {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin: 0 0 10px 0;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-left: 4px solid #f6c342;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.global-progress .gp-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: spin 1s linear infinite;
}
.global-progress .gp-icon::before { content: '⏳'; }
.global-progress .gp-text { flex: 1; color: #5d4037; white-space: pre-wrap; }
.global-progress .gp-time { font-size: 12px; color: #8d6e63; }

.scroll-bottom-inline { display:flex; justify-content:center; padding: 12px 0 20px; }
.scroll-bottom-btn {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #333;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.scroll-bottom-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.12); background: #f9fafb; }
.scroll-bottom-btn:active { transform: translateY(0); box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
.icon-arrow-down::before { content: '⬇️'; }

.messages-container { max-width: 960px; margin: 0 auto; }

/* Loading state */
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
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* Input area */
.chat-input { padding: 0.75rem 1rem; min-width: 1080px; margin: 0 auto; border-top: 1px solid #eceff3; backdrop-filter: blur(4px); }
.input-toolbar {
  max-width: 960px;
  margin: 0.25rem auto 0.5rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-toggle-btn {
  margin-left: auto; /* 将计划按钮推到右侧 */
}

.dev-test-btn {
  font-size: 11px;
  height: 28px;
  border-color: #faad14;
  color: #faad14;
}

.dev-test-btn:hover {
  border-color: #ffc53d;
  color: #ffc53d;
  background: rgba(255, 197, 61, 0.1);
}
.input-surface { max-width: 960px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; box-shadow: 0 2px 12px rgba(15,23,42,0.06); transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
.input-surface--hover { border-color: #8cb8ff; box-shadow: 0 0 0 2px rgba(22,119,255,0.08), 0 2px 12px rgba(22,119,255,0.12); }
.input-surface.input-surface--light { border-color: #1677ff; box-shadow: 0 0 0 3px rgba(22,119,255,0.12), 0 4px 16px rgba(22,119,255,0.15); }
.attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.att-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 999px; border: 1px solid #e6eaf0; background: #f6f9ff; color: #334155; font-size: 12px; }
.att-chip .att-name { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.att-chip .att-size { color: #94a3b8; }
.att-chip .att-remove { margin-left: 2px; border: none; background: transparent; cursor: pointer; color: #94a3b8; line-height: 1; }
.att-chip .att-remove:hover { color: #ef4444; }
.input-container { display: flex; gap: 1rem; margin-bottom: 0.25rem; max-width: 960px; margin-inline: auto; }
.input-container textarea {
  /* flex: 1; */
  padding: 4px;
  /* border: 1px solid #e2e8f0; */
  /* border-radius: 12px; */
  resize: vertical;
  font-family: inherit;
  background: #fff;
  min-height: 54px;
  line-height: 1.5;
}
.send-btn {
  padding: 0.75rem 1.25rem;
  /* 由 antd 按钮接管主色，这里仅处理形状与阴影 */
  background: transparent;
  color: inherit;
  border: none; /* 外观统一交给 antd */
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background .18s ease, box-shadow .18s ease, transform .18s ease;
}
.send-btn--light { box-shadow: 0 4px 14px rgba(22,119,255,0.35); }
.send-btn:hover:not(:disabled) { background: #145ddc; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.quick-actions { display: flex; gap: 0.5rem; }
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
.action-btn:hover { background: #e9ecef; }

/* Keep icons here if you want page-level icons; otherwise rely on component-scoped icons */
.icon-send::before { content: '📤'; }
.icon-clear::before { content: '🗑️'; }
.icon-export::before { content: '📥'; }

</style>
