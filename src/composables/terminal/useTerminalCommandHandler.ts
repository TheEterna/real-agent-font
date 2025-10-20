// 终端命令处理系统
// 专门为xterm.js终端设计的命令处理器

import { ref } from 'vue'
import type { Terminal } from '@xterm/xterm'
import { useCommandParser } from './useCommandParser'
import { executeCommand } from './commands/index'

export interface TerminalCommandContext {
  terminal?: Terminal
  sessionId?: string
  switchTheme?: (themeName: string) => void
  xtermVersion?: string
}

export function useTerminalCommandHandler(context: TerminalCommandContext = {}) {
  const { parseCommand, getCommandSuggestions, isValidCommand } = useCommandParser()

  const commandHistory = ref<string[]>([])
  const historyIndex = ref(-1)

  // 执行终端命令
  const executeTerminalCommand = async (commandText: string): Promise<string> => {
    const parsed = parseCommand(commandText)
    if (!parsed) {
      throw new Error('无效的命令格式')
    }

    // 增强的上下文，包含终端相关信息
    const enhancedContext = {
      ...context,
      terminal: context.terminal,
      sessionId: context.sessionId,
      commandHistory: commandHistory.value
    }

    try {
      const result = await executeCommand(parsed.command, parsed.args, enhancedContext)

      // 添加到历史记录
      if (!commandHistory.value.includes(commandText)) {
        commandHistory.value.push(commandText)
        // 限制历史记录长度
        if (commandHistory.value.length > 100) {
          commandHistory.value = commandHistory.value.slice(-80)
        }
      }
      historyIndex.value = commandHistory.value.length

      return result
    } catch (error) {
      throw new Error(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 获取命令建议
  const getCommandSuggestionsForInput = (input: string): string[] => {
    return getCommandSuggestions(input)
  }

  // 获取历史命令
  const getPreviousCommand = (): string | null => {
    if (historyIndex.value > 0) {
      historyIndex.value--
      return commandHistory.value[historyIndex.value]
    }
    return null
  }

  const getNextCommand = (): string | null => {
    if (historyIndex.value < commandHistory.value.length - 1) {
      historyIndex.value++
      return commandHistory.value[historyIndex.value]
    } else {
      historyIndex.value = commandHistory.value.length
      return null
    }
  }

  // 重置历史索引
  const resetHistoryIndex = () => {
    historyIndex.value = commandHistory.value.length
  }

  // 检查是否为命令
  const isCommand = (input: string): boolean => {
    return input.trim().startsWith('/')
  }

  // 验证命令格式
  const validateCommand = (input: string): { valid: boolean; error?: string } => {
    if (!isCommand(input)) {
      return { valid: false, error: '命令必须以 / 开头' }
    }

    const parsed = parseCommand(input)
    if (!parsed) {
      return { valid: false, error: '无效的命令格式' }
    }

    if (!isValidCommand(parsed.command)) {
      return {
        valid: false,
        error: `命令 '${parsed.command}' 不存在。输入 /help 查看可用命令。`
      }
    }

    return { valid: true }
  }

  // 格式化命令输出
  const formatCommandOutput = (command: string, output: string): string => {
    const timestamp = new Date().toLocaleTimeString('zh-CN')
    return `[${timestamp}] ${command}\n${output}`
  }

  // 清空命令历史
  const clearHistory = () => {
    commandHistory.value = []
    historyIndex.value = -1
  }

  return {
    // 方法
    executeTerminalCommand,
    getCommandSuggestionsForInput,
    getPreviousCommand,
    getNextCommand,
    resetHistoryIndex,
    isCommand,
    validateCommand,
    formatCommandOutput,
    clearHistory,

    // 状态
    commandHistory,
    historyIndex
  }
}

export type UseTerminalCommandHandlerReturn = ReturnType<typeof useTerminalCommandHandler>