/**
 * 命令输入处理 Composable
 * 简化版：使用 Pinia 存储，去除过度设计
 */

import { ref, computed, watch } from 'vue'
import { useTerminalStore, type SimpleCommand, type ParsedCommand, type ParseError } from '@/stores/terminalStore'

export interface UseCommandInputOptions {
  onExecute?: (parsed: ParsedCommand) => void | Promise<void>
  onError?: (error: ParseError) => void
  historySize?: number
  // 终端写入函数
  write?: (data: string) => void
  writeln?: (data: string) => void
  showPrompt?: () => void
}

export function useCommandInput(options: UseCommandInputOptions = {}) {
  // 配置
  const {
    onExecute,
    onError,
    historySize = 100,
    write,
    writeln,
    showPrompt
  } = options

  // 使用 Pinia store
  const terminalStore = useTerminalStore()

  // 响应式状态
  const currentInput = ref('')
  const currentCommandLine = ref('') // 终端当前命令行
  const suggestions = ref<SimpleCommand[]>([])
  const selectedSuggestionIndex = ref(-1)
  const commandHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const showSuggestions = ref(false)
  const isLoading = ref(false)

  // 解析结果
  const parseResult = ref<{
    command?: ParsedCommand
    error?: ParseError
  }>({})

  // 计算属性：当前是否有有效输入
  const hasInput = computed(() => currentInput.value.trim().length > 0)

  // 计算属性：当前是否有建议
  const hasSuggestions = computed(() => suggestions.value.length > 0)

  // 计算属性：当前选中的建议
  const selectedSuggestion = computed(() => {
    if (selectedSuggestionIndex.value >= 0 && selectedSuggestionIndex.value < suggestions.value.length) {
      return suggestions.value[selectedSuggestionIndex.value]
    }
    return null
  })

  // 更新命令建议
  const updateSuggestions = (input: string) => {
    if (!input || !input.startsWith('/')) {
      suggestions.value = []
      showSuggestions.value = false
      selectedSuggestionIndex.value = -1
      return
    }

    // 移除前缀后进行匹配
    const query = input.slice(1).trim()

    if (query.length === 0) {
      // 显示所有命令
      suggestions.value = terminalStore.getAllCommands()
    } else {
      // 获取匹配的命令建议
      suggestions.value = terminalStore.getCommandSuggestions(query)
    }

    showSuggestions.value = suggestions.value.length > 0
    selectedSuggestionIndex.value = suggestions.value.length > 0 ? 0 : -1
  }

  // 处理输入变化
  const handleInput = (input: string) => {
    currentInput.value = input
    historyIndex.value = -1 // 重置历史索引

    // 更新建议
    updateSuggestions(input)

    // 如果输入完整命令（不只是前缀），尝试解析
    const trimmed = input.trim()
    if (trimmed.length > 1 && trimmed.startsWith('/')) {
      const result = terminalStore.parseCommand(input)
      parseResult.value = result

      // 只在有错误且不是"命令名称不能为空"时才通知
      // "命令名称不能为空"的情况是用户正在输入，不应该立即报错
      if (result.error && result.error.message !== '命令名称不能为空' && onError) {
        // 不立即触发错误，等待用户执行命令时再报错
        // onError(result.error)
      }
    } else {
      parseResult.value = {}
    }
  }

  // Tab补全：完成当前选中的建议
  const handleTabComplete = (): boolean => {
    if (!hasSuggestions.value || selectedSuggestionIndex.value < 0) {
      return false
    }

    const suggestion = suggestions.value[selectedSuggestionIndex.value]

    // 构建完整命令
    let completedCommand = `/${suggestion.name}`

    // 如果命令有必需参数，添加占位符
    const requiredParams = suggestion.parameters?.filter(p => p.required) || []
    if (requiredParams.length > 0) {
      completedCommand += ' '
      // 添加第一个必需参数的占位符
      const firstParam = requiredParams[0]
      completedCommand += `<${firstParam.name}>`
    }

    currentInput.value = completedCommand
    showSuggestions.value = false
    selectedSuggestionIndex.value = -1

    return true
  }

  // 向上选择建议
  const selectPreviousSuggestion = (): boolean => {
    if (!hasSuggestions.value) return false

    if (selectedSuggestionIndex.value > 0) {
      selectedSuggestionIndex.value--
    } else {
      selectedSuggestionIndex.value = suggestions.value.length - 1
    }
    return true
  }

  // 向下选择建议
  const selectNextSuggestion = (): boolean => {
    if (!hasSuggestions.value) return false

    if (selectedSuggestionIndex.value < suggestions.value.length - 1) {
      selectedSuggestionIndex.value++
    } else {
      selectedSuggestionIndex.value = 0
    }
    return true
  }

  // 选择指定索引的建议
  const selectSuggestion = (index: number) => {
    if (index >= 0 && index < suggestions.value.length) {
      selectedSuggestionIndex.value = index
      handleTabComplete()
    }
  }

  // 从历史记录向上翻
  const selectPreviousHistory = (): boolean => {
    if (commandHistory.value.length === 0) return false

    if (historyIndex.value < commandHistory.value.length - 1) {
      historyIndex.value++
      currentInput.value = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value]
      updateSuggestions(currentInput.value)
      return true
    }
    return false
  }

  // 从历史记录向下翻
  const selectNextHistory = (): boolean => {
    if (historyIndex.value > 0) {
      historyIndex.value--
      currentInput.value = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value]
      updateSuggestions(currentInput.value)
      return true
    } else if (historyIndex.value === 0) {
      historyIndex.value = -1
      currentInput.value = ''
      updateSuggestions('')
      return true
    }
    return false
  }

  // 执行命令
  const executeCommand = async () => {
    const input = currentInput.value.trim()
    if (!input) return

    // 添加到历史记录
    if (commandHistory.value[commandHistory.value.length - 1] !== input) {
      commandHistory.value.push(input)
      if (commandHistory.value.length > historySize) {
        commandHistory.value.shift()
      }
    }

    // 解析命令
    const result = terminalStore.parseCommand(input)

    if (result.error) {
      if (onError) {
        onError(result.error)
      }
      return
    }

    if (result.command && onExecute) {
      try {
        await onExecute(result.command)
      } catch (error) {
        console.error('Command execution error:', error)
        if (onError) {
          onError({
            message: error instanceof Error ? error.message : '命令执行失败'
          })
        }
      }
    }

    // 清空输入
    currentInput.value = ''
    suggestions.value = []
    showSuggestions.value = false
    selectedSuggestionIndex.value = -1
    historyIndex.value = -1
  }

  // 清空输入
  const clearInput = () => {
    currentInput.value = ''
    suggestions.value = []
    showSuggestions.value = false
    selectedSuggestionIndex.value = -1
    parseResult.value = {}
  }

  // 获取命令帮助信息
  const getCommandHelp = (commandName: string): SimpleCommand | undefined => {
    return terminalStore.getCommand(commandName)
  }

  // 获取所有命令
  const getAllCommands = (): SimpleCommand[] => {
    return terminalStore.getAllCommands()
  }

  // 更新终端显示
  const updateDisplay = () => {
    if (write) {
      write('\r\x1b[K') // 清除当前行
      write(currentCommandLine.value)
    }
    handleInput(currentCommandLine.value)
  }

  // 处理终端原始数据输入
  const handleTerminalData = (data: string) => {
    const char = data

    // 回车
    if (char === '\r' || char === '\n') {
      if (!currentCommandLine.value.trim()) {
        if (showPrompt) showPrompt()
        return
      }
      handleInput(currentCommandLine.value)
      executeCommand()
      return
    }

    // 退格
    if (char === '\u007F' || char === '\b') {
      if (currentCommandLine.value.length > 0) {
        currentCommandLine.value = currentCommandLine.value.slice(0, -1)
        handleInput(currentCommandLine.value)
        if (write) write('\b \b')
      }
      return
    }

    // Tab - 补全
    if (char === '\t') {
      if (showSuggestions.value && handleTabComplete()) {
        currentCommandLine.value = currentInput.value
        updateDisplay()
      }
      return
    }

    // 向上箭头
    if (char === '\u001b[A') {
      if (showSuggestions.value) {
        selectPreviousSuggestion()
      } else {
        selectPreviousHistory()
        if (currentInput.value) {
          currentCommandLine.value = currentInput.value
          updateDisplay()
        }
      }
      return
    }

    // 向下箭头
    if (char === '\u001b[B') {
      if (showSuggestions.value) {
        selectNextSuggestion()
      } else {
        selectNextHistory()
        if (currentInput.value) {
          currentCommandLine.value = currentInput.value
          updateDisplay()
        }
      }
      return
    }

    // 普通字符
    if (char.length === 1 && char.charCodeAt(0) >= 32) {
      currentCommandLine.value += char
      handleInput(currentCommandLine.value)
      if (write) write(char)
    }
  }

  // 监听输入变化
  watch(currentInput, (newValue) => {
    handleInput(newValue)
  })

  return {
    // 状态
    currentInput,
    currentCommandLine,
    suggestions,
    selectedSuggestionIndex,
    commandHistory,
    showSuggestions,
    isLoading,
    parseResult,

    // 计算属性
    hasInput,
    hasSuggestions,
    selectedSuggestion,

    // 方法
    handleInput,
    handleTabComplete,
    selectPreviousSuggestion,
    selectNextSuggestion,
    selectSuggestion,
    selectPreviousHistory,
    selectNextHistory,
    executeCommand,
    clearInput,
    getCommandHelp,
    getAllCommands,
    handleTerminalData,
    updateDisplay
  }
}
