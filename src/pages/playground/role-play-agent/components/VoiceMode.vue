<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { appendMessage } from '../store/chatStore'
import { PauseOutlined, CloseOutlined, AudioMutedOutlined, AudioTwoTone } from '@ant-design/icons-vue'

const props = defineProps<{ sessionId: string; roleId: string }>()
const emit = defineEmits(['exit'])

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
let es: EventSource | null = null

const audioRef = ref<HTMLAudioElement | null>(null)
const muted = ref(false)

// 路线B：实时流，依赖服务端 VAD；本地不再做静音判定

onMounted(() => {
  dotTimer = window.setInterval(() => {
    dot.value = (dot.value % 4) + 1
  }, 800)
  // 进入语音模式即开始聆听
  startRecord().catch(() => {})
})

onBeforeUnmount(() => {
  if (dotTimer) window.clearInterval(dotTimer)
  cleanupRealtime()
})

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
    // 打断当前对话（停止播放 + 终止SSE）
    try { ws?.send('close') } catch {}
    if (es) { try { es.close() } catch {} ; es = null }
    if (audioRef.value) { try { audioRef.value.pause() } catch {} }
    playing.value = false
    turning.value = false
    tips.value = '已打断'
    // 回到聆听
    setTimeout(() => startRecord().catch(() => {}), 200)
  } else {
    // 正在听：不执行动作
  }
}

function toggleMute() {
  muted.value = !muted.value
  if (playerGain) playerGain.gain.value = muted.value ? 0 : 1
  tips.value = muted.value ? '已静音' : '取消静音'
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
  if (!es) openSse()
  // Open WebSocket for PCM frames (reopen if closed)
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) openWs()

  // Forward PCM Int16 buffers from worklet to WS
  workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    try { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(e.data) } } catch {}
  }
}

function cleanupRealtime() {
  if (es) { try { es.close() } catch {} ; es = null }
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
  ws.onopen = () => { /* ready to send PCM */ }
  ws.onerror = () => { tips.value = '语音通道错误' }
  ws.onclose = () => { /* server closed or user exit */ }
}

function openSse() {
  const url = `/api/voice/stream?sessionId=${encodeURIComponent(props.sessionId)}&roleId=${encodeURIComponent(props.roleId)}`
  es = new EventSource(url)
  // user subtitles final (persist to chat)
  bindSse(es, 'user_final', (p) => {
    const text = textOf(p)
    asrText.value = text
    if (text.trim()) appendMessage(props.sessionId, { role: 'user', content: text })
    // switch to assistant responding phase
    assistantResponding.value = true
  })
  // text stream
  bindSse(es, 'llm_delta', (p) => {
    const t = textOf(p)
    if (assistantResponding.value) {
      // assistant reply stream
      llmText.value += t
    } else {
      // treat as user transcript partial during listening phase
      asrText.value = t
    }
  })
  // audio stream: base64 of 24k mono 16-bit PCM
  bindSse(es, 'audio_delta', (b64) => {
    try {
      if (!playerNode) return
      const ab = base64ToArrayBuffer(b64)
      if (ab && ab.byteLength) {
        playerNode.port.postMessage({ type: 'push', pcm16: ab }, [ab])
        if (!playing.value) { playing.value = true; tips.value = '播放中' }
      }
    } catch {}
  })
  bindSse(es, 'done', (p) => {
    tips.value = '本轮结束'
    turning.value = false
    try { playerNode?.port.postMessage({ type: 'done' }) } catch {}
    // persist assistant message
    const reply = llmText.value.trim()
    if (reply) appendMessage(props.sessionId, { role: 'agent', content: reply })
    llmText.value = ''
    assistantResponding.value = false
    if (!playing.value && !recording.value) {
      setTimeout(() => startRecord().catch(() => {}), 200)
    }
  })
  bindSse(es, 'error', (p) => { tips.value = textOf(p) || '发生错误' })
}

function bindSse(es: EventSource, event: string, handler: (payload: string) => void) {
  es.addEventListener(event, (ev: MessageEvent) => {
    const payload = (ev && (ev as any).data) ?? ''
    handler(typeof payload === 'string' ? payload : String(payload))
  })
}

function textOf(p: any): string {
  if (typeof p === 'string') return p
  if (!p || typeof p !== 'object') return ''
  return p.text || p.message || p.delta || ''
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
    <div class="top">
      <div class="circle" :class="{ speaking: recording || playing }"></div>
      <div class="tips">{{ tips }}</div>

      <PauseOutlined class="big-icon" @click="onStateButtonClick"/>
      <div class="dots">
        <span v-for="i in 4" :key="i" :class="{ on: i === dot }"></span>
      </div>
    </div>

    <div class="subtitles">
      <div class="line asr" v-if="asrText">{{ asrText }}</div>
      <div class="line llm" v-if="llmText">{{ llmText }}</div>
    </div>

    <div class="actions">
      <a-space :size=20>
        <!-- 左：状态/打断（不说话显示三点；AI说话显示暂停，点击打断对话） -->

        <!-- 中：静音切换 -->
        <AudioTwoTone v-if="muted" class="big-icon" @click="toggleMute" />
        <AudioMutedOutlined v-else class="big-icon" @click="toggleMute" />

        <!-- 右：关闭语音聊天（退出到文本聊天） -->

        <CloseOutlined style="color: #d94c4f" class="big-icon" @click="exitVoice" />

      </a-space>
    </div>

    <audio ref="audioRef"></audio>
  </div>
</template>


<style scoped lang="scss">
.voice-mode { display:flex; flex-direction:column; align-items:center; gap:16px; width:100%; }
.top { display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:24px; }
.circle { width:200px; height:200px; border-radius:50%; background: radial-gradient(120px 120px at 40% 40%, #f0c, #9cf); opacity:.85; transition: transform .3s, box-shadow .3s; }
.circle.speaking { transform: scale(1.05); box-shadow: 0 0 30px rgba(255, 105, 180, .35); }
.tips { color:#666; font-size:14px; }
.dots { display:flex; gap:6px; }
.dots span { width:8px; height:8px; background:#d0d6e0; border-radius:50%; display:inline-block; }
.dots span.on { background:#8aa4ff; }
.subtitles { min-height:60px; width:100%; text-align:center; }
.line { font-size:14px; }
.line.asr { color:#444; }
.line.llm { color:#222; font-weight:600; margin-top:6px; }
.actions { display:flex; justify-content:center; }
.listening-dots { animation: pulse 1.2s infinite ease-in-out; }
.big-icon { cursor: pointer; font-size: 32px; padding: 12px; background: rgba(210, 224, 238, 0.7); border-radius: 50%; margin: 10px;
}
@keyframes pulse {
  0%, 100% { opacity: .4 }
  50% { opacity: 1 }
}
</style>
