import { ref } from 'vue'
import { AgentType } from '@/types/session'
import type { UIMessage } from '@/types/events'
import type { Session } from '@/types/session'

export function useChatStore() {
  return store
}

// Create 5 fixed test sessions
const fixedSessions: Session[] = [
  { id: 'session-1', title: 'ReAct 智能推理', agentType: AgentType.ReAct, updatedAt: new Date(2024, 0, 15, 10, 30, 0) },
  { id: 'session-2', title: 'ReAct+ 增强版', agentType: AgentType.ReAct_Plus, updatedAt: new Date(2024, 0, 14, 16, 45, 0) },
  { id: 'session-3', title: '代码开发助手', agentType: AgentType.ReAct, updatedAt: new Date(2024, 0, 13, 9, 20, 0) },
  { id: 'session-4', title: 'ReAct 数据分析', agentType: AgentType.ReAct, updatedAt: new Date(2024, 0, 12, 14, 15, 0) },
  { id: 'session-5', title: 'ReAct+ 深度学习', agentType: AgentType.ReAct_Plus, updatedAt: new Date(2024, 0, 11, 11, 0, 0) }
]

const sessionId = ref<string>(fixedSessions[0].id)
const selectedTag = ref<AgentType>(fixedSessions[0].agentType)
const sessions = ref<Session[]>(fixedSessions)
// Initialize message arrays for all sessions
const initialMessages: Record<string, UIMessage[]> = {}
fixedSessions.forEach(session => {
  initialMessages[session.id] = []
})
const messagesBySession = ref<Record<string, UIMessage[]>>(initialMessages)

const switchConversation = (id: string) => {
  if (sessionId.value === id) return
  sessionId.value = id
  // Update selectedTag based on session's agentType
  const session = sessions.value.find(s => s.id === id)
  if (session) {
    selectedTag.value = session.agentType
  }
}

const newConversation = (agentType: AgentType = AgentType.ReAct) => {
  const id = `session-${Date.now()}`
  const newSession: Session = {
    id,
    title: '新对话',
    agentType,
    updatedAt: new Date()
  }
  sessions.value.unshift(newSession)
  switchConversation(id)
  messagesBySession.value[id] = []
}

const selectTag = (tag: AgentType) => {
  selectedTag.value = tag
}

const store = {
  sessionId,
  selectedTag,
  sessions,
  messagesBySession,
  switchConversation,
  newConversation,
  selectTag,
  getSessionMessages(id: string): UIMessage[] { return messagesBySession.value[id] ? [...messagesBySession.value[id]] : [] },
  setSessionMessages(id: string, msgs: UIMessage[]) { messagesBySession.value[id] = [...msgs] },
  touchSession(id: string) {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      sessions.value[idx] = { ...sessions.value[idx], updatedAt: new Date() }
    }
  },
  // New methods for Agent-Session binding
  getCurrentSession(): Session | undefined {
    return sessions.value.find(s => s.id === sessionId.value)
  },
  getSessionsByAgent(agentType: AgentType): Session[] {
    return sessions.value.filter(s => s.agentType === agentType)
  },
  findOrCreateSessionForAgent(agentType: AgentType): string {
    // Try to find an existing session with this agent type
    const existingSessions = this.getSessionsByAgent(agentType)
    if (existingSessions.length > 0) {
      // Switch to the most recently updated session
      const mostRecentSession = existingSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
      this.switchConversation(mostRecentSession.id)
      return mostRecentSession.id
    } else {
      // Create new session for this agent
      this.newConversation(agentType)
      return sessionId.value
    }
  }
}

/**
 * Append a message into a session and touch its updated time.
 * Exported for convenience of simple views/components.
 */
export function appendMessage(id: string, msg: UIMessage) {
  const arr = messagesBySession.value[id] ?? []
  messagesBySession.value[id] = [...arr, msg]
  const idx = sessions.value.findIndex(s => s.id === id)
  if (idx >= 0) {
    sessions.value[idx] = { ...sessions.value[idx], updatedAt: new Date() }
  } else {
    // if session not exists, create a lightweight entry with default ReAct agent
    const newSession: Session = {
      id,
      title: '新对话',
      agentType: AgentType.ReAct,
      updatedAt: new Date()
    }
    sessions.value.unshift(newSession)
  }
}
