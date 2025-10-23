/**
 * 命令输入处理 Composable
 * 负责命令输入、实时提示、Tab补全等交互功能
 */

import { ref, computed, watch } from 'vue'
import { CommandParser } from '@/utils/terminal/CommandParser'
import { CommandConfigManager } from '@/utils/terminal/CommandConfigManager'
import type { Command, CommandSuggestion, ParsedCommand, CommandParseError } from '@/types/terminal/commands'

export interface UseCommandInputOptions {
  onExecute?: (parsed: ParsedCommand) => void | Promise<void>
  onError?: (error: CommandParseError) => void
  historySize?: number
}

export function useCommandInput(options: UseCommandInputOptions = {}) {
  // 配置
  const {
    onExecute,
    onError,
    historySize = 100
  } = options

  // 核心实例
  const parser = new CommandParser()
  const configManager = new CommandConfigManager()

  // 响应式状态
  const currentInput = ref('')
  const suggestions = ref<CommandSuggestion[]>([])
  const selectedSuggestionIndex = ref(-1)
  const commandHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const showSuggestions = ref(false)
  const isLoading = ref(false)

  // 解析结果
  const parseResult = ref<{
    command?: ParsedCommand
    error?: CommandParseError
  }>({})

  // 初始化：注册所有命令
  const initializeCommands = async () => {
    try {
      isLoading.value = true

      // 加载配置管理器中的命令
      const commands = configManager.getAllCommands()
      parser.registerCommands(commands)

      // 如果需要同步，从服务器获取最新命令
      if (configManager.needsSync()) {
        const syncResult = await configManager.syncFromServer()
        if (syncResult.success && syncResult.commands) {
          parser.registerCommands(syncResult.commands)
        }
      }

      console.log('✅ Commands initialized:', commands.length)
    } catch (error) {
      console.error('❌ Failed to initialize commands:', error)
    } finally {
      isLoading.value = false
    }
  }

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
      // 显示所有启用的命令
      const allCommands = parser.getEnabledCommands()
      suggestions.value = allCommands.map(cmd => ({
        command: cmd,
        score: 1.0,
        matchType: 'exact' as const
      }))
    } else {
      // 获取匹配的命令建议
      suggestions.value = parser.getSuggestions(query)
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

    // 如果输入完整命令，尝试解析
    if (input.trim().length > 0 && input.startsWith('/')) {
      const result = parser.parse(input)
      parseResult.value = result

      // 如果有错误，通知外部
      if (result.error && onError) {
        onError(result.error)
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
    const command = suggestion.command

    // 构建完整命令
    let completedCommand = `/${command.name}`

    // 如果命令有必需参数，添加占位符
    const requiredParams = command.parameters.filter(p => p.required)
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
    const result = parser.parse(input)

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
            type: 'INVALID_SYNTAX',
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
  const getCommandHelp = (commandName: string): Command | undefined => {
    return parser.getCommand(commandName)
  }

  // 获取所有命令
  const getAllCommands = (): Command[] => {
    return parser.getAllCommands()
  }

  // 监听输入变化
  watch(currentInput, (newValue) => {
    handleInput(newValue)
  })

  // 初始化
  initializeCommands()

  return {
    // 状态
    currentInput,
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
    initializeCommands,

    // 实例访问（高级用途）
    parser,
    configManager
  }
}
