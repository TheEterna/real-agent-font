import type { AgentUIConfig } from '@/types/agents'
import { AgentType } from '@/types/agents'

// 可按需扩展更多 Agent 配置
const registry: Record<AgentType, AgentUIConfig> = {
  [AgentType.ReAct]: {
    type: AgentType.ReAct,
    title: 'ReAct 推理-行动-观察',
    themeClass: 'theme-react',
    renderer: 'default', // 先复用默认列表渲染
    interactions: {
      // Chat.vue 中会按名称分发到具体执行函数
      sendFnName: 'executeReAct',
    },
  },
  [AgentType.Coding]: {
    type: AgentType.Coding,
    title: '代码编写（预留）',
    themeClass: 'theme-coding',
    renderer: 'default',
    interactions: {},
  },
}

export function getAgentUIConfig(agent: AgentType): AgentUIConfig {
  return registry[agent]
}
