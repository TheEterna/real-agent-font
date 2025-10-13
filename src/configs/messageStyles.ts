/**
 * 消息样式预设配置
 * 提供多种开箱即用的消息风格
 */

import { AgentMessageConfig, MessageStyle } from '@/types/messageConfig'

/**
 * ChatGPT 风格配置
 * - Thinking 默认折叠
 * - 紧凑布局
 * - 流畅动画
 */
export const chatGPTConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,
      collapseThreshold: 2,
      showPreview: false,
    },
    layout: {
      variant: 'compact',
    },
    animation: {
      entrance: 'fade',
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    interaction: {
      copyable: true,
      expandable: true,
    },
  },
  
  action: {
    collapsible: {
      enabled: false,
    },
    layout: {
      variant: 'default',
    },
  },
  
  user: {
    layout: {
      variant: 'minimal',
      alignment: 'right',
    },
    animation: {
      entrance: 'slide',
      duration: 250,
    },
  },
  
  assistant: {
    interaction: {
      copyable: true,
      hoverable: true,
    },
    layout: {
      variant: 'default',
    },
  },
}

/**
 * 豆包风格配置
 * - Thinking 折叠，显示预览
 * - 卡片布局
 * - 圆润风格
 */
export const doubaoConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,
      collapseThreshold: 3,
      showPreview: true,
      previewLines: 2,
    },
    layout: {
      variant: 'card',
    },
    animation: {
      entrance: 'zoom',
      duration: 350,
    },
  },
  
  action: {
    layout: {
      variant: 'card',
    },
  },
  
  user: {
    layout: {
      variant: 'compact',
      alignment: 'right',
    },
  },
}

/**
 * Claude 风格配置
 * - 简洁专业
 * - Thinking 展开显示
 * - 宽松布局
 */
export const claudeConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: false,  // Claude 默认展开
      collapseThreshold: 10,
    },
    layout: {
      variant: 'default',
    },
  },
  
  action: {
    layout: {
      variant: 'default',
    },
  },
  
  user: {
    layout: {
      variant: 'default',
      alignment: 'right',
    },
  },
}

/**
 * 紧凑风格配置
 * - 所有消息紧凑布局
 * - 快速动画
 * - 适合信息密集场景
 */
export const compactConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: true,
      defaultCollapsed: true,
      collapseThreshold: 1,
    },
    layout: {
      variant: 'compact',
    },
    animation: {
      entrance: 'none',
    },
  },
  
  action: {
    layout: {
      variant: 'compact',
    },
  },
  
  observing: {
    layout: {
      variant: 'compact',
    },
  },
  
  user: {
    layout: {
      variant: 'compact',
      alignment: 'right',
    },
  },
  
  assistant: {
    layout: {
      variant: 'compact',
    },
  },
}

/**
 * 默认风格配置
 * - 保持原有行为
 * - 无折叠
 * - 标准布局
 */
export const defaultConfig: AgentMessageConfig = {
  thinking: {
    collapsible: {
      enabled: false,
    },
    layout: {
      variant: 'default',
    },
  },
  
  action: {
    layout: {
      variant: 'default',
    },
  },
  
  user: {
    layout: {
      variant: 'default',
      alignment: 'right',
    },
  },
}

/**
 * 根据风格名称获取配置
 */
export function getConfigByStyle(style: MessageStyle): AgentMessageConfig {
  const configMap: Record<MessageStyle, AgentMessageConfig> = {
    [MessageStyle.DEFAULT]: defaultConfig,
    [MessageStyle.CHATGPT]: chatGPTConfig,
    [MessageStyle.DOUBAO]: doubaoConfig,
    [MessageStyle.CLAUDE]: claudeConfig,
    [MessageStyle.COMPACT]: compactConfig,
  }
  
  return configMap[style] || defaultConfig
}

/**
 * 导出所有预设配置
 */
export const messageStyles = {
  chatgpt: chatGPTConfig,
  doubao: doubaoConfig,
  claude: claudeConfig,
  compact: compactConfig,
  default: defaultConfig,
}
