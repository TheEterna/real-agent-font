<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from 'xterm-addon-fit'
import CommandSuggestions from './CommandSuggestions.vue'
import type { TerminalConfig } from '@/types/terminal'
import { DEFAULT_TERMINAL_CONFIG } from '@/configs/terminal/xterm-config'
import { useCommandInput } from '@/composables/terminal/useCommandInput'
import type { ParsedCommand, ParseError } from '@/stores/terminalStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { debounce } from "lodash"
import '@xterm/xterm/css/xterm.css';


// Props
interface Props {
  config?: Partial<TerminalConfig>
  sessionId?: string
}

const props = withDefaults(defineProps<Props>(), {})

// 状态
const container = ref<HTMLElement>()
const terminal = ref<Terminal | null>(null)
// const isReady = ref(true)
// fixme: dev to true, should be false
const isReady = ref(true)
const currentCommandLine = ref('')
const commandPrompt = ref('[root@real-agent-terminal]# ')


let resizeObserver: ResizeObserver | null = null // 声明 ResizeObserver 实例

// 终端存储
const terminalStore = useTerminalStore()

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
  onExecute: handleCommandExecute,
  onError: handleCommandError,
  write,
  writeln,
  showPrompt
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

  // 添加粘贴支持
  setupPasteSupport()
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

  terminal.value?.writeln(welcomeText)
}
// 设置粘贴支持
const setupPasteSupport = () => {
  if (!container.value) return

  // 监听粘贴事件
  container.value.addEventListener('paste', (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text')
    if (text) {
      // 将粘贴的文本添加到当前命令行
      currentCommandLine.value += text
      handleInput(currentCommandLine.value)
      write(text)
    }
  })

  // 监听复制事件（xterm.js 自动处理选择，我们只需要确保可以复制）
  container.value.addEventListener('copy', (e) => {
    const selection = terminal.value?.getSelection()
    if (selection) {
      e.clipboardData?.setData('text/plain', selection)
      e.preventDefault()
    }
  })
}

// 命令执行
async function handleCommandExecute(parsed: ParsedCommand) {
  try {
    writeln(`\r\n${commandPrompt.value}${parsed.original}`)

    // 本地命令
    switch (parsed.command.toLowerCase()) {
      case 'clear':
      case 'cls':
        terminal.value?.clear()
        showPrompt()
        return

      case 'help':
        showHelp(parsed.args[0])
        showPrompt()
        return
    }

    // TODO: 调用后端API
    writeln('⚙️ 命令处理中...')
    await new Promise(resolve => setTimeout(resolve, 500))
    writeln('✅ 完成')
    showPrompt()
  } catch (error) {
    writeln(`❌ 错误: ${error instanceof Error ? error.message : '未知错误'}`)
    showPrompt()
  }
}

// 显示帮助信息
function showHelp(commandName?: string) {
  if (commandName) {
    // 显示特定命令的详细帮助
    const command = terminalStore.getCommand(commandName)
    if (!command) {
      writeln(`\r\n❌ 未知命令: ${commandName}`)
      return
    }

    writeln('\r\n╔═══════════════════════════════════════════════════════════╗')
    writeln(`║  命令: /${command.name}`)

    if (command.aliases && command.aliases.length > 0) {
      writeln(`║  别名: ${command.aliases.join(', ')}`)
    }

    writeln(`║  描述: ${command.description}`)
    writeln(`║  用法: ${command.usage}`)

    if (command.parameters && command.parameters.length > 0) {
      writeln('║')
      writeln('║  参数:')
      command.parameters.forEach(param => {
        const required = param.required ? '[必需]' : '[可选]'
        const flags = []
        if (param.shortFlag) flags.push(param.shortFlag)
        if (param.longFlag) flags.push(param.longFlag)
        const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : ''

        writeln(`║    ${param.name}${flagStr} ${required}`)
        writeln(`║      ${param.description}`)
        if (param.defaultValue !== undefined) {
          writeln(`║      默认值: ${param.defaultValue}`)
        }
      })
    }

    if (command.examples && command.examples.length > 0) {
      writeln('║')
      writeln('║  示例:')
      command.examples.forEach(ex => {
        writeln(`║    ${ex}`)
      })
    }

    writeln('╚═══════════════════════════════════════════════════════════╝')
  } else {
    // 显示所有命令列表
    writeln('\r\n╔═══════════════════════════════════════════════════════════╗')
    writeln('║                    可用命令列表                           ║')
    writeln('╚═══════════════════════════════════════════════════════════╝')
    writeln('')

    const categories = {
      system: '🔧 系统控制',
      ai: '🤖 AI交互',
      file: '📁 文件操作',
      connection: '🔌 连接管理'
    }

    const commandsByCategory = terminalStore.commandsByCategory

    Object.entries(categories).forEach(([cat, label]) => {
      const catCommands = commandsByCategory[cat as keyof typeof commandsByCategory] || []

      if (catCommands.length > 0) {
        writeln(`${label}:`)
        catCommands.forEach(cmd => {
          const aliases = cmd.aliases && cmd.aliases.length > 0
            ? ` (${cmd.aliases.join(', ')})`
            : ''
          writeln(`  /${cmd.name}${aliases}`)
          writeln(`    ${cmd.description}`)
        })
        writeln('')
      }
    })

    writeln('💡 使用 /help <命令名> 查看详细帮助')
    writeln('💡 使用 Tab 键自动补全命令')
    writeln('💡 使用 ↑↓ 键浏览历史命令')
  }
}

// 命令错误
function handleCommandError(error: ParseError) {
  writeln(`\r\n❌ ${error.message}`)
  if (error.suggestion) {
    writeln(`💡 ${error.suggestion}`)
  }
  showPrompt()
}

// 显示提示符
function showPrompt() {
  nextTick(() => {
    write(`\r\n${commandPrompt.value}`)
    currentCommandLine.value = ''
  })
}

// 处理输入
const handleTerminalData = (data: string) => {
  const char = data

  // 回车
  if (char === '\r' || char === '\n') {
    if (!currentCommandLine.value.trim()) {
      showPrompt()
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
      write('\b \b')
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
    write(char)
  }
}

// 更新显示
function updateDisplay() {
  write('\r\x1b[K')
  write(commandPrompt.value + currentCommandLine.value)
  handleInput(currentCommandLine.value)
}

// 写入方法
const write = (data: string) => {
  if (terminal.value && isReady.value) {
    terminal.value.write(data)
    terminal.value.scrollToBottom()
  }
}

const writeln = (data: string) => {
  if (terminal.value && isReady.value) {
    terminal.value.writeln(data)
    terminal.value.scrollToBottom()
  }
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
defineExpose({ write, writeln, clear, focus, terminal, isReady })
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

  :deep(.xterm) {

    padding: 8px;
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
