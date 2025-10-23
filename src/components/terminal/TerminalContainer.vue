<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import XTerminal from './XTerminal.vue'
import CommandSuggestions from './CommandSuggestions.vue'
import type { GeekModeTheme } from '@/types/terminal/themes'
import type { TerminalConfig } from '@/types/terminal'
import { CodeOutlined, SettingOutlined, FullscreenOutlined } from '@ant-design/icons-vue'
import { useCommandInput } from '@/composables/terminal/useCommandInput'
import type { ParsedCommand, CommandParseError } from '@/types/terminal/commands'

// Props 定义
interface Props {
  title?: string
  config?: Partial<TerminalConfig>
  theme?: Partial<GeekModeTheme>
  showHeader?: boolean
  showControls?: boolean
  enableGeekMode?: boolean
  sessionId?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Real Agent Terminal',
  showHeader: true,
  showControls: true,
  enableGeekMode: true
})

// Emits 定义
interface Emits {
  terminalReady: [terminal: any]
  data: [data: string]
  key: [event: { key: string; domEvent: KeyboardEvent }]
  close: []
  minimize: []
  maximize: []
  settings: []
  reconnect: []
}

const emit = defineEmits<Emits>()

// 响应式状态
const terminalRef = ref<InstanceType<typeof XTerminal>>()
const isFullscreen = ref(false)
const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('connecting')
const currentCommandLine = ref('')
const commandPrompt = ref('$ ')
const connectionAttempts = ref(0)
const maxConnectionAttempts = ref(5)
const connectionRetryInterval = ref<NodeJS.Timeout | null>(null)

// 命令输入处理
const {
  currentInput,
  suggestions,
  selectedSuggestionIndex,
  showSuggestions,
  isLoading,
  parseResult,
  handleInput,
  handleTabComplete,
  selectPreviousSuggestion,
  selectNextSuggestion,
  selectSuggestion,
  selectPreviousHistory,
  selectNextHistory,
  executeCommand,
  clearInput
} = useCommandInput({
  onExecute: handleCommandExecute,
  onError: handleCommandError
})

// 计算属性
const containerClasses = computed(() => ({
  'terminal-container': true,
  'terminal-fullscreen': isFullscreen.value,
  'terminal-geek-mode': props.enableGeekMode,
  [`terminal-status-${connectionStatus.value}`]: true
}))

const statusColor = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return '#00ff00'
    case 'disconnected': return '#ff4040'
    case 'connecting': return '#ffff40'
    default: return '#666666'
  }
})

// 终端事件处理
const handleTerminalReady = (terminal: any) => {
  emit('terminalReady', terminal)

  // 始终显示欢迎信息,无论连接状态如何
  if (props.enableGeekMode) {
    showWelcomeMessageWithRetry()
  }

  // 尝试连接服务器
  attemptServerConnection()

  // 设置命令行提示符
  nextTick(() => {
    showPrompt()
  })
}

// 命令执行处理
async function handleCommandExecute(parsed: ParsedCommand) {
  try {
    // 在终端显示执行的命令
    terminalRef.value?.writeln(`\r\n${commandPrompt.value}${parsed.original}`)

    // 处理本地命令（不需要后端）
    const localResult = await handleLocalCommand(parsed)
    if (localResult.handled) {
      if (localResult.output) {
        terminalRef.value?.writeln(localResult.output)
      }
      showPrompt()
      return
    }

    // 需要后端处理的命令
    terminalRef.value?.writeln('⚙️ 正在处理命令...')

    // TODO: 调用后端API
    // const response = await fetch('/api/terminal/execute', {
    //   method: 'POST',
    //   body: JSON.stringify(parsed)
    // })

    // 模拟后端响应
    await new Promise(resolve => setTimeout(resolve, 500))
    terminalRef.value?.writeln('✅ 命令执行成功（模拟）')

    showPrompt()
  } catch (error) {
    terminalRef.value?.writeln(`❌ 错误: ${error instanceof Error ? error.message : '未知错误'}`)
    showPrompt()
  }
}

// 处理本地命令
async function handleLocalCommand(parsed: ParsedCommand): Promise<{ handled: boolean; output?: string }> {
  switch (parsed.command.toLowerCase()) {
    case 'clear':
    case 'cls':
      terminalRef.value?.clear()
      return { handled: true }

    case 'exit':
    case 'quit':
      terminalRef.value?.writeln('\r\n👋 再见！')
      // 可以触发关闭事件
      emit('close')
      return { handled: true }

    case 'help': {
      const helpText = generateHelpText(parsed.args[0])
      return { handled: true, output: helpText }
    }

    case 'history': {
      // 显示命令历史
      const historyText = generateHistoryText()
      return { handled: true, output: historyText }
    }

    case 'reconnect': {
      reconnect()
      return { handled: true }
    }

    default:
      return { handled: false }
  }
}

// 生成帮助文本
function generateHelpText(commandName?: string): string {
  if (commandName) {
    // 显示特定命令的帮助
    const command = useCommandInput({ onExecute: () => {}, onError: () => {} }).parser.getCommand(commandName)
    if (!command) {
      return `❌ 未知命令: ${commandName}`
    }

    let help = `\r\n📋 命令: /${command.name}\n`
    if (command.aliases && command.aliases.length > 0) {
      help += `   别名: ${command.aliases.join(', ')}\n`
    }
    help += `   描述: ${command.description}\n`
    help += `   用法: ${command.usage}\n`

    if (command.examples && command.examples.length > 0) {
      help += `\n   示例:\n`
      command.examples.forEach(ex => {
        help += `     ${ex}\n`
      })
    }

    if (command.parameters && command.parameters.length > 0) {
      help += `\n   参数:\n`
      command.parameters.forEach(param => {
        const required = param.required ? '(必需)' : '(可选)'
        help += `     ${param.name} ${required} - ${param.description}\n`
      })
    }

    return help
  }

  // 显示所有命令列表
  let help = '\r\n📖 可用命令列表:\n\n'

  const categories = {
    system: '系统控制',
    ai: 'AI交互',
    file: '文件操作',
    project: '项目管理',
    connection: '连接管理'
  }

  const commands = useCommandInput({ onExecute: () => {}, onError: () => {} }).getAllCommands()

  Object.entries(categories).forEach(([cat, label]) => {
    const catCommands = commands.filter(cmd => cmd.category === cat && cmd.enabled && !cmd.hidden)
    if (catCommands.length > 0) {
      help += `  ${label}:\n`
      catCommands.forEach(cmd => {
        help += `    /${cmd.name.padEnd(15)} - ${cmd.description}\n`
      })
      help += '\n'
    }
  })

  help += '  输入 /help <命令名> 查看详细帮助\n'
  return help
}

// 生成历史文本
function generateHistoryText(): string {
  // TODO: 从useCommandInput获取历史记录
  return '\r\n📜 命令历史功能开发中...'
}

// 命令错误处理
function handleCommandError(error: CommandParseError) {
  let errorMsg = `\r\n❌ ${error.message}`
  if (error.suggestion) {
    errorMsg += `\n💡 建议: ${error.suggestion}`
  }
  terminalRef.value?.writeln(errorMsg)
  showPrompt()
}

// 显示命令提示符
function showPrompt() {
  nextTick(() => {
    terminalRef.value?.write(`\r\n${commandPrompt.value}`)
    currentCommandLine.value = ''
  })
}

const handleTerminalData = (data: string) => {
  // 处理用户输入
  const char = data

  // 特殊键处理
  if (char === '\r' || char === '\n') {
    // 回车键 - 执行命令
    handleEnter()
    return
  }

  if (char === '\u007F' || char === '\b') {
    // 退格键
    handleBackspace()
    return
  }

  if (char === '\t') {
    // Tab键 - 补全
    handleTab()
    return
  }

  if (char === '\u001b[A') {
    // 向上箭头 - 历史记录或建议选择
    if (showSuggestions.value) {
      selectPreviousSuggestion()
    } else {
      selectPreviousHistory()
      if (currentInput.value) {
        updateTerminalDisplay()
      }
    }
    return
  }

  if (char === '\u001b[B') {
    // 向下箭头 - 历史记录或建议选择
    if (showSuggestions.value) {
      selectNextSuggestion()
    } else {
      selectNextHistory()
      if (currentInput.value) {
        updateTerminalDisplay()
      }
    }
    return
  }

  if (char === '\u001b') {
    // ESC键 - 关闭建议
    if (showSuggestions.value) {
      clearInput()
      updateTerminalDisplay()
    }
    return
  }

  // 普通字符输入
  if (char.length === 1 && char.charCodeAt(0) >= 32) {
    currentCommandLine.value += char
    handleInput(currentCommandLine.value)
    terminalRef.value?.write(char)
  }

  emit('data', data)
}

const handleTerminalKey = (event: { key: string; domEvent: KeyboardEvent }) => {
  emit('key', event)
}

// 处理回车键
function handleEnter() {
  if (!currentCommandLine.value.trim()) {
    showPrompt()
    return
  }

  // 执行命令
  handleInput(currentCommandLine.value)
  executeCommand()
}

// 处理退格键
function handleBackspace() {
  if (currentCommandLine.value.length > 0) {
    currentCommandLine.value = currentCommandLine.value.slice(0, -1)
    handleInput(currentCommandLine.value)

    // 删除终端显示的字符
    terminalRef.value?.write('\b \b')
  }
}

// 处理Tab键
function handleTab() {
  if (showSuggestions.value) {
    const completed = handleTabComplete()
    if (completed) {
      // 更新显示
      updateTerminalDisplay()
    }
  }
}

// 更新终端显示
function updateTerminalDisplay() {
  // 清除当前行
  terminalRef.value?.write('\r\x1b[K')

  // 重新显示提示符和当前输入
  terminalRef.value?.write(commandPrompt.value + currentCommandLine.value)

  // 更新当前输入到useCommandInput
  handleInput(currentCommandLine.value)
}

// 控制按钮事件
const handleClose = () => {
  emit('close')
}

const handleMinimize = () => {
  emit('minimize')
}

const handleMaximize = () => {
  isFullscreen.value = !isFullscreen.value
  emit('maximize')
}

const handleSettings = () => {
  emit('settings')
}

// 尝试连接服务器
const attemptServerConnection = async () => {
  connectionStatus.value = 'connecting'
  connectionAttempts.value = 0

  // 清除之前的重试定时器
  if (connectionRetryInterval.value) {
    clearInterval(connectionRetryInterval.value)
    connectionRetryInterval.value = null
  }

  // 开始连接重试
  connectionRetryInterval.value = setInterval(async () => {
    connectionAttempts.value++

    try {
      // TODO: 实际的连接逻辑,这里模拟连接检查
      // const response = await fetch('/api/health')
      // if (response.ok) {
      //   connectionStatus.value = 'connected'
      //   clearInterval(connectionRetryInterval.value!)
      //   terminalRef.value?.writeln('\r\n✅ 服务器连接成功!')
      //   return
      // }

      // 模拟连接失败
      throw new Error('Connection failed')

    } catch (error) {
      // 显示连接失败提示
      const attemptInfo = `⚠️  连接服务器失败 (尝试 ${connectionAttempts.value}/${maxConnectionAttempts.value})`
      terminalRef.value?.writeln(`\r${attemptInfo}`)

      // 达到最大重试次数
      if (connectionAttempts.value >= maxConnectionAttempts.value) {
        connectionStatus.value = 'disconnected'
        if (connectionRetryInterval.value) {
          clearInterval(connectionRetryInterval.value)
          connectionRetryInterval.value = null
        }
        terminalRef.value?.writeln('\r\n❌ 无法连接到服务器,已达到最大重试次数')
        terminalRef.value?.writeln('💡 提示: 您仍然可以使用本地命令 (如 /help, /clear 等)')
        showPrompt()
      }
    }
  }, 2000) // 每2秒重试一次
}

// 手动重新连接
const reconnect = () => {
  terminalRef.value?.writeln('\r\n🔄 正在重新连接服务器...')
  attemptServerConnection()
  emit('reconnect')
}

// 生命周期
onMounted(() => {
  connectionStatus.value = 'connecting'
})

// 暴露方法
defineExpose({
  write,
  writeln,
  clear,
  focus,
  reconnect,
  terminal: terminalRef
})
</script>

<template>
  <div :class="containerClasses">
    <!-- 终端头部 -->
    <div v-if="showHeader" class="terminal-header">
      <!-- 左侧：标题和图标 -->
      <div class="header-left">
        <div class="terminal-controls">
          <div class="control-button close" @click="handleClose"></div>
          <div class="control-button minimize" @click="handleMinimize"></div>
          <div class="control-button maximize" @click="handleMaximize"></div>
        </div>
        <div class="terminal-title">
          <CodeOutlined class="title-icon" />
          <span class="title-text">{{ title }}</span>
        </div>
      </div>

      <!-- 中间：状态信息 -->
      <div class="header-center">
        <div class="status-indicator">
          <div
            class="status-dot"
            :style="{ backgroundColor: statusColor }"
          ></div>
          <span class="status-text">{{ connectionStatus.toUpperCase() }}</span>
        </div>
      </div>

      <!-- 右侧：控制按钮 -->
      <div v-if="showControls" class="header-right">
        <button class="header-button" @click="handleSettings" title="设置">
          <SettingOutlined />
        </button>
        <button class="header-button" @click="handleMaximize" title="全屏">
          <FullscreenOutlined />
        </button>
      </div>
    </div>

    <!-- 终端主体 -->
    <div class="terminal-body">
      <!-- 命令建议浮层 -->
      <CommandSuggestions
        v-if="showSuggestions"
        :suggestions="suggestions"
        :selected-index="selectedSuggestionIndex"
        @select="selectSuggestion"
      />

      <!-- XTerminal 实例 -->
      <XTerminal
        ref="terminalRef"
        :config="config"
        :theme="theme"
        :enable-geek-mode="enableGeekMode"
        @ready="handleTerminalReady"
        @data="handleTerminalData"
        @key="handleTerminalKey"
      />
    </div>

  </div>
</template>

<style scoped lang="scss">
@import '@/styles/terminal/index.scss';

.terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #000000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;

  // 极客模式样式
  &.terminal-geek-mode {
    border: 1px solid rgba(0, 255, 0, 0.3);
    box-shadow:
      0 0 20px rgba(0, 255, 0, 0.1),
      inset 0 0 20px rgba(0, 255, 0, 0.05);

    // 矩阵背景效果
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(circle at 20% 80%, rgba(0, 255, 0, 0.02) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(0, 255, 0, 0.01) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
  }

  // 全屏模式
  &.terminal-fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    border-radius: 0;
  }

  // 连接状态样式
  &.terminal-status-connecting {
    .terminal-header {
      background: linear-gradient(135deg, #2a2a0a 0%, #3a3a1a 100%);
    }
  }

  &.terminal-status-connected {
    .terminal-header {
      background: linear-gradient(135deg, #0a2a0a 0%, #1a3a1a 100%);
    }
  }

  &.terminal-status-disconnected {
    .terminal-header {
      background: linear-gradient(135deg, #2a0a0a 0%, #3a1a1a 100%);
    }
  }
}

// 终端头部
.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0f1f0f 0%, #1a2f1a 100%);
  border-bottom: 1px solid rgba(0, 255, 0, 0.3);
  font-size: 14px;
  color: #00ff00;
  text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
  position: relative;
  z-index: 2;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.terminal-controls {
  display: flex;
  gap: 8px;
}

.control-button {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;

  &.close {
    background: #ff5f56;
    &:hover { background: #ff3f36; }
  }
  &.minimize {
    background: #ffbd2e;
    &:hover { background: #ff9d0e; }
  }
  &.maximize {
    background: #27ca3f;
    &:hover { background: #07aa1f; }
  }
}

.terminal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;

  .title-icon {
    font-size: 16px;
  }

  .title-text {
    white-space: nowrap;
  }
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: bold;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  .status-text {
    letter-spacing: 1px;
  }
}

.header-right {
  display: flex;
  gap: 8px;
}

.header-button {
  background: transparent;
  border: 1px solid rgba(0, 255, 0, 0.3);
  color: #00ff00;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.6);
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.3);
  }
}

// 终端主体
.terminal-body {
  flex: 1;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

// 全屏提示
.fullscreen-hint {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.8);
  color: #00ff00;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid rgba(0, 255, 0, 0.3);
  font-size: 12px;
  z-index: 10;
  cursor: pointer;
  animation: fadeInOut 3s infinite;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }
}

// 动画定义
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes fadeInOut {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}



// 终端容器样式
.geek-terminal-container {
  @extend .terminal-container-enhanced;
  flex: 1;
  background: transparent;
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px;

  // 终端头部的极客模式样式
  :deep(.terminal-header) {
    background: linear-gradient(135deg, #0f1f0f 0%, #1a2f1a 100%);
    border-bottom: 1px solid rgba(0, 255, 0, 0.3);
    color: #00ff00;
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);

    .terminal-controls {
      .control-button {
        &.close { background: #ff5f56; }
        &.minimize { background: #ffbd2e; }
        &.maximize { background: #27ca3f; }
      }
    }

    .terminal-title {
      color: #00ff00;
      font-weight: bold;
    }

    .connection-status {
      &.connected { color: #00ff00; }
      &.disconnected { color: #ff4444; }
      &.error { color: #ff6666; }
    }
  }
}

// 终端实例样式
.geek-terminal {
  @extend .real-agent-terminal;
  @extend .theme-matrix-green;
  @extend .terminal-theme-base;
  @extend .geek-terminal-effects;
  @extend .geek-cursor-enhanced;
  @extend .geek-selection-enhanced;
  @extend .geek-scrollbar-enhanced;
  @extend .geek-border-enhanced;
  @extend .geek-font-enhanced;

  height: 100%;
  background: rgba(0, 0, 0, 0.8);

  // 启动动画
  &.terminal-starting {
    @extend .geek-startup-animation;
  }

  // 主题切换过渡
  &.theme-transitioning {
    @extend .geek-theme-transition;
  }

  // 特效状态
  &.matrix-active {
    @extend .matrix-enabled;
  }

  &.scanlines-active {
    @extend .scanlines-enabled;
  }

  &.crt-active {
    @extend .crt-enabled;
  }

  &.glow-active {
    @extend .glow-enabled;
  }

  &.flicker-active {
    @extend .flicker-enabled;
  }

  &.noise-active {
    @extend .noise-enabled;
  }
}

// 终端加载状态
.terminal-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.8);
  padding: 16px 24px;
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 8px;
  color: #00ff00;
  text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
  z-index: 1000;
  backdrop-filter: blur(10px);
}


@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}



// 响应式设计
@media (max-width: 768px) {
  .geek-mode-container {
    .geek-terminal-container {
      margin: 4px;
    }

  }

}


// 响应式设计
@media (max-width: 768px) {
  .terminal-header {
    padding: 6px 12px;
    font-size: 12px;
  }

  .terminal-title .title-text {
    display: none;
  }

  .status-indicator .status-text {
    display: none;
  }

  .header-right {
    gap: 4px;
  }

  .header-button {
    padding: 3px 6px;
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .header-center {
    display: none;
  }

  .terminal-controls {
    gap: 4px;
  }

  .control-button {
    width: 10px;
    height: 10px;
  }
}

</style>