// Strong types for SSE events and UI messages

export enum EventType {
  STARTED = 'STARTED',
  EXECUTING = 'EXECUTING',
  THINKING = 'THINKING',
  ACTING = 'ACTING',
  OBSERVING = 'OBSERVING',
  TOOL = 'TOOL',
  TOOL_APPROVAL = 'TOOL_APPROVAL',
  PROGRESS = 'PROGRESS',
  ERROR = 'ERROR',
  DONE = 'DONE',
  DONEWITHWARNING = 'DONEWITHWARNING',
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
  type: EventType | string
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
  data?: unknown
}

export interface ToolResponseData {
  toolCallId?: string
  toolName?: string
  responseData?: unknown
}

export type ToolEventData = ToolResponseData | Record<string, unknown> | unknown

export interface UIMessage {
  // identity & tracing
  nodeId?: string
  sessionId?: string
  traceId?: string

  // categorization
  type: MessageType
  eventType?: EventType
  sender: string

  // text payload
  message: string
  data?: object | string

  // time
  startTime?: Date
  endTime?: Date
  timestamp?: Date

  // flags
  isCompletion?: boolean

  // tool/approval specific (optional, used by MessageItem/ToolBox)
  approval?: unknown
  events?: BaseEventItem[]
}

// Discriminated union for incoming SSE events
export type StartedEvent = {
  type: EventType.STARTED
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type ProgressEvent = {
  type: EventType.PROGRESS | EventType.EXECUTING
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type PhaseEvent = {
  type: EventType.THINKING | EventType.ACTING | EventType.OBSERVING
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type ToolEvent = {
  type: EventType.TOOL
  message?: string // usually tool title or brief
  data?: unknown   // tool payload
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type ToolApprovalEvent = {
  type: EventType.TOOL_APPROVAL
  message?: string
  data?: unknown
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type DoneEvent = {
  type: EventType.DONE | EventType.DONEWITHWARNING
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type ErrorEvent = {
  type: EventType.ERROR
  message?: string
  timestamp?: string
  sessionId?: string
  traceId?: string
  nodeId?: string
  agentId?: string
}

export type SSEEvent =
  | StartedEvent
  | ProgressEvent
  | PhaseEvent
  | ToolEvent
  | ToolApprovalEvent
  | DoneEvent
  | ErrorEvent
