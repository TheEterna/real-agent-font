import { ref } from 'vue'
import { AgentType } from '@/types/agents'
import type { UIMessage } from '@/types/events'

export function useChatStore() {
  return store
}

const sessionId = ref<string>(`session-${Date.now()}`)
const selectedTag = ref<AgentType>(AgentType.ReAct)
const sessions = ref<Array<{ id: string; title: string; updatedAt: Date }>>([
  { id: sessionId.value, title: '新对话', updatedAt: new Date() }
])
const messagesBySession = ref<Record<string, UIMessage[]>>({ [sessionId.value]: [] })

const switchConversation = (id: string) => {
  if (sessionId.value === id) return
  sessionId.value = id
}

const newConversation = () => {
  const id = `session-${Date.now()}`
  sessions.value.unshift({ id, title: '新对话', updatedAt: new Date() })
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
  }
}
