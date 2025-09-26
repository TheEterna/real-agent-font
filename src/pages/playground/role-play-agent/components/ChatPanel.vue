<template>
  <a-card :bordered="true" class="chat-panel">
    <div class="messages">
      <div class="empty" v-if="!messages.length">暂无消息，开始对话吧～</div>
      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">{{ m.content }}</div>
      </div>
    </div>
    <div class="composer">
      <a-input-search v-model:value="draft" :enter-button="'发送'" @search="send" placeholder="来说点什么..." />
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'

interface Message { role: 'user' | 'agent'; content: string }

const props = defineProps<{ sessionId: string }>()

const messages = ref<Message[]>([])
const draft = ref('')

watchEffect(() => {
  // 占位：当 sessionId 变化时，可在此加载历史
  void props.sessionId
})

function send() {
  if (!draft.value.trim()) return
  messages.value.push({ role: 'user', content: draft.value })
  // 占位：这里应调用后端并流式返回
  setTimeout(() => {
    messages.value.push({ role: 'agent', content: '（示例回复）收到：' + draft.value })
  }, 300)
  draft.value = ''
}
</script>

<style scoped lang="scss">
.chat-panel { display:flex; flex-direction:column; gap:12px; height:100%; }
.messages { flex:1; overflow:auto; display:grid; gap:8px; padding:8px; background:#fff; border:1px solid #eef2f7; border-radius:8px; }
.msg { display:flex; }
.msg.user { justify-content:flex-end; }
.msg.agent { justify-content:flex-start; }
.bubble { max-width:72%; padding:8px 10px; border-radius:10px; background:#f6f9ff; border:1px solid #e6eaf0; }
.msg.user .bubble { background:#f5faff; border-color:#d6e6ff; }
.empty{ color:#999; font-size:13px; }
.composer { }
</style>
