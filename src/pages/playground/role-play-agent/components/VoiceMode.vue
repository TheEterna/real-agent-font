<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick, getCurrentInstance } from 'vue'
import { appendMessage, useChatStore } from '@/stores/chatStore'
import { MessageType } from '@/types/events'
import { PauseOutlined, CloseOutlined, AudioMutedOutlined, AudioTwoTone } from '@ant-design/icons-vue'

interface Props {
  sessionId: string
  roleId: string
  // UI config
  circleSize?: number
  primaryColor?: string
  secondaryColor?: string
  animationSpeed?: number
  volumeSensitivity?: number
}

const props = defineProps<Props>()

// Default values
const circleSize = props.circleSize ?? 200
const primaryColor = props.primaryColor ?? '#f0c'
const secondaryColor = props.secondaryColor ?? '#9cf'
const animationSpeed = props.animationSpeed ?? 1
const volumeSensitivity = props.volumeSensitivity ?? 3
const emit = defineEmits(['exit'])

// Chat store for message history
const chatStore = useChatStore()
const messages = computed(() => chatStore.getSessionMessages(props.sessionId))
const messageListRef = ref<HTMLElement | null>(null)

// Auto scroll to bottom when new messages arrive
const scrollToBottom = () => {
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}

// Watch for new messages and scroll
watch(messages, () => {
  nextTick(() => scrollToBottom())
}, { deep: true })

const tips = ref('你可以开始说话')
const dot = ref(1)
let dotTimer: number | null = null

const recording = ref(false)
const assistantResponding = ref(false)
const turning = ref(false)
const playing = ref(false)

const asrText = ref('')
const llmText = ref('')

// Realtime streaming resources
let currentStream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null // mic encoder (16k)
let playerNode: AudioWorkletNode | null = null // pcm24k player
let playerGain: GainNode | null = null
let ws: WebSocket | null = null

const audioRef = ref<HTMLAudioElement | null>(null)
const muted = ref(false)


// UI amplitude level (0..1), used to drive pulsating circle
const vuLevel = ref(0)
const breathingPhase = ref(0)

// breathing animation baseline
setInterval(() => {
  breathingPhase.value += 0.02 * animationSpeed
}, 50)

const circleScale = computed(() => {
  const breathingScale = 1 + Math.sin(breathingPhase.value) * 0.02 // subtle breathing
  const base = (playing.value ? 1.06 : 1.0) * breathingScale
  const s = base + vuLevel.value * 0.25
  return Number.isFinite(s) ? s : 1.0
})

const circleShadow = computed(() => {
  const breathingGlow = 0.1 + Math.sin(breathingPhase.value * 0.8) * 0.05
  const blur = Math.round(20 + vuLevel.value * 40 + breathingGlow * 10)
  const alpha = Math.min(0.7, 0.2 + vuLevel.value * 0.5 + breathingGlow).toFixed(2)
  const color = primaryColor.replace('#', '')
  const r = parseInt(color.substr(0,2), 16)
  const g = parseInt(color.substr(2,2), 16)
  const b = parseInt(color.substr(4,2), 16)
  return `0 0 ${blur}px rgba(${r}, ${g}, ${b}, ${alpha})`
})

const circleGradient = computed(() => {
  const size = Math.round(circleSize * 0.6)
  return `radial-gradient(${size}px ${size}px at 40% 40%, ${primaryColor}, ${secondaryColor})`
})

const circleStyle = computed(() => ({
  width: `${circleSize}px`,
  height: `${circleSize}px`,
  background: circleGradient.value,
  transform: `scale(${circleScale.value})`,
  boxShadow: circleShadow.value
}))

// 路线B：实时流，依赖服务端 VAD；本地不再做静音判定

onMounted(() => {
  dotTimer = window.setInterval(() => {
    dot.value = (dot.value % 3) + 1
  }, 800)
  // 进入语音模式即开始聆听
  startRecord().catch(() => {})
})

onBeforeUnmount(() => {
  if (dotTimer) window.clearInterval(dotTimer)
  cleanupRealtime()
})

// 页面路由变化时也要清理连接
const { $router } = getCurrentInstance()?.appContext.config.globalProperties || {}
if ($router) {
  const unwatch = $router.beforeEach(() => {
    cleanupRealtime()
    unwatch() // 只执行一次
  })
}

async function startRecord() {
  // 开始实时推流（AudioWorklet → PCM16k → WebSocket）并订阅后端 SSE
  try {
    await startRealtime()
    recording.value = true
    tips.value = '你可以开始说话'
  } catch (e: any) {
    tips.value = '无法访问麦克风：' + (e?.message || e)
  }
}

function stopRecord() {
  // 停止实时推流，关闭连接
  try { ws?.send('close') } catch {}
  cleanupRealtime()
  recording.value = false
}

function exitVoice() {
  // 彻底停止本轮，退出语音
  try { ws?.send('close') } catch {}
  cleanupRealtime()
  if (audioRef.value) {
    try { audioRef.value.pause() } catch {}
    try { audioRef.value.currentTime = 0 } catch {}
    try { audioRef.value.src = '' ; audioRef.value.load() } catch {}
  }
  playing.value = false
  turning.value = false
  recording.value = false
  emit('exit')
}

function onStateButtonClick() {
  if (playing.value) {
    // 打断当前对话（停止播放 + 终止会话）
    try { ws?.send('close') } catch {}
    if (audioRef.value) { try { audioRef.value.pause() } catch {} }
    // 停止播放器
    try { playerNode?.port.postMessage({ type: 'stop' }) } catch {}
    playing.value = false
    turning.value = false
    assistantResponding.value = false
    tips.value = '已打断'
    // 回到聆听
    setTimeout(() => startRecord().catch(() => {}), 200)
  } else {
    // 正在听：手动触发提交
    try { ws?.send('commit') } catch {}
    tips.value = '手动提交...'
  }
}

function toggleMute() {
  muted.value = !muted.value
  if (playerGain) playerGain.gain.value = muted.value ? 0 : 1
  // 静音状态提示，但不影响正常的对话流程提示
  const muteStatus = muted.value ? '已静音' : '取消静音'
  console.log('[VoiceMode] Mute status:', muteStatus)
  // 只在非对话状态时显示静音提示
  if (!recording.value && !playing.value && !assistantResponding.value) {
    tips.value = muteStatus
    setTimeout(() => {
      if (!recording.value && !playing.value && !assistantResponding.value) {
        tips.value = '你可以开始说话'
      }
    }, 1500)
  }
}


async function startRealtime() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  currentStream = stream
  audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  await audioCtx.audioWorklet.addModule('/pcm16-worklet.js')
  await audioCtx.audioWorklet.addModule('/pcm24k-player.js')
  const source = audioCtx.createMediaStreamSource(stream)
  workletNode = new AudioWorkletNode(audioCtx, 'pcm16-processor', { processorOptions: { targetSampleRate: 16000 } })
  source.connect(workletNode)
  // Optional monitor pass-through; keep minimal or disconnect
  // workletNode.connect(audioCtx.destination)

  // Player worklet for streaming 24k PCM base64 from server
  playerNode = new AudioWorkletNode(audioCtx, 'pcm24k-player')
  try { playerNode.port.postMessage({ type: 'setSrcRate', value: 24000 }) } catch {}
  playerGain = audioCtx.createGain()
  playerGain.gain.value = muted.value ? 0 : 1
  playerNode.connect(playerGain).connect(audioCtx.destination)

  // Open SSE first to ensure we receive events (only once)
  // Open WebSocket for PCM frames (reopen if closed)
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) openWs()


  // Forward PCM Int16 buffers from worklet to WS
  workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    // update UI vu meter from the same 20ms chunk (320 samples @16k)
    try {
      const view = new Int16Array(e.data)
      if (view && view.length) {
        let sum = 0
        for (let i = 0; i < view.length; i++) {
          const v = view[i]
          sum += v * v
        }
        const rms = Math.sqrt(sum / view.length) / 32768
        const level = Math.min(1, rms * volumeSensitivity) // configurable sensitivity
        vuLevel.value = vuLevel.value * 0.8 + level * 0.2 // smooth
      }
    } catch {}

    // forward to backend (阿里云VAD会自动处理打断)
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[VoiceMode] sending audio data:', e.data.byteLength, 'bytes')
        ws.send(e.data)
      } else {
        console.warn('[VoiceMode] WebSocket not ready, state:', ws?.readyState)
      }
    } catch (err) {
      console.error('[VoiceMode] failed to send audio:', err)
    }
  }
}

function cleanupRealtime() {
  if (ws) { try { ws.close() } catch {} ; ws = null }
  if (workletNode) { try { workletNode.disconnect() } catch {} ; workletNode = null }
  if (playerNode) { try { playerNode.disconnect() } catch {} ; playerNode = null }
  if (playerGain) { try { playerGain.disconnect() } catch {} ; playerGain = null }
  if (audioCtx) { try { audioCtx.close() } catch {} ; audioCtx = null }
  if (currentStream) { try { currentStream.getTracks().forEach(t => t.stop()) } catch {} ; currentStream = null }
}

function openWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws/voice/stream?sessionId=${encodeURIComponent(props.sessionId)}&roleId=${encodeURIComponent(props.roleId)}`
  ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => { /* ready to send PCM and receive events */ }
  ws.onerror = () => { tips.value = '语音通道错误' }
  ws.onclose = () => { /* server closed or user exit */ }
  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      console.log('[WS] Raw message:', ev.data)
      const msg = JSON.parse(ev.data || '{}') as { event?: string; data?: any }
      const event = msg.event || ''
      const payload = msg.data
      console.log('[WS] Parsed event:', event, 'payload:', payload, 'type:', typeof payload)
      switch (event) {
        case 'user_final': {
          const text = textOf(payload)
          asrText.value = text
          if (text.trim()) appendMessage(props.sessionId, { type: MessageType.User, sender: 'user', message: text })
          assistantResponding.value = true
          break
        }
        case 'llm_delta': {
          const text = textOf(payload)

          if (assistantResponding.value) {
            llmText.value += text
            console.log('[WS] llm_delta - updated llmText:', JSON.stringify(llmText.value))
          } else {
            asrText.value = text
            console.log('[WS] llm_delta - updated asrText:', JSON.stringify(asrText.value))
          }
          break
        }
        case 'audio_delta': {
          console.log("语音")
          try {
            if (!playerNode) {
              console.warn('[WS] audio_delta - playerNode not ready')
              return
            }
            const ab = base64ToArrayBuffer(String(payload))
            console.log('[WS] audio_delta - payload length:', String(payload).length, 'decoded bytes:', ab.byteLength)
            if (ab && ab.byteLength) {
              playerNode.port.postMessage({ type: 'push', pcm16: ab }, [ab])
              if (!playing.value) { playing.value = true; tips.value = '播放中' }
              console.log('[WS] audio_delta - sent to player, playing:', playing.value)
            } else {
              console.warn('[WS] audio_delta - empty or invalid audio data')
            }
          } catch (e) {
            console.error('[WS] audio_delta error:', e)
          }
          break
        }
        case 'llm_final':
        case 'done': {
          console.log('[WS] Response completed')
          turning.value = false
          playing.value = false
          try { playerNode?.port.postMessage({ type: 'done' }) } catch {}
          const reply = llmText.value.trim()
          if (reply) {
            appendMessage(props.sessionId, { type: MessageType.Assistant, sender: 'assistant', message: reply })
            console.log('[WS] done - saved assistant message:', reply)
          }
          // 清空当前对话文本，准备下一轮
          llmText.value = ''
          asrText.value = ''
          assistantResponding.value = false
          // 自动开始下一轮录音
          if (!recording.value) {
            setTimeout(() => {
              startRecord().then(() => {
                tips.value = '你可以开始说话'
              }).catch(() => {
                tips.value = '录音启动失败'
              })
            }, 500)
          }
          break
        }
        case 'user_interrupt': {
          // 阿里云VAD检测到用户开始说话，打断AI播放
          console.log('[WS] User interruption detected by Aliyun VAD')
          if (playing.value) {
            try { ws?.send('close') } catch {}
            if (audioRef.value) { try { audioRef.value.pause() } catch {} }
            try { playerNode?.port.postMessage({ type: 'stop' }) } catch {}
            playing.value = false
            assistantResponding.value = false
            // 被打断时不显示tip，只记录日志
            console.log('[WS] AI playback interrupted by user speech')
          }
          break
        }
        case 'user_speech_stopped': {
          // 用户停止说话
          console.log('[WS] User speech stopped')
          break
        }
        case 'error': {
          const errorMsg = textOf(payload) || '发生错误'
          console.error('[WS] Server error:', errorMsg, 'raw payload:', payload)
          tips.value = errorMsg
          break
        }
        // session_created / voice_session_created 可按需处理
        default:
          console.log('[WS] Unhandled event:', event, 'payload:', payload)
          break
      }
    } catch (e) {
      console.error('[WS] Message parsing error:', e, 'raw data:', ev.data)
    }
  }
}

// SSE 已移除，统一走 WS 双工

function textOf(p: any): string {
  if (typeof p === 'string') return p
  if (!p || typeof p !== 'object') return ''
  return p.text || p.message || p.delta || ''
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  try {
    const cleaned = (b64 || '').replace(/\s+/g, '')
    const byteStr = atob(cleaned)
    const len = byteStr.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = byteStr.charCodeAt(i)
    return bytes.buffer
  } catch {
    return new ArrayBuffer(0)
  }
}

function audioUrlOf(p: any): string | null {
  if (typeof p === 'string') {
    const s = p.trim()
    if (!s) return null
    if (s.startsWith('data:audio')) return s
    if (s.startsWith('http') || s.startsWith('/')) return s
    // likely base64 without prefix
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(s)) {
      return `data:audio/wav;base64,${s.replace(/\r?\n/g, '')}`
    }
    return null
  }
  if (!p || typeof p !== 'object') return null
  if (p.audio_url) return p.audio_url
  if (p.url) return p.url
  if (p.audioBase64) return `data:audio/wav;base64,${String(p.audioBase64)}`
  if (p.base64) return `data:audio/wav;base64,${String(p.base64)}`
  return null
}

// 旧的一次性上传与手动解析 SSE 已移除，现由 EventSource 直连后端 /api/voice/stream
</script>

<template>
  <div class="voice-mode">
    <!-- 语音交互区域 -->
    <div class="voice-interaction">
      <div class="circle" :class="{ speaking: recording || playing }" :style="circleStyle"></div>
      <div class="tips">{{ tips }}</div>

      <!-- AI说话时显示暂停按钮，否则显示律动点 -->
      <PauseOutlined v-if="playing" class="big-icon pause-btn" @click="onStateButtonClick" title="暂停AI说话"/>
      <div v-else class="dots" :class="{ dancing: recording || assistantResponding }">
        <span v-for="i in 3" :key="i" :class="{ on: i === dot }"></span>
      </div>
      <div class="current-conversation">
        <div class="line asr" v-if="asrText">用户: {{ asrText }}</div>
        <div class="line llm" v-if="llmText">助手: {{ llmText }}</div>
      </div>
    </div>

    <!-- 聊天记录区域 -->
    <div class="chat-history" v-if="messages.length > 0">
      <div class="history-title">对话记录</div>
      <div class="message-list" ref="messageListRef">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="message-item"
          :class="{ 'user': msg.type === MessageType.User, 'assistant': msg.type === MessageType.Assistant }"
        >
          <div class="message-sender">{{ msg.type === MessageType.User ? '你' : 'AI' }}</div>
          <div class="message-content">{{ msg.message }}</div>
        </div>
      </div>
    </div>


    <!-- 操作按钮 -->
    <div class="actions">
      <a-space :size=20>
        <!-- 静音切换 -->
        <AudioMutedOutlined v-if="muted" class="big-icon" @click="toggleMute" />
        <AudioTwoTone v-else class="big-icon" @click="toggleMute" />

        <!-- 关闭语音聊天 -->
        <CloseOutlined style="color: #d94c4f" class="big-icon" @click="exitVoice" />
      </a-space>
    </div>

    <audio ref="audioRef"></audio>
  </div>
</template>


<style scoped lang="scss">
.voice-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

// 语音交互区域
.voice-interaction {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  min-height: 300px;
}

.circle {
  border-radius: 50%;
  opacity: .85;
  transition: transform .08s linear, box-shadow .12s ease;
}

.tips {
  color: #666;
  font-size: 14px;
}

.dots {
  display: flex;
  gap: 8px;
  height: 16px;
  align-items: flex-end;
}

.dots span {
  width: 8px;
  height: 8px;
  background: #d0d6e0;
  border-radius: 50%;
  display: inline-block;
}

.dots span.on {
  background: #8aa4ff;
}

.dots.dancing span {
  animation: beat 1.05s infinite ease-in-out;
}

.dots.dancing span:nth-child(1) { animation-delay: 0s }
.dots.dancing span:nth-child(2) { animation-delay: .18s }
.dots.dancing span:nth-child(3) { animation-delay: .36s }

.current-conversation {
  min-height: 60px;
  width: 100%;
  text-align: center;
  padding: 0 20px;
}

.line {
  font-size: 14px;
  margin: 4px 0;
}

.line.asr {
  color: #444;
}

.line.llm {
  color: #222;
  font-weight: 600;
}

// 聊天记录区域
.chat-history {
  width: 100%;
  max-width: 600px;
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
  margin-top: 20px;
}

.history-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
}

.message-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  border-radius: 8px;

  &.user {
    background: #e3f2fd;
    align-self: flex-end;
    max-width: 80%;

    .message-sender {
      color: #1976d2;
    }
  }

  &.assistant {
    background: #f1f8e9;
    align-self: flex-start;
    max-width: 80%;

    .message-sender {
      color: #388e3c;
    }
  }
}

.message-sender {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.message-content {
  font-size: 14px;
  line-height: 1.4;
  color: #333;
}

// 操作按钮
.actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.big-icon {
  cursor: pointer;
  font-size: 32px;
  padding: 12px;
  background: rgba(210, 224, 238, 0.7);
  border-radius: 50%;
  margin: 10px;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(210, 224, 238, 0.9);
  }

  &.pause-btn {
    background: rgba(255, 193, 7, 0.8);
    color: #856404;
    animation: pulse-pause 1.5s infinite ease-in-out;

    &:hover {
      background: rgba(255, 193, 7, 1);
    }
  }
}

@keyframes pulse-pause {
  0%, 100% { transform: scale(1); opacity: 0.8 }
  50% { transform: scale(1.05); opacity: 1 }
}

@keyframes pulse {
  0%, 100% { opacity: .4 }
  50% { opacity: 1 }
}

@keyframes beat {
  0%, 100% { transform: translateY(0); opacity: .6 }
  50% { transform: translateY(-6px); opacity: 1 }
}

</style>
