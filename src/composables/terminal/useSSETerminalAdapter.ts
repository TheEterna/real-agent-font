// SSE 终端适配器
// 将 SSE 流式数据适配到 xterm.js 终端显示

import { ref, computed } from 'vue'
import type { Terminal } from '@xterm/xterm'
import type { UIMessage, BaseEventItem, EventType } from '@/types/events'
import type { GeekModeTheme } from '@/types/terminal/themes'

export interface SSETerminalAdapterOptions {
  terminal?: Terminal
  theme?: GeekModeTheme
  enableTypewriter?: boolean
  typewriterSpeed?: number
  enableColors?: boolean
  maxBufferSize?: number
}

export function useSSETerminalAdapter(options: SSETerminalAdapterOptions = {}) {
  // 响应式状态
  const terminal = ref<Terminal | null>(options.terminal || null)
  const isConnected = ref(false)
  const isProcessing = ref(false)
  const buffer = ref<string>('')
  const messageQueue = ref<UIMessage[]>([])

  // 配置
  const enableTypewriter = ref(options.enableTypewriter !== false)
  const typewriterSpeed = ref(options.typewriterSpeed || 30)
  const enableColors = ref(options.enableColors !== false)
  const maxBufferSize = ref(options.maxBufferSize || 10000)

  // 计算属性
  const hasTerminal = computed(() => terminal.value !== null)
  const queueLength = computed(() => messageQueue.value.length)

  // ANSI 颜色映射
  const colorMap = {
    success: '\x1b[32m',    // 绿色
    error: '\x1b[31m',      // 红色
    warning: '\x1b[33m',    // 黄色
    info: '\x1b[36m',       // 青色
    command: '\x1b[32m',    // 绿色
    output: '\x1b[37m',     // 白色
    system: '\x1b[90m',     // 灰色
    reset: '\x1b[0m'        // 重置
  }

  // 设置终端引用
  const setTerminal = (terminalInstance: Terminal) => {
    terminal.value = terminalInstance
    isConnected.value = true
  }

  // 格式化消息类型
  const formatMessageWithColor = (message: string, type: string): string => {
    if (!enableColors.value) return message

    const color = colorMap[type as keyof typeof colorMap] || colorMap.output
    return `${color}${message}${colorMap.reset}`
  }

  // 添加时间戳
  const addTimestamp = (message: string): string => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    return `[${timestamp}] ${message}`
  }

  // 打字机效果写入
  const typewriterWrite = async (text: string): Promise<void> => {
    if (!terminal.value || !enableTypewriter.value) {
      terminal.value?.write(text)
      return
    }

    return new Promise((resolve) => {
      let index = 0
      const writeNext = () => {
        if (index < text.length && terminal.value) {
          terminal.value.write(text[index])
          index++
          setTimeout(writeNext, typewriterSpeed.value)
        } else {
          resolve()
        }
      }
      writeNext()
    })
  }

  // 处理 SSE 事件
  const handleSSEEvent = async (event: BaseEventItem) => {
    if (!terminal.value) {
      // 如果终端未准备好，将事件加入队列
      const message: UIMessage = {
        nodeId: event.nodeId,
        sessionId: event.sessionId,
        type: getMessageTypeFromEvent(event.type),
        sender: event.agentId || 'Agent',
        message: event.message || '',
        timestamp: event.startTime || new Date(),
        data: event.data,
        meta: event.meta
      }
      messageQueue.value.push(message)
      return
    }

    isProcessing.value = true

    try {
      await processEvent(event)
    } catch (error) {
      console.error('Error processing SSE event:', error)
      await writeError(`处理事件时出错: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      isProcessing.value = false
    }
  }

  // 获取消息类型
  const getMessageTypeFromEvent = (eventType: string): string => {
    switch (eventType) {
      case EventType.STARTED: return 'system'
      case EventType.EXECUTING: return 'system'
      case EventType.THINKING: return 'info'
      case EventType.ACTION: return 'command'
      case EventType.OBSERVING: return 'output'
      case EventType.TOOL: return 'command'
      case EventType.TOOL_APPROVAL: return 'warning'
      case EventType.ERROR: return 'error'
      case EventType.DONE: return 'success'
      case EventType.DONEWITHWARNING: return 'warning'
      default: return 'output'
    }
  }

  // 处理单个事件
  const processEvent = async (event: BaseEventItem) => {
    const messageType = getMessageTypeFromEvent(event.type)
    let content = event.message || ''

    // 特殊事件处理
    switch (event.type) {
      case EventType.STARTED:
        await writeSystem(`🚀 任务开始: ${content}`)
        break

      case EventType.THINKING:
        await writeInfo(`🤔 思考中: ${content}`)
        break

      case EventType.ACTION:
        await writeCommand(`⚡ 执行: ${content}`)
        break

      case EventType.TOOL:
        await writeCommand(`🔧 工具调用: ${content}`)
        if (event.data) {
          await writeOutput(`📊 工具数据: ${JSON.stringify(event.data, null, 2)}`)
        }
        break

      case EventType.TOOL_APPROVAL:
        await writeWarning(`⚠️ 需要授权: ${content}`)
        break

      case EventType.ERROR:
        await writeError(`❌ 错误: ${content}`)
        break

      case EventType.DONE:
        await writeSuccess(`✅ 完成: ${content}`)
        break

      case EventType.DONEWITHWARNING:
        await writeWarning(`⚠️ 完成(有警告): ${content}`)
        break

      case EventType.PROGRESS:
        await writeInfo(`📈 进度: ${content}`)
        break

      case EventType.COMPLETED:
        await writeSystem('🎉 所有任务已完成')
        await writePrompt()
        break

      default:
        await writeOutput(content)
        break
    }
  }

  // 写入不同类型的消息
  const writeSystem = async (message: string) => {
    const formatted = formatMessageWithColor(addTimestamp(message), 'system')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeInfo = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'info')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeCommand = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'command')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeOutput = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'output')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeSuccess = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'success')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeWarning = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'warning')
    await typewriterWrite(`${formatted}\r\n`)
  }

  const writeError = async (message: string) => {
    const formatted = formatMessageWithColor(message, 'error')
    await typewriterWrite(`${formatted}\r\n`)
  }

  // 写入提示符
  const writePrompt = async () => {
    const prompt = '\r\n$ '
    const formatted = formatMessageWithColor(prompt, 'command')
    await typewriterWrite(formatted)
  }

  // 处理队列中的消息
  const processQueue = async () => {
    if (!terminal.value || isProcessing.value || messageQueue.value.length === 0) {
      return
    }

    isProcessing.value = true

    try {
      while (messageQueue.value.length > 0 && terminal.value) {
        const message = messageQueue.value.shift()
        if (message) {
          const event: BaseEventItem = {
            nodeId: message.nodeId,
            sessionId: message.sessionId,
            agentId: message.sender,
            type: message.type as EventType,
            message: message.message,
            startTime: message.timestamp,
            data: message.data,
            meta: message.meta
          }
          await processEvent(event)
        }
      }
    } catch (error) {
      console.error('Error processing message queue:', error)
    } finally {
      isProcessing.value = false
    }
  }

  // 清空终端
  const clear = () => {
    if (terminal.value) {
      terminal.value.clear()
      writePrompt()
    }
  }

  // 重置适配器
  const reset = () => {
    messageQueue.value = []
    buffer.value = ''
    isProcessing.value = false
  }

  // 写入欢迎信息
  const writeWelcome = async () => {
    await writeSystem('Real Agent 极客模式终端已连接')
    await writeInfo('输入 /help 查看可用命令')
    await writePrompt()
  }

  // 断开连接
  const disconnect = () => {
    isConnected.value = false
    terminal.value = null
    reset()
  }

  // 流式写入文本（用于 AI 响应）
  const streamWrite = async (text: string, speed: number = 50) => {
    if (!terminal.value) return

    const chunks = text.split('')
    for (const chunk of chunks) {
      if (terminal.value) {
        terminal.value.write(chunk)
        await new Promise(resolve => setTimeout(resolve, speed))
      }
    }
  }

  // 批量处理 SSE 事件
  const handleSSEEvents = async (events: BaseEventItem[]) => {
    for (const event of events) {
      await handleSSEEvent(event)
    }
  }

  // 返回 API
  return {
    // 状态
    terminal: computed(() => terminal.value),
    isConnected,
    isProcessing,
    hasTerminal,
    queueLength,

    // 配置
    enableTypewriter,
    typewriterSpeed,
    enableColors,

    // 方法
    setTerminal,
    handleSSEEvent,
    handleSSEEvents,
    processQueue,
    clear,
    reset,
    writeWelcome,
    disconnect,
    streamWrite,

    // 写入方法
    writeSystem,
    writeInfo,
    writeCommand,
    writeOutput,
    writeSuccess,
    writeWarning,
    writeError,
    writePrompt
  }
}

export type UseSSETerminalAdapterReturn = ReturnType<typeof useSSETerminalAdapter>