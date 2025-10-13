# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Real Agent Console 是一个基于 Vue 3 + TypeScript + Vite + Ant Design Vue 的智能体（Agent）交互前端应用。项目采用模块化架构，支持多种 Agent 类型，提供实时流式交互能力。

**技术栈：**
- **框架**: Vue 3 (Composition API)
- **语言**: TypeScript
- **构建工具**: Vite
- **UI 框架**: Ant Design Vue 4.x
- **动画库**: GSAP
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **国际化**: Vue I18n
- **实时通信**: SSE (Server-Sent Events)

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 5173）
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview

# 类型检查
vue-tsc -b
```

**重要**: 项目依赖后端服务，默认代理到 `http://localhost:8080`，可通过 `.env` 文件中的 `VITE_API_BASE_URL` 配置。

## 核心架构

### 1. Agent 注册机制

项目采用 **Agent 注册表模式**，所有 Agent 配置集中在 `src/agent-ui/registry.ts`：

```typescript
// Agent 类型定义
export enum AgentType {
  ReAct = 'ReAct',           // 推理-行动-观察框架
  ReAct_Plus = 'ReAct+',     // 增强版 ReAct
  Coding = 'coding',         // 代码编写（预留）
}

```

**新增 Agent 的步骤：**

1. **在 `src/types/agents.ts` 中定义 Agent 类型**
   ```typescript
   export enum AgentType {
     // ... 现有类型
     YourNewAgent = 'your-agent-type',
   }
   ```

2. **在 `src/agent-ui/registry.ts` 中注册配置**
   ```typescript
   [AgentType.YourNewAgent]: {
     type: AgentType.YourNewAgent,
     title: '新 Agent 标题',
     themeClass: 'theme-your-agent',
     renderer: 'default',
     interactions: {
       sendFnName: 'executeYourAgent',
     },
   }
   ```

3. **创建 Agent 专属样式** (`src/styles/agents/your-agent.css`)
   ```css
   .theme-your-agent {
     /* Agent 专属主题样式 */
   }
   ```

4. **在 `src/composables/useSSE.ts` 中实现执行函数**
   ```typescript
   const executeYourAgent = async (text: string, sessionId: string) => {
     // 实现 SSE 流式通信逻辑
   }
   ```

5. **创建 Agent 页面** (`src/pages/chat/YourAgent.vue`)，参考 `ReAct.vue` 实现

6. **在 `src/router/index.ts` 中添加路由**
   ```typescript
   {
     path: '/chat/your-agent',
     components: {
       default: () => import('@/pages/chat/YourAgent.vue'),
       sider: () => import('@/pages/chat/ChatSider.vue')
     }
   }
   ```

7. **在 `src/pages/chat/ChatSider.vue` 中添加导航按钮**

### 2. SSE 事件流处理

项目使用 `useSSE` Composable 处理 Server-Sent Events 流式通信：

**核心事件类型** (`src/types/events.ts`)：
```typescript
export enum EventType {
  STARTED = 'STARTED',              // 任务开始
  EXECUTING = 'EXECUTING',          // 执行中
  THINKING = 'THINKING',            // 思考中
  ACTION = 'ACTION',                // 动作执行
  OBSERVING = 'OBSERVING',          // 观察结果
  TOOL = 'TOOL',                    // 工具调用
  TOOL_APPROVAL = 'TOOL_APPROVAL',  // 工具审批
  PROGRESS = 'PROGRESS',            // 进度更新（全局）
  ERROR = 'ERROR',                  // 错误
  DONE = 'DONE',                    // 完成（普通）
  DONEWITHWARNING = 'DONEWITHWARNING', // 完成（警告）
  COMPLETED = 'COMPLETED'           // 流结束信号
}
```

**消息聚合规则**：
- 相同 `nodeId` 的事件会累积到同一条消息
- `TOOL` 事件作为独立消息插入（视觉上仍归属于父节点）
- `PROGRESS` 事件不进入消息列表，仅更新全局进度状态
- `COMPLETED` 事件关闭 SSE 连接，不生成消息

### 3. 会话管理

使用 `src/stores/chatStore.ts` 管理多会话状态：

```typescript
// 会话结构
interface Session {
  id: string
  title: string
  updatedAt: Date
}

// 核心方法
- switchConversation(id: string)    // 切换会话
- newConversation()                 // 创建新会话
- selectTag(tag: AgentType)         // 选择 Agent
- getSessionMessages(id: string)    // 获取会话消息
- setSessionMessages(id, messages)  // 保存会话消息
- touchSession(id: string)          // 更新会话时间戳
```

**会话切换机制**：
- 使用 `watch` 监听 `sessionId` 变化
- 切换时保存旧会话消息，加载新会话消息
- 自动清理 `nodeIndex`（用于事件聚合）

### 4. 路由与布局

项目使用 **命名视图**（Named Views）实现侧边栏与主内容分离：

```typescript
{
  path: '/chat/react',
  components: {
    default: () => import('@/pages/chat/ReAct.vue'),    // 主内容
    sider: () => import('@/pages/chat/ChatSider.vue')    // 侧边栏
  }
}
```

`App.vue` 中定义两个 `<router-view>`：
```vue
<router-view name="sider" />  <!-- 侧边栏 -->
<router-view />                <!-- 主内容 -->
```

## 开发规范

### UI 设计原则

**核心理念**：效果优先、炫酷、切合主题、艺术感

- **视觉冲击力**：参考 OpenManus 的演示效果，技术实现可以简单，但视觉呈现必须惊艳
- **动画流畅性**：使用 GSAP 实现高性能动画，注重微交互细节
- **主题一致性**：每个 Agent 有独立主题样式（`theme-react`, `theme-react-plus`, `theme-coding`）
- **玻璃态（Glassmorphism）**：使用 `src/utils/colorUtils.ts` 中的颜色工具生成半透明效果
- **渐进增强**：基础功能稳定，视觉效果逐步提升

**UI 组件使用**：
- 优先使用 Ant Design Vue 组件
- 自定义组件放在 `src/components/`
- 复杂交互可扩展 Ant Design 组件（如 Tooltip、Notification）

### 颜色工具使用

`src/utils/colorUtils.ts` 提供多种颜色生成方法：

```typescript
// 随机玻璃色（浅色、半透明）
generateGlassColor(alpha?, saturation, lightness)

// 适用于 Tooltip 的深色背景（确保文字可读性）
generateTooltipColor(alpha?, saturation, lightness)

// 基于主题色生成浅色版本
generateThemeGlassColor(themeColor, alpha)

// 获取预定义玻璃色彩色板
getGlassColorPalette()

// 随机选择玻璃色/Tooltip 色
getRandomGlassColor()
getRandomTooltipColor()
```

**使用场景**：
- Tooltip 背景色：使用 `getRandomTooltipColor()`（深色，文字可读）
- 卡片背景：使用 `getRandomGlassColor()`（浅色，玻璃态效果）
- 主题色衍生：使用 `generateThemeGlassColor()`

### 架构扩展原则

**关键原则**：严格遵守现有架构，避免过度设计

1. **功能扩展前评估**：
   - 当前架构是否支持？
   - 是否会破坏简洁性和鲁棒性？
   - 是否需要架构升级？（需用户审批）

2. **架构升级条件**：
   - 功能膨胀导致代码混乱
   - 性能瓶颈无法通过优化解决
   - 新需求与现有设计冲突

3. **升级流程**：
   - 向用户说明问题和方案
   - 明确不改变现有功能
   - 获得批准后执行

### 代码质量要求

**TypeScript 严格模式**：
- 启用 `strict: true`
- 避免使用 `any`（必要时添加注释说明）
- 定义清晰的接口和类型

**组件开发**：
- 使用 Composition API
- Props 和 Emits 类型化
- 逻辑复用通过 Composables

**样式管理**：
- 组件样式使用 `scoped`
- 全局样式放在 `src/styles/`
- Agent 主题样式独立文件（`src/styles/agents/`）

**命名规范**：
- 组件：PascalCase（`MessageItem.vue`）
- 文件：kebab-case（`color-utils.ts`）或 PascalCase（组件文件）
- 变量/函数：camelCase
- 常量/枚举：UPPER_SNAKE_CASE 或 PascalCase

## 重要文件说明

### 配置文件
- `vite.config.ts` - Vite 配置（代理、别名、构建）
- `tsconfig.json` - TypeScript 配置（严格模式、路径别名）
- `package.json` - 依赖管理

### 核心目录
```
src/
├── agent-ui/        # Agent 注册表和 UI 配置
├── components/      # 通用组件（MessageItem, ToolBox, StatusIndicator）
├── composables/     # 可复用逻辑（useSSE）
├── pages/           # 页面组件
│   ├── chat/        # 聊天页面（ReAct, ReActPlus, ChatSider）
│   └── playground/  # 实验性功能（角色扮演、数据实验室）
├── router/          # 路由配置
├── services/        # API 服务（http, tools, roleplay）
├── stores/          # 状态管理（chatStore, roleStore）
├── styles/          # 全局样式和 Agent 主题
├── types/           # TypeScript 类型定义
├── utils/           # 工具函数（colorUtils）
├── i18n/            # 国际化配置
├── locales/         # 语言文件（zh.ts, en.ts）
├── constants/       # 常量定义（UI 映射、角色配置）
└── models/          # 数据模型（Attachment, Status, Notification）
```

### 关键文件
- `src/composables/useSSE.ts` - SSE 流处理核心逻辑
- `src/agent-ui/registry.ts` - Agent 注册表
- `src/types/events.ts` - 事件类型定义
- `src/stores/chatStore.ts` - 会话状态管理
- `src/utils/colorUtils.ts` - 颜色生成工具
- `src/pages/chat/ReAct.vue` - Agent 页面模板（最佳实践）

## 后端接口约定

**SSE 流式接口**：
- 端点：`POST /api/agent/chat/react/stream`
- Content-Type: `application/json`
- Accept: `text/event-stream`

**请求体**：
```json
{
  "message": "用户输入",
  "userId": "user-001",
  "sessionId": "session-xxx",
  "agentType": "ReAct"
}
```

**SSE 事件格式**：
```typescript
interface BaseEventItem {
  sessionId?: string
  traceId?: string
  startTime: Date
  endTime?: Date
  spanId?: string
  nodeId?: string        // 事件聚合标识
  agentId: string
  type: EventType        // 事件类型（STARTED, THINKING, TOOL 等）
  message?: string       // 文本内容
  data?: any             // 附加数据（工具调用结果等）
  meta?: object          // 元数据
}
```

## 调试技巧

**SSE 流调试**：
1. 打开浏览器开发者工具 → Network
2. 筛选 `EventStream` 类型
3. 查看 `Messages` 标签页查看实时事件流

**状态调试**：
- 使用 Vue DevTools 查看 Pinia Store
- 查看 `chatStore` 的 `messagesBySession` 了解会话消息

**样式调试**：
- 检查元素的 `class`，确认主题类名已正确应用
- 查看 `src/styles/agents/` 中的对应主题文件

## 反思与改进指南

开发时持续自问：
1. **功能实现**：是否符合 Agent 注册机制？是否破坏了现有架构？
2. **用户体验**：交互是否流畅？视觉效果是否惊艳？加载状态是否明确？
3. **代码质量**：类型定义是否完整？是否有重复代码？是否易于维护？
4. **性能优化**：列表渲染是否需要虚拟滚动？动画是否影响性能？
5. **扩展性**：新功能是否易于集成？是否为未来需求留有余地？

**改进建议提交流程**：
1. 发现架构缺陷或功能瓶颈
2. 分析问题根源和影响范围
3. 提出解决方案（含实现成本和风险评估）
4. 向用户说明并获得批准
5. 在不破坏现有功能的前提下实施

## 特殊注意事项

1. **不要随意修改 Agent 注册表**：
   - 任何对 `src/agent-ui/registry.ts` 的修改需经过充分测试
   - 确保不影响已有 Agent 的运行

2. **SSE 连接管理**：
   - 始终在 `COMPLETED` 或 `ERROR` 事件后关闭连接
   - 避免内存泄漏，组件卸载时清理事件监听器

3. **会话数据持久化**：
   - 当前仅内存存储，刷新页面会丢失
   - 如需持久化，考虑使用 LocalStorage 或后端存储

4. **国际化支持**：
   - 所有用户可见文本应使用 `$t()` 或 `t()` 函数
   - 在 `src/locales/zh.ts` 和 `en.ts` 中添加翻译

5. **Markdown 渲染安全**：
   - 使用 DOMPurify 清理不安全的 HTML
   - 配置 markdown-it 禁用 HTML 标签（`html: false`）

## Playground 实验性功能

`src/pages/playground/` 包含实验性 Agent：

- **角色扮演 Agent** (`role-play-agent/`)：
  - 支持语音交互（WebSocket + PCM 音频流）
  - 多角色选择（孙悟空、哈利波特、蝙蝠侠等）
  - 会话管理和语音模式切换

- **数据实验室** (`DataLab.vue`)：
  - 预留用于数据分析和可视化功能

实验性功能可能不稳定，开发时注意隔离影响范围。

---

**最后提醒**：保持代码简洁、架构清晰、视觉惊艳。遇到架构瓶颈时，先思考再行动，必要时寻求用户批准。
