import { ref, computed, watch, Ref } from 'vue'
import { useTerminalStore, type SimpleCommand, type ParsedCommand, type ParseError } from '@/stores/terminalStore'
import { useCommandHandler } from "@/composables/terminal/useCommandHandler";
import { Terminal } from "@xterm/xterm";

export interface UseCommandInputOptions {
    historySize?: number
    commandPrompt?: string,
    terminal?: Ref<Terminal | undefined, Terminal | undefined>,
    isReady: Ref<boolean>,
}

export function useCommandInput(options: UseCommandInputOptions = { isReady: ref(false), terminal: undefined }) {
    // 配置
    const {
        historySize = 100,
        commandPrompt = '[root@real-agent-terminal]# ',
        terminal,
        isReady,
    } = options

    // 使用 Pinia store
    const terminalStore = useTerminalStore()

    // 响应式状态
    const currentInput = ref('')
    const currentCommandLine = ref('') // 终端当前命令行
    const cursorPosition = ref(0) // 光标位置（0 表示行首，值越大越靠右）
    const suggestions = ref<SimpleCommand[]>([])
    const selectedSuggestionIndex = ref(-1)
    const commandHistory = ref<string[]>([])
    const historyIndex = ref(-1) // -1 表示当前输入，0+ 表示历史命令索引（0是最新）
    const temporarySavedInput = ref('') // 浏览历史前保存的临时输入
    const showSuggestions = ref(false)
    const isLoading = ref(false)

    // 解析结果
    const parseResult = ref<{
        command?: ParsedCommand
        error?: ParseError
    }>({})

    const {
        write: write,
        writeln: writeln,
        handleCommandExecute: onExecute,
        handleCommandError: onError,
        showPrompt
    } = useCommandHandler({
        terminal: terminal,
        isReady: isReady,
        currentCommandLine: currentCommandLine
    });

    // 计算属性：当前是否有有效输入
    const hasInput = computed(() => currentInput.value.trim().length > 0)

    // 计算属性：当前是否有建议
    const hasSuggestions = computed(() => suggestions.value.length > 0)

    // 计算属性：当前选中的建议
    const selectedSuggestion = computed(() => {
        if (selectedSuggestionIndex.value >= 0 && selectedSuggestionIndex.value < suggestions.value.length) {
            return suggestions.value[selectedSuggestionIndex.value]
        }
        return null
    })

    // 更新命令建议
    const updateSuggestions = (input: string) => {
        if (!input || !input.startsWith('/')) {
            suggestions.value = []
            showSuggestions.value = false
            selectedSuggestionIndex.value = -1
            return
        }

        // 移除前缀后进行匹配
        const query = input.slice(1).trim()

        if (query.length === 0) {
            // 显示所有命令
            suggestions.value = terminalStore.getAllCommands()
        } else {
            // 获取匹配的命令建议
            suggestions.value = terminalStore.getCommandSuggestions(query)
        }

        showSuggestions.value = suggestions.value.length > 0
        selectedSuggestionIndex.value = suggestions.value.length > 0 ? 0 : -1
    }

    // 处理输入变化
    const handleInput = (input: string) => {
        currentInput.value = input
        historyIndex.value = -1 // 重置历史索引

        // 更新建议
        updateSuggestions(input)

        // 如果输入完整命令（不只是前缀），尝试解析（但不显示错误）
        const trimmed = input.trim()
        if (trimmed.length > 1 && trimmed.startsWith('/')) {
            const result = terminalStore.parseCommand(input)
            parseResult.value = result
            // 注意：这里只保存解析结果，不显示错误
            // 错误信息只在用户按回车执行命令时才显示
        } else {
            parseResult.value = {}
        }
    }

    // Tab补全：完成当前选中的建议
    const handleTabComplete = (): boolean => {
        if (!hasSuggestions.value || selectedSuggestionIndex.value < 0) {
            return false
        }

        const suggestion = suggestions.value[selectedSuggestionIndex.value]

        // 构建完整命令
        let completedCommand = `/${suggestion.name}`

        // 如果命令有必需参数，添加占位符
        const requiredParams = suggestion.parameters?.filter(p => p.required) || []
        if (requiredParams.length > 0) {
            completedCommand += ' '
            // 添加第一个必需参数的占位符
            const firstParam = requiredParams[0]
            completedCommand += `<${firstParam.name}>`
        }

        currentInput.value = completedCommand
        currentCommandLine.value = completedCommand
        cursorPosition.value = completedCommand.length // 光标移到行尾
        showSuggestions.value = false
        selectedSuggestionIndex.value = -1
        updateDisplay()

        return true
    }

    // 向上选择建议
    const selectPreviousSuggestion = (): boolean => {
        if (!hasSuggestions.value) return false

        if (selectedSuggestionIndex.value > 0) {
            selectedSuggestionIndex.value--
        } else {
            selectedSuggestionIndex.value = suggestions.value.length - 1
        }
        return true
    }

    // 向下选择建议
    const selectNextSuggestion = (): boolean => {
        if (!hasSuggestions.value) return false

        if (selectedSuggestionIndex.value < suggestions.value.length - 1) {
            selectedSuggestionIndex.value++
        } else {
            selectedSuggestionIndex.value = 0
        }
        return true
    }

    // 选择指定索引的建议
    const selectSuggestion = (index: number) => {
        if (index >= 0 && index < suggestions.value.length) {
            selectedSuggestionIndex.value = index
            handleTabComplete()
        }
    }

    // 从历史记录向上翻（显示更老的命令）
    const selectPreviousHistory = (): boolean => {
        if (commandHistory.value.length === 0) return false

        // 第一次进入历史浏览模式：保存当前输入
        if (historyIndex.value === -1) {
            temporarySavedInput.value = currentCommandLine.value
            historyIndex.value = 0
        } else if (historyIndex.value < commandHistory.value.length - 1) {
            // 继续向上浏览更老的历史
            historyIndex.value++
        } else {
            // 已经到达最老的历史记录，不再移动
            return false
        }

        // ⚠️ 只更新 currentCommandLine，不更新 currentInput（避免触发 watch 导致 historyIndex 重置）
        const historyCommand = commandHistory.value[historyIndex.value]
        currentCommandLine.value = historyCommand
        cursorPosition.value = historyCommand.length // 光标移到行尾
        updateSuggestions(historyCommand)
        updateDisplay()
        return true
    }

    // 从历史记录向下翻（显示更新的命令）
    const selectNextHistory = (): boolean => {
        if (historyIndex.value === -1) {
            // 已经在当前输入状态，无法继续向下
            return false
        }

        if (historyIndex.value > 0) {
            // 返回更新的历史命令
            historyIndex.value--
            const historyCommand = commandHistory.value[historyIndex.value]
            // ⚠️ 只更新 currentCommandLine，不更新 currentInput
            currentCommandLine.value = historyCommand
            cursorPosition.value = historyCommand.length
            updateSuggestions(historyCommand)
            updateDisplay()
            return true
        } else {
            // 返回到原始输入状态
            historyIndex.value = -1
            const savedInput = temporarySavedInput.value
            // ⚠️ 只更新 currentCommandLine，不更新 currentInput
            currentCommandLine.value = savedInput
            cursorPosition.value = savedInput.length
            temporarySavedInput.value = '' // 清空临时保存
            updateSuggestions(savedInput)
            updateDisplay()
            return true
        }
    }

    // 执行命令
    const executeCommand = async () => {
        const input = currentInput.value.trim()
        if (!input) return

        // 重置历史浏览状态
        historyIndex.value = -1
        temporarySavedInput.value = ''

        // 添加到历史记录（去重：只有当最新的历史命令与当前输入不同时才添加）
        if (commandHistory.value.length === 0 || commandHistory.value[0] !== input) {
            commandHistory.value.unshift(input) // 新命令放在索引0
            if (commandHistory.value.length > historySize) {
                commandHistory.value.pop() // 移除最老的命令
            }
        }

        // 解析命令
        const result = terminalStore.parseCommand(input)

        if (result.error) {
            if (onError) {
                onError(result.error)
            }
            return
        }

        if (result.command && onExecute) {
            try {
                await onExecute(result.command)
            } catch (error) {
                console.error('Command execution error:', error)
                if (onError) {
                    onError({
                        message: error instanceof Error ? error.message : '命令执行失败'
                    })
                }
            }
        }

        // 清空输入
        currentInput.value = ''
        currentCommandLine.value = ''
        cursorPosition.value = 0
        suggestions.value = []
        showSuggestions.value = false
        selectedSuggestionIndex.value = -1
    }

    // 清空输入
    const clearInput = () => {
        currentInput.value = ''
        currentCommandLine.value = ''
        cursorPosition.value = 0
        suggestions.value = []
        showSuggestions.value = false
        selectedSuggestionIndex.value = -1
        parseResult.value = {}
        historyIndex.value = -1
        temporarySavedInput.value = ''
        updateDisplay()
    }

    // 获取命令帮助信息
    const getCommandHelp = (commandName: string): SimpleCommand | undefined => {
        return terminalStore.getCommand(commandName)
    }

    // 获取所有命令
    const getAllCommands = (): SimpleCommand[] => {
        return terminalStore.getAllCommands()
    }

    // 更新终端显示
    const updateDisplay = () => {
        if (!write) return

        // 清除当前行
        write('\r\x1b[K')

        // 重新写入命令行
        write(commandPrompt + currentCommandLine.value)

        // 移动光标到正确位置
        const offset = currentCommandLine.value.length - cursorPosition.value
        if (offset > 0) {
            write(`\x1b[${offset}D`) // 向左移动光标
        }
    }

    // 光标移动到行首
    const moveCursorToStart = () => {
        cursorPosition.value = 0
        updateDisplay()
    }

    // 光标移动到行尾
    const moveCursorToEnd = () => {
        cursorPosition.value = currentCommandLine.value.length
        updateDisplay()
    }

    // 光标向左移动
    const moveCursorLeft = () => {
        if (cursorPosition.value > 0) {
            cursorPosition.value--
            if (write) write('\x1b[D') // 向左移动一个字符
        }
    }

    // 光标向右移动
    const moveCursorRight = () => {
        if (cursorPosition.value < currentCommandLine.value.length) {
            cursorPosition.value++
            if (write) write('\x1b[C') // 向右移动一个字符
        }
    }

    // 处理终端原始数据输入
    const handleTerminalData = (data: string) => {
        const char = data

        // 回车
        if (char === '\r' || char === '\n') {
            if (!currentCommandLine.value.trim()) {
                if (showPrompt) showPrompt()
                return
            }
            handleInput(currentCommandLine.value)
            executeCommand()
            return
        }

        // 退格（Backspace）
        if (char === '\u007F' || char === '\b') {
            if (cursorPosition.value > 0) {
                // 在光标位置删除字符
                currentCommandLine.value =
                    currentCommandLine.value.slice(0, cursorPosition.value - 1) +
                    currentCommandLine.value.slice(cursorPosition.value)
                cursorPosition.value--
                handleInput(currentCommandLine.value)
                updateDisplay()
            }
            return
        }

        // Delete 键
        if (char === '\u001b[3~') {
            if (cursorPosition.value < currentCommandLine.value.length) {
                // 删除光标后的字符
                currentCommandLine.value =
                    currentCommandLine.value.slice(0, cursorPosition.value) +
                    currentCommandLine.value.slice(cursorPosition.value + 1)
                handleInput(currentCommandLine.value)
                updateDisplay()
            }
            return
        }

        // Home 键 - 移动到行首
        if (char === '\u001b[H' || char === '\u001b[1~') {
            moveCursorToStart()
            return
        }

        // End 键 - 移动到行尾
        if (char === '\u001b[F' || char === '\u001b[4~') {
            moveCursorToEnd()
            return
        }

        // 左箭头 - 向左移动光标
        if (char === '\u001b[D') {
            moveCursorLeft()
            return
        }

        // 右箭头 - 向右移动光标
        if (char === '\u001b[C') {
            moveCursorRight()
            return
        }

        // Tab - 补全
        if (char === '\t') {
            if (showSuggestions.value) {
                handleTabComplete()
            } else {
                // 如果没有建议，显示所有命令建议
                updateSuggestions(currentCommandLine.value)
            }
            return
        }

        // 向上箭头 - 历史记录或建议选择
        if (char === '\u001b[A') {
            if (showSuggestions.value) {
                selectPreviousSuggestion()
            } else {
                selectPreviousHistory()
            }
            return
        }

        // 向下箭头 - 历史记录或建议选择
        if (char === '\u001b[B') {
            if (showSuggestions.value) {
                selectNextSuggestion()
            } else {
                selectNextHistory()
            }
            return
        }

        // 普通字符 - 在光标位置插入
        if (char.length === 1 && char.charCodeAt(0) >= 32) {
            // 在光标位置插入字符
            currentCommandLine.value =
                currentCommandLine.value.slice(0, cursorPosition.value) +
                char +
                currentCommandLine.value.slice(cursorPosition.value)
            cursorPosition.value++
            handleInput(currentCommandLine.value)
            updateDisplay()
        }
    }

    // 监听输入变化
    watch(currentInput, (newValue) => {
        handleInput(newValue)
    })

    return {
        // 状态
        currentInput,
        currentCommandLine,
        suggestions,
        selectedSuggestionIndex,
        commandHistory,
        showSuggestions,
        isLoading,
        parseResult,

        // 计算属性
        hasInput,
        hasSuggestions,
        selectedSuggestion,

        // 方法
        handleInput,
        handleTabComplete,
        selectPreviousSuggestion,
        selectNextSuggestion,
        selectSuggestion,
        selectPreviousHistory,
        selectNextHistory,
        executeCommand,
        clearInput,
        getCommandHelp,
        getAllCommands,
        handleTerminalData,
        updateDisplay
    }
}