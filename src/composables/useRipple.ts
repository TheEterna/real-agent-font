/**
 * 玉琢波纹效果 Composable
 * 为按钮添加点击时的波纹扩散动画
 */

import { onMounted, onUnmounted, Ref } from 'vue'
import { gsap } from 'gsap'

interface RippleConfig {
  color?: string
  duration?: number
  maxScale?: number
}

/**
 * 创建波纹效果
 * @param elementRef - 按钮元素的 ref
 * @param config - 波纹配置
 */
export function useRipple(
  elementRef: Ref<HTMLElement | undefined>,
  config: RippleConfig = {}
) {
  const {
    color = 'rgba(255, 255, 255, 0.4)',
    duration = 0.6,
    maxScale = 4
  } = config

  /**
   * 创建并播放波纹动画
   */
  const createRipple = (event: MouseEvent) => {
    const button = elementRef.value
    if (!button) return

    // 确保按钮是相对定位
    const position = window.getComputedStyle(button).position
    if (position === 'static') {
      button.style.position = 'relative'
    }

    // 确保按钮有 overflow: hidden
    button.style.overflow = 'hidden'

    // 获取按钮尺寸和点击位置
    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = event.clientX - rect.left - size / 2
    const y = event.clientY - rect.top - size / 2

    // 创建波纹元素
    const ripple = document.createElement('span')
    ripple.className = 'jade-ripple'
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      transform: scale(0);
      opacity: 1;
      pointer-events: none;
      z-index: 9999;
    `

    button.appendChild(ripple)

    // GSAP 波纹动画
    gsap.to(ripple, {
      scale: maxScale,
      opacity: 0,
      duration: duration,
      ease: 'power2.out',
      onComplete: () => {
        ripple.remove()
      }
    })
  }

  /**
   * 添加点击事件监听
   */
  const addRippleEffect = () => {
    const button = elementRef.value
    if (!button) return

    button.addEventListener('click', createRipple)
  }

  /**
   * 移除点击事件监听
   */
  const removeRippleEffect = () => {
    const button = elementRef.value
    if (!button) return

    button.removeEventListener('click', createRipple)
  }

  // 生命周期钩子
  onMounted(() => {
    addRippleEffect()
  })

  onUnmounted(() => {
    removeRippleEffect()
  })

  return {
    createRipple,
    addRippleEffect,
    removeRippleEffect
  }
}

/**
 * 为多个按钮批量添加波纹效果
 * @param selector - CSS 选择器
 * @param config - 波纹配置
 */
export function useBatchRipple(
  selector: string,
  config: RippleConfig = {}
) {
  const {
    color = 'rgba(255, 255, 255, 0.4)',
    duration = 0.6,
    maxScale = 4
  } = config

  const createRipple = (event: MouseEvent) => {
    const button = event.currentTarget as HTMLElement
    if (!button) return

    // 确保按钮样式正确
    const position = window.getComputedStyle(button).position
    if (position === 'static') {
      button.style.position = 'relative'
    }
    button.style.overflow = 'hidden'

    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = event.clientX - rect.left - size / 2
    const y = event.clientY - rect.top - size / 2

    const ripple = document.createElement('span')
    ripple.className = 'jade-ripple'
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      transform: scale(0);
      opacity: 1;
      pointer-events: none;
      z-index: 9999;
    `

    button.appendChild(ripple)

    gsap.to(ripple, {
      scale: maxScale,
      opacity: 0,
      duration: duration,
      ease: 'power2.out',
      onComplete: () => {
        ripple.remove()
      }
    })
  }

  const attachRipples = () => {
    const buttons = document.querySelectorAll(selector)
    buttons.forEach(button => {
      button.addEventListener('click', createRipple as EventListener)
    })
  }

  const detachRipples = () => {
    const buttons = document.querySelectorAll(selector)
    buttons.forEach(button => {
      button.removeEventListener('click', createRipple as EventListener)
    })
  }

  onMounted(() => {
    attachRipples()
  })

  onUnmounted(() => {
    detachRipples()
  })

  return {
    attachRipples,
    detachRipples
  }
}
