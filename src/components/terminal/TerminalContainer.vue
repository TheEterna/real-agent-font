<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import XTerminal from './XTerminal.vue'
import type { GeekModeTheme } from '@/types/terminal/themes'
import type { TerminalConfig } from '@/types/terminal'
import { CodeOutlined, SettingOutlined, FullscreenOutlined } from '@ant-design/icons-vue'

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
}

const emit = defineEmits<Emits>()

// 响应式状态
const terminalRef = ref<InstanceType<typeof XTerminal>>()
const isFullscreen = ref(false)
const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('connecting')

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
  connectionStatus.value = 'connected'
  emit('terminalReady', terminal)

  // 显示欢迎信息
  if (props.enableGeekMode) {
    showWelcomeMessage()
  }
}

const handleTerminalData = (data: string) => {
  emit('data', data)
}

const handleTerminalKey = (event: { key: string; domEvent: KeyboardEvent }) => {
  emit('key', event)
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

// 显示欢迎信息
const showWelcomeMessage = () => {
  if (!terminalRef.value) return

  const welcomeText = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  ██████╗ ███████╗ █████╗ ██╗         █████╗  ██████╗ ███████╗███╗   ██╗████████╗ ║
║  ██╔══██╗██╔════╝██╔══██╗██║        ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝ ║
║  ██████╔╝█████╗  ███████║██║        ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║    ║
║  ██╔══██╗██╔══╝  ██╔══██║██║        ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║    ║
║  ██║  ██║███████╗██║  ██║███████╗   ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║    ║
║  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ║
║                                                                              ║
║                            🚀 GEEK MODE ACTIVATED 🚀                        ║
║                                                                              ║
║  Welcome to Real Agent Geek Terminal v1.0                                   ║
║  Type '/help' for available commands                                         ║
║  Session ID: ${props.sessionId || 'unknown'}                                         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

$ Ready for commands...
`

  setTimeout(() => {
    terminalRef.value?.writeln(welcomeText)
  }, 500)
}

// 公开方法给父组件
const write = (data: string) => {
  terminalRef.value?.write(data)
}

const writeln = (data: string) => {
  terminalRef.value?.writeln(data)
}

const clear = () => {
  terminalRef.value?.clear()
}

const focus = () => {
  terminalRef.value?.focus()
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