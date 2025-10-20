// xterm.js Vue Composable
// 终端实例管理和状态管理

import { ref, computed, onUnmounted, nextTick } from 'vue'
import type { Terminal } from '@xterm/xterm'
import type { TerminalConfig, TerminalState, TerminalMessage } from '@/types/terminal'
import type { GeekModeTheme } from '@/types/terminal/themes'
import { DEFAULT_TERMINAL_CONFIG, mergeTerminalConfig } from '@/configs/terminal/xterm-config'
import { getDefaultTheme, getThemeByName } from '@/configs/terminal/geek-theme'

export interface UseXTerminalOptions {
  config?: Partial<TerminalConfig>
  theme?: Partial<GeekModeTheme> | string
  sessionId?: string
  enableGeekMode?: boolean
  autoConnect?: boolean
}

export function useXTerminal(options: UseXTerminalOptions = {}) {
  // 响应式状态
  const terminal = ref<Terminal | null>(null)
  const isReady = ref(false)
  const isConnected = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 终端状态
  const terminalState = ref<TerminalState>({
    isConnected: false,
    isLoading: false,
    currentDirectory: '~',
    prompt: '$ ',
    history: [],
    historyIndex: -1
  })

  // 消息队列
  const messages = ref<TerminalMessage[]>([])
  const messageId = ref(0)

  // 主题管理
  const currentTheme = ref<GeekModeTheme>(getDefaultTheme())

  // 计算属性
  const terminalConfig = computed(() => {
    return mergeTerminalConfig(DEFAULT_TERMINAL_CONFIG, options.config)
  })

  const isGeekMode = computed(() => {
    return options.enableGeekMode !== false
  })

  const connectionStatus = computed(() => {
    if (isLoading.value) return 'connecting'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  // 初始化主题
  const initializeTheme = () => {
    if (typeof options.theme === 'string') {
      const theme = getThemeByName(options.theme)
      if (theme) {
        currentTheme.value = theme
      }
    } else if (options.theme) {
      currentTheme.value = { ...getDefaultTheme(), ...options.theme }
    }
  }

  // 创建消息
  const createMessage = (
    type: TerminalMessage['type'],
    content: string,
    metadata?: Record<string, any>
  ): TerminalMessage => {
    return {
      id: `msg-${++messageId.value}`,
      type,
      content,
      timestamp: new Date(),
      sessionId: options.sessionId,
      metadata
    }
  }

  // 添加消息到历史
  const addMessage = (message: TerminalMessage) => {
    messages.value.push(message)

    // 限制消息历史长度
    if (messages.value.length > 1000) {
      messages.value = messages.value.slice(-800)
    }
  }

  // 写入数据到终端
  const write = (data: string, type: TerminalMessage['type'] = 'output') => {
    if (!terminal.value || !isReady.value) {
      console.warn('Terminal not ready for writing')
      return
    }

    try {
      terminal.value.write(data)
      addMessage(createMessage(type, data))
    } catch (err) {
      console.error('Failed to write to terminal:', err)
    }
  }

  // 写入一行数据
  const writeln = (data: string, type: TerminalMessage['type'] = 'output') => {
    if (!terminal.value || !isReady.value) {
      console.warn('Terminal not ready for writing')
      return
    }

    try {
      terminal.value.writeln(data)
      addMessage(createMessage(type, data + '\n'))
    } catch (err) {
      console.error('Failed to writeln to terminal:', err)
    }
  }

  // 清空终端
  const clear = () => {
    if (!terminal.value || !isReady.value) return

    try {
      terminal.value.clear()
      addMessage(createMessage('system', '[Terminal cleared]'))
    } catch (err) {
      console.error('Failed to clear terminal:', err)
    }
  }

  // 聚焦终端
  const focus = () => {
    if (!terminal.value || !isReady.value) return

    try {
      terminal.value.focus()
    } catch (err) {
      console.error('Failed to focus terminal:', err)
    }
  }

  // 处理用户输入
  const handleInput = (data: string) => {
    if (!isReady.value) return

    addMessage(createMessage('input', data))

    // 更新命令历史
    if (data.trim() && data.includes('\r')) {
      const command = data.replace(/\r?\n/g, '').trim()
      if (command && !terminalState.value.history.includes(command)) {
        terminalState.value.history.push(command)
        // 限制历史长度
        if (terminalState.value.history.length > 100) {
          terminalState.value.history = terminalState.value.history.slice(-80)
        }
      }
      terminalState.value.historyIndex = terminalState.value.history.length
    }
  }

  // 处理键盘事件
  const handleKey = (event: { key: string; domEvent: KeyboardEvent }) => {
    const { key, domEvent } = event

    // 历史命令导航
    if (domEvent.ctrlKey || domEvent.metaKey) {
      return // 让系统处理 Ctrl/Cmd 组合键
    }

    // 上箭头 - 上一个命令
    if (key === '\x1b[A') {
      if (terminalState.value.historyIndex > 0) {
        terminalState.value.historyIndex--
        const command = terminalState.value.history[terminalState.value.historyIndex]
        if (command) {
          // 清除当前行并输入历史命令
          terminal.value?.write('\x1b[2K\r' + terminalState.value.prompt + command)
        }
      }
      domEvent.preventDefault()
      return
    }

    // 下箭头 - 下一个命令
    if (key === '\x1b[B') {
      if (terminalState.value.historyIndex < terminalState.value.history.length - 1) {
        terminalState.value.historyIndex++
        const command = terminalState.value.history[terminalState.value.historyIndex]
        if (command) {
          terminal.value?.write('\x1b[2K\r' + terminalState.value.prompt + command)
        }
      } else {
        terminalState.value.historyIndex = terminalState.value.history.length
        terminal.value?.write('\x1b[2K\r' + terminalState.value.prompt)
      }
      domEvent.preventDefault()
      return
    }
  }

  // 应用主题
  const applyTheme = (theme: GeekModeTheme) => {
    if (!terminal.value) return

    try {
      const xtermTheme = {
        foreground: theme.foreground,
        background: theme.background,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selection: theme.selection,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.brightBlack,
        brightRed: theme.brightRed,
        brightGreen: theme.brightGreen,
        brightYellow: theme.brightYellow,
        brightBlue: theme.brightBlue,
        brightMagenta: theme.brightMagenta,
        brightCyan: theme.brightCyan,
        brightWhite: theme.brightWhite,
      }

      terminal.value.options.theme = xtermTheme
      currentTheme.value = theme
    } catch (err) {
      console.error('Failed to apply theme:', err)
    }
  }

  // 切换主题
  const switchTheme = (themeName: string) => {
    const theme = getThemeByName(themeName)
    if (theme) {
      applyTheme(theme)
    }
  }

  // 执行命令
  const executeCommand = async (command: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        addMessage(createMessage('command', command))

        // 这里应该集成实际的命令处理逻辑
        // 暂时返回模拟响应
        setTimeout(() => {
          const response = `Command executed: ${command}`
          addMessage(createMessage('output', response))
          resolve(response)
        }, 100)

      } catch (err) {
        const errorMsg = `Command failed: ${err instanceof Error ? err.message : String(err)}`
        addMessage(createMessage('error', errorMsg))
        reject(new Error(errorMsg))
      }
    })
  }

  // 显示提示符
  const showPrompt = () => {
    if (!terminal.value || !isReady.value) return

    const promptText = `\r\n${terminalState.value.prompt}`
    terminal.value.write(promptText)
  }

  // 错误处理
  const handleError = (err: Error) => {
    error.value = err.message
    console.error('Terminal error:', err)
    addMessage(createMessage('error', `Error: ${err.message}`))
  }

  // 连接到终端
  const connect = async () => {
    if (isConnected.value) return

    isLoading.value = true
    error.value = null

    try {
      await nextTick()

      terminalState.value.isConnected = true
      terminalState.value.isLoading = false
      isConnected.value = true

      addMessage(createMessage('system', 'Terminal connected'))

    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Connection failed'))
    } finally {
      isLoading.value = false
    }
  }

  // 断开连接
  const disconnect = () => {
    if (!isConnected.value) return

    try {
      terminalState.value.isConnected = false
      isConnected.value = false

      addMessage(createMessage('system', 'Terminal disconnected'))

    } catch (err) {
      console.error('Disconnect error:', err)
    }
  }

  // 重置终端状态
  const reset = () => {
    try {
      clear()
      terminalState.value.history = []
      terminalState.value.historyIndex = -1
      messages.value = []
      messageId.value = 0
      error.value = null

      addMessage(createMessage('system', 'Terminal reset'))

    } catch (err) {
      console.error('Reset error:', err)
    }
  }

  // 设置终端引用
  const setTerminal = (terminalInstance: Terminal) => {
    terminal.value = terminalInstance
    isReady.value = true

    // 设置事件监听
    terminalInstance.onData(handleInput)
    terminalInstance.onKey(handleKey)

    // 应用主题
    applyTheme(currentTheme.value)

    // 自动连接
    if (options.autoConnect !== false) {
      connect()
    }
  }

  // 清理资源
  const dispose = () => {
    try {
      disconnect()

      if (terminal.value) {
        terminal.value.dispose()
        terminal.value = null
      }

      isReady.value = false

    } catch (err) {
      console.error('Dispose error:', err)
    }
  }

  // 初始化
  initializeTheme()

  // 组件卸载时清理
  onUnmounted(() => {
    dispose()
  })

  // 返回API
  return {
    // 状态
    terminal: computed(() => terminal.value),
    isReady,
    isConnected,
    isLoading,
    error,
    connectionStatus,
    terminalState,
    messages,
    currentTheme,
    terminalConfig,
    isGeekMode,

    // 方法
    setTerminal,
    write,
    writeln,
    clear,
    focus,
    executeCommand,
    showPrompt,
    connect,
    disconnect,
    reset,
    dispose,

    // 主题方法
    applyTheme,
    switchTheme,

    // 事件处理
    handleInput,
    handleKey,
    handleError
  }
}