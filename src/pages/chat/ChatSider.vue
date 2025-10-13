<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { useRouter, useRoute } from 'vue-router'
import { AgentType } from '@/types/agents'
import type { Ref } from 'vue'
import { getRandomGlassColor, getRandomTooltipColor } from '@/utils/colorUtils'

const chat = useChatStore()
const router = useRouter()
const route = useRoute()

// Agent路由映射
const agentRouteMap: Record<AgentType, string> = {
  [AgentType.ReAct]: '/chat/react',
  [AgentType.ReAct_Plus]: '/chat/react-plus',
  [AgentType.Coding]: '/chat/coding',
}

const agentTags = [
  {
    label: 'ReAct',
    value: AgentType.ReAct,
    description: '推理-行动-观察框架',
    disabled: false,
    tipColor: getRandomTooltipColor()
  },
  {
    label: 'ReAct+',
    value: AgentType.ReAct_Plus,
    description: '本系统下一代主力通用Agent',
    disabled: false,
    tipColor: getRandomTooltipColor()
  },
  {
    label: '代码编写',
    value: AgentType.Coding,
    description: '专业代码生成助手',
    disabled: true,
    tipColor: getRandomTooltipColor()
  },
]

const isActive = (id: string) => chat.sessionId.value === id

// 判断Agent是否处于激活状态（基于路由）
const isAgentActive = (agentType: AgentType) => {
  return route.path === agentRouteMap[agentType]
}

// 切换Agent（通过路由跳转）
const handleAgentSelect = (agentType: AgentType) => {
  const targetRoute = agentRouteMap[agentType]
  if (targetRoute && route.path !== targetRoute) {
    chat.selectTag(agentType)
    router.push(targetRoute)
  }
}
</script>

<template>
  <div>
    <div class="sl-section">
      <div class="sl-title">会话</div>
      <div class="sl-conv-list">
        <div
          v-for="c in (chat.sessions as any)"
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
        <a-tooltip
          v-for="tag in agentTags"
          :key="tag.value"
          :title="tag.description"
          placement="rightBottom"
          :color="tag.tipColor"
        >
          <a-button
            style="text-align: left;padding-left: 30px"
            size="large"
            :type="isAgentActive(tag.value) ? 'primary' : 'default'"
            @click="handleAgentSelect(tag.value)"
            :disabled="tag.disabled"
          >
            {{ tag.label }}
          </a-button>
        </a-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
/**** rely on global chat.css .sl-* styles ****/

.sl-section { padding: 12px 14px; border-bottom: 1px solid #f5f7fb; }
.sl-title { font-weight: 600; font-size: 13px; color: #445; margin-bottom: 8px; }
.sl-agents { display: grid; gap: 8px; }
.sl-conv-list { display: grid; gap: 6px; }
.sl-conv-item { padding: 8px 10px; border-radius: 10px; border: 1px solid #eef2f7; cursor: pointer; background: #fff; }
.sl-conv-item.active { border-color: #1677ff; background: #f5faff; }
.sl-conv-title { font-size: 13px; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sl-conv-meta { font-size: 12px; color: #888; }
</style>
