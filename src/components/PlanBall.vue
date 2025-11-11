<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { PlanStatus } from '@/types/events'
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons-vue'
import { gsap } from 'gsap'
import Vue3DraggableResizable from 'vue3-draggable-resizable'
import 'vue3-draggable-resizable/dist/Vue3DraggableResizable.css'

const chat = useChatStore()
const ballRef = ref<HTMLElement | null>(null)

// 当前计划
const currentPlan = computed(() => chat.getCurrentPlan())

// 计算进度
const planProgress = computed(() => {
  if (!currentPlan.value?.phases.length) return 0
  const completedPhases = currentPlan.value.phases.filter(
    phase => phase.status === 'COMPLETED'
  ).length
  return Math.round((completedPhases / currentPlan.value.phases.length) * 100)
})

// 进度环 SVG 计算
const progressCircle = computed(() => {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (planProgress.value / 100) * circumference
  return { radius, circumference, offset }
})

// 获取状态颜色
const getStatusColor = (status?: PlanStatus) => {
  const colorMap = {
    PLANNING: '#1677ff',
    EXECUTING: '#52c41a',
    COMPLETED: '#00b96b',
    PAUSED: '#fa8c16',
    FAILED: '#ff4d4f'
  }
  return colorMap[status || 'PLANNING'] || '#666'
}

// 状态图标
const statusIcon = computed(() => {
  const status = currentPlan.value?.status
  if (status === 'EXECUTING' || status === 'PLANNING') return LoadingOutlined
  if (status === 'COMPLETED') return CheckCircleOutlined
  if (status === 'FAILED') return CloseCircleOutlined
  return LoadingOutlined
})

// 位置和拖拽
const position = ref(chat.getPlanWidgetPosition())
console.log(position.value)
const isDragging = ref(false)

const onDragStart = () => {
  isDragging.value = true
}

const onDrag = (x: number, y: number) => {
  position.value = { x, y }
}

const onDragStop = () => {
  console.log(position.value)
  chat.setPlanWidgetPosition(position.value)
  // 确保拖拽结束不会触发点击
  isDragging.value = false
}

// 单击展开为侧边栏
const handleClick = () => {
  if (isDragging.value) return
  chat.setPlanWidgetMode('sidebar')
}

// 已移除迷你面板入口

// 进入动画
onMounted(() => {
  if (ballRef.value) {
    gsap.from(ballRef.value, {
      scale: 0,
      opacity: 0,
      duration: 0.3,
      ease: 'back.out(1.7)'
    })
  }
})

// 监听计划变化，添加脉冲动画
watch(currentPlan, (newPlan, oldPlan) => {
  if (newPlan && newPlan !== oldPlan && ballRef.value) {
    gsap.fromTo(
      ballRef.value,
      { scale: 1 },
      { scale: 1.1, duration: 0.2, yoyo: true, repeat: 1 }
    )
  }
}, { deep: true })

onUnmounted(() => {})
</script>

<template>
  <div class="plan-ball-wrapper">
    <!-- 可拖拽的状态球 -->
    <Vue3DraggableResizable
      class="plan-ball-draggable"
      :initW="60"
      :initH="60"
      :draggable="true"
      :resizable="false"
      :parent="false"
      @drag-start="onDragStart"
      @drag-end="onDragStop"
      @dragging="onDrag"
    >
      <div
        ref="ballRef"
        class="plan-ball"
        @click.stop="handleClick"
      >
        <!-- 进度环：使用 Ant Design Progress 替换自定义 SVG -->
        <a-progress
          type="circle"
          :percent="planProgress"
          :stroke-color="getStatusColor(currentPlan?.status)"
          :trail-color="'rgba(255,255,255,0.2)'"
          :show-info="false"
          :size="60"
          class="progress-circle"
        />

        <!-- 中心内容 -->
        <div class="ball-content">
          <component
            :is="statusIcon"
            class="status-icon"
            :spin="currentPlan?.status === 'EXECUTING' || currentPlan?.status === 'PLANNING'"
          />
          <div class="progress-text">{{ planProgress }}%</div>
        </div>
      </div>
    </Vue3DraggableResizable>

    
  </div>
</template>

<style scoped lang="scss">

.plan-ball-wrapper {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
}

.plan-ball-draggable,
.plan-ball-wrapper :deep(.vdr) {
  /* 去除拖拽激活时的边框/阴影/黑框 */
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

.plan-ball {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 244, 255, 0.9) 100%);
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.3);
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  pointer-events: auto;
  touch-action: none;
  outline: none;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  &:active {
    transform: scale(0.95);
  }
}
.progress-circle {
  position: absolute;
  top: 0;
  left: 0;
  width: 60px !important;
  height: 60px !important;
  pointer-events: none;
}

.ball-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.status-icon {
  font-size: 18px;
  color: $primary-color-500;
  margin-bottom: 2px;
}

.progress-text {
  font-size: 10px;
  font-weight: 600;
  color: $text-color;
  line-height: 1;
}

/* 已移除长按菜单相关样式 */
</style>
