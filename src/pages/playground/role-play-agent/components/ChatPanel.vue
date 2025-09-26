<template>
  <a-card :bordered="true" class="chat-panel">
    <div class="messages">
      <div class="empty" v-if="!messages.length">暂无消息，开始对话吧～</div>
      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">{{ m.content }}</div>
      </div>
    </div>
    <!-- 录音测试区域 -->
    <div class="test-recording">
      <div class="test-title">录音测试 (调试用)</div>
      <div class="test-controls">
        <a-button 
          type="primary" 
          :loading="testRecording" 
          @click="startTestRecording"
          :disabled="testRecording"
        >
          {{ testRecording ? `录音中 ${testDuration.toFixed(1)}s` : '开始5秒录音测试' }}
        </a-button>
        
        <div v-if="testAudioUrl && !testRecording" class="test-playback">
          <audio :src="testAudioUrl" controls style="width: 300px;"></audio>
          <div class="test-info">
            录制了 {{ testAudioData.length }} 个音频块（每块1600样本/3200字节），<br>
            总样本数: {{ testAudioData.reduce((sum, chunk) => sum + chunk.length, 0) }}，<br>
            总字节数: {{ testAudioData.reduce((sum, chunk) => sum + chunk.length, 0) * 2 }}
          </div>
        </div>
      </div>
    </div>

    <div class="composer">
      <a-input-search v-model:value="draft" :enter-button="'发送'" @search="send" placeholder="来说点什么..." />
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'

interface Message { role: 'user' | 'agent'; content: string }

const props = defineProps<{ sessionId: string }>()

const messages = ref<Message[]>([])
const draft = ref('')

// 录音测试相关状态
const testRecording = ref(false)
const testAudioData = ref<Int16Array[]>([])
const testAudioUrl = ref<string | null>(null)
const testDuration = ref(0)

watchEffect(() => {
  // 占位：当 sessionId 变化时，可在此加载历史
  void props.sessionId
})

function send() {
  if (!draft.value.trim()) return
  messages.value.push({ role: 'user', content: draft.value })
  // 占位：这里应调用后端并流式返回
  setTimeout(() => {
    messages.value.push({ role: 'agent', content: '（示例回复）收到：' + draft.value })
  }, 300)
  draft.value = ''
}

// 录音测试功能
async function startTestRecording() {
  if (testRecording.value) return
  
  try {
    testAudioData.value = []
    testDuration.value = 0
    testRecording.value = true
    
    // 获取麦克风权限
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const audioCtx = new AudioContext()
    
    // 加载AudioWorklet
    await audioCtx.audioWorklet.addModule('/pcm16-worklet.js')
    const source = audioCtx.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(audioCtx, 'pcm16-processor', { 
      processorOptions: { targetSampleRate: 16000 } 
    })
    
    source.connect(workletNode)
    
    // 监听音频数据
    workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const view = new Int16Array(e.data)
      testAudioData.value.push(new Int16Array(view))
    }
    
    // 5秒后停止录音
    setTimeout(() => {
      testRecording.value = false
      workletNode.disconnect()
      source.disconnect()
      stream.getTracks().forEach(track => track.stop())
      audioCtx.close()
      
      // 生成可播放的音频文件
      generateTestAudio()
    }, 5000)
    
    // 计时器
    const timer = setInterval(() => {
      if (!testRecording.value) {
        clearInterval(timer)
        return
      }
      testDuration.value += 0.1
    }, 100)
    
  } catch (error) {
    console.error('录音测试失败:', error)
    testRecording.value = false
  }
}

// 生成可播放的WAV文件
function generateTestAudio() {
  if (testAudioData.value.length === 0) return
  
  // 合并所有音频数据
  const totalSamples = testAudioData.value.reduce((sum, chunk) => sum + chunk.length, 0)
  const combinedData = new Int16Array(totalSamples)
  let offset = 0
  
  for (const chunk of testAudioData.value) {
    combinedData.set(chunk, offset)
    offset += chunk.length
  }
  
  // 生成WAV文件
  const wavBuffer = createWavFile(combinedData, 16000)
  const blob = new Blob([wavBuffer], { type: 'audio/wav' })
  
  // 清理之前的URL
  if (testAudioUrl.value) {
    URL.revokeObjectURL(testAudioUrl.value)
  }
  
  testAudioUrl.value = URL.createObjectURL(blob)
}

// 创建WAV文件格式
function createWavFile(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const length = samples.length
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  
  // WAV文件头
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }
  
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * 2, true)
  
  // 音频数据
  let offset = 44
  for (let i = 0; i < length; i++) {
    view.setInt16(offset, samples[i], true)
    offset += 2
  }
  
  return buffer
}
</script>

<style scoped lang="scss">
.chat-panel { display:flex; flex-direction:column; gap:12px; height:100%; }
.messages { flex:1; overflow:auto; display:grid; gap:8px; padding:8px; background:#fff; border:1px solid #eef2f7; border-radius:8px; }
.msg { display:flex; }
.msg.user { justify-content:flex-end; }
.msg.agent { justify-content:flex-start; }
.bubble { max-width:72%; padding:8px 10px; border-radius:10px; background:#f6f9ff; border:1px solid #e6eaf0; }
.msg.user .bubble { background:#f5faff; border-color:#d6e6ff; }
.empty{ color:#999; font-size:13px; }
.composer { }

// 录音测试区域
.test-recording {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}

.test-title {
  font-size: 16px;
  font-weight: 600;
  color: #495057;
  margin-bottom: 12px;
  text-align: center;
}

.test-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.test-playback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.test-info {
  font-size: 12px;
  color: #6c757d;
  text-align: center;
  background: #e9ecef;
  padding: 8px 12px;
  border-radius: 4px;
}
</style>
