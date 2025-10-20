<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import type { GeekModeTheme } from '@/types/terminal/themes'
import type { TerminalConfig } from '@/types/terminal'
import { DEFAULT_TERMINAL_CONFIG, GEEK_DEFAULT_THEME } from '@/configs/terminal/xterm-config'

// Props 定义
interface Props {
  config?: Partial<TerminalConfig>
  theme?: Partial<GeekModeTheme>
  autoFocus?: boolean
  disabled?: boolean
  enableGeekMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  autoFocus: true,
  disabled: false,
  enableGeekMode: true
})

// Emits 定义
interface Emits {
  ready: [terminal: Terminal]
  data: [data: string]
  key: [event: { key: string; domEvent: KeyboardEvent }]
  resize: [data: { cols: number; rows: number }]
  dispose: []
  error: [error: Error]
}

const emit = defineEmits<Emits>()

// 响应式状态
const terminalContainer = ref<HTMLElement>()
const terminal = ref<Terminal | null>(null)
const isReady = ref(false)
const isDestroyed = ref(false)

// 终端实例管理
let addons: any[] = []
let resizeObserver: ResizeObserver | null = null

// 动态导入插件的函数
const loadAddons = async () => {
  try {
    const addonsToLoad = []

    // FitAddon - 自适应尺寸
    if (props.config?.enableFit !== false) {
      addonsToLoad.push(
        import('xterm-addon-fit').then(({ FitAddon }) => ({ name: 'fit', addon: new FitAddon() }))
      )
    }

    // WebLinksAddon - 链接支持
    if (props.config?.enableWebLinks !== false) {
      addonsToLoad.push(
        import('xterm-addon-web-links').then(({ WebLinksAddon }) => ({ name: 'webLinks', addon: new WebLinksAddon() }))
      )
    }

    // SearchAddon - 搜索功能
    if (props.config?.enableSearch !== false) {
      addonsToLoad.push(
        import('xterm-addon-search').then(({ SearchAddon }) => ({ name: 'search', addon: new SearchAddon() }))
      )
    }

    const loadedAddons = await Promise.all(addonsToLoad)
    return loadedAddons
  } catch (error) {
    console.warn('Failed to load some xterm addons:', error)
    return []
  }
}

// 合并终端配置
const getTerminalConfig = (): TerminalConfig => {
  const baseConfig = { ...DEFAULT_TERMINAL_CONFIG }
  const userConfig = props.config || {}

  return {
    ...baseConfig,
    ...userConfig,
    // 应用主题颜色
    ...(props.theme && {
      theme: {
        foreground: props.theme.foreground || baseConfig.theme?.foreground,
        background: props.theme.background || baseConfig.theme?.background,
        cursor: props.theme.cursor || baseConfig.theme?.cursor,
        // 其他主题属性...
      }
    })
  }
}

// 初始化终端
const initTerminal = async () => {
  if (!terminalContainer.value || isDestroyed.value) {
    console.warn('Terminal container not ready or component destroyed')
    return
  }

  try {
    // 创建终端实例
    const config = getTerminalConfig()
    terminal.value = new Terminal(config)

    // 加载插件
    const loadedAddons = await loadAddons()
    for (const { name, addon } of loadedAddons) {
      terminal.value.loadAddon(addon)
      addons.push({ name, addon })
    }

    // 挂载到DOM
    terminal.value.open(terminalContainer.value)

    // 设置事件监听
    setupEventListeners()

    // 应用主题
    applyTheme()

    // 自适应尺寸
    fitTerminal()

    // 设置就绪状态
    isReady.value = true

    // 聚焦
    if (props.autoFocus && !props.disabled) {
      await nextTick()
      terminal.value.focus()
    }

    // 启用极客模式特效
    if (props.enableGeekMode) {
      enableGeekEffects()
    }

    // 发送就绪事件
    emit('ready', terminal.value)

  } catch (error) {
    console.error('Failed to initialize terminal:', error)
    emit('error', error instanceof Error ? error : new Error('Terminal initialization failed'))
  }
}

// 设置事件监听
const setupEventListeners = () => {
  if (!terminal.value) return

  // 数据输入事件
  terminal.value.onData((data: string) => {
    emit('data', data)
  })

  // 键盘事件
  terminal.value.onKey((event: { key: string; domEvent: KeyboardEvent }) => {
    emit('key', event)
  })

  // 尺寸变化事件
  terminal.value.onResize((data: { cols: number; rows: number }) => {
    emit('resize', data)
  })

  // 设置 ResizeObserver 监听容器尺寸变化
  if (terminalContainer.value && ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      fitTerminal()
    })
    resizeObserver.observe(terminalContainer.value)
  }
}

// 应用主题
const applyTheme = () => {
  if (!terminal.value || !props.theme) return

  try {
    // 构建 xterm.js 兼容的主题对象
    const xtermTheme = {
      foreground: props.theme.foreground,
      background: props.theme.background,
      cursor: props.theme.cursor,
      cursorAccent: props.theme.cursorAccent,
      selection: props.theme.selection,
      black: props.theme.black,
      red: props.theme.red,
      green: props.theme.green,
      yellow: props.theme.yellow,
      blue: props.theme.blue,
      magenta: props.theme.magenta,
      cyan: props.theme.cyan,
      white: props.theme.white,
      brightBlack: props.theme.brightBlack,
      brightRed: props.theme.brightRed,
      brightGreen: props.theme.brightGreen,
      brightYellow: props.theme.brightYellow,
      brightBlue: props.theme.brightBlue,
      brightMagenta: props.theme.brightMagenta,
      brightCyan: props.theme.brightCyan,
      brightWhite: props.theme.brightWhite,
    }

    // 过滤掉 undefined 值
    const cleanTheme = Object.fromEntries(
      Object.entries(xtermTheme).filter(([_, value]) => value !== undefined)
    )

    terminal.value.options.theme = cleanTheme
  } catch (error) {
    console.warn('Failed to apply theme:', error)
  }
}

// 自适应尺寸
const fitTerminal = () => {
  try {
    const fitAddon = addons.find(addon => addon.name === 'fit')?.addon
    if (fitAddon && terminal.value) {
      fitAddon.fit()
    }
  } catch (error) {
    console.warn('Failed to fit terminal:', error)
  }
}

// 启用极客模式特效
const enableGeekEffects = () => {
  if (!terminalContainer.value || !props.theme) return

  const container = terminalContainer.value

  // 添加极客模式CSS类
  container.classList.add('geek-terminal')

  // 矩阵效果
  if (props.theme.matrix?.enabled) {
    container.classList.add('matrix-effect')
  }

  // 扫描线效果
  if (props.theme.scanlines?.enabled) {
    container.classList.add('scanlines-effect')
  }

  // CRT效果
  if (props.theme.crt?.enabled) {
    container.classList.add('crt-effect')
  }
}

// 写入数据到终端
const write = (data: string) => {
  if (terminal.value && isReady.value) {
    terminal.value.write(data)
  }
}

// 写入一行数据
const writeln = (data: string) => {
  if (terminal.value && isReady.value) {
    terminal.value.writeln(data)
  }
}

// 清空终端
const clear = () => {
  if (terminal.value && isReady.value) {
    terminal.value.clear()
  }
}

// 聚焦终端
const focus = () => {
  if (terminal.value && isReady.value && !props.disabled) {
    terminal.value.focus()
  }
}

// 失焦终端
const blur = () => {
  if (terminal.value && isReady.value) {
    terminal.value.blur()
  }
}

// 销毁终端
const dispose = () => {
  if (isDestroyed.value) return

  isDestroyed.value = true
  isReady.value = false

  try {
    // 清理 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }

    // 销毁终端实例
    if (terminal.value) {
      terminal.value.dispose()
      terminal.value = null
    }

    // 清理插件
    addons = []

    emit('dispose')
  } catch (error) {
    console.error('Error disposing terminal:', error)
  }
}

// 监听主题变化
watch(() => props.theme, () => {
  if (isReady.value) {
    applyTheme()
  }
}, { deep: true })

// 监听配置变化
watch(() => props.config, () => {
  // 配置变化需要重新初始化
  if (isReady.value) {
    dispose()
    nextTick(() => {
      initTerminal()
    })
  }
}, { deep: true })

// 生命周期钩子
onMounted(() => {
  nextTick(() => {
    initTerminal()
  })
})

onUnmounted(() => {
  dispose()
})

// 暴露给父组件的方法
defineExpose({
  terminal: terminal,
  write,
  writeln,
  clear,
  focus,
  blur,
  dispose,
  fit: fitTerminal,
  isReady
})
</script>

<template>
  <div
    ref="terminalContainer"
    class="xterm-container"
    :class="{
      'xterm-disabled': disabled,
      'xterm-geek-mode': enableGeekMode,
      'xterm-ready': isReady
    }"
  >
    <!-- 加载状态 -->
    <div v-if="!isReady" class="xterm-loading">
      <div class="loading-text">初始化终端...</div>
      <div class="loading-bar">
        <div class="loading-progress"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.xterm-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000000;
  border-radius: 4px;
  overflow: hidden;

  // 确保 xterm.js 样式正确应用
  :deep(.xterm) {
    height: 100%;
    padding: 8px;
  }

  :deep(.xterm-screen) {
    height: 100% !important;
  }

  :deep(.xterm-viewport) {
    height: 100% !important;
  }

  // 禁用状态
  &.xterm-disabled {
    opacity: 0.6;
    pointer-events: none;
    filter: grayscale(0.3);
  }

  // 极客模式样式
  &.xterm-geek-mode {
    // 基础极客效果
    border: 1px solid rgba(0, 255, 0, 0.3);
    box-shadow:
      0 0 20px rgba(0, 255, 0, 0.1),
      inset 0 0 20px rgba(0, 255, 0, 0.05);

    // 矩阵效果
    &.matrix-effect {
      position: relative;

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
        z-index: 1;
      }
    }

    // 扫描线效果
    &.scanlines-effect {
      position: relative;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          transparent 50%,
          rgba(0, 255, 0, 0.1) 50%
        );
        background-size: 100% 4px;
        pointer-events: none;
        z-index: 2;
        animation: scanlines 0.1s linear infinite;
      }
    }

    // CRT效果
    &.crt-effect {
      border-radius: 8px;

      &::before {
        border-radius: 8px;
      }

      :deep(.xterm-screen) {
        filter:
          contrast(1.2)
          brightness(1.1)
          blur(0.1px);
      }
    }
  }
}

// 加载状态样式
.xterm-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  z-index: 10;

  .loading-text {
    font-size: 14px;
    margin-bottom: 16px;
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
  }

  .loading-bar {
    width: 200px;
    height: 2px;
    background: rgba(0, 255, 0, 0.2);
    border-radius: 1px;
    overflow: hidden;
    position: relative;

    .loading-progress {
      height: 100%;
      background: linear-gradient(90deg,
        transparent,
        rgba(0, 255, 0, 0.8),
        transparent
      );
      animation: loading 1.5s ease-in-out infinite;
    }
  }
}

// 动画定义
@keyframes scanlines {
  0% { transform: translateY(0); }
  100% { transform: translateY(4px); }
}

@keyframes loading {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200px); }
}

// 响应式设计
@media (max-width: 768px) {
  .xterm-container {
    :deep(.xterm) {
      padding: 4px;
    }
  }

  .loading-bar {
    width: 150px !important;
  }
}
</style>