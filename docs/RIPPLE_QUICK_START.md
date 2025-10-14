# 🌊 波纹效果 - 快速开始

## 🎯 一分钟上手

### 单个按钮添加波纹

```vue
<script setup>
import { ref } from 'vue'
import { useRipple } from '@/composables/useRipple'

const myButtonRef = ref()

// 添加波纹效果
useRipple(myButtonRef, {
  color: 'rgba(107, 154, 152, 0.4)',  // 波纹颜色
  duration: 0.6,                       // 持续时间
  maxScale: 4                          // 最大缩放
})
</script>

<template>
  <button ref="myButtonRef">点我试试</button>
</template>
```

---

### 批量按钮添加波纹

```vue
<script setup>
import { useBatchRipple } from '@/composables/useRipple'

// 为所有 .my-button 类的按钮添加波纹
useBatchRipple('.my-button', {
  color: 'rgba(255, 255, 255, 0.4)'
})
</script>

<template>
  <button class="my-button">按钮 1</button>
  <button class="my-button">按钮 2</button>
  <button class="my-button">按钮 3</button>
</template>
```

---

## 🎨 推荐色彩

### 主题色系

```typescript
// 龙泉青瓷（主按钮）
color: 'rgba(107, 154, 152, 0.4)'

// 汉白玉（工具按钮）
color: 'rgba(255, 255, 255, 0.5)'

// 青龙（滚动按钮）
color: 'rgba(91, 138, 138, 0.4)'

// 墨色（特殊按钮）
color: 'rgba(40, 50, 50, 0.3)'

// 朱砂（删除按钮）
color: 'rgba(248, 113, 113, 0.3)'
```

---

## 📝 注意事项

### 1. 按钮样式要求

```css
button {
  position: relative;  /* 必须 */
  overflow: hidden;    /* 必须 */
}
```

**说明**：composable 会自动设置这两个属性，无需手动添加。

---

### 2. 避免重复绑定

```typescript
// ✅ 正确：使用 composable
useRipple(buttonRef)

// ❌ 错误：多次调用
useRipple(buttonRef)
useRipple(buttonRef)  // 会重复绑定！
```

---

### 3. 动态按钮处理

如果按钮是动态添加的，使用 **批量模式** + **MutationObserver**：

```typescript
import { useBatchRipple } from '@/composables/useRipple'

// 监听 DOM 变化，自动为新按钮添加波纹
const observer = new MutationObserver(() => {
  const newButtons = document.querySelectorAll('.dynamic-button')
  newButtons.forEach(button => {
    if (!button.hasAttribute('data-ripple-attached')) {
      button.setAttribute('data-ripple-attached', 'true')
      // 添加波纹逻辑
    }
  })
})

observer.observe(container, { childList: true, subtree: true })
```

---

## 🚀 完整示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRipple, useBatchRipple } from '@/composables/useRipple'

// 单个按钮
const primaryButton = ref()
useRipple(primaryButton, {
  color: 'rgba(107, 154, 152, 0.4)'
})

// 批量按钮
useBatchRipple('.secondary-button', {
  color: 'rgba(255, 255, 255, 0.5)'
})
</script>

<template>
  <div class="button-group">
    <!-- 主按钮 -->
    <button 
      ref="primaryButton"
      class="primary-button"
    >
      主操作
    </button>
    
    <!-- 次要按钮 -->
    <button class="secondary-button">次要操作 1</button>
    <button class="secondary-button">次要操作 2</button>
    <button class="secondary-button">次要操作 3</button>
  </div>
</template>

<style scoped>
button {
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.primary-button {
  background: linear-gradient(135deg, #6b9a98, #5b8a8a);
  color: white;
}

.secondary-button {
  background: #f1f5f9;
  color: #475569;
}
</style>
```

---

## 🎬 效果预览

### 点击流程

```
1. 用户点击按钮
   ↓
2. 波纹从点击位置扩散
   ● → ◉ → ○
   ↓
3. 0.6秒后自动消失
   ↓
4. DOM 元素自动清理
```

---

## 📚 完整文档

详见：[RIPPLE_EFFECT_SYSTEM.md](./RIPPLE_EFFECT_SYSTEM.md)

---

**快速开始，优雅交互！** 🌊✨
