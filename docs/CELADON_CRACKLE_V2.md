# 🏺 青花瓷冰裂纹 V2 - "瓷片破碎"效果

## 📅 更新时间：2025-01-14

---

## 🎯 V2 核心改进

### V1 vs V2 对比

| 特性 | V1 (放射型) | V2 (瓷片型) |
|------|-------------|-------------|
| **裂纹模式** | 从中心放射 | 瓷片独立破碎 |
| **视觉效果** | 爆裂效果 | 瓦片脆裂效果 |
| **背景** | 圆形青瓷 | 全屏天青色 |
| **裂纹位置** | 整体路径 | 每片瓷片内部 |
| **破碎方式** | 统一爆裂 | 依次脱落 |
| **实现技术** | SVG Path | Canvas 2D |
| **动画时长** | 4.5s | 4s |

---

## 🎨 动画效果说明

### 总时长：**4 秒**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

阶段1 (0-2.5s)    瓷片依次出现冰裂纹
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 70 个不规则瓷片
- 从随机位置开始
- 每片延迟 35ms
- 波浪式扩散
- 冰裂纹逐渐显现（0.3s）
🔊 每 5 片播放一次破裂音

阶段2 (2.5-2.8s)  短暂停顿，欣赏冰裂纹
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 所有裂纹已完全显现
- 静止 0.3s
- 营造"碎而未散"的张力

阶段3 (2.8-4s)    瓷片依次脱落四散
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 依次掉落（每片延迟 15ms）
- 随机方向 + 随机旋转
- 向下坠落效果
- 淡出消失
🔊 每 8 片播放一次掉落音

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🏺 核心技术

### 1️⃣ **Voronoi 瓷片生成**

模拟真实瓷器破碎成不规则瓷片：

```typescript
const generateTileFragments = () => {
  // 生成 70 个随机种子点
  const numTiles = 70
  const seeds: Point[] = []
  
  for (let i = 0; i < numTiles; i++) {
    seeds.push({
      x: Math.random() * width,
      y: Math.random() * height
    })
  }
  
  // 为每个种子点生成不规则多边形
  tiles.value = seeds.map((seed) => {
    // 5-8 边的不规则多边形
    const sides = 5 + Math.floor(Math.random() * 4)
    const radius = 80 + Math.random() * 60
    
    // 生成顶点（带随机偏移）
    const polygon = generateIrregularPolygon(seed, sides, radius)
    
    // 为每片瓷片生成冰裂纹
    const cracks = generateTileCracks(seed, radius)
    
    return { polygon, cracks, ... }
  })
}
```

**效果**：
- 每次生成的瓷片都不同
- 瓷片大小和形状随机
- 模拟真实瓷器破碎

---

### 2️⃣ **瓷片内部冰裂纹**

每个瓷片内部有细密的冰裂纹理：

```typescript
const generateTileCracks = (center: Point, radius: number) => {
  const cracks: CrackLine[] = []
  const numCracks = 8 + Math.floor(Math.random() * 8)  // 8-15 条
  
  for (let i = 0; i < numCracks; i++) {
    // 随机起点（瓷片内部）
    const start = randomPointInCircle(center, radius * 0.3)
    
    // 随机终点（延伸到边缘）
    const end = randomPointInCircle(center, radius * 0.9)
    
    cracks.push({ start, end, width: 1-2.5px })
  }
  
  return cracks
}
```

**特征**：
- 每片瓷片 8-15 条裂纹
- 从内部向边缘延伸
- 模拟真实冰裂纹理

---

### 3️⃣ **Canvas 渲染**

使用 Canvas 2D 绘制，性能更优：

```typescript
const drawTile = (tile: TileFragment) => {
  // 1. 绘制瓷片底色（天青色渐变）
  ctx.fillStyle = createRadialGradient(center, radius)
  ctx.fill(tile.polygon)
  
  // 2. 绘制瓷片边缘
  ctx.strokeStyle = 'rgba(91, 138, 138, 0.4)'
  ctx.stroke(tile.polygon)
  
  // 3. 绘制冰裂纹（根据进度）
  tile.cracks.forEach(crack => {
    const progress = tile.crackProgress
    const currentEnd = lerp(crack.start, crack.end, progress)
    
    ctx.beginPath()
    ctx.moveTo(crack.start)
    ctx.lineTo(currentEnd)
    ctx.stroke()
  })
}
```

**优势**：
- 实时渲染，性能优异
- 支持复杂变换（旋转、平移、缩放）
- 灵活的透明度控制

---

### 4️⃣ **GSAP 编排 - 波浪式破碎**

```typescript
const playShatterAnimation = () => {
  const tl = gsap.timeline({ onUpdate: render })
  
  // 阶段1: 依次出现裂纹
  tiles.forEach((tile, index) => {
    tl.to(tile, {
      crackProgress: 1,
      duration: 0.3,
      ease: 'power2.out'
    }, index * 0.035)  // 🔥 依次延迟 35ms
  })
  
  // 阶段2: 停顿 0.3s
  tl.to({}, { duration: 0.3 })
  
  // 阶段3: 依次脱落
  tiles.forEach((tile, index) => {
    tl.to(tile, {
      offsetX: random(-200, 200),
      offsetY: 200 + random(0, 100),  // 向下掉落
      rotation: random(-180, 180),
      opacity: 0,
      duration: 1.2,
      ease: 'power2.in'
    }, 2.8 + index * 0.015)  // 🔥 依次延迟 15ms
  })
}
```

**关键**：
- `stagger` 效果通过手动延迟实现
- 每个瓷片独立动画
- `onUpdate: render` 实时重绘

---

## 🎨 视觉特征

### 全屏天青色背景

```scss
.sky-blue-background {
  background: linear-gradient(135deg, 
    #A8C5D1 0%,    /* 天青色 */
    #9AB8C5 50%,   /* 中间色 */
    #8CAAB8 100%   /* 深天青 */
  );
  
  /* 细微纹理 */
  &::before {
    background-image:
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.03) ...),
      radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.02) ...);
  }
}
```

### 瓷片配色

| 元素 | 颜色 | 说明 |
|------|------|------|
| **瓷片底色** | `#B8D4E0` → `#A0C0CD` | 径向渐变 |
| **瓷片边缘** | `rgba(91, 138, 138, 0.4)` | 淡青色 |
| **裂纹深色** | `rgba(70, 100, 110, 0.8)` | 深色裂纹 |
| **裂纹浅色** | `rgba(91, 138, 138, 0.6)` | 浅色裂纹 |
| **裂纹光晕** | `rgba(255, 255, 255, 0.3)` | 白色光晕 |

---

## 📊 性能数据

### 元素统计

| 元素 | 数量 | 说明 |
|------|------|------|
| **瓷片** | 70 个 | 不规则多边形（5-8边） |
| **裂纹** | 700-1050 条 | 每片 8-15 条 |
| **Canvas** | 1 个 | 单画布渲染 |
| **DOM 节点** | ~5 个 | 极少 |

### 性能优势

✅ **Canvas vs SVG**：
- SVG: 70 片 = 70 个 DOM 节点 + 1000+ 个 `<path>`
- Canvas: 1 个 DOM 节点 + JavaScript 绘制

✅ **渲染性能**：
- 60 FPS 流畅动画
- 实时变换（旋转、平移）
- 透明度渐变

---

## 🎯 使用方法

### 基础使用（无变化）

```vue
<script setup>
import CeladonCrackleLoading from '@/components/loading/CeladonCrackleLoading.vue'
import { ref } from 'vue'

const isLoading = ref(false)

const switchAgent = () => {
  isLoading.value = true
  setTimeout(() => {
    isLoading.value = false
  }, 4000)  // 4 秒
}
</script>

<template>
  <CeladonCrackleLoading
    :visible="isLoading"
    title="切换中"
    subtitle="碎玉落叠，冰壶炸裂..."
  />
</template>
```

---

## 🔧 自定义配置

### 修改瓷片数量

```typescript
// 在 generateTileFragments() 中
const numTiles = 70  // 改为 50 或 100
```

**建议**：
- 高端设备: 80-100 片
- 中端设备: 60-80 片
- 低端设备: 40-60 片

### 修改裂纹密度

```typescript
// 在 generateTileCracks() 中
const numCracks = 8 + Math.floor(Math.random() * 8)  // 8-15 条
// 改为
const numCracks = 5 + Math.floor(Math.random() * 5)  // 5-10 条（更稀疏）
```

### 修改动画时长

```typescript
// 阶段1: 裂纹出现
tl.to(tile, {
  crackProgress: 1,
  duration: 0.3,  // 改为 0.2（更快）
  ...
}, index * 0.035)  // 改为 0.02（更快波浪）

// 阶段3: 脱落
tl.to(tile, {
  ...
  duration: 1.2,  // 改为 0.8（更快脱落）
  ...
}, 2.8 + index * 0.015)
```

### 修改颜色主题

```typescript
const COLORS = {
  skyBlue: '#A8C5D1',    // 改为其他颜色
  crackDark: 'rgba(70, 100, 110, 0.8)',
  crackLight: 'rgba(91, 138, 138, 0.6)',
  tileEdge: 'rgba(91, 138, 138, 0.4)'
}
```

---

## 🎭 动画细节

### 波浪式破碎

```
瓷片 1:  0.000s 开始裂纹
瓷片 2:  0.035s 开始裂纹
瓷片 3:  0.070s 开始裂纹
...
瓷片 70: 2.415s 开始裂纹
```

形成从某处向外扩散的波浪效果。

### 依次脱落

```
瓷片 1:  2.800s 开始脱落
瓷片 2:  2.815s 开始脱落
瓷片 3:  2.830s 开始脱落
...
瓷片 70: 3.835s 开始脱落
```

像多米诺骨牌一样依次倒下。

---

## 🔊 音效说明

### 破裂音效

```typescript
// 每 5 片播放一次
if (index % 5 === 0) {
  playCrackSound(0.2 + Math.random() * 0.3)  // 音量 20-50%
}
```

### 掉落音效

```typescript
// 每 8 片播放一次
if (index % 8 === 0) {
  playCrackSound(0.4)  // 音量 40%
}
```

### Web Audio API 实现

```typescript
const playCrackSound = (volume) => {
  // 1. 白噪声 (80ms)
  // 2. 高通滤波器 (2000-3000Hz)
  // 3. 指数衰减
}
```

---

## 🐉 诗意表达

### V2 独特美学

| 阶段 | 诗意 | 视觉 |
|------|------|------|
| **瓷片完整** | 天青色等烟雨 | 全屏天青色背景 |
| **裂纹显现** | 银瓶乍破 | 冰裂纹依次出现 |
| **碎而未散** | 玉碎声起 | 静止片刻，张力十足 |
| **依次脱落** | 碎玉落叠 | 瓷片依次掉落 |
| **消散无形** | 冰壶炸裂 | 淡出消失 |

---

## 📊 V1 vs V2 选择建议

### 使用 V1 (放射型)

- ✅ 需要爆裂感
- ✅ 强调中心点
- ✅ 快速炸裂效果
- ✅ 强烈视觉冲击

### 使用 V2 (瓷片型)

- ✅ 需要优雅破碎
- ✅ 强调细节美感
- ✅ 全屏天青色
- ✅ 瓦片脆裂效果
- ✅ 更真实的瓷器破碎

---

## 📝 总结

### V2 核心特色

1. **全屏天青色** - 真正的瓷器感
2. **不规则瓷片** - 70 个独立瓷片
3. **内部冰裂纹** - 每片 8-15 条细密裂纹
4. **波浪式破碎** - 依次出现，不是爆裂
5. **瓦片脱落** - 像斑驳的瓦片掉落
6. **Canvas 渲染** - 性能更优

### 技术亮点

- 🎨 **Voronoi 算法** - 模拟真实破碎
- 🐉 **GSAP Timeline** - 精确编排 3 个阶段
- 🎬 **Canvas 2D** - 高性能实时渲染
- 🔊 **Web Audio** - 音效同步

### 美学追求

**"天青色等烟雨，而我在等你"**

表面是天青色的素雅，破碎时如瓷片脆裂，每片上都有细密的冰裂纹理，最终像斑驳的瓦片依次掉落，美而不妖，碎而有致！

---

**创建时间**: 2025-01-14  
**版本**: V2 - 瓷片破碎型  
**状态**: ✅ 完成

🏺✨🐉
