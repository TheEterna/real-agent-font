// Strong types for SSE events and UI messages

import {ToolSpec} from "@/services/tools.js";

export enum EventType {
  STARTED = 'STARTED',
  PROGRESS = 'PROGRESS',
  AGENT_SELECTED = 'AGENT_SELECTED',
  THINKING = 'THINKING',
  ACTION = 'ACTION',
  ACTING = 'ACTING',
  OBSERVING = 'OBSERVING',
  COLLABORATING = 'COLLABORATING',
  PARTIAL_RESULT = 'PARTIAL_RESULT',
  DONE = 'DONE',
  EXECUTING = 'EXECUTING',
  ERROR = 'ERROR',
  TOOL = 'TOOL',
  DONEWITHWARNING = 'DONEWITHWARNING',
  TOOL_APPROVAL = 'TOOL_APPROVAL',
  INTERACTION = 'INTERACTION',
  COMPLETED = 'COMPLETED',

  // ReActPlus 专属事件类型,
  TASK_ANALYSIS = 'TASK_ANALYSIS',  // 任务分析阶段
  THOUGHT = 'THOUGHT',              // 思维链生成
  INIT_PLAN = 'INIT_PLAN',          // 初始化计划
  UPDATE_PLAN = 'UPDATE_PLAN',      // 更新计划
  ADVANCE_PLAN = 'ADVANCE_PLAN',    // 推进计划
}

export enum MessageType {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
  ToolApproval = 'tool_approval',
  Error = 'error',
}

export interface BaseEventItem {
  sessionId?: string
  turnId?: string
  startTime: Date
  endTime?: Date
  spanId?: string
  nodeId?: string
  agentId: string
  type: EventType | string
  message: string
  data?: any
  meta?: object
}

export interface ToolResponseData {
  toolCallId?: string
  toolName?: string
  responseData?: any
}

export type ToolEventData = ToolResponseData | Record<string, any> | any

export interface UIMessage {
  // identity & tracing
  nodeId?: string
  sessionId?: string
  turnId?: string

  // categorization
  type: MessageType
  eventType?: string
  sender: string

  // text payload
  message: string
  data?: any

  // time
  startTime?: Date
  endTime?: Date

  events?: BaseEventItem[],
  meta?: {
      toolSchema?: ToolSpec; // 可选链，允许 meta 或 toolSchema 不存在
  };

  // hierarchy support for tool calls (父子关系支持)
  parentNodeId?: string      // 父节点 ID（用于工具调用关联到 ACTION 节点）
  children?: UIMessage[]     // 子消息列表（如工具调用结果）
}
