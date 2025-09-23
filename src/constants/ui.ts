import { EventType, MessageType } from '../types/events'

// Labels for sender names per event type
export const SenderLabel: Record<string, string> = {
  [EventType.STARTED]: 'System',
  [EventType.PROGRESS]: 'System',
  [EventType.THINKING]: 'AI思考',
  [EventType.ACTING]: 'AI行动',
  [EventType.OBSERVING]: 'AI观察',
  [EventType.EXECUTING]: 'AI执行',
  [EventType.DONE]: 'Task Completed',
  [EventType.DONEWITHWARNING]: 'Task Completed (Warning)',
  [EventType.TOOL]: 'Tool',
  [EventType.TOOL_APPROVAL]: 'Approval',
  [EventType.ERROR]: 'System Error',
}

// Map EventType => MessageType used by UI renderer
export const MessageTypeMap: Record<string, MessageType> = {
  [EventType.STARTED]: MessageType.System,
  [EventType.PROGRESS]: MessageType.System,
  [EventType.THINKING]: MessageType.Assistant, // rendered as thinking
  [EventType.ACTING]: MessageType.Assistant,   // rendered as action in UI component
  [EventType.OBSERVING]: MessageType.Assistant,
  [EventType.EXECUTING]: MessageType.Assistant,
  [EventType.DONE]: MessageType.System,
  [EventType.DONEWITHWARNING]: MessageType.System,
  [EventType.TOOL]: MessageType.Tool,
  [EventType.TOOL_APPROVAL]: MessageType.ToolApproval,
  [EventType.ERROR]: MessageType.Error,
}

export const Icons = {
  tool: '🛠️',
  running: '🟢',
  done: '✅',
  warning: '⚠️',
  error: '❌',
}
