/**
 * 命令配置管理器
 * 负责命令的存储、同步、缓存和管理
 */
import {Command, CommandCategory, CommandPermission, ParameterType} from "@/types/terminal/commands";


// 命令配置存储键
const STORAGE_KEYS = {
  COMMANDS: 'terminal_commands',
  CACHE_TIMESTAMP: 'terminal_commands_cache_timestamp',
  USER_PREFERENCES: 'terminal_user_preferences'
} as const

// 缓存配置
interface CacheConfig {
  maxAge: number        // 最大缓存时间(ms)
  enableOffline: boolean // 启用离线模式
  syncInterval: number  // 同步间隔(ms)
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxAge: 24 * 60 * 60 * 1000, // 24小时
  enableOffline: true,
  syncInterval: 5 * 60 * 1000   // 5分钟
}

export class CommandConfigManager {
  private commands: Map<string, Command> = new Map()
  private cacheConfig: CacheConfig
  private syncTimer?: number
  private isOnline: boolean = navigator.onLine

  constructor(cacheConfig: Partial<CacheConfig> = {}) {
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig }
    this.initializeDefaults()
    this.setupNetworkListeners()
    this.loadFromCache()
    this.startSyncTimer()
  }

  /**
   * 获取所有命令
   */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values())
  }

  /**
   * 根据类别获取命令
   */
  getCommandsByCategory(category: CommandCategory): Command[] {
    return this.getAllCommands().filter(cmd => cmd.category === category)
  }

  /**
   * 获取单个命令
   */
  getCommand(name: string): Command | undefined {
    return this.commands.get(name.toLowerCase())
  }

  /**
   * 注册命令
   */
  registerCommand(command: Command): void {
    this.commands.set(command.name.toLowerCase(), command)
    this.saveToCache()
  }

  /**
   * 批量注册命令
   */
  registerCommands(commands: Command[]): void {
    for (const command of commands) {
      this.commands.set(command.name.toLowerCase(), command)
    }
    this.saveToCache()
  }

  /**
   * 更新命令
   */
  updateCommand(name: string, updates: Partial<Command>): boolean {
    const command = this.commands.get(name.toLowerCase())
    if (!command) return false

    const updated = { ...command, ...updates, updatedAt: new Date() }
    this.commands.set(name.toLowerCase(), updated)
    this.saveToCache()
    return true
  }

  /**
   * 禁用/启用命令
   */
  toggleCommand(name: string, enabled?: boolean): boolean {
    const command = this.commands.get(name.toLowerCase())
    if (!command) return false

    command.enabled = enabled !== undefined ? enabled : !command.enabled
    command.updatedAt = new Date()
    this.saveToCache()
    return true
  }

  /**
   * 从后端同步命令配置
   */
  async syncFromServer(): Promise<{ success: boolean; commands?: Command[]; error?: string }> {
    if (!this.isOnline) {
      return { success: false, error: '网络不可用' }
    }

    try {
      const response = await fetch('/api/terminal/commands')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const { data: serverCommands } = await response.json()

      // 合并服务器配置与本地默认配置
      const mergedCommands = this.mergeCommands(serverCommands)

      // 更新本地存储
      this.commands.clear()
      this.registerCommands(mergedCommands)

      // 更新缓存时间戳
      localStorage.setItem(STORAGE_KEYS.CACHE_TIMESTAMP, Date.now().toString())

      console.log('✅ Commands synced from server:', mergedCommands.length)
      return { success: true, commands: mergedCommands }

    } catch (error) {
      console.error('❌ Failed to sync commands from server:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '同步失败'
      }
    }
  }

  /**
   * 检查是否需要同步
   */
  needsSync(): boolean {
    if (!this.cacheConfig.enableOffline) return true

    const lastSync = localStorage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP)
    if (!lastSync) return true

    const cacheAge = Date.now() - parseInt(lastSync, 10)
    return cacheAge > this.cacheConfig.maxAge
  }

  /**
   * 强制刷新配置
   */
  async refresh(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.CACHE_TIMESTAMP)
    await this.syncFromServer()
  }

  /**
   * 获取缓存状态
   */
  getCacheInfo(): {
    lastSync: Date | null
    cacheAge: number
    isStale: boolean
    commandCount: number
  } {
    const lastSyncTimestamp = localStorage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP)
    const lastSync = lastSyncTimestamp ? new Date(parseInt(lastSyncTimestamp, 10)) : null
    const cacheAge = lastSync ? Date.now() - lastSync.getTime() : 0
    const isStale = this.needsSync()

    return {
      lastSync,
      cacheAge,
      isStale,
      commandCount: this.commands.size
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = undefined
    }
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
  }

  // ============ 私有方法 ============

  /**
   * 初始化默认命令配置
   */
  private initializeDefaults(): void {
    const defaultCommands = this.createDefaultCommands()
    this.registerCommands(defaultCommands)
  }

  /**
   * 创建默认命令配置
   */
  private createDefaultCommands(): Command[] {
    const now = new Date()

    return [
      // 系统控制命令
      {
        name: 'help',
        aliases: ['h', '?'],
        description: '显示帮助信息',
        usage: 'help [command]',
        examples: ['help', 'help connect'],
        category: CommandCategory.SYSTEM,
        permission: CommandPermission.PUBLIC,
        needsBackend: false,
        needsConnection: false,
        parameters: [
          {
            name: 'command',
            type: ParameterType.STRING,
            required: false,
            description: '要查看帮助的命令名称'
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'clear',
        aliases: ['cls'],
        description: '清空终端屏幕',
        usage: 'clear',
        category: CommandCategory.SYSTEM,
        permission: CommandPermission.PUBLIC,
        needsBackend: false,
        needsConnection: false,
        parameters: [],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'exit',
        aliases: ['quit', 'q'],
        description: '退出终端',
        usage: 'exit',
        category: CommandCategory.SYSTEM,
        permission: CommandPermission.PUBLIC,
        needsBackend: false,
        needsConnection: false,
        parameters: [],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'history',
        description: '显示命令历史',
        usage: 'history [-n number]',
        examples: ['history', 'history -n 10'],
        category: CommandCategory.SYSTEM,
        permission: CommandPermission.PUBLIC,
        needsBackend: false,
        needsConnection: false,
        parameters: [
          {
            name: 'number',
            type: ParameterType.NUMBER,
            required: false,
            shortFlag: '-n',
            longFlag: '--number',
            description: '显示最近的N条命令',
            defaultValue: 20
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      // AI交互命令
      {
        name: 'chat',
        aliases: ['ask'],
        description: '与AI助手对话',
        usage: 'chat <message>',
        examples: ['chat 你好', 'chat 帮我写一个Python函数'],
        category: CommandCategory.AI,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: false,
        parameters: [
          {
            name: 'message',
            type: ParameterType.STRING,
            required: true,
            description: '要发送给AI的消息'
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'plan',
        description: '让AI制定计划',
        usage: 'plan <task> [--detail]',
        examples: ['plan 学习Vue3', 'plan 开发网站 --detail'],
        category: CommandCategory.AI,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: false,
        parameters: [
          {
            name: 'task',
            type: ParameterType.STRING,
            required: true,
            description: '要制定计划的任务'
          },
          {
            name: 'detail',
            type: ParameterType.BOOLEAN,
            required: false,
            longFlag: '--detail',
            description: '生成详细计划',
            defaultValue: false
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      // 连接命令
      {
        name: 'connect',
        description: '连接到远程服务器',
        usage: 'connect <server> [--port port] [--user username]',
        examples: [
          'connect example.com',
          'connect 192.168.1.100 --port 2222 --user admin'
        ],
        category: CommandCategory.CONNECTION,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: false,
        parameters: [
          {
            name: 'server',
            type: ParameterType.STRING,
            required: true,
            description: '服务器地址或名称'
          },
          {
            name: 'port',
            type: ParameterType.NUMBER,
            required: false,
            longFlag: '--port',
            description: 'SSH端口号',
            defaultValue: 22
          },
          {
            name: 'user',
            type: ParameterType.STRING,
            required: false,
            longFlag: '--user',
            description: '用户名'
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'disconnect',
        description: '断开服务器连接',
        usage: 'disconnect',
        category: CommandCategory.CONNECTION,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: true,
        parameters: [],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      // 文件操作命令（需要连接）
      {
        name: 'ls',
        aliases: ['dir'],
        description: '列出目录内容',
        usage: 'ls [path] [-l] [-a]',
        examples: ['ls', 'ls /home', 'ls -la'],
        category: CommandCategory.FILE,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: true,
        parameters: [
          {
            name: 'path',
            type: ParameterType.PATH,
            required: false,
            description: '要列出的目录路径',
            defaultValue: '.'
          },
          {
            name: 'long',
            type: ParameterType.BOOLEAN,
            required: false,
            shortFlag: '-l',
            description: '详细格式显示',
            defaultValue: false
          },
          {
            name: 'all',
            type: ParameterType.BOOLEAN,
            required: false,
            shortFlag: '-a',
            description: '显示隐藏文件',
            defaultValue: false
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'pwd',
        description: '显示当前工作目录',
        usage: 'pwd',
        category: CommandCategory.FILE,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: true,
        parameters: [],
        enabled: true,
        createdAt: now,
        updatedAt: now
      },

      {
        name: 'cat',
        description: '显示文件内容',
        usage: 'cat <file>',
        examples: ['cat readme.txt', 'cat /etc/hosts'],
        category: CommandCategory.FILE,
        permission: CommandPermission.USER,
        needsBackend: true,
        needsConnection: true,
        parameters: [
          {
            name: 'file',
            type: ParameterType.PATH,
            required: true,
            description: '要查看的文件路径'
          }
        ],
        enabled: true,
        createdAt: now,
        updatedAt: now
      }
    ]
  }

  /**
   * 合并服务器配置与本地默认配置
   */
  private mergeCommands(serverCommands: Command[]): Command[] {
    const merged = new Map<string, Command>()

    // 首先添加默认命令
    for (const defaultCmd of this.createDefaultCommands()) {
      merged.set(defaultCmd.name.toLowerCase(), defaultCmd)
    }

    // 然后覆盖/添加服务器命令
    for (const serverCmd of serverCommands) {
      merged.set(serverCmd.name.toLowerCase(), serverCmd)
    }

    return Array.from(merged.values())
  }

  /**
   * 从缓存加载命令
   */
  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.COMMANDS)
      if (cached) {
        const commands: Command[] = JSON.parse(cached)
        this.commands.clear()

        // 恢复日期对象
        for (const cmd of commands) {
          if (cmd.createdAt) cmd.createdAt = new Date(cmd.createdAt)
          if (cmd.updatedAt) cmd.updatedAt = new Date(cmd.updatedAt)
          this.commands.set(cmd.name.toLowerCase(), cmd)
        }

        console.log('📋 Loaded commands from cache:', commands.length)
      }
    } catch (error) {
      console.warn('⚠️ Failed to load commands from cache:', error)
    }
  }

  /**
   * 保存到缓存
   */
  private saveToCache(): void {
    try {
      const commands = this.getAllCommands()
      localStorage.setItem(STORAGE_KEYS.COMMANDS, JSON.stringify(commands))
    } catch (error) {
      console.warn('⚠️ Failed to save commands to cache:', error)
    }
  }

  /**
   * 设置网络监听器
   */
  private setupNetworkListeners(): void {
    this.handleOnline = this.handleOnline.bind(this)
    this.handleOffline = this.handleOffline.bind(this)

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  /**
   * 处理网络恢复
   */
  private handleOnline(): void {
    this.isOnline = true
    console.log('🌐 Network online - checking for command updates')

    // 网络恢复时检查更新
    if (this.needsSync()) {
      this.syncFromServer()
    }
  }

  /**
   * 处理网络断开
   */
  private handleOffline(): void {
    this.isOnline = false
    console.log('📴 Network offline - using cached commands')
  }

  /**
   * 启动同步定时器
   */
  private startSyncTimer(): void {
    if (this.syncTimer) return

    this.syncTimer = window.setInterval(() => {
      if (this.isOnline && this.needsSync()) {
        this.syncFromServer()
      }
    }, this.cacheConfig.syncInterval)
  }
}