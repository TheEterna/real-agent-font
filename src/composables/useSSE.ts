import {ref, nextTick} from 'vue'
import {UIMessage, EventType, BaseEventItem} from '../types/events'
import {MessageType} from '@/types/events'
import {MessageTypeMap} from '../constants/ui'
import {ConnectionStatus, TaskStatus, ProgressInfo} from '@/types/status'
import {TypeFlags} from 'typescript'
import {NotificationType} from '@/types/notification'

// === 新增接口定义 ===

/** SSE上下文，提供给事件处理器的上下文信息 */
interface SSEContext {
    messages: UIMessage[]
    nodeIndex: Record<string, number>
    connectionStatus: ConnectionStatus
    taskStatus: TaskStatus
    progress: ProgressInfo | null
    currentTaskTitle: string
    source?: any
    scrollToBottom: () => Promise<void>
}

/** 自定义事件处理器映射 */
interface SSEEventHandlers {
    onStarted?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onThinking?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onAction?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onActing?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onObserving?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onCollaborating?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onExecuting?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onTool?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onToolApproval?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onInteraction?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onPartialResult?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onProgress?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onDone?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onDoneWithWarning?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onError?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onCompleted?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onDefault?: (event: BaseEventItem, context: SSEContext) => void | boolean

    // ReActPlus 专属事件处理器
    onTaskAnalysis?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onThought?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onInitPlan?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onUpdatePlan?: (event: BaseEventItem, context: SSEContext) => void | boolean
    onAdvancePlan?: (event: BaseEventItem, context: SSEContext) => void | boolean
}

/** Agent执行配置 */
interface AgentExecuteOptions {
    agentType: string
    endpoint: string
    method?: 'POST' | 'GET'
    headers?: Record<string, string>
    payload?: Record<string, any>
}

/** useSSE 配置选项 */
interface SSEOptions {
    /** 自定义事件处理器 */
    handlers?: SSEEventHandlers
    /** 是否启用默认处理器，默认为true */
    enableDefaultHandlers?: boolean
    /** 滚动到底部回调 */
    onScrollToBottom?: () => void
    /** 完成通知回调 */
    onDoneNotice?: (p: {
        text: string;
        timestamp: Date;
        title: string;
        nodeId?: string,
        type: NotificationType
    }) => void
}

export function useSSE(options: SSEOptions = {}) {
    // === 响应式状态 ===
    const messages = ref<UIMessage[]>([])
    const nodeIndex = ref<Record<string, number>>({})
    const connectionStatus = ref(new ConnectionStatus('disconnected'))
    const taskStatus = ref(new TaskStatus('idle'))
    const progress = ref<ProgressInfo | null>(null)
    const currentTaskTitle = ref<string>("")

    // === 工具函数 ===
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

    // === 默认事件处理器实现（策略模式） ===

    /** 创建SSE上下文对象 */
    const createContext = (source?: any): SSEContext => ({
        messages: messages.value,
        nodeIndex: nodeIndex.value,
        connectionStatus: connectionStatus.value as ConnectionStatus,
        taskStatus: taskStatus.value as TaskStatus,
        progress: progress.value,
        currentTaskTitle: currentTaskTitle.value,
        source,
        scrollToBottom
    })

    /** 更新消息到消息列表（默认的消息聚合逻辑） */
    const updateMessage = (event: BaseEventItem): void => {
        const nodeId: string = event.nodeId as string
        const eventType: string = event.type
        const messageType = MessageTypeMap[eventType] || MessageTypeMap[EventType.STARTED]
        let message = (event.message || '').toString()
        const timestamp = event.startTime || Date.now()

        const index = nodeIndex.value[nodeId]

        if (index !== undefined) {
            // nodeId已存在，更新现有消息
            const node = messages.value[index]
            if (eventType === EventType.TOOL) {
                // 工具事件作为独立消息插入
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
            }

            else if (eventType === EventType.TOOL_APPROVAL) {
                node.type = MessageTypeMap[EventType.TOOL_APPROVAL]
                node.eventType = eventType
                node.sender = getSenderByEventType(event)
                node.approval = event.data
                node.timestamp = timestamp
                node.events?.push?.(event)
                node.meta = event.meta
            }
            else {
                // 非工具事件：累积到message字段
                node.message = node.message ? `${node.message}${message}` : message
                node.type = messageType
                node.eventType = eventType
                node.timestamp = timestamp
                node.events?.push?.(event)
                node.meta = event.meta
            }
        } else {
            // 首次出现该nodeId
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
                    meta: event.meta,
                }

                messages.value.push(toolMsg)
                nodeIndex.value[nodeId] = messages.value.length - 1
            } else {
                // 非工具事件作为主消息创建并建立nodeIndex
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

    /** 默认事件处理器映射 */
    const defaultHandlers: Required<SSEEventHandlers> = {
        onStarted: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onThinking: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onAction: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onActing: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onObserving: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onCollaborating: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onExecuting: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onTool: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onToolApproval: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onInteraction: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onPartialResult: (event: BaseEventItem) => {
            updateMessage(event)
        },
        onProgress: (event: BaseEventItem, context: SSEContext) => {
            const message = (event.message || '').toString()
            const timestamp = event.startTime || Date.now()
            progress.value = new ProgressInfo(message, timestamp, event.agentId as any)
        },
        onDone: (event: BaseEventItem) => {
            const message = (event.message || '').toString()
            const timestamp = event.startTime || Date.now()
            options?.onDoneNotice?.({
                text: message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.WARNING
            })
        },
        onDoneWithWarning: (event: BaseEventItem) => {
            const message = (event.message || '').toString()
            const timestamp = event.startTime || Date.now()
            progress.value = null
            options?.onDoneNotice?.({
                text: message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.WARNING
            })
        },
        onError: (event: BaseEventItem) => {
            const message = (event.message || '').toString()
            const timestamp = event.startTime || Date.now()
            options?.onDoneNotice?.({
                text: '[ERROR] ' + message,
                timestamp,
                title: currentTaskTitle.value || '',
                nodeId: (event.nodeId as string) || undefined,
                type: NotificationType.ERROR
            })
        },
        onCompleted: (event: BaseEventItem, context: SSEContext) => {
            // COMPLETED为流结束信号，不写入消息列表，但需要更新状态
            connectionStatus.value.set('disconnected')
            taskStatus.value.set('completed')
            progress.value = null // 清空进度信息
            if (context.source) {
                closeSource(context.source)
            }
        },
        onDefault: (event: BaseEventItem) => {
            updateMessage(event)
        },

        // ReActPlus 专属事件处理器的默认实现
        onTaskAnalysis: (event: BaseEventItem) => {
            // 任务分析阶段：累积消息到独立节点
            updateMessage(event)
        },
        onThought: (event: BaseEventItem) => {
            // 思维链生成：累积消息到独立节点
            updateMessage(event)
        },
        onInitPlan: (event: BaseEventItem) => {
            // 初始化计划：累积消息到独立节点
            updateMessage(event)
        },
        onUpdatePlan: (event: BaseEventItem) => {
            // 更新计划：累积消息到独立节点
            updateMessage(event)
        },
        onAdvancePlan: (event: BaseEventItem) => {
            // 推进计划：累积消息到独立节点
            updateMessage(event)
        }
    }

    // === 核心事件处理函数（对外暴露） ===

    /**
     * 手动处理SSE事件
     * @param event SSE事件对象
     * @param source SSE连接源（可选）
     */
    const handleEvent = (event: BaseEventItem, source?: any): void => {
        if (!event?.type) return

        const context = createContext(source)
        const eventType = event.type
        const customHandlers = options.handlers || {}
        const enableDefault = options.enableDefaultHandlers !== false

        // 获取事件类型对应的处理器名称
        const handlerName = getHandlerNameByEventType(eventType)

        // 优先使用自定义处理器
        const customHandler = customHandlers[handlerName]
        if (customHandler) {
            const result = customHandler(event, context)
            // 如果自定义处理器返回false，则跳过默认处理器
            if (result === false) return
        }

        // 如果启用默认处理器且没有被自定义处理器阻止，则执行默认处理
        if (enableDefault) {
            const defaultHandler = defaultHandlers[handlerName]
            defaultHandler(event, context)
        }
    }

    /** 根据事件类型获取处理器方法名称 */
    const getHandlerNameByEventType = (eventType: string): keyof SSEEventHandlers => {
        const handlerMap: Record<string, keyof SSEEventHandlers> = {
            [EventType.STARTED]: 'onStarted',
            [EventType.THINKING]: 'onThinking',
            [EventType.ACTION]: 'onAction',
            [EventType.ACTING]: 'onActing',
            [EventType.OBSERVING]: 'onObserving',
            [EventType.COLLABORATING]: 'onCollaborating',
            [EventType.EXECUTING]: 'onExecuting',
            [EventType.TOOL]: 'onTool',
            [EventType.TOOL_APPROVAL]: 'onToolApproval',
            [EventType.INTERACTION]: 'onInteraction',
            [EventType.PARTIAL_RESULT]: 'onPartialResult',
            [EventType.PROGRESS]: 'onProgress',
            [EventType.DONE]: 'onDone',
            [EventType.DONEWITHWARNING]: 'onDoneWithWarning',
            [EventType.ERROR]: 'onError',
            [EventType.COMPLETED]: 'onCompleted',
            // ReActPlus 专属事件类型
            [EventType.TASK_ANALYSIS]: 'onTaskAnalysis',
            [EventType.THOUGHT]: 'onThought',
            [EventType.INIT_PLAN]: 'onInitPlan',
            [EventType.UPDATE_PLAN]: 'onUpdatePlan',
            [EventType.ADVANCE_PLAN]: 'onAdvancePlan'
        }

        return handlerMap[eventType] || 'onDefault'
    }

    // === 通用 Agent 执行器 ===

    /**
     * 通用的 Agent 执行方法
     * @param text 用户输入文本
     * @param sessionId 会话ID
     * @param agentOptions Agent配置选项
     */
    const executeAgent = async (
        text: string,
        sessionId: string,
        agentOptions: AgentExecuteOptions
    ): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            // 动态 import，避免在 SSR 或测试环境报错
            import('sse.js')
                .then(({SSE}) => {
                    currentTaskTitle.value = text || ''
                    // 启动新任务时清理进度
                    progress.value = null

                    const defaultHeaders = {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                        'Cache-Control': 'no-cache',
                    }

                    const source = new SSE(agentOptions.endpoint, {
                        method: agentOptions.method || 'POST',
                        headers: { ...defaultHeaders, ...(agentOptions.headers || {}) },
                        payload: agentOptions.payload ? JSON.stringify(agentOptions.payload) : undefined,
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

                    // === 重要：使用新的事件分发机制 ===

                    /** 创建事件监听器的工厂函数 */
                    const createEventListener = (eventName: string) => (messageEvent: MessageEvent) => {
                        if (!messageEvent?.data) return
                        try {
                            const event = JSON.parse(messageEvent.data) as BaseEventItem
                            handleEvent(event, source)
                        } catch (e) {
                            console.error(`Failed to parse ${eventName} event:`, e)
                        }
                    }

                    // 为每个事件类型创建专属的监听器函数


                    const onStarted = createEventListener('STARTED')
                    const onProgress = createEventListener('PROGRESS')
                    const onAgentSelected = createEventListener('AGENT_SELECTED')
                    const onThinking = createEventListener('THINKING')
                    const onAction = createEventListener('ACTION')
                    const onActing = createEventListener('ACTING')
                    const onObserving = createEventListener('OBSERVING')
                    const onCollaborating = createEventListener('COLLABORATING')
                    const onPartialResult = createEventListener('PARTIAL_RESULT')
                    const onDone = createEventListener('DONE')
                    const onExecuting = createEventListener('EXECUTING')
                    const onError = createEventListener('ERROR')
                    const onTool = createEventListener('TOOL')
                    const onDoneWithWarning = createEventListener('DONEWITHWARNING')
                    const onToolApproval = createEventListener('TOOL_APPROVAL')
                    const onInteraction = createEventListener('INTERACTION')
                    const onCompleted = createEventListener('COMPLETED')

                    // ReActPlus 专属事件监听器
                    const onTaskAnalysis = createEventListener('TASK_ANALYSIS')
                    const onThought = createEventListener('THOUGHT')
                    const onInitPlan = createEventListener('INIT_PLAN')
                    const onUpdatePlan = createEventListener('UPDATE_PLAN')
                    const onAdvancePlan = createEventListener('ADVANCE_PLAN')

                    // 监听所有可能的事件类型，每个事件使用专属的监听器
                    source.addEventListener('message', onExecuting)
                    source.addEventListener('STARTED', onStarted)
                    source.addEventListener('PROGRESS', onProgress)
                    source.addEventListener('AGENT_SELECTED', onAgentSelected)
                    source.addEventListener('THINKING', onThinking)
                    source.addEventListener('ACTION', onAction)
                    source.addEventListener('ACTING', onActing)
                    source.addEventListener('OBSERVING', onObserving)
                    source.addEventListener('COLLABORATING', onCollaborating)
                    source.addEventListener('PARTIAL_RESULT', onPartialResult)
                    source.addEventListener('DONE', onDone)
                    source.addEventListener('EXECUTING', onExecuting)
                    source.addEventListener('ERROR', onError)
                    source.addEventListener('TOOL', onTool)
                    source.addEventListener('DONEWITHWARNING', onDoneWithWarning)
                    source.addEventListener('TOOL_APPROVAL', onToolApproval)
                    source.addEventListener('INTERACTION', onInteraction)
                    source.addEventListener('COMPLETED', onCompleted)

                    // 监听 ReActPlus 专属事件
                    source.addEventListener('TASK_ANALYSIS', onTaskAnalysis)
                    source.addEventListener('THOUGHT', onThought)
                    source.addEventListener('INIT_PLAN', onInitPlan)
                    source.addEventListener('UPDATE_PLAN', onUpdatePlan)
                    source.addEventListener('ADVANCE_PLAN', onAdvancePlan)

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

    /**
     * 执行ReAct智能体
     * @param text 用户输入文本
     * @param sessionId 会话ID
     */
    const executeReAct = async (text: string, sessionId: string): Promise<void> => {
        return executeAgent(text, sessionId, {
            agentType: 'ReAct',
            endpoint: '/api/agent/chat/react/stream',
            method: 'POST',
            payload: {
                message: text,
                userId: 'user-001',
                sessionId,
                agentType: 'ReAct',
            }
        })
    }
    /**
     * 执行ReActPlus智能体
     * @param text 用户输入文本
     * @param sessionId 会话ID
     */
    const executeReActPlus = async (text: string, sessionId: string): Promise<void> => {
        return executeAgent(text, sessionId, {
            agentType: 'ReAct',
            endpoint: '/api/agent/chat/react-plus/stream',
            method: 'POST',
            payload: {
                message: text,
                userId: 'user-001',
                sessionId,
                agentType: 'ReAct',
            }
        })
    }



    // === 返回接口 ===
    return {
        // 状态数据（保持不变，确保向后兼容）
        messages,
        nodeIndex,
        connectionStatus,
        taskStatus,
        progress,

        // 执行方法（重构后的新接口）
        executeAgent,          // 新增：通用 Agent 执行方法
        executeReAct,          // 保留：向后兼容的快捷方法
        executeReActPlus,          // 保留：向后兼容的快捷方法

        // 事件处理（新增，修复ReActPlus的handleEvent问题）
        handleEvent,           // 新增：手动处理SSE事件的方法
        updateMessage,         // 新增：手动更新消息的方法

        // 工具函数（新增）
        createContext,         // 新增：创建SSE上下文的方法
    }
}
