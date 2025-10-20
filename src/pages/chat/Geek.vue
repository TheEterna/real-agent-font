<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useSSE } from '@/composables/useSSE'
import { useTerminalCommandHandler } from '@/composables/terminal/useTerminalCommandHandler'
import { UIMessage, MessageType, BaseEventItem } from '@/types/events'
import { useXTerminal } from '@/composables/terminal/useXTerminal'
import { useSSETerminalAdapter } from '@/composables/terminal/useSSETerminalAdapter'
import { useTerminalTheme } from '@/composables/terminal/useTerminalTheme'
import { useSSEGeekMode } from '@/composables/terminal/useSSEGeekMode'
import { MessageRenderer } from '@/services/terminal/MessageRenderer'
import XTerminal from '@/components/terminal/XTerminal.vue'
import TerminalContainer from '@/components/terminal/TerminalContainer.vue'
import { CodeOutlined } from '@ant-design/icons-vue'

const router = useRouter()
const chat = useChatStore()

// 终端实例管理
const {
  terminal,
  isReady,
  isConnected,
  connectionStatus: terminalConnectionStatus,
  setTerminal,
  write,
  writeln,
  clear,
  focus,
  handleInput,
  reset
} = useXTerminal({
  sessionId: chat.sessionId.value,
  enableGeekMode: true,
  autoConnect: true
})

// 终端主题管理
const {
  currentTheme,
  switchTheme,
  toggleMatrix,
  toggleScanlines,
  isMatrixEnabled,
  isScanlinesEnabled
} = useTerminalTheme({
  defaultTheme: 'matrix-green',
  enableEffects: true,
  persistTheme: true
})

// SSE 终端适配器
const sseTerminalAdapter = useSSETerminalAdapter({
  enableTypewriter: true,
  typewriterSpeed: 30,
  enableColors: true
})

const {
  handleSSEEvent,
  handleSSEEvents,
  writeWelcome,
  writeSystem,
  writeError,
  writeSuccess,
  writeCommand,
  writeOutput,
  setTerminal: setSSETerminal
} = sseTerminalAdapter

// SSE 极客模式集成
const sseGeekMode = useSSEGeekMode({
  terminalAdapter: sseTerminalAdapter,
  sessionId: chat.sessionId.value,
  onError: (error) => {
    console.error('❌ 极客模式执行失败:', error)
    writeError(`执行失败: ${error.message}`)
  },
  onComplete: () => {
    writeSuccess('✅ 执行完成')
  }
})

const {
  isConnected: isSSEConnected,
  isExecuting: isSSEExecuting,
  executeGeekCommand,
  interrupt: interruptSSE
} = sseGeekMode

// 消息渲染器
const messageRenderer = new MessageRenderer({
  enableColors: true,
  enableTimestamp: true,
  enableTypewriter: true,
  typewriterSpeed: 30
})

// 终端命令处理器
const terminalCommandHandler = useTerminalCommandHandler({
  sessionId: chat.sessionId.value,
  switchTheme: (themeName: string) => switchTheme(themeName),
  xtermVersion: '5.5.0'
})

const {
  executeTerminalCommand,
  getCommandSuggestionsForInput,
  isCommand,
  validateCommand
} = terminalCommandHandler

// 使用SSE composable
const {
  messages,
  connectionStatus,
  taskStatus,
  progress,
  executeGeek
} = useSSE({
  onScrollToBottom: () => {}, // 终端自动滚动
  onDoneNotice: (notice) => {
    console.log('📢 极客模式任务完成:', notice)
    writeSuccess(`✅ 任务完成: ${notice}`)
  }
})

// 更新终端状态
const isLoading = computed(() => taskStatus.value.status === 'running' || isSSEExecuting.value)
const isTerminalReady = computed(() => isReady.value && isConnected.value)

// 处理终端就绪
const handleTerminalReady = (terminalInstance: any) => {
  setTerminal(terminalInstance)

  // 设置SSE适配器的终端引用
  setSSETerminal(terminalInstance)

  // 设置渲染器的终端引用
  messageRenderer.setTerminal(terminalInstance)
  messageRenderer.setTheme(currentTheme.value)

  // 设置命令处理器的终端引用
  terminalCommandHandler.terminal = terminalInstance

  // 显示欢迎信息
  nextTick(() => {
    writeWelcome()

    // 加载历史消息到终端
    loadHistoryMessages()
  })
}

// 加载历史消息到终端
const loadHistoryMessages = async () => {
  if (!isTerminalReady.value) return

  const sessionMessages = chat.getSessionMessages(chat.sessionId.value)

  if (sessionMessages.length > 0) {
    await writeSystem('📚 加载会话历史...')

    for (const message of sessionMessages) {
      const uiMessage: UIMessage = {
        nodeId: message.nodeId,
        sessionId: message.sessionId,
        type: message.type,
        sender: message.sender,
        message: message.message,
        timestamp: message.timestamp,
        data: message.data
      }

      await messageRenderer.render(uiMessage)
    }

    await writeSystem('✅ 历史消息加载完成')
  }
}

// 处理本地命令
const handleLocalCommand = async (commandText: string): Promise<boolean> => {
  // 验证命令格式
  const validation = validateCommand(commandText)
  if (!validation.valid) {
    await writeError(validation.error || '命令格式错误')
    return true
  }

  try {
    // 显示执行的命令
    await writeCommand(`⚡ 执行命令: ${commandText}`)

    const result = await executeTerminalCommand(commandText)

    // 特殊处理清屏命令
    if (result === '__CLEAR_TERMINAL__') {
      clear()
      messages.value.splice(0)
      chat.setSessionMessages(chat.sessionId.value, [])
      await writeSystem('🗑️ 终端已清空')
      return true
    }

    // 显示命令结果
    await writeOutput(result)

    // 添加到消息历史
    const commandMessage: UIMessage = {
      nodeId: `command-${Date.now()}`,
      sessionId: chat.sessionId.value,
      type: MessageType.Assistant,
      sender: 'Terminal',
      message: `${commandText}\n${result}`,
      timestamp: new Date()
    }

    messages.value.push(commandMessage)
    chat.setSessionMessages(chat.sessionId.value, messages.value)

    return true
  } catch (error) {
    const errorMsg = `❌ ${error instanceof Error ? error.message : String(error)}`
    await writeError(errorMsg)

    // 添加错误消息到历史
    const errorMessage: UIMessage = {
      nodeId: `command-error-${Date.now()}`,
      sessionId: chat.sessionId.value,
      type: MessageType.Error,
      sender: 'Terminal',
      message: errorMsg,
      timestamp: new Date()
    }

    messages.value.push(errorMessage)
    return true
  }
}

// 处理用户输入
const handleUserInput = async (inputText: string) => {
  if (!isTerminalReady.value || !inputText.trim()) return

  const message = inputText.trim()

  try {
    // 创建用户消息
    const userMessage: UIMessage = {
      nodeId: `user-${Date.now()}`,
      sessionId: chat.sessionId.value,
      type: MessageType.User,
      sender: 'User',
      message,
      timestamp: new Date()
    }

    // 渲染用户消息到终端
    await messageRenderer.render(userMessage)

    // 添加到消息历史
    messages.value.push(userMessage)
    chat.setSessionMessages(chat.sessionId.value, messages.value)
    chat.touchSession(chat.sessionId.value)

    // 检查是否是本地命令
    if (isCommand(message)) {
      const handled = await handleLocalCommand(message)
      if (handled) {
        await messageRenderer.renderPrompt()
        return
      }
    }

    // 使用新的SSE集成执行极客模式
    await executeGeekCommand(message)

    // 显示提示符
    await messageRenderer.renderPrompt()

  } catch (error) {
    const errorMsg = `❌ 极客模式执行失败: ${error instanceof Error ? error.message : String(error)}`
    await writeError(errorMsg)
    console.error('❌ 极客模式执行失败:', error)
  }
}

// 监听主题变化
watch(currentTheme, (newTheme) => {
  messageRenderer.setTheme(newTheme)
}, { deep: true })

// 组件挂载时初始化
onMounted(() => {
  // 应用极客模式主题
  switchTheme('matrix-green')
})
</script>

<template>
  <div class="geek-mode-container">
    <!-- 终端容器 -->
    <TerminalContainer
      :title="`Real Agent Terminal v1.0 - Geek Mode`"
      :connection-status="terminalConnectionStatus"
      :theme="currentTheme"
      :enable-matrix="isMatrixEnabled"
      :enable-scanlines="isScanlinesEnabled"
      class="geek-terminal-container"
      @toggle-matrix="toggleMatrix"
      @toggle-scanlines="toggleScanlines"
    >
      <!-- 终端实例 -->
      <XTerminal
        :config="{
          theme: currentTheme,
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Courier New, monospace',
          cursorBlink: true,
          cursorStyle: 'block'
        }"
        :theme="currentTheme"
        :enable-addons="['fit', 'webLinks', 'search']"
        :enable-geek-mode="true"
        class="geek-terminal"
        @ready="handleTerminalReady"
        @input="handleUserInput"
      />
    </TerminalContainer>

    <!-- 连接状态指示器 -->
    <div v-if="!isTerminalReady" class="terminal-loading">
      <div class="loading-spinner"></div>
      <span>终端初始化中...</span>
    </div>

    <!-- 主题控制面板 -->
    <div class="theme-controls" v-if="isTerminalReady">
      <div class="control-group">
        <label>特效控制:</label>
        <button
          @click="toggleMatrix"
          :class="{ active: isMatrixEnabled }"
          class="effect-button"
        >
          Matrix
        </button>
        <button
          @click="toggleScanlines"
          :class="{ active: isScanlinesEnabled }"
          class="effect-button"
        >
          扫描线
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import '@/styles/terminal/index.scss';

.geek-mode-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0a0e0a;
  color: #00ff00;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  overflow: hidden;
  position: relative;

  // 矩阵背景效果
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(circle at 20% 80%, rgba(0, 255, 0, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(0, 255, 0, 0.02) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  > * {
    position: relative;
    z-index: 1;
  }
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

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 255, 0, 0.3);
  border-top: 2px solid #00ff00;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

// 主题控制面板
.theme-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 6px;
  padding: 12px;
  backdrop-filter: blur(10px);
  z-index: 100;

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      color: rgba(0, 255, 0, 0.8);
      font-size: 12px;
      margin-right: 8px;
    }
  }
}

.effect-button {
  background: rgba(0, 255, 0, 0.1);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 4px;
  padding: 4px 8px;
  color: rgba(0, 255, 0, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(0, 255, 0, 0.2);
    color: #00ff00;
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.3);
  }

  &.active {
    background: rgba(0, 255, 0, 0.3);
    color: #00ff00;
    border-color: rgba(0, 255, 0, 0.6);
    text-shadow: 0 0 4px rgba(0, 255, 0, 0.8);
  }
}

// 响应式设计
@media (max-width: 768px) {
  .geek-mode-container {
    .geek-terminal-container {
      margin: 4px;
    }

    .theme-controls {
      top: 8px;
      right: 8px;
      padding: 8px;

      .control-group {
        flex-direction: column;
        gap: 4px;

        label {
          margin-right: 0;
          margin-bottom: 4px;
        }
      }
    }
  }

  .effect-button {
    font-size: 11px;
    padding: 3px 6px;
  }
}

@media (max-width: 480px) {
  .theme-controls {
    position: relative;
    margin: 8px;
    width: calc(100% - 16px);

    .control-group {
      flex-direction: row;
      justify-content: center;
    }
  }
}
</style>