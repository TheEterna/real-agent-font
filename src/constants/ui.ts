import { EventType, MessageType } from '../types/events'



// Map EventType => MessageType used by UI renderer
export const MessageTypeMap: Record<string, MessageType> = {
  [EventType.STARTED]: MessageType.System,
  [EventType.PROGRESS]: MessageType.System,
  [EventType.AGENT_SELECTED]: MessageType.System,
  [EventType.THINKING]: MessageType.Assistant, // rendered as thinking
  [EventType.ACTION]: MessageType.Assistant,   // rendered as action in UI component
  [EventType.ACTING]: MessageType.Assistant,
  [EventType.OBSERVING]: MessageType.Assistant,
  [EventType.COLLABORATING]: MessageType.Assistant,
  [EventType.PARTIAL_RESULT]: MessageType.Assistant,
  [EventType.DONE]: MessageType.System,
  [EventType.EXECUTING]: MessageType.Assistant,
  [EventType.ERROR]: MessageType.Error,
  [EventType.TOOL]: MessageType.Tool,
  [EventType.DONEWITHWARNING]: MessageType.System,
  [EventType.TOOL_APPROVAL]: MessageType.ToolApproval,
  [EventType.INTERACTION]: MessageType.ToolApproval, // 通用交互请求，使用与工具审批相同的UI
  [EventType.COMPLETED]: MessageType.System,

  // ReActPlus 专属事件类型
  [EventType.TASK_ANALYSIS]: MessageType.Assistant,  // 任务分析阶段
  [EventType.THOUGHT]: MessageType.Assistant,        // 思维链生成
  [EventType.INIT_PLAN]: MessageType.Assistant,      // 初始化计划
  [EventType.UPDATE_PLAN]: MessageType.Assistant,    // 更新计划
  [EventType.ADVANCE_PLAN]: MessageType.Assistant,   // 推进计划
}

