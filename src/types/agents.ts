import type { Component } from 'vue'

export enum AgentType {
  ReAct = 'ReAct',
  Coding = 'coding',
}

export interface AgentUIConfig {
  type: AgentType
  title: string
  themeClass: string
  renderer: Component | string
  // 可扩展的交互/工具栏定义
  toolbarSlots?: string[]
  interactions?: {
    sendFnName?: string
  }
}
