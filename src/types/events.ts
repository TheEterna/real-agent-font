// Strong types for SSE events and UI messages

export enum EventType {
  STARTED = 'STARTED',
  EXECUTING = 'EXECUTING',
  THINKING = 'THINKING',
  ACTION = 'ACTION',
  OBSERVING = 'OBSERVING',
  TOOL = 'TOOL',
  TOOL_APPROVAL = 'TOOL_APPROVAL',
  PROGRESS = 'PROGRESS',
  ERROR = 'ERROR',
  DONE = 'DONE',
  DONEWITHWARNING = 'DONEWITHWARNING',
  COMPLETED = 'COMPLETED'
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
  timestamp?: Date

  // tool/approval specific (optional, used by MessageItem/ToolBox)
  approval?: any
  events?: BaseEventItem[],
  meta?: object
}
