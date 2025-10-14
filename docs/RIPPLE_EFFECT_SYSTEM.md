# 🌊 玉琢波纹效果系统

## 📅 创建时间：2025-01-14

---

## 🎯 设计理念

**"玉琢天成，点石成波"**

灵感源自玉石点击时的温润质感，当用户点击按钮时，从点击位置向外扩散出柔和的波纹，如同在平静水面投下一颗玉石，营造出优雅的交互反馈。

---

## 🏗️ 系统架构

### 核心文件

```
src/
├── composables/
│   └── useRipple.ts           # 波纹效果 Composable（通用）
└── pages/chat/
    └── ReActPlus.vue           # 集成实现（setupButtonRippleEffects）
```

---

## 📚 Composable API

### 1️⃣ **useRipple** - 单个按钮

```typescript
import { useRipple } from '@/composables/useRipple'

const buttonRef = ref<HTMLElement>()

useRipple(buttonRef, {
  color: 'rgba(107, 154, 152, 0.4)',
  duration: 0.6,
  maxScale: 4
})
```

**Props**：
- `elementRef` - 按钮元素的 ref
- `config.color` - 波纹颜色（默认：`rgba(255, 255, 255, 0.4)`）
- `config.duration` - 动画时长（默认：`0.6s`）
- `config.maxScale` - 最大缩放（默认：`4`）

---

### 2️⃣ **useBatchRipple** - 批量按钮

```typescript
import { useBatchRipple } from '@/composables/useRipple'

useBatchRipple('.my-buttons', {
  color: 'rgba(107, 154, 152, 0.4)',
  duration: 0.6,
  maxScale: 4
})
```

**Props**：
- `selector` - CSS 选择器
- `config` - 同上

---

## 🎨 ReActPlus 集成方案

### 按钮分类与波纹颜色

| 按钮类型 | 选择器 | 波纹颜色 | 色彩寓意 |
|---------|--------|----------|----------|
| 发送按钮 | `.send-button` | `rgba(107, 154, 152, 0.4)` | 龙泉青瓷 |
| 工具栏按钮 | `.input-toolbar button` | `rgba(255, 255, 255, 0.5)` | 汉白玉 |
| 顶部操作 | `.action-btn` | `rgba(107, 154, 152, 0.3)` | 淡雅青瓷 |
| 附件移除 | `.remove-btn` | `rgba(248, 113, 113, 0.3)` | 朱砂红 |
| 滚动按钮 | `.scroll-to-bottom button` | `rgba(91, 138, 138, 0.4)` | 青龙 |
| 水墨按钮 | `.ink-button` | `rgba(40, 50, 50, 0.3)` | 墨色 |
| Ant Design 主按钮 | `.ant-btn-primary` | `rgba(107, 154, 152, 0.4)` | 青瓷 |
| Ant Design 危险按钮 | `.ant-btn-danger` | `rgba(248, 113, 113, 0.3)` | 朱砂 |

---

## ⚙️ 核心实现

### 波纹创建流程

```typescript
const createButtonRipple = (event: MouseEvent, color: string) => {
  const button = event.currentTarget as HTMLElement
  
  // 1. 确保容器样式正确
  button.style.position = 'relative'
  button.style.overflow = 'hidden'
  
  // 2. 计算波纹位置和尺寸
  const rect = button.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = event.clientX - rect.left - size / 2
  const y = event.clientY - rect.top - size / 2
  
  // 3. 创建波纹元素
  const ripple = document.createElement('span')
  ripple.className = 'jade-ripple'
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: ${color};
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    transform: scale(0);
    opacity: 1;
    pointer-events: none;
    z-index: 9999;
  `
  
  button.appendChild(ripple)
  
  // 4. GSAP 动画
  gsap.to(ripple, {
    scale: 4,
    opacity: 0,
    duration: 0.6,
    ease: 'power2.out',
    onComplete: () => ripple.remove()
  })
}
```

---

## 🔧 特殊处理

### 1. 动态按钮监听

使用 **MutationObserver** 监听 DOM 变化，自动为新增按钮添加波纹：

```typescript
const attachmentObserver = new MutationObserver(() => {
  const removeButtons = document.querySelectorAll('.remove-btn')
  removeButtons.forEach(button => {
    if (!button.hasAttribute('data-ripple-attached')) {
      button.setAttribute('data-ripple-attached', 'true')
      button.addEventListener('click', (e) => {
        createButtonRipple(e as MouseEvent, 'rgba(248, 113, 113, 0.3)')
      })
    }
  })
})

attachmentObserver.observe(attachmentsPreview, {
  childList: true,
  subtree: true
})
```

**应用场景**：
- 附件移除按钮（动态添加）
- 消息中的操作按钮
- 工具审批卡片按钮

---

### 2. 避免重复绑定

```typescript
if (!button.hasAttribute('data-ripple-attached')) {
  button.setAttribute('data-ripple-attached', 'true')
  button.addEventListener('click', handler)
}
```

---

## 🎬 动画参数

### 标准配置

```typescript
{
  scale: 4,          // 扩散到 4 倍大小
  opacity: 0,        // 透明度从 1 → 0
  duration: 0.6,     // 持续 0.6 秒
  ease: 'power2.out' // 缓动函数
}
```

### 视觉效果

```
点击瞬间：
  ● (scale: 0, opacity: 1)

0.3秒后：
  ◉ (scale: 2, opacity: 0.5)

0.6秒后：
  ○ (scale: 4, opacity: 0)
  → 自动移除 DOM
```

---

## 🎨 色彩系统

### 主题色波纹

| 色系 | 颜色值 | 应用场景 |
|-----|--------|----------|
| **龙泉青瓷** | `rgba(107, 154, 152, 0.4)` | 主操作按钮 |
| **汉白玉** | `rgba(255, 255, 255, 0.5)` | 工具栏按钮 |
| **青龙** | `rgba(91, 138, 138, 0.4)` | 滚动按钮 |
| **墨色** | `rgba(40, 50, 50, 0.3)` | 水墨模式按钮 |
| **朱砂** | `rgba(248, 113, 113, 0.3)` | 删除/危险按钮 |

### 透明度规则

- **主按钮**：0.4（明显但不突兀）
- **辅助按钮**：0.3（轻盈淡雅）
- **浅色按钮**：0.5（增强可见度）

---

## 📱 响应式设计

### 自适应尺寸

```typescript
const size = Math.max(rect.width, rect.height)
```

**原理**：
- 取按钮宽高的最大值
- 确保波纹完全覆盖按钮
- 圆形按钮和方形按钮都适用

### 触摸设备支持

```typescript
button.addEventListener('click', (e) => {
  // click 事件同时支持鼠标和触摸
  createButtonRipple(e as MouseEvent, color)
})
```

---

## 🛠️ 性能优化

### 1. DOM 清理

```typescript
onComplete: () => {
  ripple.remove()  // 动画结束立即移除
}
```

### 2. 事件委托（可选优化）

```typescript
// 未来可改为事件委托
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target.matches('.send-button')) {
    createButtonRipple(e, 'rgba(107, 154, 152, 0.4)')
  }
})
```

### 3. GPU 加速

```typescript
transform: scale(0)  // 触发 GPU 加速
border-radius: 50%   // 圆形裁剪高效
```

---

## 📊 性能指标

| 指标 | 目标值 | 说明 |
|-----|--------|------|
| 动画帧率 | ≥ 60 FPS | 流畅无卡顿 |
| 内存占用 | < 5KB | 单次波纹 |
| DOM 节点 | 临时 | 动画结束即清理 |
| CPU 占用 | < 5% | GSAP 优化 |

---

## 🐛 常见问题

### Q1: 波纹位置不准确？

**A**: 检查按钮是否有 `transform` 或 `scale`，这些会影响 `getBoundingClientRect()`。

### Q2: 波纹被裁剪了？

**A**: 确保按钮设置了 `overflow: hidden`：

```typescript
button.style.overflow = 'hidden'
```

### Q3: 按钮点击后没有波纹？

**A**: 检查：
1. 按钮是否已挂载到 DOM
2. 事件是否成功绑定
3. 控制台是否有报错

---

## 🚀 未来扩展

### 1. 波纹颜色动态化

```typescript
const getRippleColor = (button: HTMLElement) => {
  const theme = button.dataset.theme
  return RIPPLE_COLORS[theme] || 'rgba(255, 255, 255, 0.4)'
}
```

### 2. 波纹形状变体

```typescript
// 方形波纹
ripple.style.borderRadius = '8px'

// 椭圆波纹
ripple.style.width = size * 1.5 + 'px'
```

### 3. 多波纹叠加

```typescript
// 同时触发多个波纹
for (let i = 0; i < 3; i++) {
  setTimeout(() => {
    createButtonRipple(e, color)
  }, i * 100)
}
```

---

## ✅ 集成检查清单

部署前确认：

- [x] Composable 已创建
- [x] setupButtonRippleEffects 已实现
- [x] 7 类按钮波纹已配置
- [x] MutationObserver 正常工作
- [x] 避免重复绑定机制正常
- [x] GSAP 动画流畅
- [x] DOM 自动清理
- [x] 移动端触摸支持
- [x] 性能测试通过

---

## 📚 参考资料

- **设计灵感**：Material Design Ripple Effect
- **GSAP 文档**：[GreenSock Animation Platform](https://greensock.com/docs/)
- **MDN**：[Touch Events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)

---

## ✨ 总结

### 核心特性

1. ✅ **优雅交互** - 玉石般温润的波纹扩散
2. ✅ **主题融合** - 龙泉青瓷/汉白玉色系
3. ✅ **智能适配** - 自动识别按钮类型
4. ✅ **性能优秀** - GSAP 优化 + 自动清理
5. ✅ **通用复用** - Composable API

### 技术亮点

- 🎨 7 种按钮类型专属波纹
- 🔧 MutationObserver 动态监听
- ⚡ GSAP 高性能动画
- 📱 完美支持触摸设备
- 🧹 自动 DOM 清理

---

**创建时间**：2025-01-14  
**版本**：v1.0  
**状态**：✅ 已完成并集成

🌊✨🎨
