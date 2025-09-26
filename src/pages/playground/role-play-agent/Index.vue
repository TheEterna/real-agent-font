<template>
  <div class="rpa">
    <div class="topbar">
      <a-button type="default" shape="circle" @click="goBack" :title="'返回 Playground'">
        <template #icon>
          <ArrowLeftOutlined />
        </template>
      </a-button>
      <div class="spacer"></div>
      <a-segmented v-model:value="mode" :options="['文本', '语音']" size="small" />
    </div>

    <div class="content">
      <div class="chat-area">
        <template v-if="mode === '语音' && currentRole">
          <VoiceMode :session-id="sessionId" :role-id="currentRole.id" @exit="mode = '文本'" />
        </template>
        <template v-else>
          <ChatPanel :session-id="sessionId" />
        </template>
      </div>
      <div class="side-area">
        <a-card size="small" :title="`角色：${currentRole?.name || '未选择'}`" style="margin-bottom: 12px;">
          <div class="role-avatar">
            <img v-if="currentRole" :src="currentRole.avatar" alt="avatar" />
            <div v-else class="placeholder">请返回上一页选择角色</div>
          </div>
        </a-card>

        <a-card size="small" title="操作" style="margin-bottom: 12px;">
          <a-space direction="vertical" style="width:100%">
            <a-button type="primary" block @click="mode = '语音'">开启语音聊天</a-button>
<!--{{ ... }}-->
          </a-space>
        </a-card>

        <a-card size="small" title="会话设置">
          <a-form layout="vertical">
            <a-form-item label="角色">
              <a-input v-model:value="roleName" placeholder="如：柯南" />
            </a-form-item>
            <a-form-item label="模型">
              <a-select v-model:value="model" :options="models" />
            </a-form-item>
          </a-form>
        </a-card>

        <a-card size="small" title="语音">
          <AudioBar :mode="mode" />
        </a-card>
      </div>
    </div>

    <a-modal v-model:open="introVisible" :title="currentRole?.name || '角色简介'" :footer="null" width="520px">
      <p v-if="currentRole">{{ currentRole.desc }}</p>
      <p v-else>未选择角色。</p>
    </a-modal>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import AudioBar from '@/pages/playground/role-play-agent/components/AudioBar.vue'
import ChatPanel from "@/pages/playground/role-play-agent/components/ChatPanel.vue";
import VoiceMode from "@/pages/playground/role-play-agent/components/VoiceMode.vue";

const router = useRouter()
const route = useRoute()
const goBack = () => router.push('/playground')

const sessionId = ref<string>('demo-session')
const roleName = ref<string>('柯南')
const model = ref<string>('qwen-turbo')
const models = [
  { label: 'qwen-turbo', value: 'qwen-turbo' },
  { label: 'qwen-plus', value: 'qwen-plus' },
]
const mode = ref<'文本' | '语音'>('文本')

type Role = { id: string; name: string; avatar: string; desc: string }
const roles: Role[] = [
  { id: 'conan', name: '柯南', desc: '真相只有一个！冷静缜密的推理型角色', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect rx="16" ry="16" width="96" height="96" fill="%23f5f7ff"/><g transform="translate(12,12)"><circle cx="36" cy="24" r="12" fill="%231677ff"/><rect x="18" y="42" width="48" height="24" rx="12" fill="%231677ff"/></g></svg>' },
  { id: 'detective', name: '福尔摩斯', desc: '观察入微、逻辑严密的侦探角色', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect rx="16" ry="16" width="96" height="96" fill="%23fff5f0"/><g transform="translate(12,12)"><circle cx="36" cy="24" r="12" fill="%23ff7a45"/><rect x="18" y="42" width="48" height="24" rx="12" fill="%23ff7a45"/></g></svg>' },
]
const roleId = computed(() => String(route.params.roleId || ''))
const currentRole = computed<Role | undefined>(() => roles.find(r => r.id === roleId.value))
const introVisible = ref(false)
</script>

<style scoped lang="scss">
.rpa { display:flex; flex-direction:column; gap:12px; width:100%; }
.topbar { display:flex; align-items:center; gap:8px; }
.topbar .title { font-weight:700; }
.topbar .spacer{ flex:1; }
.content { display:grid; grid-template-columns: 1fr 320px; gap:12px; min-height: 60vh; }
.chat-area { min-height: 60vh; }
.side-area { display:flex; flex-direction:column; }
.role-avatar { display:flex; justify-content:center; padding:8px 0; }
.role-avatar img { width:120px; height:120px; border-radius:16px; border:1px solid #eef2f7; object-fit:cover; }
.role-avatar .placeholder { color:#999; font-size:12px; }
</style>
