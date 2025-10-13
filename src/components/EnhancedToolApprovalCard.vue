<template>
  <div class="tool-approval-card">
    <!-- 卡片头部 -->
    <div class="tool-approval-header">
      <div class="tool-approval-icon">
        <i class="icon-tools">🔧</i>
      </div>
      <div class="tool-approval-title">
        <h3>工具执行审批</h3>
        <p>{{ approval?.toolName || '未知工具' }}</p>
      </div>
      <div class="tool-approval-status" :class="statusClass">
        {{ statusText }}
      </div>
    </div>

    <!-- 卡片内容 -->
    <div class="tool-approval-content">
      <!-- 工具信息 -->
      <div class="tool-info-section">
        <h4>工具信息</h4>
        <div class="tool-info-grid">
          <div class="info-item">
            <label>工具名称：</label>
            <span>{{ approval?.toolName || '未指定' }}</span>
          </div>
          <div class="info-item">
            <label>调用时间：</label>
            <span>{{ formatTime(new Date()) }}</span>
          </div>
          <div class="info-item">
            <label>会话ID：</label>
            <span>{{ sessionId || 'N/A' }}</span>
          </div>
        </div>
      </div>

      <!-- 参数详情 -->
      <div class="tool-params-section" v-if="approval?.args">
        <h4>
          <span>执行参数</span>
          <a-button size="small" type="text" @click="toggleParamsView">
            {{ showRawParams ? '格式化视图' : '原始视图' }}
          </a-button>
        </h4>

        <div class="tool-params" v-if="!showRawParams">
          <div class="params-grid">
            <div
              v-for="(value, key) in approval.args"
              :key="key"
              class="param-item"
            >
              <div class="param-key">{{ key }}</div>
              <div class="param-value" :class="getValueTypeClass(value)">
                <span v-if="typeof value === 'string'" class="value-string">"{{ value }}"</span>
                <span v-else-if="typeof value === 'number'" class="value-number">{{ value }}</span>
                <span v-else-if="typeof value === 'boolean'" class="value-boolean">{{ value }}</span>
                <div v-else class="value-object">{{ formatValue(value) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="tool-params raw-params" v-else>
          <pre><code>{{ formatJSON(approval.args) }}</code></pre>
        </div>
      </div>

      <!-- 风险评估 -->
      <div class="risk-assessment" v-if="riskLevel">
        <h4>风险评估</h4>
        <div class="risk-indicator" :class="riskLevel.class">
          <div class="risk-icon">{{ riskLevel.icon }}</div>
          <div class="risk-content">
            <div class="risk-title">{{ riskLevel.title }}</div>
            <div class="risk-description">{{ riskLevel.description }}</div>
          </div>
        </div>
      </div>

      <!-- 预期结果 -->
      <div class="expected-result" v-if="expectedResult">
        <h4>预期执行结果</h4>
        <div class="expected-content">
          <p>{{ expectedResult }}</p>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="tool-approval-actions">
      <a-button
        class="approval-btn-secondary"
        @click="openInTools"
        :disabled="executing"
      >
        <template #icon><i>🔍</i></template>
        详细信息
      </a-button>

      <a-button
        class="approval-btn-danger"
        @click="onReject"
        :disabled="executing"
      >
        <template #icon><i>❌</i></template>
        拒绝执行
      </a-button>

      <a-button
        class="approval-btn-primary"
        @click="onApprove"
        :loading="executing"
      >
        <template #icon><i>✓</i></template>
        {{ executing ? '执行中...' : '批准执行' }}
      </a-button>
    </div>

    <!-- 执行状态 -->
    <div v-if="statusMsg" class="execution-status" :class="executionStatusClass">
      <div class="status-icon">
        <i v-if="executing">⏳</i>
        <i v-else-if="executionSuccess">✅</i>
        <i v-else-if="executionError">❌</i>
        <i v-else>ℹ️</i>
      </div>
      <div class="status-text">{{ statusMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { approveExecute } from '@/services/tools'

interface ToolApproval {
  toolName?: string
  args?: Record<string, any>
  callId?: string
  riskLevel?: 'low' | 'medium' | 'high'
  expectedResult?: string
}

const props = defineProps<{
  approval: ToolApproval
  sessionId?: string
}>()

const emit = defineEmits<{
  approved: [result: any]
  rejected: [reason: string]
  error: [error: Error]
}>()

const { t } = useI18n()
const router = useRouter()

// 状态管理
const executing = ref(false)
const statusMsg = ref('')
const executionSuccess = ref(false)
const executionError = ref(false)
const showRawParams = ref(false)

// 计算属性
const statusClass = computed(() => ({
  'status-pending': !executing.value && !executionSuccess.value && !executionError.value,
  'status-executing': executing.value,
  'status-success': executionSuccess.value,
  'status-error': executionError.value
}))

const statusText = computed(() => {
  if (executing.value) return '执行中'
  if (executionSuccess.value) return '执行成功'
  if (executionError.value) return '执行失败'
  return '等待审批'
})

const executionStatusClass = computed(() => ({
  'status-executing': executing.value,
  'status-success': executionSuccess.value && !executing.value,
  'status-error': executionError.value && !executing.value,
  'status-info': !executing.value && !executionSuccess.value && !executionError.value
}))

const riskLevel = computed(() => {
  const level = props.approval?.riskLevel || 'medium'
  const riskMap = {
    low: {
      class: 'risk-low',
      icon: '🟢',
      title: '低风险操作',
      description: '该操作相对安全，不会对系统造成重大影响'
    },
    medium: {
      class: 'risk-medium',
      icon: '🟡',
      title: '中等风险操作',
      description: '该操作可能会对系统或数据产生一定影响，请仔细确认'
    },
    high: {
      class: 'risk-high',
      icon: '🔴',
      title: '高风险操作',
      description: '该操作存在较高风险，可能会对系统造成重大影响或不可逆的变更'
    }
  }
  return riskMap[level]
})

const expectedResult = computed(() => {
  return props.approval?.expectedResult || '执行该工具以获取相应结果'
})

// 工具函数
const formatTime = (date: Date) => {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatJSON = (obj: any) => {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const formatValue = (value: any) => {
  if (Array.isArray(value)) {
    return `[${value.length} items]`
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).length} properties}`
  }
  return String(value)
}

const getValueTypeClass = (value: any) => {
  const type = typeof value
  return {
    'type-string': type === 'string',
    'type-number': type === 'number',
    'type-boolean': type === 'boolean',
    'type-object': type === 'object',
    'type-null': value === null,
    'type-undefined': type === 'undefined'
  }
}

const toggleParamsView = () => {
  showRawParams.value = !showRawParams.value
}

// 事件处理
const onApprove = async () => {
  if (!props.approval?.toolName) {
    statusMsg.value = '错误：未指定工具名称'
    executionError.value = true
    return
  }

  executing.value = true
  executionError.value = false
  executionSuccess.value = false
  statusMsg.value = '正在执行工具调用...'

  try {
    const result = await approveExecute(
      props.approval.toolName,
      props.approval.args || {}
    )

    statusMsg.value = '工具执行成功！'
    executionSuccess.value = true
    emit('approved', result)
  } catch (error: any) {
    statusMsg.value = `执行失败: ${error?.message || '未知错误'}`
    executionError.value = true
    emit('error', error)
  } finally {
    executing.value = false
  }
}

const onReject = () => {
  statusMsg.value = '用户拒绝执行该工具'
  emit('rejected', '用户手动拒绝')
}

const openInTools = () => {
  const query: any = {}
  if (props.approval?.toolName) query.toolName = props.approval.toolName
  if (props.approval?.args) {
    query.args = encodeURIComponent(JSON.stringify(props.approval.args))
  }
  router.push({ path: '/tools', query }).catch(() => {})
}
</script>

<style scoped>
/* 基础样式已在 react-plus.css 中定义，这里添加组件特有样式 */

.tool-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-item span {
  font-size: 14px;
  color: #374151;
  font-family: 'SF Mono', Consolas, monospace;
}

.tool-params-section h4,
.tool-info-section h4,
.risk-assessment h4,
.expected-result h4 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

.params-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.param-key {
  flex: 0 0 120px;
  font-size: 13px;
  font-weight: 600;
  color: #6366f1;
}

.param-value {
  flex: 1;
  font-size: 13px;
  font-family: 'SF Mono', Consolas, monospace;
}

.value-string { color: #059669; }
.value-number { color: #dc2626; }
.value-boolean { color: #7c3aed; }
.value-object { color: #374151; }

.raw-params {
  margin-top: 8px;
}

.raw-params pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.risk-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  margin-top: 8px;
}

.risk-indicator.risk-low {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.risk-indicator.risk-medium {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.risk-indicator.risk-high {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.risk-icon {
  font-size: 20px;
}

.risk-content {
  flex: 1;
}

.risk-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}

.risk-description {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.expected-content {
  background: rgba(99, 102, 241, 0.05);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
}

.expected-content p {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.tool-approval-status {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-pending {
  background: rgba(156, 163, 175, 0.2);
  color: #6b7280;
  border: 1px solid rgba(156, 163, 175, 0.3);
}

.status-executing {
  background: rgba(245, 158, 11, 0.2);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-success {
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-error {
  background: rgba(239, 68, 68, 0.2);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.execution-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  margin-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0 0 16px 16px;
}

.status-icon {
  font-size: 16px;
}

.status-text {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.execution-status.status-success {
  background: rgba(16, 185, 129, 0.05);
  border-top-color: rgba(16, 185, 129, 0.2);
}

.execution-status.status-error {
  background: rgba(239, 68, 68, 0.05);
  border-top-color: rgba(239, 68, 68, 0.2);
}

.execution-status.status-executing {
  background: rgba(245, 158, 11, 0.05);
  border-top-color: rgba(245, 158, 11, 0.2);
}
</style>