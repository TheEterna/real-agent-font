import { ref, watch, onUnmounted } from 'vue'

/**
 * 打字机效果 Composable
 * 实现类似 ChatGPT 的流畅文字逐字显示效果
 *
 * @param speed 打字速度（毫秒/字符），默认 30ms
 * @param enableEffect 是否启用打字机效果，默认 true
 */
export function useTypewriter(speed: number = 30, enableEffect: boolean = true) {
    const displayedText = ref('')  // 当前显示的文本
    const targetText = ref('')     // 目标文本（完整内容）
    const isTyping = ref(false)    // 是否正在打字

    let animationFrameId: number | null = null
    let lastUpdateTime = 0
    let currentIndex = 0

    /**
     * 使用 requestAnimationFrame 实现流畅的打字机效果
     * 比 setInterval 更流畅，不会阻塞主线程
     */
    const typeNextChar = (startTime: number) => {
        if (!isTyping.value) return

        // 控制打字速度
        if (startTime - lastUpdateTime >= speed) {
            const target = targetText.value
            const displayed = displayedText.value

            if (currentIndex < target.length) {
                // 逐字符添加
                displayedText.value = target.substring(0, currentIndex + 1)
                currentIndex++
                lastUpdateTime = startTime
            } else {
                // 打字完成
                isTyping.value = false
                displayedText.value = target
                return
            }
        }

        // 继续下一帧
        animationFrameId = requestAnimationFrame(typeNextChar)
    }

    /**
     * 停止当前的打字动画
     */
    const stopTyping = () => {
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }
        isTyping.value = false
    }

    /**
     * 立即完成打字（跳过动画）
     */
    const completeTyping = () => {
        stopTyping()
        displayedText.value = targetText.value
        currentIndex = targetText.value.length
    }

    /**
     * 重置打字机状态
     */
    const reset = () => {
        stopTyping()
        displayedText.value = ''
        targetText.value = ''
        currentIndex = 0
        lastUpdateTime = 0
    }

    /**
     * 监听目标文本变化，自动开始打字动画
     */
    watch(targetText, (newText, oldText) => {
        if (!enableEffect) {
            // 如果禁用打字机效果，直接显示完整文本
            displayedText.value = newText
            return
        }

        const newLength = newText.length
        const oldLength = oldText?.length || 0
        const displayedLength = displayedText.value.length

        // 如果新文本比旧文本短，说明是清空或替换，重新开始
        if (newLength < oldLength || newLength < displayedLength) {
            stopTyping()
            displayedText.value = ''
            currentIndex = 0
        }

        // 如果新文本与已显示文本相同，无需打字
        if (newText === displayedText.value) {
            return
        }

        // 从当前位置继续打字
        if (newLength > displayedLength) {
            currentIndex = displayedLength
            isTyping.value = true
            lastUpdateTime = performance.now()
            animationFrameId = requestAnimationFrame(typeNextChar)
        }
    })

    /**
     * 组件卸载时清理动画
     */
    onUnmounted(() => {
        stopTyping()
    })

    return {
        displayedText,    // 用于显示的文本（只读）
        targetText,       // 设置目标文本（可写）
        isTyping,         // 是否正在打字（只读）
        stopTyping,       // 停止打字动画
        completeTyping,   // 立即完成打字
        reset             // 重置状态
    }
}

/**
 * 简化版打字机效果（用于简单场景）
 * 直接传入文本，返回显示文本
 */
export function useSimpleTypewriter(initialText: string = '', speed: number = 30) {
    const { displayedText, targetText } = useTypewriter(speed)

    // 设置初始文本
    if (initialText) {
        targetText.value = initialText
    }

    return {
        displayedText,
        setText: (text: string) => {
            targetText.value = text
        }
    }
}
