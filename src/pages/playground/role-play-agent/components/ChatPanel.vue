<template>
  <div class="chat-layout">
    <section class="chat-panel">
      <div class="chat-shell">
        <header class="chat-header">
          <div class="chat-title">文本对话</div>
          <div class="chat-subtitle">实时记录你与角色之间的每一句交流</div>
        </header>

        <div class="messages" ref="messagesRef">
          <div class="empty" v-if="!messages.length">暂无消息，开始对话吧～</div>
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="msg"
            :class="m.role"
          >
            <div class="msg-meta">
              <span class="sender">{{ m.role === 'user' ? '你' : 'AI' }}</span>
            </div>
            <div class="bubble" :class="m.role">
              <div class="bubble-text">{{ m.content }}</div>
            </div>
          </div>
        </div>

        <footer class="composer">
          <a-input-search
            v-model:value="draft"
            :enter-button="'发送'"
            @search="send"
            placeholder="来说点什么..."
          />
        </footer>
      </div>
    </section>

    <aside class="chat-side">
      <a-card class="record-card" bordered="false">
        <div class="record-header">
          <div class="record-title">
            <span>录音调试</span>
            <a-tag v-if="recordTest?.active" color="#5b77ff">进行中</a-tag>
          </div>
          <div class="record-hint">确保麦克风状态可用，录制链路通畅。</div>
        </div>

        <div v-if="recordTest" class="record-body">
          <div class="record-status" :class="{ active: recordTest.active }">
            <span class="status-light"></span>
            <div class="status-text">
              <span v-if="recordTest.active">{{ `录音测试进行中 · ${recordTest.duration.toFixed(1)}s` }}</span>
              <span v-else-if="recordTest.lastCheckAt">最近一次测试：{{ recordTest.lastCheckAt }}</span>
              <span v-else>尚未进行录音测试</span>
            </div>
          </div>

          <a-space direction="vertical" style="width:100%">
            <a-button type="primary" block :disabled="recordTest.active" @click="onStart">
              开始 5 秒录音测试
            </a-button>
            <a-button block danger :disabled="!recordTest.active" @click="onStop">
              手动停止
            </a-button>
          </a-space>

          <div class="record-preview" v-if="recordTest.audioUrl">
            <audio :src="recordTest.audioUrl" controls style="width: 100%;"></audio>
            <div class="record-info">
              <div>音频块：{{ recordTest.chunkCount }} 个</div>
              <div>总样本数：{{ recordTest.totalSamples }}</div>
              <div>总字节数：{{ recordTest.totalBytes }}</div>
            </div>
          </div>

          <a-alert
              v-else-if="!recordTest.active && recordTest.lastCheckAt"
              type="warning"
              show-icon
              message="未捕获到任何音频数据，请检查麦克风权限或输入设备。"
          />
          <div class="record-preview-placeholder" v-else>
            <div class="placeholder-content">
              <div class="placeholder-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="#F0F6FF"/>
                  <path d="M20 16L20 32" stroke="#8AA4FF" stroke-width="2" stroke-linecap="round"/>
                  <path d="M28 16L28 32" stroke="#8AA4FF" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="placeholder-text">
                <h3 v-if="recordTest.active">正在录音...</h3>
                <h3 v-else>等待音频数据</h3>
                <p>音频数据将在此处播放</p>
              </div>
            </div>
          </div>

        </div>

        <div v-else class="record-placeholder">
          <div class="placeholder-content">
            <div class="placeholder-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="20" fill="#F0F6FF"/>
                <path d="M24 34C29.5228 34 34 29.5228 34 24C34 18.4772 29.5228 14 24 14C18.4772 14 14 18.4772 14 24C14 29.5228 18.4772 34 24 34Z" stroke="#8AA4FF" stroke-width="2"/>
                <path d="M20 24L23 27L28 21" stroke="#8AA4FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="placeholder-text">
              <h3>录音测试功能</h3>
              <p>加载中...</p>
            </div>
          </div>
        </div>
      </a-card>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch, watchEffect } from 'vue'

interface Message { role: 'user' | 'agent'; content: string }

interface RecordTestState {
  active: boolean
  lastCheckAt: string
  duration: number
  audioUrl: string | null
  chunkCount: number
  totalSamples: number
  totalBytes: number
}

const props = defineProps<{
  sessionId: string
  recordTest?: RecordTestState
  onStartTest?: () => void
  onStopTest?: () => void
}>()

const messages = ref<Message[]>([])
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)

watchEffect(() => {
  // 占位：当 sessionId 变化时，可在此加载历史
  void props.sessionId
})

watch(messages, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
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

const onStart = () => {
  if (props.onStartTest) props.onStartTest()
}

const onStop = () => {
  if (props.onStopTest) props.onStopTest()
}
</script>

<style scoped lang="scss">
.chat-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: stretch;
  height: 100%;
}

.chat-panel {
  border-radius: 20px;
  box-shadow: 0 26px 40px rgba(24, 52, 133, 0.12);
  overflow: hidden;
  background: linear-gradient(180deg, rgba(240, 246, 255, 0.9), #ffffff 60%);
  border: 1px solid rgba(174, 191, 242, 0.24);
}

.chat-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 520px;
  background: rgba(255, 255, 255, 0.82);
}

.chat-header {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-title {
  font-size: 18px;
  font-weight: 700;
  color: #1c2358;
}

.chat-subtitle {
  font-size: 13px;
  color: #5a6592;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 24px 8px;
  scrollbar-width: thin;
}

.empty {
  color: #8893c2;
  font-size: 14px;
  text-align: center;
  padding: 80px 0;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 78%;
}

.msg.user {
  align-self: flex-end;
  text-align: right;
}

.msg.agent {
  align-self: flex-start;
}

.msg.user .msg-meta {
  justify-content: flex-end;
}

.msg-meta {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: #7a86be;
}

.sender {
  font-weight: 600;
  letter-spacing: .2px;
}

.bubble {
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.55;
  box-shadow: 0 16px 30px rgba(35, 63, 148, 0.08);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(142, 160, 215, 0.2);
  color: #1f2558;
  background: rgba(255, 255, 255, 0.75);
}

.bubble.user {
  background: linear-gradient(135deg, rgba(129, 211, 255, 0.26), rgba(99, 162, 255, 0.24));
  color: #124b73;
  border-color: rgba(99, 162, 255, 0.28);
}

.bubble.agent {
  background: linear-gradient(135deg, rgba(142, 233, 208, 0.24), rgba(97, 204, 169, 0.18));
  color: #0b5d4d;
  border-color: rgba(97, 204, 169, 0.22);
}

.composer {
  padding: 8px 24px 24px;
  display: flex;
}

.composer :deep(.ant-input) {
  padding: 12px 16px;
  font-size: 14px;
}

.composer :deep(.ant-btn) {
  border-radius: 0 14px 14px 0;
  padding: 0 18px;
  height: 46px;
}

.composer :deep(.ant-input-search-button) {
  height: 46px;
}

.chat-side {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.record-card {
  border-radius: 18px;
  box-shadow: 0 20px 36px rgba(24, 52, 133, 0.12);
  padding: 20px;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.record-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2558;
}

.record-hint {
  font-size: 13px;
  color: #6b78a9;
}

.record-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(92, 114, 205, 0.08);
  border: 1px solid rgba(92, 114, 205, 0.18);
}

.record-status.active {
  background: rgba(92, 114, 205, 0.14);
  border-color: rgba(92, 114, 205, 0.28);
}

.status-light {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #8aa4ff;
  box-shadow: 0 0 0 4px rgba(138, 164, 255, 0.22);
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #4a5586;
}

.record-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(237, 243, 255, 0.6);
}

.record-info {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: #566296;
}

.record-preview-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px 12px;
  border-radius: 12px;
  background: rgba(237, 243, 255, 0.6);
  min-height: 120px;
}

.record-preview-placeholder .placeholder-content {
  text-align: center;
  color: #8893c2;
}

.record-preview-placeholder .placeholder-icon {
  margin-bottom: 16px;
}

.record-preview-placeholder .placeholder-text h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #5a6592;
}

.record-preview-placeholder .placeholder-text p {
  margin: 0;
  font-size: 14px;
  color: #8893c2;
}

@media (max-width: 1024px) {
  .chat-layout {
    grid-template-columns: 1fr;
  }

  .chat-side {
    order: -1;
  }
}
</style>
