<template>
  <div
    ref="cardRef"
    class="enhanced-tool-approval-card theme-react-plus"
    :class="{ 'is-executing': executing, 'is-completed': completed }"
  >
    <!-- 青花瓷装饰边框 -->
    <div class="celadon-border"></div>

    <!-- 卡片头部 -->
    <div class="approval-header" ref="headerRef">
      <div class="header-icon" ref="iconRef">
        <div class="icon-ring"></div>
        <div class="icon-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L13.09 8.26L18 7L16.74 12L22 13.09L15.74 14.18L17 19L12 17.74L7 19L8.26 14.18L2 13.09L7.26 12L6 7L11 8.26L12 2Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <div class="icon-pulse"></div>
      </div>

      <div class="header-content">
        <h3 class="approval-title">🔧 工具执行审批</h3>
        <div class="tool-info">
          <span class="tool-name">{{ approval?.toolName || '未知工具' }}</span>
          <span class="risk-badge" :class="riskLevelClass">
            {{ riskLevelIcon }} {{ riskLevelText }}
          </span>
        </div>
      </div>

      <div class="status-indicator" :class="statusClass">
        <div class="status-dot"></div>
        <span class="status-text">{{ statusText }}</span>
      </div>
    </div>

    <!-- 工具详情（可折叠） -->
    <div class="approval-details" ref="detailsRef">
      <div class="details-toggle" @click="toggleDetails" ref="toggleRef">
        <span class="toggle-text">{{ showDetails ? '收起详情' : '查看详情' }}</span>
        <div class="toggle-icon" :class="{ expanded: showDetails }">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <Transition name="details-expand">
        <div v-show="showDetails" class="details-content" ref="contentRef">
          <!-- 执行参数 -->
          <div class="param-section" v-if="approval?.args">
            <h4 class="section-title">
              <span>执行参数</span>
              <a-button size="small" type="text" @click="toggleParamsView" class="view-toggle">
                {{ showRawParams ? '格式化视图' : '原始视图' }}
              </a-button>
            </h4>

            <div v-if="!showRawParams" class="params-formatted">
              <div class="param-grid">
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

            <div v-else class="params-raw">
              <pre><code>{{ formatJSON(approval.args) }}</code></pre>
            </div>
          </div>

          <!-- 预期结果 -->
          <div class="expected-section" v-if="expectedResult">
            <h4 class="section-title">预期执行结果</h4>
            <div class="expected-content">
              <p>{{ expectedResult }}</p>
            </div>
          </div>

          <!-- 风险评估 -->
          <div class="risk-section" v-if="riskLevel">
            <h4 class="section-title">风险评估</h4>
            <div class="risk-assessment" :class="riskLevel.class">
              <div class="risk-icon">{{ riskLevel.icon }}</div>
              <div class="risk-content">
                <div class="risk-title">{{ riskLevel.title }}</div>
                <div class="risk-description">{{ riskLevel.description }}</div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 理由输入区域 -->
    <Transition name="reason-expand">
      <div v-show="showReasonInput" class="reason-input-section" ref="reasonRef">
        <h4 class="section-title">请说明理由</h4>
        <a-textarea
          v-model:value="rejectionReason"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          placeholder="请详细说明拒绝执行的理由..."
          class="reason-textarea"
        />
      </div>
    </Transition>

    <!-- 操作按钮区域 -->
    <div class="approval-actions" ref="actionsRef">
      <!-- 第一排：主要操作 -->
      <div class="actions-primary">
        <a-button
          type="primary"
          size="large"
          @click="onJustDoIt"
          :disabled="executing || completed"
          :loading="currentAction === 'just-do-it'"
          class="action-btn action-approve"
          ref="justDoItBtn"
        >
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 10L3 7L2 8L6 12L14 4L13 3L6 10Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="currentColor"
              />
            </svg>
          </template>
          JUST DO IT
        </a-button>

        <a-button
          size="large"
          @click="onRetryExecution"
          :disabled="executing || completed"
          :loading="currentAction === 'retry'"
          class="action-btn action-retry"
          ref="retryBtn"
        >
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M1 4V10C1 11.1046 1.89543 12 3 12H9M1 4L4 1M1 4L4 7"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M15 12V6C15 4.89543 14.1046 4 13 4H7M15 12L12 15M15 12L12 9"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </template>
          重新执行
        </a-button>
      </div>

      <!-- 第二排：拒绝操作 -->
      <div class="actions-secondary">
        <a-button
          danger
          size="large"
          @click="onRejectWithReason"
          :disabled="executing || completed"
          :loading="currentAction === 'reject-reason'"
          class="action-btn action-reject"
          ref="rejectReasonBtn"
        >
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </template>
          拒绝并说明理由
        </a-button>

        <a-button
          danger
          size="large"
          @click="onRejectAndTerminate"
          :disabled="executing || completed"
          :loading="currentAction === 'reject-terminate'"
          class="action-btn action-terminate"
          ref="terminateBtn"
        >
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
              <path d="M10 6L6 10M6 6L10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </template>
          拒绝并终止对话
        </a-button>
      </div>
    </div>

    <!-- 执行状态反馈 -->
    <Transition name="status-slide">
      <div v-if="statusMsg" class="execution-feedback" :class="executionStatusClass" ref="statusRef">
        <div class="feedback-icon">
          <div v-if="executing" class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-dot"></div>
          </div>
          <div v-else-if="executionSuccess" class="success-icon">✅</div>
          <div v-else-if="executionError" class="error-icon">❌</div>
          <div v-else class="info-icon">ℹ️</div>
        </div>
        <div class="feedback-content">
          <div class="feedback-text">{{ statusMsg }}</div>
          <div v-if="executionDetails" class="feedback-details">{{ executionDetails }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { gsap } from 'gsap'

interface ToolApproval {
  toolName?: string
  args?: Record<string, any>
  callId?: string
  riskLevel?: 'low' | 'medium' | 'high'
  expectedResult?: string
  timestamp?: Date
}

type ApprovalAction = 'just-do-it' | 'retry' | 'reject-reason' | 'reject-terminate'

const props = defineProps<{
  approval: ToolApproval
  sessionId?: string
}>()

const emit = defineEmits<{
  approved: [result: any]
  rejected: [reason: string]
  error: [error: Error]
  retryRequested: [params: any]
  terminateRequested: [reason: string]
}>()

// DOM 引用
const cardRef = ref<HTMLElement>()
const headerRef = ref<HTMLElement>()
const iconRef = ref<HTMLElement>()
const detailsRef = ref<HTMLElement>()
const toggleRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const reasonRef = ref<HTMLElement>()
const actionsRef = ref<HTMLElement>()
const statusRef = ref<HTMLElement>()
const justDoItBtn = ref<HTMLElement>()
const retryBtn = ref<HTMLElement>()
const rejectReasonBtn = ref<HTMLElement>()
const terminateBtn = ref<HTMLElement>()

// 状态管理
const executing = ref(false)
const completed = ref(false)
const statusMsg = ref('')
const executionDetails = ref('')
const executionSuccess = ref(false)
const executionError = ref(false)
const currentAction = ref<ApprovalAction | null>(null)

// UI 状态
const showDetails = ref(false)
const showRawParams = ref(false)
const showReasonInput = ref(false)
const rejectionReason = ref('')

// 计算属性
const statusClass = computed(() => ({
  'status-pending': !executing.value && !executionSuccess.value && !executionError.value && !completed.value,
  'status-executing': executing.value,
  'status-success': executionSuccess.value && !executing.value,
  'status-error': executionError.value && !executing.value,
  'status-completed': completed.value
}))

const statusText = computed(() => {
  if (completed.value) return '已完成'
  if (executing.value) return '执行中'
  if (executionSuccess.value) return '执行成功'
  if (executionError.value) return '执行失败'
  return '等待审批'
})

const executionStatusClass = computed(() => ({
  'feedback-executing': executing.value,
  'feedback-success': executionSuccess.value && !executing.value,
  'feedback-error': executionError.value && !executing.value,
  'feedback-info': !executing.value && !executionSuccess.value && !executionError.value
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

const riskLevelClass = computed(() => `risk-${props.approval?.riskLevel || 'medium'}`)
const riskLevelIcon = computed(() => riskLevel.value.icon)
const riskLevelText = computed(() => riskLevel.value.title)

const expectedResult = computed(() => {
  return props.approval?.expectedResult || '执行该工具以获取相应结果'
})

// 工具函数
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

const toggleDetails = () => {
  showDetails.value = !showDetails.value

  // GSAP 动画：旋转图标
  if (toggleRef.value) {
    const icon = toggleRef.value.querySelector('.toggle-icon')
    gsap.to(icon, {
      rotation: showDetails.value ? 180 : 0,
      duration: 0.3,
      ease: "power2.out"
    })
  }
}

const toggleParamsView = () => {
  showRawParams.value = !showRawParams.value
}

// 动画函数
const animateCardEntry = () => {
  if (!cardRef.value) return

  gsap.fromTo(cardRef.value,
    {
      opacity: 0,
      y: 30,
      scale: 0.95
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.6,
      ease: "back.out(1.2)",
      clearProps: "all"
    }
  )
}

const animateIconPulse = () => {
  if (!iconRef.value) return

  const iconCenter = iconRef.value.querySelector('.icon-center')
  const iconRing = iconRef.value.querySelector('.icon-ring')
  const iconPulse = iconRef.value.querySelector('.icon-pulse')

  // 中心图标轻微旋转
  gsap.to(iconCenter, {
    rotation: 360,
    duration: 8,
    ease: "none",
    repeat: -1
  })

  // 外圈脉动
  gsap.to(iconRing, {
    scale: 1.2,
    opacity: 0.3,
    duration: 2,
    ease: "power2.inOut",
    repeat: -1,
    yoyo: true
  })

  // 脉冲效果
  gsap.to(iconPulse, {
    scale: 1.5,
    opacity: 0,
    duration: 1.5,
    ease: "power2.out",
    repeat: -1
  })
}

const animateButtonsEntry = () => {
  const buttons = [justDoItBtn.value, retryBtn.value, rejectReasonBtn.value, terminateBtn.value]
  
  // 获取真实的 DOM 元素
  const buttonEls = buttons
    .filter(Boolean)
    .map(btn => btn.$el || btn)

  gsap.fromTo(buttonEls,
    {
      opacity: 0,
      y: 20,
      scale: 0.9
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      stagger: 0.1,
      ease: "back.out(1.5)",
      clearProps: "all"
    }
  )
}

const animateButtonHover = (button: HTMLElement, isEnter: boolean) => {
  if (isEnter) {
    gsap.to(button, {
      y: -2,
      scale: 1.02,
      duration: 0.2,
      ease: "power2.out"
    })
  } else {
    gsap.to(button, {
      y: 0,
      scale: 1,
      duration: 0.2,
      ease: "power2.out"
    })
  }
}

const animateButtonClick = (button: HTMLElement) => {
  gsap.to(button, {
    scale: 0.98,
    duration: 0.1,
    ease: "power2.in",
    onComplete: () => {
      gsap.to(button, {
        scale: 1,
        duration: 0.2,
        ease: "back.out(1.5)"
      })
    }
  })
}

// 执行函数
const executeAction = async (action: ApprovalAction, handler: () => Promise<void>) => {
  if (executing.value || completed.value) return

  executing.value = true
  currentAction.value = action
  executionSuccess.value = false
  executionError.value = false

  try {
    await handler()
  } catch (error: any) {
    statusMsg.value = `执行失败: ${error?.message || '未知错误'}`
    executionDetails.value = error?.stack || ''
    executionError.value = true
    emit('error', error)
  } finally {
    executing.value = false
    currentAction.value = null

    // 动画反馈
    if (statusRef.value) {
      gsap.fromTo(statusRef.value,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
      )
    }
  }
}

// 事件处理
const onJustDoIt = async () => {
  const button = justDoItBtn.value!
  const buttonEl = button.$el || button
  animateButtonClick(buttonEl)

  await executeAction('just-do-it', async () => {
    statusMsg.value = '正在执行工具调用...'

    // 模拟 API 调用
    await new Promise(resolve => setTimeout(resolve, 1500))

    statusMsg.value = '工具执行成功！'
    executionSuccess.value = true
    completed.value = true

    emit('approved', { success: true, action: 'just-do-it' })
  })
}

const onRetryExecution = async () => {
  const button = retryBtn.value!
  const buttonEl = button.$el || button
  animateButtonClick(buttonEl)

  await executeAction('retry', async () => {
    statusMsg.value = '正在重新分析并执行工具调用...'

    await new Promise(resolve => setTimeout(resolve, 2000))

    statusMsg.value = '重新执行完成！'
    executionSuccess.value = true
    completed.value = true

    emit('retryRequested', {
      toolName: props.approval.toolName,
      originalArgs: props.approval.args,
      action: 'retry'
    })
  })
}

const onRejectWithReason = async () => {
  const button = rejectReasonBtn.value!

  if (!showReasonInput.value) {
    // 首次点击：显示理由输入框
    showReasonInput.value = true
    const buttonEl = button.$el || button
    animateButtonClick(buttonEl)

    // 聚焦到输入框
    await nextTick()
    if (reasonRef.value) {
      const textarea = reasonRef.value.querySelector('textarea')
      textarea?.focus()
    }
    return
  }

  if (!rejectionReason.value.trim()) {
    statusMsg.value = '请输入拒绝理由'
    executionError.value = true
    return
  }

  const buttonEl = button.$el || button
  animateButtonClick(buttonEl)

  await executeAction('reject-reason', async () => {
    statusMsg.value = '已拒绝执行并记录理由'
    executionDetails.value = `拒绝理由: ${rejectionReason.value}`
    completed.value = true

    emit('rejected', rejectionReason.value)
  })
}

const onRejectAndTerminate = async () => {
  const button = terminateBtn.value!
  const buttonEl = button.$el || button
  animateButtonClick(buttonEl)

  await executeAction('reject-terminate', async () => {
    statusMsg.value = '已拒绝执行并终止对话'
    executionDetails.value = '对话已被用户主动终止'
    completed.value = true

    emit('terminateRequested', '用户拒绝工具执行并终止对话')
  })
}

// 组件挂载
onMounted(() => {
  // 入场动画
  animateCardEntry()

  // 图标动画
  animateIconPulse()

  // 按钮入场动画（延迟）
  setTimeout(() => {
    animateButtonsEntry()
  }, 300)

  // 按钮悬停效果
  const buttons = [justDoItBtn.value, retryBtn.value, rejectReasonBtn.value, terminateBtn.value]

  buttons.forEach(button => {
    if (button) {
      // 获取 Ant Design 按钮的真实 DOM 元素
      const buttonEl = button.$el || button
      if (buttonEl && buttonEl.addEventListener) {
        buttonEl.addEventListener('mouseenter', () => animateButtonHover(buttonEl, true))
        buttonEl.addEventListener('mouseleave', () => animateButtonHover(buttonEl, false))
      }
    }
  })
})
</script>

<style scoped lang="scss">
/* =================================================================
   🏺 青花瓷工具审批卡片 - ENHANCED TOOL APPROVAL CARD
   Design Philosophy: 青龙守护 + 现代交互
   ================================================================= */

.enhanced-tool-approval-card {
  position: relative;
  background: var(--bg-secondary, #FEFEFE);
  border-radius: var(--radius-xl, 1.125rem);
  overflow: hidden;
  transition: all var(--transition-normal, 300ms cubic-bezier(0.4, 0, 0.2, 1));
  box-shadow:
    var(--shadow-soft, 0 2px 8px rgba(91, 138, 138, 0.08)),
    0 0 0 1px var(--border-light, #C8D8D8);

  /* 青花瓷纹理背景 */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 20% 20%, rgba(91, 138, 138, 0.02) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(91, 138, 138, 0.02) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      var(--shadow-large, 0 8px 32px rgba(91, 138, 138, 0.16)),
      0 0 0 1px var(--brand-primary, #5B8A8A),
      var(--shadow-glow, 0 0 24px rgba(91, 138, 138, 0.2));
  }

  &.is-executing {
    border-color: var(--warning, #D0A048);
    box-shadow:
      0 0 0 2px rgba(208, 160, 72, 0.3),
      var(--shadow-medium, 0 4px 16px rgba(91, 138, 138, 0.12));
  }

  &.is-completed {
    border-color: var(--success, #52A885);
    box-shadow:
      0 0 0 2px rgba(82, 168, 133, 0.3),
      var(--shadow-medium, 0 4px 16px rgba(91, 138, 138, 0.12));
  }
}

/* 青花瓷装饰边框 */
.celadon-border {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--brand-primary, #5B8A8A) 30%,
    var(--accent-jade, #6B9A98) 50%,
    var(--brand-primary, #5B8A8A) 70%,
    transparent 100%
  );
  background-size: 300% 100%;
  animation: shimmer 3s ease-in-out infinite;
  z-index: 1;
}

@keyframes shimmer {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

/* 卡片头部 */
.approval-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-lg, 1.5rem);
  padding: var(--space-xl, 2rem) var(--space-xl, 2rem) var(--space-lg, 1.5rem);
  border-bottom: 1px solid var(--border-subtle, #E0E8E8);
}

.header-icon {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.icon-ring {
  position: absolute;
  inset: -4px;
  border: 2px solid var(--brand-primary, #5B8A8A);
  border-radius: 50%;
  opacity: 0.6;
}

.icon-center {
  position: absolute;
  inset: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-primary, #5B8A8A);
  border-radius: 50%;
  color: white;
  box-shadow:
    0 4px 12px rgba(91, 138, 138, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.icon-pulse {
  position: absolute;
  inset: 0;
  border: 2px solid var(--brand-primary, #5B8A8A);
  border-radius: 50%;
  opacity: 0.8;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.approval-title {
  font-size: var(--font-size-lg, 1.125rem);
  font-weight: 700;
  color: var(--text-primary, #2C3E3E);
  margin: 0 0 var(--space-sm, 0.5rem);
  letter-spacing: 0.5px;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: var(--space-md, 1rem);
  flex-wrap: wrap;
}

.tool-name {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  color: var(--brand-primary, #5B8A8A);
  background: var(--brand-light, #D8E8E8);
  padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
  border-radius: var(--radius-sm, 0.375rem);
}

.risk-badge {
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: 600;
  padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
  border-radius: var(--radius-full, 9999px);
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.risk-low {
    background: rgba(82, 168, 133, 0.1);
    color: var(--success, #52A885);
    border: 1px solid rgba(82, 168, 133, 0.3);
  }

  &.risk-medium {
    background: rgba(208, 160, 72, 0.1);
    color: var(--warning, #D0A048);
    border: 1px solid rgba(208, 160, 72, 0.3);
  }

  &.risk-high {
    background: rgba(200, 90, 90, 0.1);
    color: var(--error, #C85A5A);
    border: 1px solid rgba(200, 90, 90, 0.3);
  }
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 0.5rem);
  padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.status-pending {
    background: rgba(139, 157, 157, 0.1);
    color: var(--text-tertiary, #8B9D9D);
    border: 1px solid rgba(139, 157, 157, 0.3);
  }

  &.status-executing {
    background: rgba(208, 160, 72, 0.1);
    color: var(--warning, #D0A048);
    border: 1px solid rgba(208, 160, 72, 0.3);
  }

  &.status-success {
    background: rgba(82, 168, 133, 0.1);
    color: var(--success, #52A885);
    border: 1px solid rgba(82, 168, 133, 0.3);
  }

  &.status-error {
    background: rgba(200, 90, 90, 0.1);
    color: var(--error, #C85A5A);
    border: 1px solid rgba(200, 90, 90, 0.3);
  }

  &.status-completed {
    background: rgba(91, 138, 138, 0.1);
    color: var(--brand-primary, #5B8A8A);
    border: 1px solid rgba(91, 138, 138, 0.3);
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: statusPulse 2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 详情区域 */
.approval-details {
  position: relative;
  z-index: 2;
  border-bottom: 1px solid var(--border-subtle, #E0E8E8);
}

.details-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg, 1.5rem) var(--space-xl, 2rem);
  cursor: pointer;
  background: var(--bg-tertiary, #F0F4F4);
  transition: all var(--transition-fast, 180ms);

  &:hover {
    background: var(--bg-hover, #E8F0F0);
  }
}

.toggle-text {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  color: var(--text-secondary, #5B7373);
}

.toggle-icon {
  color: var(--brand-primary, #5B8A8A);
  transition: transform var(--transition-normal, 300ms);

  &.expanded {
    transform: rotate(180deg);
  }
}

.details-content {
  padding: var(--space-xl, 2rem);
  background: var(--bg-secondary, #FEFEFE);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 700;
  color: var(--text-primary, #2C3E3E);
  margin: 0 0 var(--space-md, 1rem);
  padding-bottom: var(--space-sm, 0.5rem);
  border-bottom: 2px solid var(--brand-light, #D8E8E8);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.view-toggle {
  font-size: var(--font-size-xs, 0.75rem) !important;
  color: var(--brand-primary, #5B8A8A) !important;
  border: 1px solid var(--brand-primary, #5B8A8A) !important;
  border-radius: var(--radius-sm, 0.375rem) !important;
}

/* 参数区域 */
.param-section {
  margin-bottom: var(--space-xl, 2rem);
}

.param-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 1rem);
}

.param-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg, 1.5rem);
  padding: var(--space-md, 1rem);
  background: var(--bg-tertiary, #F0F4F4);
  border-radius: var(--radius-md, 0.625rem);
  border-left: 3px solid var(--brand-primary, #5B8A8A);
}

.param-key {
  flex: 0 0 120px;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 700;
  color: var(--brand-primary, #5B8A8A);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-value {
  flex: 1;
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: var(--font-size-sm, 0.875rem);
  line-height: 1.6;
}

.value-string { color: var(--success, #52A885); }
.value-number { color: var(--error, #C85A5A); }
.value-boolean { color: var(--brand-primary, #5B8A8A); }
.value-object { color: var(--text-primary, #2C3E3E); }

.params-raw {
  background: var(--text-primary, #2C3E3E);
  border-radius: var(--radius-md, 0.625rem);
  padding: var(--space-lg, 1.5rem);

  pre {
    margin: 0;
    color: var(--text-inverse, #FFFFFF);
    font-family: var(--font-mono, 'SF Mono', monospace);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

/* 预期结果区域 */
.expected-section {
  margin-bottom: var(--space-xl, 2rem);
}

.expected-content {
  background: linear-gradient(135deg,
    rgba(91, 138, 138, 0.05) 0%,
    rgba(91, 138, 138, 0.02) 100%
  );
  border: 1px solid rgba(91, 138, 138, 0.2);
  border-radius: var(--radius-md, 0.625rem);
  padding: var(--space-lg, 1.5rem);

  p {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--text-primary, #2C3E3E);
    line-height: 1.6;
  }
}

/* 风险评估区域 */
.risk-section {
  margin-bottom: var(--space-xl, 2rem);
}

.risk-assessment {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md, 1rem);
  padding: var(--space-lg, 1.5rem);
  border-radius: var(--radius-md, 0.625rem);

  &.risk-low {
    background: rgba(82, 168, 133, 0.05);
    border: 1px solid rgba(82, 168, 133, 0.2);
  }

  &.risk-medium {
    background: rgba(208, 160, 72, 0.05);
    border: 1px solid rgba(208, 160, 72, 0.2);
  }

  &.risk-high {
    background: rgba(200, 90, 90, 0.05);
    border: 1px solid rgba(200, 90, 90, 0.2);
  }
}

.risk-icon {
  font-size: var(--font-size-xl, 1.25rem);
  flex-shrink: 0;
}

.risk-content {
  flex: 1;
}

.risk-title {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 700;
  color: var(--text-primary, #2C3E3E);
  margin-bottom: var(--space-xs, 0.25rem);
}

.risk-description {
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--text-secondary, #5B7373);
  line-height: 1.6;
}

/* 理由输入区域 */
.reason-input-section {
  position: relative;
  z-index: 2;
  padding: var(--space-xl, 2rem);
  background: var(--bg-tertiary, #F0F4F4);
  border-bottom: 1px solid var(--border-subtle, #E0E8E8);
}

.reason-textarea {
  background: var(--bg-secondary, #FEFEFE) !important;
  border: 2px solid var(--border-light, #C8D8D8) !important;
  border-radius: var(--radius-md, 0.625rem) !important;
  font-size: var(--font-size-sm, 0.875rem) !important;
  line-height: 1.6 !important;

  &:focus {
    border-color: var(--brand-primary, #5B8A8A) !important;
    box-shadow: 0 0 0 3px rgba(91, 138, 138, 0.1) !important;
  }

  &::placeholder {
    color: var(--text-tertiary, #8B9D9D);
  }
}

/* 操作按钮区域 */
.approval-actions {
  position: relative;
  z-index: 2;
  padding: var(--space-xl, 2rem);
  background: var(--bg-secondary, #FEFEFE);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg, 1.5rem);
}

.actions-primary,
.actions-secondary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md, 1rem);
}

.action-btn {
  position: relative;
  height: 48px !important;
  font-weight: 700 !important;
  font-size: var(--font-size-sm, 0.875rem) !important;
  border-radius: var(--radius-md, 0.625rem) !important;
  transition: all var(--transition-normal, 300ms) !important;
  overflow: hidden;
  text-transform: uppercase;
  letter-spacing: 0.8px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
    background-size: 200% 200%;
    opacity: 0;
    transition: opacity var(--transition-fast, 180ms);
  }

  &:hover:not(:disabled)::before {
    opacity: 1;
    animation: shimmer 1.5s ease-in-out infinite;
  }
}

.action-approve {
  background: var(--brand-primary, #5B8A8A) !important;
  border: 2px solid var(--brand-primary, #5B8A8A) !important;
  color: var(--text-inverse, #FFFFFF) !important;
  box-shadow:
    0 4px 12px rgba(91, 138, 138, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);

  &:hover:not(:disabled) {
    background: var(--brand-hover, #3A5F5F) !important;
    border-color: var(--brand-hover, #3A5F5F) !important;
    box-shadow:
      0 8px 24px rgba(91, 138, 138, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
}

.action-retry {
  background: var(--bg-secondary, #FEFEFE) !important;
  border: 2px solid var(--brand-primary, #5B8A8A) !important;
  color: var(--brand-primary, #5B8A8A) !important;

  &:hover:not(:disabled) {
    background: var(--brand-light, #D8E8E8) !important;
    border-color: var(--brand-hover, #3A5F5F) !important;
    color: var(--brand-hover, #3A5F5F) !important;
  }
}

.action-reject {
  background: var(--bg-secondary, #FEFEFE) !important;
  border: 2px solid var(--error, #C85A5A) !important;
  color: var(--error, #C85A5A) !important;

  &:hover:not(:disabled) {
    background: var(--error-light, #F8E0E0) !important;
    border-color: var(--error, #C85A5A) !important;
    color: var(--error, #C85A5A) !important;
  }
}

.action-terminate {
  background: var(--error, #C85A5A) !important;
  border: 2px solid var(--error, #C85A5A) !important;
  color: var(--text-inverse, #FFFFFF) !important;
  box-shadow:
    0 4px 12px rgba(200, 90, 90, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);

  &:hover:not(:disabled) {
    background: #A03838 !important;
    border-color: #A03838 !important;
    box-shadow:
      0 8px 24px rgba(200, 90, 90, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
}

/* 执行状态反馈 */
.execution-feedback {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: var(--space-md, 1rem);
  padding: var(--space-xl, 2rem);
  border-radius: 0 0 var(--radius-xl, 1.125rem) var(--radius-xl, 1.125rem);

  &.feedback-executing {
    background: rgba(208, 160, 72, 0.05);
    border-top: 2px solid rgba(208, 160, 72, 0.2);
  }

  &.feedback-success {
    background: rgba(82, 168, 133, 0.05);
    border-top: 2px solid rgba(82, 168, 133, 0.2);
  }

  &.feedback-error {
    background: rgba(200, 90, 90, 0.05);
    border-top: 2px solid rgba(200, 90, 90, 0.2);
  }

  &.feedback-info {
    background: rgba(91, 138, 138, 0.05);
    border-top: 2px solid rgba(91, 138, 138, 0.2);
  }
}

.feedback-icon {
  flex-shrink: 0;

  .loading-spinner {
    position: relative;
    width: 24px;
    height: 24px;
  }

  .spinner-ring {
    position: absolute;
    inset: 0;
    border: 2px solid var(--brand-light, #D8E8E8);
    border-top-color: var(--brand-primary, #5B8A8A);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner-dot {
    position: absolute;
    inset: 6px;
    background: var(--brand-primary, #5B8A8A);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  .success-icon,
  .error-icon,
  .info-icon {
    font-size: var(--font-size-xl, 1.25rem);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.feedback-content {
  flex: 1;
}

.feedback-text {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  color: var(--text-primary, #2C3E3E);
  margin-bottom: var(--space-xs, 0.25rem);
}

.feedback-details {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-secondary, #5B7373);
  line-height: 1.5;
}

/* Vue Transition 动画 */
.details-expand-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.details-expand-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.details-expand-enter-from,
.details-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.details-expand-enter-to {
  max-height: 800px;
  opacity: 1;
}

.details-expand-leave-from {
  max-height: 800px;
  opacity: 1;
}

.reason-expand-enter-active,
.reason-expand-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.reason-expand-enter-from,
.reason-expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.status-slide-enter-active,
.status-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-slide-enter-from,
.status-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .enhanced-tool-approval-card {
    border-radius: var(--radius-md, 0.625rem);
  }

  .approval-header {
    padding: var(--space-lg, 1.5rem);
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md, 1rem);
  }

  .tool-info {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm, 0.5rem);
  }

  .details-content,
  .reason-input-section,
  .approval-actions {
    padding: var(--space-lg, 1.5rem);
  }

  .actions-primary,
  .actions-secondary {
    grid-template-columns: 1fr;
  }

  .param-item {
    flex-direction: column;
    gap: var(--space-sm, 0.5rem);
  }

  .param-key {
    flex: none;
  }
}
</style>