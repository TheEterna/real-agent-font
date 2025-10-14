# 🔊 青花瓷冰裂纹音效系统

## 📅 创建时间：2025-01-14

---

## 🎯 音效系统架构

### 双重音效设计

```
┌─────────────────────────────────────────┐
│        青花瓷冰裂纹音效系统              │
├─────────────────────────────────────────┤
│                                         │
│  🎵 背景音乐层（Background Music）      │
│  ├─ 真实瓷器开片录音                    │
│  ├─ 4秒时长                             │
│  ├─ 随机选择 3 个音频之一                │
│  └─ 音量: 60%                           │
│                                         │
│  🔔 前景音效层（Foreground SFX）        │
│  ├─ 清脆空灵的合成音效                  │
│  ├─ 像乐器（编钟）                      │
│  ├─ 高音调 + 泛音 + 混响                │
│  └─ 依次触发，配合视觉                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🎵 背景音乐 - 真实瓷器开片

### 音频文件

```
/voice/CeramicCracking-1.mp3  ─┐
/voice/CeramicCracking-2.mp3  ─┼─ 随机选择一个
/voice/CeramicCracking-3.mp3  ─┘
```

### 特征

| 属性 | 值 |
|------|-----|
| **时长** | ~4 秒 |
| **音量** | 60% |
| **格式** | MP3 |
| **内容** | 真实瓷器开片录音 |
| **作用** | 营造真实感 |

### 播放时机

```typescript
// 动画开始时播放
startAnimation() {
  playBackgroundMusic()  // 🔊 播放
  ...
}

// 动画完成时停止
onComplete: () => {
  stopBackgroundMusic()  // 🔇 停止
}

// 组件卸载时清理
onUnmounted(() => {
  stopBackgroundMusic()  // 🔇 清理
})
```

### 随机选择实现

```typescript
const playBackgroundMusic = () => {
  const audioFiles = [
    '/voice/CeramicCracking-1.mp3',
    '/voice/CeramicCracking-2.mp3',
    '/voice/CeramicCracking-3.mp3'
  ]
  
  // 随机选择
  const randomAudio = audioFiles[Math.floor(Math.random() * 3)]
  
  backgroundAudio.value = new Audio(randomAudio)
  backgroundAudio.value.volume = 0.6  // 60% 音量
  backgroundAudio.value.play()
}
```

---

## 🔔 前景音效 - 清脆空灵合成音

### 音效特征

**像乐器一样**：
- ✅ 清脆
- ✅ 空灵
- ✅ 高音调
- ✅ 带混响

### 5 层音频合成

```
🎼 音效结构

┌────────────────────────────────────────┐
│ 1️⃣ 主音调 (Main Tone)                  │
│    正弦波 2500-4000Hz                   │
│    音量: 30%                            │
│    衰减: 150ms                          │
│    → 像编钟的主音                       │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 2️⃣ 泛音 (Harmonic)                     │
│    正弦波 × 2 (高八度)                  │
│    音量: 15%                            │
│    衰减: 120ms                          │
│    → 增加空灵感                         │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 3️⃣ 次泛音 (High Harmonic)              │
│    正弦波 × 3 (更高八度)                │
│    音量: 8%                             │
│    衰减: 100ms                          │
│    → 增加透明感                         │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 4️⃣ 脆响声 (Crisp Noise)                │
│    白噪声 + 带通滤波器 6000Hz           │
│    音量: 25%                            │
│    时长: 30ms                           │
│    → 像瓷片撞击                         │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 5️⃣ 混响 (Reverb)                       │
│    0.8秒混响                            │
│    强度: 30%                            │
│    → 空灵悠长                           │
└────────────────────────────────────────┘
```

---

## 🎹 技术细节

### 1️⃣ 主音调 - 高频正弦波

```typescript
const mainOscillator = audioContext.createOscillator()
mainOscillator.type = 'sine'  // 最纯净的波形
mainOscillator.frequency.value = 2500 + Math.random() * 1500  // 2500-4000Hz

const mainGain = audioContext.createGain()
mainGain.gain.setValueAtTime(volume * 0.3, now)
mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)  // 快速衰减

mainOscillator.connect(mainGain)
mainOscillator.start(now)
mainOscillator.stop(now + 0.15)
```

**关键参数**：
- **频率 2500-4000Hz** - 很高，像编钟的高音
- **正弦波** - 最纯净，没有杂音
- **指数衰减** - 快速消失，模拟瓷器破裂

**效果**：清脆、纯净的主音调

---

### 2️⃣ 泛音 - 高八度

```typescript
const harmonicOscillator = audioContext.createOscillator()
harmonicOscillator.type = 'sine'
harmonicOscillator.frequency.value = baseFreq * 2  // 高八度

const harmonicGain = audioContext.createGain()
harmonicGain.gain.setValueAtTime(volume * 0.15, now)
harmonicGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

harmonicOscillator.connect(harmonicGain)
```

**为什么需要泛音**：
- 单一频率太单调
- 泛音增加丰富度
- 模拟真实乐器

**频率关系**：
```
主音:   2500Hz
泛音:   5000Hz (× 2)
次泛音: 7500Hz (× 3)
```

**效果**：增加空灵感，像寺庙编钟

---

### 3️⃣ 次泛音 - 更高八度

```typescript
const highHarmonicOscillator = audioContext.createOscillator()
highHarmonicOscillator.type = 'sine'
highHarmonicOscillator.frequency.value = baseFreq * 3  // 再高八度

const highHarmonicGain = audioContext.createGain()
highHarmonicGain.gain.setValueAtTime(volume * 0.08, now)
highHarmonicGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
```

**特点**：
- 音量更小（8%）
- 衰减更快（100ms）
- 频率更高（× 3）

**效果**：增加透明感，像水晶

---

### 4️⃣ 脆响声 - 短促白噪声

```typescript
// 创建白噪声
const noiseBufferSize = audioContext.sampleRate * 0.03  // 30ms
const noiseBuffer = audioContext.createBuffer(1, noiseBufferSize, audioContext.sampleRate)
const noiseData = noiseBuffer.getChannelData(0)

for (let i = 0; i < noiseBufferSize; i++) {
  const decay = 1 - (i / noiseBufferSize)
  noiseData[i] = (Math.random() * 2 - 1) * decay  // 衰减白噪声
}

// 带通滤波器
const bandpassFilter = audioContext.createBiquadFilter()
bandpassFilter.type = 'bandpass'
bandpassFilter.frequency.value = 6000  // 很高的频率
bandpassFilter.Q.value = 5  // 窄带

noiseSource.connect(bandpassFilter).connect(noiseGain)
```

**关键技术**：
- **白噪声** - 包含所有频率
- **带通滤波器** - 只保留 6000Hz 附近
- **窄带（Q=5）** - 很尖锐

**效果**：像瓷片撞击的脆响

---

### 5️⃣ 混响 - 增加空灵感

```typescript
const convolver = audioContext.createConvolver()

// 创建混响冲激响应
const reverbLength = audioContext.sampleRate * 0.8  // 0.8秒
const reverbBuffer = audioContext.createBuffer(2, reverbLength, audioContext.sampleRate)

for (let channel = 0; channel < 2; channel++) {
  const channelData = reverbBuffer.getChannelData(channel)
  for (let i = 0; i < reverbLength; i++) {
    // 指数衰减的随机噪声
    channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (reverbLength * 0.3))
  }
}

convolver.buffer = reverbBuffer

// 音源 → 混响 → 输出
mainGain.connect(convolver)
convolver.connect(reverbGain)
reverbGain.connect(audioContext.destination)
```

**混响原理**：
1. 声音在空间中反射
2. 形成多次回声
3. 逐渐衰减

**效果**：声音悠长，空灵感十足

---

## 🎚️ 音频路由

### 信号流图

```
主音调 ────┬──→ 混响 ──→ 输出
           └──→ 直连 ──→ 输出

泛音 ──────┬──→ 混响 ──→ 输出
           └──→ 直连 ──→ 输出

次泛音 ────┴──→ 混响 ──→ 输出

脆响 ─────────→ 直连 ──→ 输出
```

**设计思路**：
- **主音调/泛音**：既过混响，又直连
  - 混响增加空灵感
  - 直连保持清晰度
- **脆响**：只直连
  - 保持短促尖锐
  - 不需要混响

---

## 📊 音效触发时机

### 阶段 1: 裂纹出现 (0-2.5s)

```typescript
tiles.forEach((tile, index) => {
  tl.to(tile, {
    crackProgress: 1,
    onStart: () => {
      if (index % 5 === 0) {  // 🔥 每 5 片播放一次
        playCrackSound(0.2 + Math.random() * 0.3)  // 音量 20-50%
      }
    }
  }, index * 0.035)
})
```

**触发规律**：
```
瓷片 0:  播放 ✅
瓷片 1:  -
瓷片 2:  -
瓷片 3:  -
瓷片 4:  -
瓷片 5:  播放 ✅
...
瓷片 70: 播放 ✅
```

**音量**：随机 20-50%，避免单调

---

### 阶段 3: 瓷片脱落 (2.8-4s)

```typescript
tiles.forEach((tile, index) => {
  tl.to(tile, {
    offsetY: 200 + random(0, 100),
    onStart: () => {
      if (index % 8 === 0) {  // 🔥 每 8 片播放一次
        playCrackSound(0.4)  // 音量 40%
      }
    }
  }, 2.8 + index * 0.015)
})
```

**触发规律**：
```
瓷片 0:  播放 ✅
瓷片 1-7:  -
瓷片 8:  播放 ✅
...
瓷片 64: 播放 ✅
```

**音量**：固定 40%，模拟掉落声

---

## 🎵 对比分析

### V1 vs V2 音效

| 特性 | V1 (旧) | V2 (新) |
|------|---------|---------|
| **音调** | 2000-3000Hz | 2500-4000Hz ✅ |
| **波形** | 白噪声 | 正弦波 ✅ |
| **泛音** | ❌ 无 | ✅ 2 层泛音 |
| **混响** | ❌ 无 | ✅ 0.8秒混响 |
| **衰减** | 80ms | 100-150ms ✅ |
| **清脆度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ ✅ |
| **空灵感** | ⭐⭐ | ⭐⭐⭐⭐⭐ ✅ |
| **乐器感** | ❌ 无 | ✅ 像编钟 |

---

## 🎼 频率对比

### V1 音效频谱

```
频率 (Hz)
8000 |
7000 |
6000 |  ░░░░   白噪声（宽频）
5000 |  ░░░░
4000 |  ░░░░
3000 |  ████   高通滤波器
2000 |  ████
1000 |
   0 |________
```

### V2 音效频谱

```
频率 (Hz)
8000 |   ▲    次泛音 (7500Hz)
7000 |   █
6000 |   █ ░  脆响 (6000Hz 窄带)
5000 |   █ ░  泛音 (5000Hz)
4000 |   █ ░
3000 |   █ ░  主音调 (2500-4000Hz)
2000 |   █
1000 |
   0 |________
```

**V2 优势**：
- ✅ 频率更高（更清脆）
- ✅ 层次分明（主音 + 泛音）
- ✅ 有脆响（6000Hz 白噪声）
- ✅ 有混响（空灵感）

---

## 🎚️ 音量控制

### 各层音量比例

```
┌─────────────────────────────────┐
│ 主音调     ████████████  30%   │
│ 脆响       ████████      25%    │
│ 泛音       █████         15%    │
│ 次泛音     ███           8%     │
│ 混响       ██████████    30%    │
└─────────────────────────────────┘
```

### 总体音量

```
背景音乐:  60%  ═══════════════════════════
前景音效:  20-50% (随机) ════════════
```

**平衡原则**：
- 背景音乐是主体
- 前景音效是点缀
- 不互相盖过

---

## 🔧 自定义配置

### 修改背景音乐音量

```typescript
const playBackgroundMusic = () => {
  backgroundAudio.value.volume = 0.6  // 改为 0.4 或 0.8
}
```

### 修改前景音效音量

```typescript
// 阶段 1: 裂纹出现
playCrackSound(0.2 + Math.random() * 0.3)  // 20-50%
// 改为
playCrackSound(0.1 + Math.random() * 0.2)  // 10-30% (更轻)
```

### 修改音调高度

```typescript
// 更高音调
const baseFreq = 3000 + Math.random() * 2000  // 3000-5000Hz

// 更低音调
const baseFreq = 2000 + Math.random() * 1000  // 2000-3000Hz
```

### 修改混响强度

```typescript
const reverbGain = audioContext.createGain()
reverbGain.gain.value = 0.3  // 改为 0.5 (更强) 或 0.1 (更弱)
```

### 修改触发频率

```typescript
// 更频繁
if (index % 3 === 0) {  // 每 3 片一次
  playCrackSound(...)
}

// 更稀疏
if (index % 10 === 0) {  // 每 10 片一次
  playCrackSound(...)
}
```

---

## 📝 总结

### 音效系统特色

1. **双重音效** - 背景 + 前景
2. **真实录音** - 3 个真实瓷器开片音频
3. **合成音效** - 5 层音频合成
4. **清脆空灵** - 像编钟，高音调 + 混响
5. **智能触发** - 配合视觉，不过度

### 技术亮点

- 🎵 **随机选择背景音乐** - 避免重复
- 🔔 **5 层音频合成** - 主音 + 2 层泛音 + 脆响 + 混响
- 🎹 **高频正弦波** - 2500-4000Hz，清脆纯净
- 🌊 **混响效果** - 0.8 秒，空灵悠长
- 🎚️ **音量平衡** - 背景 60%，前景 20-50%

### 美学追求

**"清脆如编钟，空灵若仙乐"**

像寺庙的编钟，高音清脆，余音袅袅，混响悠长，配合青花瓷的破碎视觉，声画合一，天人合一！

---

**创建时间**: 2025-01-14  
**版本**: V2 - 清脆空灵版  
**状态**: ✅ 完成

🔊✨🏺
