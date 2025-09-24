<script setup lang="ts">
import { computed } from 'vue'
import ToolBox from './ToolBox.vue'
import { defineAsyncComponent } from 'vue'
import { UIMessage, EventType, MessageType } from '@/types/events'
const MarkdownViewer = defineAsyncComponent(() => import('./MarkdownViewer.vue'))
const ToolApprovalCard = defineAsyncComponent(() => import('./ToolApprovalCard.vue'))

const props = defineProps<{
  message: UIMessage
}>()

const toolEvents = computed(() => {
  const events = (props.message as any)?.events as Array<any> | undefined
  if (!events || !events.length) return []
  return events.filter(e => e?.type === EventType.TOOL)
})

// 通用渲染辅助
const pretty = (v: unknown) => {
  try { return JSON.stringify(v, null, 2) } catch { return String(v as any) }
}
const isObject = (v: unknown) => v !== null && typeof v === 'object'

// 主题样式需要的语义类名：thinking/action/observing/tool/error/completed/system/user
const messageCssClass = computed(() => {
  const mes = props.message
  if (mes.type === MessageType.Tool) return 'tool'
  if (mes.type === MessageType.ToolApproval) return 'tool_approval'
  if (mes.isCompletion) return 'completed'
  if (mes.eventType === EventType.PROGRESS) return 'progress'
  if (mes.eventType === EventType.DONEWITHWARNING) return 'warning'
  if (mes.type === MessageType.Error) {
    return 'error'
  }
  if (mes.type === MessageType.System) return 'system'
  if (mes.type === MessageType.User) return 'user'
  if (mes.type === MessageType.Assistant) {
    switch (mes.eventType) {
      case EventType.THINKING: return 'thinking'
      case EventType.ACTING: return 'action'
      case EventType.OBSERVING: return 'observing'
      default: return 'assistant'
    }
  }
  return String(mes.type || '').toLowerCase()
})

// 安全的时间格式化，兼容 undefined / Date / string
const formatTime = (ts?: Date | string) => {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div :class="['message', messageCssClass]">
    <div v-if="props.message.type !== MessageType.User" class="message-header">
      <span class="sender">{{ props.message.sender }}</span>
      <span class="timestamp">{{ formatTime((props.message as any).timestamp) }}</span>
    </div>

    <div class="message-body">
      <!-- 工具消息：通用结构化渲染 -->
      <template v-if="props.message.type === MessageType.Tool">
        <div v-if="props.message.data" class="tool-data">
          <div v-if="Array.isArray((props.message as any).data)" class="tool-grid">
            <div v-for="(item, idx) in (props.message as any).data" :key="idx" class="tool-card">
              <div class="tool-card-title">{{ (item && (item.title || item.name)) ? (item.title || item.name) : `项目 #${idx + 1}` }}</div>
              <div v-for="(val, key) in item" :key="String(key)" class="tool-card-row">
                <template v-if="isObject(val)">
                  <div><strong>{{ key }}</strong></div>
                  <pre class="tool-json" style="margin-top:4px">{{ pretty(val) }}</pre>
                </template>
                <template v-else>
                  {{ key }}：{{ val }}
                </template>
              </div>
            </div>
          </div>
          <template v-else>
            <pre v-if="isObject((props.message as any).data)" class="tool-json">{{ pretty((props.message as any).data) }}</pre>
            <pre v-else class="tool-json">{{ String((props.message as any).data ?? '') }}</pre>
          </template>
        </div>
      </template>

      

      <!-- 工具审批 -->
      <div v-else-if="props.message.type === MessageType.ToolApproval">
        <ToolApprovalCard :approval="(props.message as any).approval" />
      </div>

      <!-- 其他：默认按 Markdown 渲染正文 -->
      <div v-else class="normal-message">
        <div class="message-text">
          <MarkdownViewer :message="props.message.message" />
        </div>
      </div>
    </div>

    <!-- 嵌入：若该消息节点包含 TOOL 事件，则在同一消息框内追加工具框列表 -->
    <div v-if="toolEvents.length" class="embedded-tools">
      <ToolBox v-for="(ev, i) in toolEvents" :key="i" :title="(ev?.message || '工具调用')" :message="ev?.details || ev?.data || ''" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/_variables.scss" as *;
.message { margin-bottom: 1rem; padding: 1.1rem; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06); }
.message.thinking { background: #fff3e0; border-left: 4px solid #ff9800; }
.message.action { background: #e8f5e8; border-left: 4px solid #4caf50; }
.message.observing { background: #f3e5f5; border-left: 4px solid #9c27b0; }
.message.error { background: #ffebee; border-left: 4px solid #f44336; }
.message.completed { background: #e8f5e8; border-left: 4px solid #4caf50; border-radius: 8px; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2); }
.message.progress { background: #fffbea; border-left: 4px solid #f6c342; }
.message.warning { background: #fff8e1; border-left: 4px solid #ffb300; }
.message.tool { background: #e3f2fd; border-left: 4px solid #42a5f5; }
/* 用户消息：右侧简洁气泡样式（朴素） */
.message.user { background: #ffffff; border: 1px solid #e5e7eb; margin-left: auto; max-width: 88%; width: fit-content; box-shadow: none; border-radius: 12px; }
.message.user .message-header { flex-direction: row-reverse; }
.message.user .sender { color: #1e88e5; }
.message-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; color: #666; }
.sender { font-weight: 500; }
.message-message { line-height: 1.6; }
.stream-message .thinking-message,
.stream-message .action-message,
.stream-message .observing-message,
.stream-message .completion-message { display: flex; align-items: flex-start; gap: 0.75rem; }
.embedded-tools { display: grid; gap: 8px; margin-top: 8px; }
.tool-data { margin-top: 10px; }
.tool-grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 768px) { .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tool-card { background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 12px; padding: 12px 14px; box-shadow: 0 2px 8px rgba(0,0,0,.05); }
.tool-card-title { font-weight: 600; margin-bottom: 6px; color: #333; }
.tool-card-row { font-size: 13px; color: #444; line-height: 1.6; }
.tool-json { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 10px; overflow: auto; font-size: 12px; }
.message-text { flex: 1; line-height: 1.6; margin-bottom: -1em; }
.formatted-message { background: transparent; padding: 0; margin: 0; font-family: inherit; white-space: pre-wrap; word-wrap: break-word; border: none; }
.completion-text { font-weight: 500; color: #2e7d32; }
.completion-message { animation: slideInUp 0.3s ease-out; }
.icon-thinking::before { content: '🤔'; }
.icon-action::before { content: '🛠️'; }
.icon-observing::before { content: '👀'; }
.icon-completed::before { content: '✅'; }
.icon-progress::before { content: '⏳'; }

/* 状态气泡（进度） */
.status-bubble { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #fff8e1; border: 1px solid #ffe082; }
.status-bubble.progress { background: #fff8e1; border-color: #ffd54f; }
.status-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.status-bubble.progress .status-icon { animation: spin 1s linear infinite; }
.status-content { display: grid; gap: 2px; }
.status-title { font-weight: 600; color: #8d6e63; font-size: 0.85rem; }
.status-text { font-size: 0.95rem; color: #5d4037; white-space: pre-wrap; }
.status-meta { font-size: 0.75rem; color: #8d6e63; }
.icon-warning::before { content: '⚠️'; }
@keyframes slideInUp { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: translateY(0);} }
@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
</style>
