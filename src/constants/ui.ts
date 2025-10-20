import { EventType, MessageType } from '../types/events'



// Map EventType => MessageType used by UI renderer
export const MessageTypeMap: Record<string, MessageType> = {
  [EventType.STARTED]: MessageType.System,
  [EventType.PROGRESS]: MessageType.System,
  [EventType.THINKING]: MessageType.Assistant, // rendered as thinking
  [EventType.ACTION]: MessageType.Assistant,   // rendered as action in UI component
  [EventType.OBSERVING]: MessageType.Assistant,
  [EventType.EXECUTING]: MessageType.Assistant,
  [EventType.DONE]: MessageType.System,
  [EventType.DONEWITHWARNING]: MessageType.System,
  [EventType.COMPLETED]: MessageType.System,
  [EventType.TOOL]: MessageType.Tool,
  [EventType.TOOL_APPROVAL]: MessageType.ToolApproval,
  [EventType.ERROR]: MessageType.Error,
}

