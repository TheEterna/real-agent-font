<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, h, watch } from 'vue'
import { UIMessage, MessageType } from '@/types/events'
import { AgentType } from '@/types/agents'
import { useChatStore } from '@/stores/chatStore'
import { getAgentUIConfig } from '@/agent-ui/registry'
import StatusIndicator from '@/components/StatusIndicator.vue'
import MessageItem from '@/components/MessageItem.vue'
import { useSSE } from '@/composables/useSSE'
import { notification } from 'ant-design-vue'
import { SendOutlined, PaperClipOutlined, FileTextOutlined } from '@ant-design/icons-vue'
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
import '@/styles/agents/react.css'
import '@/styles/agents/coding.css'

// 共享状态（会话/Agent 选择）
const chat = useChatStore()
// 已移除渲染模式，统一为 Markdown 行为（组件内处理工具渲染）
const inputMessage = ref('')
const attachments = ref<Attachment[]>([])

// 附件约束（放在 attachments 定义之后，以确保引用有效）
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
// 发送可用状态（控制“亮起”）
const canSend = computed(() => inputMessage.value.trim().length > 0 && !isLoading.value)
// 输入区 hover 状态（原子类控制）
const isInputHover = ref(false)

// Ant Design Vue 通知：8s 自动关闭 + 悬停暂停 + 点击定位
const AUTOCLOSE_MS = 8000

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

// 使用可复用的 SSE 组合式函数（取消自动滚动，仅按钮手动触发）
const handleDoneNotice = (node: { text: string; timestamp: Date; title: string; nodeId?: string }) => {
  const key = `done-${node.timestamp.getTime()}-${Math.random().toString(36).slice(2,8)}`
  // let left = AUTOCLOSE_MS
  // let start = Date.now()
  // let closed = false
  // let timer: number | undefined
  // const close = () => {
  //   if (closed) return
  //   closed = true
  //   if (timer) clearTimeout(timer)
  //   notification.close(key)
  // }
  // const pause = () => {
  //   if (closed) return
  //   const elapsed = Date.now() - start
  //   left = Math.max(0, left - elapsed)
  //   if (timer) { clearTimeout(timer); timer = undefined }
  // }
  // const resume = () => {
  //   if (closed) return
  //   if (left <= 0) { close(); return }
  //   start = Date.now()
  //   timer = window.setTimeout(() => close(), left)
  // }
  const onClick = () => locateByNode(node.nodeId)

  // const desc = h('div', { onMouseenter: pause, onMouseleave: resume, style: 'max-width: 280px;' }, [
  const desc = h('div', { style: 'max-width: 280px;' }, [
    h('div', { style: 'margin-top:4px; font-size:12px; color:#888; display:flex; align-items:center; gap:6px;' }, [
      h('span', formatTime(node.timestamp as any)),
      h('span', '·'),
      h('span', { style: 'max-width: 180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' }, node.title || '')
    ])
  ])

  notification.success({
    message: node.text,
    description: desc,
    key,
    duration: 8, // 手动控制关闭以支持悬停暂停
    onClick,
    // onClose: () => { closed = true; if (timer) clearTimeout(timer) }
  })
  // resume()
}

const { messages, nodeIndex, connectionStatus, taskStatus, progress, executeReAct, executeCoding } = useSSE({ onDoneNotice: handleDoneNotice })

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
const agentUI = computed(() => getAgentUIConfig(chat.selectedTag.value))

// 会话ID
const sessionId = chat.sessionId

// 渲染模式已移除，无需切换

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
    switch (chat.selectedTag.value) {
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
    connectionStatus.value.set('disconnected')
    if (taskStatus.value.is('running')) {
      taskStatus.value.set('error')
    }
    // 不自动滚动，保留当前滚动位置
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
  new TemplateItem('生成单元测试', '为以下代码生成JUnit5单元测试，包含边界与异常用例：\n```java\n// 粘贴代码\n```'),
  new TemplateItem('优化说明文档', '请根据以下变更生成简洁明了的更新说明（变更点/影响范围/回滚方式）：\n- 变更点：\n- 影响范围：\n- 回滚方式：'),
]
const insertTemplate = (t: string) => {
  inputMessage.value = (inputMessage.value ? inputMessage.value + '\n' : '') + t
  templatesOpen.value = false
}

// 导出对话


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
  // 优先加载当前会话已存在的消息
  const existing = chat.getSessionMessages(sessionId.value)
  if (existing && existing.length > 0) {
    messages.value = [...existing]
  } else {
    // 添加欢迎消息（首次会话）
    messages.value.push({
      type: MessageType.System,
      sender: 'AI Assistant',
      message: `欢迎使用 ${chat.selectedTag.value} Agent！我可以帮助您解决各种问题。请输入您的问题开始对话。`,
      timestamp: new Date()
    })
  }

  // 监听滚动，控制“下滑按钮”显隐
  chatContent.value?.addEventListener('scroll', updateScrollButtonVisibility)
  updateScrollButtonVisibility()
})
</script>
<template>
  <div class="chat-container" :class="agentUI.themeClass">
    <!-- 主对话区域（滚动） -->
    <div class="chat-content" ref="chatContent">
      <!-- 状态指示器 -->
      <StatusIndicator :status="taskStatus.value.value" />
      <!-- 全局唯一进度显示器 -->
      <div v-if="progress" class="global-progress">
        <div class="gp-icon" aria-hidden></div>
        <div class="gp-text">{{ progress.text }}</div>
        <div class="gp-time">{{ formatTime(progress.timestamp as any) }}</div>
      </div>

      <!-- 消息列表 -->
      <div class="messages-container">
        <div v-for="(message, index) in messages" :key="index" :id="message.nodeId ? 'msg-' + message.nodeId : undefined">
          <MessageItem :message="message" />
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
        <a-button size="small" class="toolbar-btn" @click="handleUploadClick">
          <template #icon><PaperClipOutlined /></template>
          上传
        </a-button>
        <a-button size="small" class="toolbar-btn" @click="insertCodeBlock">🧩 代码块</a-button>
        <a-dropdown placement="topLeft">
          <a-button size="small" class="toolbar-btn">🧰 模板</a-button>
          <template #overlay>
            <a-menu @click="({ key }) => insertTemplate((templates.find(t=>t.label===key) as any).text)">
              <a-menu-item v-for="t in templates" :key="t.label">{{ t.label }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
      <div v-if="templatesOpen" class="input-toolbar" style="margin-top: -6px;">
        <a-button
          v-for="t in templates"
          :key="t.label"
          size="small"
          class="toolbar-btn"
          @click="insertTemplate(t.text)"
        >{{ t.label }}</a-button>
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
            <template #icon><SendOutlined /></template>
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

      <!-- <div class="quick-actions">
        <a-button @click="clearChat" class="action-btn">
          清空对话
        </a-button>
        <a-button @click="exportChat" class="action-btn">
          导出对话
        </a-button>
      </div> -->
    </div>
  </div>
</template>


<style scoped lang="scss">
/* Styles moved to src/styles/chat.css; component-specific styles live in each component */
</style>
