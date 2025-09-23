import { ref, nextTick } from 'vue'
import { BaseEventItem, UIMessage, EventType, SSEEvent } from '../types/events'
import { MessageType } from '@/types/events'
import { SenderLabel, MessageTypeMap } from '../constants/ui'

// Use BaseEventItem from strong types instead of redefining a loose type
export type EventItem = SSEEvent

export function useSSE(options?: { onScrollToBottom?: () => void }) {
  const messages = ref<UIMessage[]>([])
  const nodeIndex = ref<Record<string, number>>({})
  const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const taskStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')

  const closeSource = (source: any) => {
    try {
      if (source && typeof source.close === 'function') source.close()
    } catch {}
  }

  // 预留：Coding Agent 执行骨架（暂未对接后端 SSE）
  const executeCoding = async (text: string, sessionId: string) => {
    // 简单示意：直接追加系统提示（未来接入具体 SSE 流或 HTTP 接口）
    messages.value.push({
      type: MessageType.System,
      sender: 'Coding Agent',
      content: `Coding Agent 尚未接入后端，收到指令：${text}`,
      timestamp: new Date(),
    })
    await scrollToBottom()
  }

  // 解析工具返回的结构化结果：
  // 支持以下几种格式：
  // 1) 直接返回JSON字符串（对象或数组）
  // 2) 返回数组，元素包含{text: "<json字符串>"}
  // 3) 返回字符串包裹的JSON，如 "[{...}]"
  const parseToolPayload = (raw: unknown): unknown | null => {
    try {
      // 优先使用传入对象
      if (raw && typeof raw !== 'string') {
        // 如果是数组且第一个元素为{text: "..."}
        if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object' && 'text' in (raw[0] as any)) {
          const inner = (raw as Array<any>).map((it: any) => (typeof it.text === 'string' ? it.text : it))
          // 只解析第一段text为主要数据
          const first = inner[0]
          if (typeof first === 'string') {
            const parsedFirst = parseToolPayload(first)
            return parsedFirst ?? raw
          }
          return raw
        }
        return raw
      }

      const str = String(raw || '').trim()
      if (!str) return null

      // 如果是字符串，尝试识别是否是JSON
      const looksJson = (s: string) => (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))

      if (looksJson(str)) {
        return JSON.parse(str)
      }

      // 有些场景会是一个数组字符串包裹在数组中的text里，此时直接尝试再解析
      // 例如: [{ text: "[ {\"name\":...} ]" }]
      try {
        const attempt = JSON.parse(str)
        return attempt
      } catch {
        // 不是严格的JSON字符串，返回原始字符串
        return null
      }
    } catch {
      return null
    }
  }

  const scrollToBottom = async () => {
    await nextTick()
    options?.onScrollToBottom?.()
  }

  const getSenderByEventType = (eventType: string): string => {
    return SenderLabel[eventType] || 'Agent'
  }

  const handleEvent = (event: EventItem) => {
    const nodeId: string = event.nodeId as string
    const eventType = event.type
    const messageType = MessageTypeMap[eventType] || MessageTypeMap[EventType.STARTED]
    let message = (event.message || '').toString()
    const timestamp = new Date(event.timestamp || Date.now())

    // TOOL 事件：将 message 作为工具框标题显示；尝试解析结构化数据
    let toolTitle: string | undefined = undefined
    let toolData: any | undefined = undefined

    if (eventType === EventType.TOOL) {
      toolTitle = (message || '').toString().trim() || 'tool calling'
      // 优先从 event.data 尝试解析；若没有再从 message 中尝试
      toolData = parseToolPayload(event.data)
      if (!toolData) {
        toolData = parseToolPayload(message)
      }
      console.log(toolData)
    }

    const index = nodeIndex.value[nodeId]
    if (index !== undefined) {
      const node = messages.value[index]
      if (eventType === EventType.TOOL) {
        // 将工具事件作为独立消息插入，但共享相同的 nodeId 以实现“嵌入式”视觉归属
        const toolMsg: UIMessage = {
          nodeId,
          sessionId: event.sessionId,
          type: MessageTypeMap[EventType.TOOL],
          eventType: eventType,
          sender: getSenderByEventType(eventType),
          timestamp: timestamp,
          message: toolTitle,
          data: toolData as any,
        }
        messages.value.push(toolMsg)
      } else if (eventType === EventType.TOOL_APPROVAL) {
        node.type = MessageTypeMap[EventType.TOOL_APPROVAL]
        node.eventType = eventType
        node.sender = getSenderByEventType(eventType)
        node.approval = event.data
        node.timestamp = timestamp
        node.events?.push?.(event)
        node.isCompletion = eventType === EventType.DONE || eventType === EventType.DONEWITHWARNING
      } else {
        // 非工具事件：累积到 message 字段并更新类型/事件类型
        node.message = node.message ? `${node.message}${message}` : message
        node.type = messageType
        node.eventType = eventType
        node.timestamp = timestamp
        node.events?.push?.(event)
        node.isCompletion = eventType === EventType.DONE || eventType === EventType.DONEWITHWARNING
      }
    } else {
      // 首次出现该 nodeId
      if (eventType === EventType.TOOL) {
        // 工具事件作为独立消息插入，但不建立 nodeIndex，等待后续非工具消息作为该 node 的主消息
        const toolMsg: UIMessage = {
          nodeId,
          sessionId: event.sessionId,
          type: MessageTypeMap[EventType.TOOL],
          eventType: eventType,
          sender: getSenderByEventType(eventType),
          content: '',
          timestamp: timestamp,
          message: toolTitle,
          data: toolData as any,
        }
        messages.value.push(toolMsg)
      } else {
        // 非工具事件作为主消息创建并建立 nodeIndex
        const node: UIMessage = {
          nodeId: nodeId,
          sessionId: event.sessionId,
          type: messageType,
          eventType: eventType,
          sender: getSenderByEventType(eventType),
          message: message,
          timestamp: timestamp,
          events: [event],
          isCompletion: eventType === EventType.DONE || eventType === EventType.DONEWITHWARNING,
          approval: eventType === EventType.TOOL_APPROVAL ? event.data : undefined,
        }
        messages.value.push(node)
        nodeIndex.value[nodeId] = messages.value.length - 1
      }
    }

  }

  // 执行 ReAct，使用 sse.js 的 POST 方式
  const executeReAct = async (text: string, sessionId: string) => {
    return new Promise<void>((resolve, reject) => {
      // 动态 import，避免在 SSR 或测试环境报错
      import('sse.js')
        .then(({ SSE }) => {
          const source = new SSE('/api/agent/chat/react/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
            payload: JSON.stringify({
              message: text,
              userId: 'user-001',
              sessionId,
              agentType: 'ReAct',
            }),
          })

          const closeAndResolve = () => {
            closeSource(source)
            resolve()
          }

          source.addEventListener('open', () => {
            connectionStatus.value = 'connected'
            taskStatus.value = 'running'
            scrollToBottom()

          })

          source.addEventListener('message', (event: MessageEvent) => {
            if (!event?.data) return
            try {
              const data = JSON.parse(event.data) as EventItem
              handleEvent(data)
              if (data.type === EventType.DONE || data.type === EventType.DONEWITHWARNING) {
                taskStatus.value = 'completed'
                setTimeout(closeAndResolve, 100)
              } else if (data.type === EventType.ERROR) {
                taskStatus.value = 'error'
                setTimeout(closeAndResolve, 100)
              }
            } catch (e) {
              // 尝试直接作为观察事件处理
              handleEvent({ type: EventType.OBSERVING, message: event.data, timestamp: new Date().toISOString() })
            }
          })

          source.addEventListener('error', (err: any) => {
            connectionStatus.value = 'error'
            taskStatus.value = 'error'
            closeSource(source)
            messages.value.push({
              type: MessageType.Error,
              sender: 'System Error',
              messgae: '❌ 连接失败，请检查后端服务是否正常运行。' + (err?.message || err?.type || ''),
              timestamp: new Date(),
            })
            scrollToBottom()
            reject(new Error('SSE连接失败: ' + (err?.message || err?.type || '未知错误')))
          })

          try {
            (source as any).stream()
          } catch (e: any) {
            reject(new Error('启动SSE流失败: ' + (e?.message || '未知错误')))
          }
        })
        .catch((e) => {
          reject(new Error('未能加载 sse.js: ' + (e as Error).message))
        })
    })
  }

  return {
    messages,
    nodeIndex,
    connectionStatus,
    taskStatus,
    executeReAct,
    executeCoding,
    handleEvent,
  }
}
