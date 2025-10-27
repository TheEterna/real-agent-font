<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from 'xterm-addon-fit'
import CommandSuggestions from './CommandSuggestions.vue'
import type { TerminalConfig } from '@/types/terminal'
import { DEFAULT_TERMINAL_CONFIG } from '@/configs/terminal/xterm-config'
import { useCommandInput } from '@/composables/terminal/useCommandInput'
import type { ParsedCommand, ParseError } from '@/stores/terminalStore'
import { debounce } from "lodash"
import '@xterm/xterm/css/xterm.css';
import {useCommandHandler} from "@/composables/terminal/useCommandHandler";

// Props
interface Props {
  config?: Partial<TerminalConfig>
  sessionId?: string
}

const props = withDefaults(defineProps<Props>(), {})

// 状态
const container = ref<HTMLElement>()
const terminal = ref<Terminal>()
// const isReady = ref(true)
// fixme: dev to true, should be false
const isReady = ref(true)

// 终端存储

let fitAddon: FitAddon | null = null


// 命令输入处理
const {
  currentInput,
  currentCommandLine,
  suggestions,
  selectedSuggestionIndex,
  showSuggestions,
  handleInput,
  handleTabComplete,
  selectPreviousSuggestion,
  selectNextSuggestion,
  selectSuggestion,
  selectPreviousHistory,
  selectNextHistory,
  executeCommand,
  handleTerminalData,
  updateDisplay
} = useCommandInput({
  terminal: terminal,
  isReady: isReady
})
// 初始化
const init = () => {
  if (!container.value) return

  // 合并配置，确保支持复制粘贴和选择
  const config = {
    ...DEFAULT_TERMINAL_CONFIG,
    ...props.config,

  }

  terminal.value = new Terminal(config)

  fitAddon = new FitAddon()
  terminal.value.loadAddon(fitAddon)
  terminal.value.open(container.value)


  // 监听输入
  terminal.value.onData(handleTerminalData)


  window.addEventListener('resize', debounce(function () {
    fitAddon?.fit()
  }, 500))
  terminal.value.onResize((config, vo) => {
      console.log(`触发终端onResize：cols为${config.cols}, rows为${config.rows}`)
  })


  isReady.value = true
  terminal.value.focus()


  showWelcomeMessage()

}
const showWelcomeMessage = () => {
  if (!terminal.value) return

  const welcomeText = `
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║  ██████╗ ███████╗ █████╗ ██╗         █████╗  ██████╗ ███████╗███╗   ██╗████████╗ ║
║  ██╔══██╗██╔════╝██╔══██╗██║        ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝ ║
║  ██████╔╝█████╗  ███████║██║        ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║    ║
║  ██╔══██╗██╔══╝  ██╔══██║██║        ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║    ║
║  ██║  ██║███████╗██║  ██║███████╗   ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║    ║
║  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ║
║  Welcome to Real Agent Geek Terminal v1.0                                        ║
║  Type '/help' for available commands                                             ║
║  Session ID: ${props.sessionId}                                                           ║
╚══════════════════════════════════════════════════════════════════════════════════╝
$ Ready for commands...
`

  terminal.value?.write(welcomeText)
}



const clear = () => terminal.value?.clear()
const focus = () => terminal.value?.focus()

// 生命周期
onMounted(() => {
  nextTick(init)
  setTimeout(() => {
    fitAddon?.fit()
  }, 60)
})

onUnmounted(() => {
  // terminal.value?.dispose()
  // fitAddon = null
})

// 暴露
defineExpose({ clear, focus, terminal, isReady })
</script>

<template>
  <div class="terminal">
    <div class="terminal-header">
      <span>Real Agent Terminal</span>
    </div>

    <div class="terminal-body">
      <CommandSuggestions
        v-if="showSuggestions"
        :suggestions="suggestions"
        :selected-index="selectedSuggestionIndex"
        @select="selectSuggestion"
      />

      <div ref="container" class="terminal-container">
        <div v-if="!isReady" class="loading">初始化...</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0, 255, 0, 0.3);
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.1);
}

.terminal-header {
  flex-shrink: 0;  // 防止被压缩
  padding: 8px 16px;
  background: linear-gradient(135deg, #0f1f0f 0%, #1a2f1a 100%);
  border-bottom: 1px solid rgba(0, 255, 0, 0.3);
  color: #00ff00;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
}

.terminal-body {
  flex: 1;
  min-height: 0;  // 关键：允许 flex 子元素缩小
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;  // 防止内容溢出
}

.terminal-container {
  flex: 1;
  min-height: 0;  // 关键：允许 flex 子元素缩小
  position: relative;
  width: 100%;
  overflow: hidden;  // 防止内容溢出
  padding: 8px;  // 在容器层添加 padding，避免影响 xterm 坐标计算

  :deep(.xterm) {
    height: 100%;  // 确保 xterm 填充整个容器
    width: 100%;
  }

  // 确保 xterm 的 viewport 和 screen 正确对齐
  :deep(.xterm-viewport) {
    width: 100% !important;
  }
}

.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #00ff00;
  font-family: 'Courier New', monospace;
  text-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
}
</style>
