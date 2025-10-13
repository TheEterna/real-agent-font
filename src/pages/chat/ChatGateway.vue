<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, shallowRef } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { AgentType } from '@/types/session'
import gsap from 'gsap'

// 动态导入Agent组件
import ReAct from './ReAct.vue'
import ReActPlus from './ReActPlus.vue'

const chat = useChatStore()

// 使用shallowRef优化性能
const currentComponent = shallowRef<any>(null)
const previousComponent = shallowRef<any>(null)

// 过渡动画相关
const transitionOverlay = ref<HTMLElement>()
const currentView = ref<HTMLElement>()
const isTransitioning = ref(false)

// Agent组件映射
const agentComponentMap: Record<AgentType, any> = {
  [AgentType.ReAct]: ReAct,
  [AgentType.ReAct_Plus]: ReActPlus,
  [AgentType.Coding]: ReAct, // todo 暂时使用ReAct作为placeholder
}

// 获取当前session
const currentSession = computed(() => chat.getCurrentSession())

// 获取当前应该渲染的组件
const getComponentForAgent = (agentType: AgentType) => {
  return agentComponentMap[agentType] || ReAct
}

// 全屏过渡动画
const playTransitionAnimation = async () => {
  if (!transitionOverlay.value || isTransitioning.value) return

  isTransitioning.value = true

  const tl = gsap.timeline({
    onComplete: () => {
      isTransitioning.value = false
    }
  })

  // 创建炫酷的粒子效果
  tl.set(transitionOverlay.value, {
    display: 'flex',
    opacity: 0
  })

  // 淡入遮罩
  tl.to(transitionOverlay.value, {
    opacity: 1,
    duration: 0.3,
    ease: 'power2.in'
  })

  // 缩放动画
  tl.to(transitionOverlay.value, {
    scale: 1.2,
    duration: 0.4,
    ease: 'power2.out'
  }, '-=0.1')

  // 淡出遮罩
  tl.to(transitionOverlay.value, {
    opacity: 0,
    scale: 1,
    duration: 0.3,
    ease: 'power2.out'
  })

  tl.set(transitionOverlay.value, {
    display: 'none'
  })
}

// 监听session变化
watch(() => chat.sessionId.value, async (newSessionId, oldSessionId) => {
  if (oldSessionId && newSessionId !== oldSessionId) {
    // 播放过渡动画
    await playTransitionAnimation()
  }

  // 更新组件
  const session = chat.getCurrentSession()
  if (session) {
    previousComponent.value = currentComponent.value
    currentComponent.value = getComponentForAgent(session.agentType)
  }
}, { immediate: true })

// 初始化
onMounted(() => {
  const session = chat.getCurrentSession()
  if (session) {
    currentComponent.value = getComponentForAgent(session.agentType)
  }
})
</script>

<template>
  <div class="chat-gateway">
    <!-- 过渡遮罩 -->
    <div ref="transitionOverlay" class="transition-overlay">
      <div class="transition-content">
        <div class="loader-ring"></div>
        <div class="transition-text">
          <h3 v-if="currentSession">切换至 {{ currentSession.title }}</h3>
          <p>正在加载智能助手...</p>
        </div>
      </div>
    </div>

    <!-- 动态渲染Agent组件 -->
    <Transition name="fade" mode="out-in">
      <component
        v-if="currentComponent"
        :is="currentComponent"
        :key="chat.sessionId.value"
        ref="currentView"
        class="agent-view"
      />
      <div v-else class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>欢迎使用 Real Agent</h3>
        <p>请从左侧选择或创建一个会话</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-gateway {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.agent-view {
  width: 100%;
  height: 100%;
}

.transition-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
  opacity: 0;
}

.transition-content {
  text-align: center;
  color: white;
}

.loader-ring {
  width: 80px;
  height: 80px;
  margin: 0 auto 30px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.transition-text h3 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 12px;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.transition-text p {
  font-size: 16px;
  opacity: 0.9;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.empty-icon {
  font-size: 80px;
  margin-bottom: 24px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 16px;
  color: #666;
}

/* 淡入淡出过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: scale(1.05) translateY(-20px);
}
</style>
