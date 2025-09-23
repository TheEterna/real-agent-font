<script setup lang="ts">
import { computed } from 'vue'
import ToolBox from './ToolBox.vue'
import { defineAsyncComponent } from 'vue'
import { UIMessage, EventType, MessageType } from '@/types/events'
const MarkdownViewer = defineAsyncComponent(() => import('./MarkdownViewer.vue'))
const ToolApprovalCard = defineAsyncComponent(() => import('./ToolApprovalCard.vue'))

const props = defineProps<{
  message: UIMessage
  renderMode: 'stream' | 'markdown' | 'json' | 'timeline'
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
  const m = props.message
  if (m.type === MessageType.Tool) return 'tool'
  if (m.type === MessageType.ToolApproval) return 'tool_approval'
  if (m.isCompletion) return 'completed'
  if (m.type === MessageType.Error) {
    if (m.eventType === EventType.DONEWITHWARNING) return 'warning'
    return 'error'
  }
  if (m.type === MessageType.System) return 'system'
  if (m.type === MessageType.User) return 'user'
  if (m.type === MessageType.Assistant) {
    switch (m.eventType) {
      case EventType.THINKING: return 'thinking'
      case EventType.ACTING: return 'action'
      case EventType.OBSERVING: return 'observing'
      default: return 'assistant'
    }
  }
  return String(m.type || '').toLowerCase()
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
    <div class="message-header">
      <span class="sender">{{ props.message.sender }}</span>
      <span class="timestamp">{{ formatTime((props.message as any).timestamp) }}</span>
    </div>

    <div class="message-">
      <div v-if="props.renderMode === 'stream'" class="stream-">
        <!-- TOOL 专用嵌入式框 -->
        <div v-if="props.message.type === MessageType.Tool">
          <!-- <ToolBox :title="props.message.message || '工具调用'" :="props.message.data" /> -->

          <!-- 通用结构化工具结果渲染：优先数组卡片，否则JSON美化/文本 -->
          <div v-if="props.message.data" class="tool-data">
            <!-- 数组：通用卡片渲染（不写死字段） -->
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

            <!-- 非数组：对象->JSON，美化；原始->文本 -->
            <template v-else>
              <pre v-if="isObject((props.message as any).data)" class="tool-json">{{ pretty((props.message as any).data) }}</pre>
              <pre v-else class="tool-json">{{ String((props.message as any).data ?? '') }}</pre>
            </template>
          </div>

          
        </div>

        <!-- TOOL APPROVAL -->
        <div v-else-if="props.message.type === MessageType.ToolApproval">
          <ToolApprovalCard :approval="(props.message as any).approval" />
        </div>

        <!-- THINKING -->
        <div v-else-if="props.message.type === MessageType.Assistant && props.message.eventType === EventType.THINKING" class="thinking-message">
          <i class="icon-thinking"></i>
          <div class="message-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- ACTION -->
        <div v-else-if="props.message.type === MessageType.Assistant && props.message.eventType === EventType.ACTING" class="action-message">
          <i class="icon-action"></i>
          <div class="message-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- OBSERVING -->
        <div v-else-if="props.message.type === MessageType.Assistant && props.message.eventType === EventType.OBSERVING" class="observing-message">
          <i class="icon-observing"></i>
          <div class="message-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- DONEWITHWARNING 作为警告完成 -->
        <div v-else-if="props.message.type === MessageType.Error && props.message.eventType === EventType.DONEWITHWARNING" class="warning-message">
          <i class="icon-warning"></i>
          <div class="message-text completion-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- COMPLETED -->
        <div v-else-if="props.message.isCompletion" class="completion-message">
          <i class="icon-completed"></i>
          <div class="message-text completion-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- 其他普通消息 -->
        <div v-else class="normal-message">
          <div class="message-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>

        <!-- 嵌入：若该消息节点包含 TOOL 事件，则在同一消息框内追加工具框列表 -->
        <div v-if="toolEvents.length" class="embedded-tools">
          <ToolBox v-for="(ev, i) in toolEvents" :key="i" :title="(ev?.message || '工具调用')" :="ev?.details || ev?.data || ''" />
        </div>
      </div>

      
      <!-- Markdown 模式：同样使用消息气泡样式包裹 -->
      <div v-else-if="props.renderMode === 'markdown'" class="stream-">
        <div class="normal-message">
          <div class="message-text">
            <MarkdownViewer :="props.message.message || ''" />
          </div>
        </div>

        <!-- 嵌入工具框（若有） -->
        <div v-if="toolEvents.length" class="embedded-tools">
          <ToolBox v-for="(ev, i) in toolEvents" :key="'md-'+i" :title="(ev?.message || '工具调用')" :="ev?.details || ev?.data || ''" />
        </div>
      </div>

      <div v-else-if="props.renderMode === 'json'" class="json-">
        <pre>{{ JSON.stringify(props.message, null, 2) }}</pre>
      </div>

      <div v-else-if="props.renderMode === 'timeline'" class="timeline-">
        <div class="timeline-item">
          <div class="timeline-marker"></div>
          <div class="timeline--inner">
            <strong>{{ (props.message.type || '').toUpperCase() }}</strong>
            <p>{{ props.message.message }}</p>
          </div>
        </div>
      </div>

      <!-- markdown 渲染交给上层，避免组件内引入大量依赖 -->
      <div v-else class="stream-">
        <div class="normal-message">
          <div class="message-text">
            <pre v-if="(props.message.message || '').includes('\n')" class="formatted-">{{ props.message.message }}</pre>
            <span v-else>{{ props.message.message }}</span>
          </div>
        </div>
      </div>
    </div>



  </div>
</template>

<style scoped>
.message { margin-bottom: 1rem; padding: 1rem; border-radius: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.message.thinking { background: #fff3e0; border-left: 4px solid #ff9800; }
.message.action { background: #e8f5e8; border-left: 4px solid #4caf50; }
.message.observing { background: #f3e5f5; border-left: 4px solid #9c27b0; }
.message.error { background: #ffebee; border-left: 4px solid #f44336; }
.message.completed { background: #e8f5e8; border-left: 4px solid #4caf50; border-radius: 8px; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2); }
.message.warning { background: #fff8e1; border-left: 4px solid #ffb300; }
.message.tool { background: #e3f2fd; border-left: 4px solid #42a5f5; }
.message-header { display: flex; justify-: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; color: #666; }
.sender { font-weight: 500; }
.message- { line-height: 1.6; }
.stream- .thinking-message,
.stream- .action-message,
.stream- .observing-message,
.stream- .completion-message { display: flex; align-items: flex-start; gap: 0.75rem; }
.embedded-tools { display: grid; gap: 8px; margin-top: 8px; }
.tool-data { margin-top: 10px; }
.tool-grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 768px) { .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tool-card { background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
.tool-card-title { font-weight: 600; margin-bottom: 6px; color: #333; }
.tool-card-row { font-size: 13px; color: #444; line-height: 1.6; }
.tool-json { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 10px; overflow: auto; font-size: 12px; }
.message-text { flex: 1; line-height: 1.6; }
.formatted- { background: transparent; padding: 0; margin: 0; font-family: inherit; white-space: pre-wrap; word-wrap: break-word; border: none; }
.completion-text { font-weight: 500; color: #2e7d32; }
.completion-message { animation: slideInUp 0.3s ease-out; }
.icon-thinking::before { : '🤔'; }
.icon-action::before { : '⚡'; }
.icon-observing::before { : '👁️'; }
.icon-completed::before { : '✅'; }
.icon-warning::before { : '⚠️'; }
@keyframes slideInUp { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: translateY(0);} }
</style>
