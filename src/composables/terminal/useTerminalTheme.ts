// 终端主题管理 Composable
// 负责主题切换、自定义主题和视觉效果管理

import { ref, computed, watch } from 'vue'
import type { GeekModeTheme, ThemeName, AnimationEffect } from '@/types/terminal/themes'
import {
  getDefaultTheme,
  getAvailableThemes,
  getThemeByName,
  validateTheme
} from '@/configs/terminal/geek-theme'

export interface UseTerminalThemeOptions {
  defaultTheme?: ThemeName | GeekModeTheme
  enableEffects?: boolean
  persistTheme?: boolean
  storageKey?: string
}

export function useTerminalTheme(options: UseTerminalThemeOptions = {}) {
  // 响应式状态
  const currentTheme = ref<GeekModeTheme>(getDefaultTheme())
  const availableThemes = ref<GeekModeTheme[]>(getAvailableThemes())
  const customThemes = ref<GeekModeTheme[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 配置选项
  const storageKey = options.storageKey || 'real-agent-terminal-theme'
  const enableEffects = ref(options.enableEffects !== false)

  // 计算属性
  const allThemes = computed(() => [
    ...availableThemes.value,
    ...customThemes.value
  ])

  const themeNames = computed(() =>
    allThemes.value.map(theme => theme.name)
  )

  const currentEffects = computed(() =>
    currentTheme.value.effects?.animations || []
  )

  const isMatrixEnabled = computed(() =>
    currentTheme.value.matrix?.enabled && enableEffects.value
  )

  const isScanlinesEnabled = computed(() =>
    currentTheme.value.scanlines?.enabled && enableEffects.value
  )

  const isCRTEnabled = computed(() =>
    currentTheme.value.crt?.enabled && enableEffects.value
  )

  // 从本地存储加载主题
  const loadThemeFromStorage = (): GeekModeTheme | null => {
    if (!options.persistTheme) return null

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const theme = JSON.parse(stored) as GeekModeTheme
        if (validateTheme(theme)) {
          return theme
        }
      }
    } catch (err) {
      console.warn('Failed to load theme from storage:', err)
    }
    return null
  }

  // 保存主题到本地存储
  const saveThemeToStorage = (theme: GeekModeTheme) => {
    if (!options.persistTheme) return

    try {
      localStorage.setItem(storageKey, JSON.stringify(theme))
    } catch (err) {
      console.warn('Failed to save theme to storage:', err)
    }
  }

  // 应用主题
  const applyTheme = (theme: GeekModeTheme) => {
    try {
      if (!validateTheme(theme)) {
        throw new Error('Invalid theme configuration')
      }

      currentTheme.value = { ...theme }
      saveThemeToStorage(theme)
      error.value = null

      // 应用CSS变量
      applyCSSVariables(theme)

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to apply theme'
      console.error('Theme application error:', err)
    }
  }

  // 应用CSS变量到根元素
  const applyCSSVariables = (theme: GeekModeTheme) => {
    const root = document.documentElement

    // 基础颜色变量
    root.style.setProperty('--terminal-bg', theme.background)
    root.style.setProperty('--terminal-fg', theme.foreground)
    root.style.setProperty('--terminal-cursor', theme.cursor)
    root.style.setProperty('--terminal-selection', theme.selection)

    // UI元素颜色
    if (theme.ui) {
      root.style.setProperty('--terminal-prompt', theme.ui.prompt)
      root.style.setProperty('--terminal-command', theme.ui.command)
      root.style.setProperty('--terminal-output', theme.ui.output)
      root.style.setProperty('--terminal-error', theme.ui.error)
      root.style.setProperty('--terminal-success', theme.ui.success)
      root.style.setProperty('--terminal-warning', theme.ui.warning)
      root.style.setProperty('--terminal-info', theme.ui.info)
      root.style.setProperty('--terminal-link', theme.ui.link)
    }

    // 字体配置
    if (theme.typography) {
      root.style.setProperty('--terminal-font-family', theme.typography.fontFamily)
      root.style.setProperty('--terminal-font-size', `${theme.typography.fontSize}px`)
      root.style.setProperty('--terminal-line-height', theme.typography.lineHeight.toString())
      root.style.setProperty('--terminal-letter-spacing', `${theme.typography.letterSpacing}px`)
    }

    // 特效配置
    if (theme.matrix) {
      root.style.setProperty('--matrix-color', theme.matrix.color)
      root.style.setProperty('--matrix-speed', `${theme.matrix.speed}ms`)
      root.style.setProperty('--matrix-density', theme.matrix.density.toString())
    }

    if (theme.scanlines) {
      root.style.setProperty('--scanlines-opacity', theme.scanlines.opacity.toString())
      root.style.setProperty('--scanlines-color', theme.scanlines.color)
      root.style.setProperty('--scanlines-speed', `${theme.scanlines.speed}s`)
    }
  }

  // 切换主题
  const switchTheme = async (themeNameOrTheme: string | GeekModeTheme) => {
    isLoading.value = true
    error.value = null

    try {
      let theme: GeekModeTheme

      if (typeof themeNameOrTheme === 'string') {
        const foundTheme = getThemeByName(themeNameOrTheme) ||
                          allThemes.value.find(t => t.name === themeNameOrTheme)

        if (!foundTheme) {
          throw new Error(`Theme "${themeNameOrTheme}" not found`)
        }
        theme = foundTheme
      } else {
        theme = themeNameOrTheme
      }

      applyTheme(theme)

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to switch theme'
      console.error('Theme switch error:', err)
    } finally {
      isLoading.value = false
    }
  }

  // 创建自定义主题
  const createCustomTheme = (
    baseName: string,
    overrides: Partial<GeekModeTheme>,
    customName?: string
  ): GeekModeTheme => {
    const baseTheme = getThemeByName(baseName) || getDefaultTheme()

    const customTheme: GeekModeTheme = {
      ...baseTheme,
      ...overrides,
      id: `custom-${Date.now()}`,
      name: customName || `Custom ${baseTheme.name}`,
      author: 'User',
      version: '1.0.0',
      effects: {
        ...baseTheme.effects,
        ...overrides.effects
      },
      typography: {
        ...baseTheme.typography,
        ...overrides.typography
      },
      ui: {
        ...baseTheme.ui,
        ...overrides.ui
      },
      matrix: {
        ...baseTheme.matrix,
        ...overrides.matrix
      },
      scanlines: {
        ...baseTheme.scanlines,
        ...overrides.scanlines
      },
      crt: {
        ...baseTheme.crt,
        ...overrides.crt
      }
    }

    return customTheme
  }

  // 保存自定义主题
  const saveCustomTheme = (theme: GeekModeTheme) => {
    try {
      if (!validateTheme(theme)) {
        throw new Error('Invalid theme configuration')
      }

      // 检查是否已存在
      const existingIndex = customThemes.value.findIndex(t => t.id === theme.id)

      if (existingIndex >= 0) {
        customThemes.value[existingIndex] = theme
      } else {
        customThemes.value.push(theme)
      }

      // 保存到本地存储
      if (options.persistTheme) {
        const customThemesKey = `${storageKey}-custom`
        localStorage.setItem(customThemesKey, JSON.stringify(customThemes.value))
      }

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save custom theme'
      console.error('Custom theme save error:', err)
    }
  }

  // 删除自定义主题
  const deleteCustomTheme = (themeId: string) => {
    try {
      const index = customThemes.value.findIndex(t => t.id === themeId)
      if (index >= 0) {
        customThemes.value.splice(index, 1)

        // 更新本地存储
        if (options.persistTheme) {
          const customThemesKey = `${storageKey}-custom`
          localStorage.setItem(customThemesKey, JSON.stringify(customThemes.value))
        }

        // 如果删除的是当前主题，切换到默认主题
        if (currentTheme.value.id === themeId) {
          switchTheme(getDefaultTheme())
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete custom theme'
      console.error('Custom theme delete error:', err)
    }
  }

  // 切换特效
  const toggleEffect = (effect: AnimationEffect) => {
    const theme = { ...currentTheme.value }

    if (!theme.effects) {
      theme.effects = {
        animations: [],
        transparency: 1,
        blur: 0,
        glow: false,
        shadows: false
      }
    }

    const animations = theme.effects.animations || []
    const index = animations.indexOf(effect)

    if (index >= 0) {
      animations.splice(index, 1)
    } else {
      animations.push(effect)
    }

    theme.effects.animations = animations
    applyTheme(theme)
  }

  // 启用/禁用矩阵效果
  const toggleMatrix = () => {
    const theme = { ...currentTheme.value }
    if (theme.matrix) {
      theme.matrix.enabled = !theme.matrix.enabled
      applyTheme(theme)
    }
  }

  // 启用/禁用扫描线效果
  const toggleScanlines = () => {
    const theme = { ...currentTheme.value }
    if (theme.scanlines) {
      theme.scanlines.enabled = !theme.scanlines.enabled
      applyTheme(theme)
    }
  }

  // 启用/禁用CRT效果
  const toggleCRT = () => {
    const theme = { ...currentTheme.value }
    if (theme.crt) {
      theme.crt.enabled = !theme.crt.enabled
      applyTheme(theme)
    }
  }

  // 重置到默认主题
  const resetToDefault = () => {
    switchTheme(getDefaultTheme())
  }

  // 加载自定义主题
  const loadCustomThemes = () => {
    if (!options.persistTheme) return

    try {
      const customThemesKey = `${storageKey}-custom`
      const stored = localStorage.getItem(customThemesKey)
      if (stored) {
        const themes = JSON.parse(stored) as GeekModeTheme[]
        customThemes.value = themes.filter(validateTheme)
      }
    } catch (err) {
      console.warn('Failed to load custom themes:', err)
    }
  }

  // 初始化
  const initialize = () => {
    // 加载自定义主题
    loadCustomThemes()

    // 加载保存的主题
    const savedTheme = loadThemeFromStorage()
    if (savedTheme) {
      applyTheme(savedTheme)
    } else if (options.defaultTheme) {
      if (typeof options.defaultTheme === 'string') {
        switchTheme(options.defaultTheme)
      } else {
        applyTheme(options.defaultTheme)
      }
    } else {
      applyTheme(getDefaultTheme())
    }
  }

  // 监听主题变化
  watch(currentTheme, (newTheme) => {
    applyCSSVariables(newTheme)
  }, { deep: true })

  // 初始化
  initialize()

  // 返回API
  return {
    // 状态
    currentTheme: computed(() => currentTheme.value),
    availableThemes,
    customThemes,
    allThemes,
    themeNames,
    isLoading,
    error,
    enableEffects,

    // 特效状态
    currentEffects,
    isMatrixEnabled,
    isScanlinesEnabled,
    isCRTEnabled,

    // 方法
    switchTheme,
    applyTheme,
    resetToDefault,

    // 自定义主题
    createCustomTheme,
    saveCustomTheme,
    deleteCustomTheme,

    // 特效控制
    toggleEffect,
    toggleMatrix,
    toggleScanlines,
    toggleCRT
  }
}