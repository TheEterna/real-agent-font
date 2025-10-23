/**
 * 终端命令解析器
 * 支持Linux风格的命令行解析，包括标记、选项、参数验证等
 */

import {
    Command,
    ParsedCommand,
    CommandParseError,
    CommandSuggestion,
    CommandParserConfig,
    CommandParameter, ParameterType,
} from '@/types/terminal/commands'
import { DEFAULT_PARSER_CONFIG } from '@/types/terminal/commands'

export class CommandParser {
  private config: CommandParserConfig
  private commands: Map<string, Command> = new Map()
  private aliases: Map<string, string> = new Map()

  constructor(config: Partial<CommandParserConfig> = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config }
  }

  /**
   * 注册命令
   */
  registerCommand(command: Command): void {
    // 注册主命令名
    const name = this.config.caseSensitive ? command.name : command.name.toLowerCase()
    this.commands.set(name, command)

    // 注册别名
    if (command.aliases) {
      for (const alias of command.aliases) {
        const aliasKey = this.config.caseSensitive ? alias : alias.toLowerCase()
        this.aliases.set(aliasKey, name)
      }
    }
  }

  /**
   * 批量注册命令
   */
  registerCommands(commands: Command[]): void {
    for (const command of commands) {
      this.registerCommand(command)
    }
  }

  /**
   * 获取命令
   */
  getCommand(name: string): Command | undefined {
    const key = this.config.caseSensitive ? name : name.toLowerCase()
    // 先查找直接命令
    const command = this.commands.get(key)
    if (command) return command

    // 再查找别名
    const aliasTarget = this.aliases.get(key)
    if (aliasTarget) {
      return this.commands.get(aliasTarget)
    }

    return undefined
  }

  /**
   * 解析命令字符串
   */
  parse(input: string): { command?: ParsedCommand; error?: CommandParseError } {
    try {
      // 清理输入
      const trimmed = input.trim()
      if (!trimmed) {
        return { error: { type: 'INVALID_SYNTAX', message: '请输入命令' } }
      }

      // 检查命令前缀
      if (!trimmed.startsWith(this.config.prefix)) {
        return {
          error: {
            type: 'INVALID_SYNTAX',
            message: `命令必须以 ${this.config.prefix} 开头`,
            suggestion: `尝试: ${this.config.prefix}${trimmed}`
          }
        }
      }

      // 移除前缀
      const withoutPrefix = trimmed.slice(this.config.prefix.length)
      if (!withoutPrefix) {
        return { error: { type: 'INVALID_SYNTAX', message: '命令名称不能为空' } }
      }

      // 分词解析
      const tokens = this.tokenize(withoutPrefix)
      if (tokens.length === 0) {
        return { error: { type: 'INVALID_SYNTAX', message: '无效的命令格式' } }
      }

      const commandName = tokens[0]
      const command = this.getCommand(commandName)

      if (!command) {
        // 提供建议
        const suggestions = this.getSuggestions(commandName)
        const suggestion = suggestions.length > 0
          ? `您是否想输入: ${suggestions[0].command.name}?`
          : undefined

        return {
          error: {
            type: 'UNKNOWN_COMMAND',
            message: `未知命令: ${commandName}`,
            suggestion
          }
        }
      }

      // 解析参数和标记
      const parseResult = this.parseArguments(tokens.slice(1), command)
      if (parseResult.error) {
        return { error: parseResult.error }
      }

      return {
        command: {
          original: input,
          command: commandName,
          args: parseResult.args!,
          flags: parseResult.flags!,
          options: parseResult.options!
        }
      }

    } catch (error) {
      return {
        error: {
          type: 'INVALID_SYNTAX',
          message: error instanceof Error ? error.message : '解析错误'
        }
      }
    }
  }

  /**
   * 获取命令建议
   */
  getSuggestions(input: string, maxResults?: number): CommandSuggestion[] {
    const limit = maxResults || this.config.maxSuggestions
    const threshold = this.config.suggestionThreshold
    const suggestions: CommandSuggestion[] = []

    const query = this.config.caseSensitive ? input : input.toLowerCase()

    for (const [name, command] of this.commands) {
      if (!command.enabled || command.hidden) continue

      // 精确匹配
      if (name === query) {
        suggestions.push({
          command,
          score: 1.0,
          matchType: 'exact'
        })
        continue
      }

      // 前缀匹配
      if (name.startsWith(query)) {
        const score = query.length / name.length
        suggestions.push({
          command,
          score,
          matchType: 'prefix'
        })
        continue
      }

      // 别名匹配
      if (command.aliases) {
        for (const alias of command.aliases) {
          const aliasKey = this.config.caseSensitive ? alias : alias.toLowerCase()
          if (aliasKey === query || aliasKey.startsWith(query)) {
            const score = query.length / aliasKey.length
            suggestions.push({
              command,
              score,
              matchType: 'alias'
            })
            break
          }
        }
      }

      // 模糊匹配
      if (this.config.enableFuzzyMatch) {
        const fuzzyScore = this.calculateFuzzyScore(query, name)
        if (fuzzyScore >= threshold) {
          suggestions.push({
            command,
            score: fuzzyScore,
            matchType: 'fuzzy'
          })
        }
      }
    }

    // 排序并限制结果数量
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * 检查命令是否存在
   */
  hasCommand(name: string): boolean {
    return this.getCommand(name) !== undefined
  }

  /**
   * 获取所有命令
   */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values())
  }

  /**
   * 获取启用的命令
   */
  getEnabledCommands(): Command[] {
    return this.getAllCommands().filter(cmd => cmd.enabled && !cmd.hidden)
  }

  // ============ 私有方法 ============

  /**
   * 分词器 - 支持引号和转义
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''
    let escaped = false

    for (let i = 0; i < input.length; i++) {
      const char = input[i]

      if (escaped) {
        current += char
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
        continue
      }

      if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ''
        continue
      }

      if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
        continue
      }

      current += char
    }

    if (current.trim()) {
      tokens.push(current.trim())
    }

    return tokens
  }

  /**
   * 解析参数和标记
   */
  private parseArguments(tokens: string[], command: Command): {
    args?: string[]
    flags?: Record<string, any>
    options?: Record<string, any>
    error?: CommandParseError
  } {
    const args: string[] = []
    const flags: Record<string, any> = {}
    const options: Record<string, any> = {}

    let i = 0
    const paramMap = new Map<string, CommandParameter>()

    // 构建参数映射
    for (const param of command.parameters) {
      paramMap.set(param.name, param)
      if (param.shortFlag) paramMap.set(param.shortFlag, param)
      if (param.longFlag) paramMap.set(param.longFlag, param)
    }

    while (i < tokens.length) {
      const token = tokens[i]

      // 长标记 (--flag)
      if (token.startsWith('--')) {
        const flagName = token.slice(2)
        const param = paramMap.get(`--${flagName}`)

        if (!param) {
          return {
            error: {
              type: 'INVALID_PARAMETER',
              message: `未知参数: ${token}`,
              position: i
            }
          }
        }

        const result = this.parseParameter(param, tokens, i)
        if (result.error) return { error: result.error }

        if (param.type === ParameterType.BOOLEAN) {
          flags[param.name] = result.value
        } else {
          options[param.name] = result.value
        }

        i = result.nextIndex
        continue
      }

      // 短标记 (-f)
      if (token.startsWith('-') && token.length > 1) {
        const flagName = token.slice(1)
        const param = paramMap.get(`-${flagName}`)

        if (!param) {
          return {
            error: {
              type: 'INVALID_PARAMETER',
              message: `未知参数: ${token}`,
              position: i
            }
          }
        }

        const result = this.parseParameter(param, tokens, i)
        if (result.error) return { error: result.error }

        if (param.type === ParameterType.BOOLEAN) {
          flags[param.name] = result.value
        } else {
          options[param.name] = result.value
        }

        i = result.nextIndex
        continue
      }

      // 位置参数
      args.push(token)
      i++
    }

    // 验证必需参数
    for (const param of command.parameters) {
      if (param.required && !(param.name in flags) && !(param.name in options)) {
        // 检查是否有默认值
        if (param.defaultValue !== undefined) {
          if (param.type === ParameterType.BOOLEAN) {
            flags[param.name] = param.defaultValue
          } else {
            options[param.name] = param.defaultValue
          }
        } else {
          return {
            error: {
              type: 'MISSING_PARAMETER',
              message: `缺少必需参数: ${param.name}`,
              suggestion: param.shortFlag || param.longFlag
                ? `请添加 ${param.shortFlag || param.longFlag}`
                : undefined
            }
          }
        }
      }
    }

    return { args, flags, options }
  }

  /**
   * 解析单个参数
   */
  private parseParameter(param: CommandParameter, tokens: string[], index: number): {
    value?: any
    nextIndex: number
    error?: CommandParseError
  } {
    if (param.type === ParameterType.BOOLEAN) {
      return { value: true, nextIndex: index + 1 }
    }

    // 需要值的参数
    if (index + 1 >= tokens.length) {
      return {
        error: {
          type: 'MISSING_PARAMETER',
          message: `参数 ${param.name} 需要一个值`
        },
        nextIndex: index + 1
      }
    }

    const valueToken = tokens[index + 1]
    const converted = this.convertParameterValue(valueToken, param)

    if (converted.error) {
      return { error: converted.error, nextIndex: index + 2 }
    }

    return { value: converted.value, nextIndex: index + 2 }
  }

  /**
   * 转换参数值
   */
  private convertParameterValue(value: string, param: CommandParameter): {
    value?: any
    error?: CommandParseError
  } {
    try {
      switch (param.type) {
        case ParameterType.STRING:
          if (param.choices && !param.choices.includes(value)) {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 必须是以下值之一: ${param.choices.join(', ')}`
              }
            }
          }
          if (param.validation && !param.validation.test(value)) {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 格式不正确`
              }
            }
          }
          return { value }

        case ParameterType.NUMBER:
          const num = Number(value)
          if (isNaN(num)) {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 必须是数字`
              }
            }
          }
          return { value: num }

        case ParameterType.PATH:
          // 简单路径验证
          if (value.includes('..') && value.includes('/')) {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 包含不安全的路径`
              }
            }
          }
          return { value }

        case ParameterType.URL:
          try {
            new URL(value)
            return { value }
          } catch {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 不是有效的URL`
              }
            }
          }

        case ParameterType.JSON:
          try {
            const parsed = JSON.parse(value)
            return { value: parsed }
          } catch {
            return {
              error: {
                type: 'INVALID_PARAMETER',
                message: `${param.name} 不是有效的JSON`
              }
            }
          }

        default:
          return { value }
      }
    } catch (error) {
      return {
        error: {
          type: 'INVALID_PARAMETER',
          message: `参数 ${param.name} 处理失败`
        }
      }
    }
  }

  /**
   * 计算模糊匹配分数
   */
  private calculateFuzzyScore(query: string, target: string): number {
    if (query.length === 0) return 0
    if (query.length > target.length) return 0

    const matrix: number[][] = []
    for (let i = 0; i <= target.length; i++) {
      matrix[i] = []
      for (let j = 0; j <= query.length; j++) {
        if (i === 0) matrix[i][j] = j
        else if (j === 0) matrix[i][j] = i
        else {
          const cost = target[i - 1] === query[j - 1] ? 0 : 1
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,      // 删除
            matrix[i][j - 1] + 1,      // 插入
            matrix[i - 1][j - 1] + cost // 替换
          )
        }
      }
    }

    const distance = matrix[target.length][query.length]
    return 1 - (distance / Math.max(query.length, target.length))
  }
}