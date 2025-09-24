<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { AgentType } from '@/types/agents'

const chat = useChatStore()

const agentTags = [
  { label: 'ReAct', value: AgentType.ReAct, description: '推理-行动-观察框架' },
  { label: '代码编写', value: AgentType.Coding, description: '专业代码生成助手', disabled: true },
]

const isActive = (id: string) => chat.sessionId.value === id
</script>

<template>
  <div>
    <div class="sl-section">
      <div class="sl-title">会话</div>
      <div class="sl-conv-list">
        <div
          v-for="c in chat.sessions"
          :key="c.id"
          class="sl-conv-item"
          :class="{ active: isActive(c.id) }"
          @click="chat.switchConversation(c.id)"
        >
          <div class="sl-conv-title">{{ c.title }}</div>
          <div class="sl-conv-meta">{{ c.id }}</div>
        </div>
      </div>
      <button class="toolbar-btn" style="margin-top:8px" @click="chat.newConversation">新建会话</button>
    </div>

    <div class="sl-section">
      <div class="sl-title">Agent</div>
      <div class="sl-agents">
        <button
          v-for="tag in agentTags"
          :key="tag.value"
          class="sl-agent-btn"
          :class="{ active: chat.selectedTag.value === tag.value }"
          @click="chat.selectTag(tag.value)"
          :disabled="tag.disabled"
        >
          {{ tag.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/**** rely on global chat.css .sl-* styles ****/
</style>
