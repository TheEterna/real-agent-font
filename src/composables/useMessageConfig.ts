/**
 * 消息配置 Composable
 * 提供消息配置的管理和获取功能
 */

import { ref, computed } from 'vue'
import { MessageConfig, AgentMessageConfig, MessageStyle } from '@/types/messageConfig'
import { getConfigByStyle } from '@/configs/messageStyles'
import {UIMessage, EventType, MessageType} from '@/types/events'

/**
 * 消息配置管理
 */
export function useMessageConfig(defaultStyle: MessageStyle = MessageStyle.DEFAULT) {
  // 当前使用的风格
  const currentStyle = ref<MessageStyle>(defaultStyle)

  // 当前风格的配置
  const currentConfig = computed<AgentMessageConfig>(() => {
    return getConfigByStyle(currentStyle.value)
  })

  /**
   * 根据消息获取对应的配置
   */
  function getMessageConfig(message: UIMessage): MessageConfig {
    const config = currentConfig.value

    // 根据事件类型返回对应配置
    if (message.eventType === EventType.THINKING) {
      return config.thinking || config.default || {}
    }

    if (message.eventType === EventType.ACTION) {
      return config.action || config.default || {}
    }

    if (message.eventType === EventType.OBSERVING) {
      return config.observing || config.default || {}
    }

    // 根据消息类型
    if (message.type === MessageType.User) {
      return config.user || config.default || {}
    }

    if (message.type === MessageType.Assistant) {
      return config.assistant || config.default || {}
    }

    if (message.type === MessageType.Tool) {
      return config.tool || config.default || {}
    }

    if (message.type === MessageType.Error) {
      return config.error || config.default || {}
    }
    // todo: 这里可能需要加

    return config.default || {}
  }

  /**
   * 切换风格
   */
  function setStyle(style: MessageStyle) {
    currentStyle.value = style
  }

  /**
   * 判断消息是否应该折叠
   */
  function shouldCollapse(message: UIMessage): boolean {
    const config = getMessageConfig(message)
    if (!config.collapsible?.enabled) return false

    const threshold = config.collapsible.collapseThreshold ?? 5
    const lineCount = message.message.split('\n').length
    return lineCount > threshold
  }

  /**
   * 判断消息是否默认折叠
   */
  function isDefaultCollapsed(message: UIMessage): boolean {
    const config = getMessageConfig(message)
    return config.collapsible?.defaultCollapsed ?? false
  }

  return {
    currentStyle,
    currentConfig,
    getMessageConfig,
    setStyle,
    shouldCollapse,
    isDefaultCollapsed,
  }
}
