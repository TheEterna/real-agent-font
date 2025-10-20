import {ref, nextTick} from 'vue'
import {UIMessage, EventType, BaseEventItem} from '../types/events'
import {MessageType} from '@/types/events'
import {MessageTypeMap} from '../constants/ui'
import {ConnectionStatus, TaskStatus, ProgressInfo} from '@/types/status'
import {TypeFlags} from 'typescript'
import {NotificationType} from '@/types/notification'

// Use SSEEvent as strong type alias for incoming SSE events

export function useSSE(options?: {
    onScrollToBottom?: () => void,
    onDoneNotice?: (p: {
        text: string;
        timestamp: Date;
        title: string;
        nodeId?: string,
        type: NotificationType
    }) => void
}) {
    const messages = ref<UIMessage[]>([])
    const nodeIndex = ref<Record<string, number>>({})
    const connectionStatus = ref(new ConnectionStatus('disconnected'))
    const taskStatus = ref(new TaskStatus('idle'))
    const progress = ref<ProgressInfo | null>(null)
    const currentTaskTitle = ref<string>("")

    const closeSource = (source: any) => {
        try {
            if (source && typeof source.close === 'function') source.close()
        } catch (e) {
            console.error(e)
        }
    }

    const scrollToBottom = async () => {
        await nextTick()
        options?.onScrollToBottom?.()
    }

    const getSenderByEventType = (event: BaseEventItem): string => {
        console.log(event.agentId)
        return event.agentId || "Agent"

    }

    const handleEvent = (event: BaseEventItem, source: any) => {
        const nodeId: string = event.nodeId as string
        const eventType: string = event.type
        const messageType = MessageTypeMap[eventType] || MessageTypeMap[EventType.STARTED]
        let message = (event.message || '').toString()
        const timestamp = event.startTime || Date.now()

        // 全局唯一进度：不进入消息列表，直接更新全局进度状态
        if (eventType === EventType.PROGRESS) {
            progress.value = new ProgressInfo(message, timestamp, event.agentId as any)
            return
        }



        if (eventType === EventType.DONE) {
            options?.onDoneNotice?.({
                text: message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.WARNING
            })
            return
        } else if (eventType === EventType.DONEWITHWARNING) {
            progress.value = null

            options?.onDoneNotice?.({
                text: message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.WARNING
            })
            return
        } else if (eventType === EventType.ERROR) {
            options?.onDoneNotice?.({
                text: '[ERROR] ' + message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.ERROR
            })
            return
        } else if (eventType === EventType.COMPLETED) {
            // COMPLETED 为流结束信号，不写入消息列表，但需要更新状态
            connectionStatus.value.set('disconnected')
            taskStatus.value.set('completed')
            progress.value = null // 清空进度信息
            closeSource(source)
            return
        }



        // nodeIndex is like map of java
        const index = nodeIndex.value[nodeId]
        // if already exist this node， 就累加他
        if (index !== undefined) {
            const node = messages.value[index]
            if (eventType === EventType.TOOL) {
                // 将工具事件作为独立消息插入，但共享相同的 nodeId 以实现“嵌入式”视觉归属
                const toolMsg: UIMessage = {
                    nodeId,
                    sessionId: event.sessionId,
                    type: MessageTypeMap[EventType.TOOL],
                    eventType: eventType,
                    sender: getSenderByEventType(event),
                    timestamp: timestamp,
                    message: event.message,
                    data: event.data,
                    meta: event.meta
                }
                messages.value.push(toolMsg)
            } else if (eventType === EventType.TOOL_APPROVAL) {
                node.type = MessageTypeMap[EventType.TOOL_APPROVAL]
                node.eventType = eventType
                node.sender = getSenderByEventType(event)
                node.approval = event.data
                node.timestamp = timestamp
                node.events?.push?.(event)
                node.meta = event.meta
            } else {
                // 非工具事件：累积到 message 字段并更新类型/事件类型
                node.message = node.message ? `${node.message}${message}` : message
                node.type = messageType
                node.eventType = eventType
                node.timestamp = timestamp
                node.events?.push?.(event)
                node.meta = event.meta
            }
        } else {
            // 首次出现该 nodeId
            if (eventType === EventType.TOOL) {
                const toolMsg: UIMessage = {
                    nodeId,
                    sessionId: event.sessionId,
                    type: MessageTypeMap[EventType.TOOL],
                    eventType: eventType,
                    sender: getSenderByEventType(event),
                    timestamp: timestamp,
                    message: event.message,
                    data: event.data,
                    meta: event.meta
                }
                messages.value.push(toolMsg)
                nodeIndex.value[nodeId] = messages.value.length - 1
            } else {
                // 非工具事件作为主消息创建并建立 nodeIndex
                const node: UIMessage = {
                    nodeId: nodeId,
                    sessionId: event.sessionId,
                    type: messageType,
                    eventType: eventType,
                    sender: getSenderByEventType(event),
                    message: message,
                    timestamp: timestamp,
                    events: [event],
                    approval: eventType === EventType.TOOL_APPROVAL ? event.data : undefined,
                    meta: event.meta
                }
                messages.value.push(node)
                nodeIndex.value[nodeId] = messages.value.length - 1
            }
        }

    }

    // 执行极客模式，支持命令行式交互
    const executeGeek = async (text: string, sessionId: string) => {
        return new Promise<void>((resolve, reject) => {
            import('sse.js')
                .then(({SSE}) => {
                    currentTaskTitle.value = text || ''
                    progress.value = null

                    // 检查是否是命令
                    const isCommand = text.startsWith('/')
                    const endpoint = isCommand ? '/api/agent/chat/geek/command/stream' : '/api/agent/chat/geek/stream'

                    const source = new SSE(endpoint, {
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
                            agentType: 'Geek',
                            isCommand,
                        }),
                    })

                    const closeAndResolve = () => {
                        closeSource(source)
                        resolve()
                    }

                    source.addEventListener('open', () => {
                        connectionStatus.value.set('connected')
                        taskStatus.value.set('running')
                        scrollToBottom()
                    })

                    source.addEventListener('message', (event: MessageEvent) => {
                        if (!event?.data) return
                        const data = JSON.parse(event.data) as BaseEventItem
                        handleEvent(data, source)
                    })

                    source.addEventListener('error', (err: any) => {
                        connectionStatus.value.set('error')
                        taskStatus.value.set('error')
                        closeSource(source)
                        messages.value.push({
                            nodeId: 'error',
                            timestamp: new Date(),
                            eventType: EventType.ERROR,
                            data: err,
                            sessionId: sessionId,
                            type: MessageType.Error,
                            sender: 'System Error',
                            message: '❌ 极客模式连接失败，请检查后端服务。' + err?.message
                        })
                        scrollToBottom()
                        reject(new Error('极客模式SSE连接失败: ' + (err?.message || err?.type || '未知错误')))
                    })

                    try {
                        (source as any).stream()
                    } catch (e: any) {
                        reject(new Error('启动极客模式SSE流失败: ' + (e?.message || '未知错误')))
                    }
                })
                .catch((e) => {
                    reject(new Error('未能加载 sse.js: ' + (e as Error).message))
                })
        })
    }

    // 执行 ReAct，使用 sse.js 的 POST 方式
    const executeReAct = async (text: string, sessionId: string) => {
        return new Promise<void>((resolve, reject) => {
            // 动态 import，避免在 SSR 或测试环境报错
            import('sse.js')
                .then(({SSE}) => {
                    currentTaskTitle.value = text || ''
                    // 启动新任务时清理进度（不清理已完成通知列表）
                    progress.value = null
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
                        connectionStatus.value.set('connected')
                        taskStatus.value.set('running')
                        scrollToBottom()

                    })

                    source.addEventListener('message', (event: MessageEvent) => {
                        if (!event?.data) return
                        const data = JSON.parse(event.data) as BaseEventItem
                        handleEvent(data, source)

                    })

                    source.addEventListener('error', (err: any) => {
                        connectionStatus.value.set('error')
                        taskStatus.value.set('error')
                        closeSource(source)
                        messages.value.push({
                            nodeId: 'error',
                            timestamp: new Date(),
                            eventType: EventType.ERROR,
                            data: err,
                            sessionId: sessionId,
                            type: MessageType.Error,
                            sender: 'System Error',
                            message: '❌ 连接失败，请检查后端服务是否正常运行。' + err?.message
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
        progress,
        executeReAct,
        executeGeek,
        // executeCoding,
        handleEvent,
    }
}
