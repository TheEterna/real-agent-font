<template>
  <a-layout v-if="!isStandalone" style="overflow: hidden;min-height: 100vh;height: 100vh;">
    <a-layout-sider
      theme="light"
      :width="220"
      :collapsed-width="0"
      :collapsed="effectiveCollapsed"
      :collapsible="false"
    >
      <div class="sider-inner">
        <div class="sider-top">
          <button class="collapse-btn" @click="toggleCollapse" :title="collapsed ? '展开' : '折叠'" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
            <template v-if="effectiveCollapsed">
              <MenuUnfoldOutlined />
            </template>
            <template v-else>
              <MenuFoldOutlined />
            </template>
          </button>
          <div class="brand" v-show="!effectiveCollapsed">Real Agent</div>
          <div class="lang" v-show="!effectiveCollapsed">
            <a-select
                v-model:value="currentLocale"
                style="width: 100%"
                @change="changeLanguage"
                size="small"
            >
              <a-select-option value="zh">中文</a-select-option>
              <a-select-option value="en">English</a-select-option>
            </a-select>
          </div>
        </div>

        <!-- per-page sidebar content -->
        <router-view name="sider" v-show="!effectiveCollapsed" />

        <div class="sider-spacer"></div>

        <div :class="['sider-bottom', { 'sider-bottom--collapsed': effectiveCollapsed }]" v-show="!effectiveCollapsed">
          <a-tooltip :title="t('menu.chat')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/chat">
              <MessageOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.chat') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.dashboard')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/dashboard">
              <DashboardOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.dashboard') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.tools')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/tools">
              <ToolOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.tools') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.agents')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/agents">
              <RobotOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.agents') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.workflows')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/workflows">
              <ApartmentOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.workflows') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.config')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/config">
              <SettingOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.config') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.logs')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/logs">
              <FileTextOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.logs') }}</span>
            </router-link>
          </a-tooltip>
          <a-tooltip :title="t('menu.playground')" placement="right">
            <router-link :class="['app-icon', { 'app-icon--collapsed': effectiveCollapsed }]" to="/playground">
              <ExperimentOutlined />
              <span v-show="!effectiveCollapsed"> {{ t('menu.playground') }}</span>
            </router-link>
          </a-tooltip>
        </div>
      </div>
    </a-layout-sider>
    <!-- Collapsed floating mini bar (expand button + horizontal icons) -->
    <div v-if="effectiveCollapsed" class="sider-mini" aria-label="quick apps">
      <button class="collapse-btn mini" @click="toggleCollapse" :title="'展开'" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
        <MenuUnfoldOutlined />
      </button>
      <div class="mini-icons">
        <a-tooltip :title="t('menu.chat')" placement="top">
          <router-link class="mini-icon" to="/chat"><MessageOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.dashboard')" placement="top">
          <router-link class="mini-icon" to="/dashboard"><DashboardOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.tools')" placement="top">
          <router-link class="mini-icon" to="/tools"><ToolOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.agents')" placement="top">
          <router-link class="mini-icon" to="/agents"><RobotOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.workflows')" placement="top">
          <router-link class="mini-icon" to="/workflows"><ApartmentOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.config')" placement="top">
          <router-link class="mini-icon" to="/config"><SettingOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.logs')" placement="top">
          <router-link class="mini-icon" to="/logs"><FileTextOutlined /></router-link>
        </a-tooltip>
        <a-tooltip :title="t('menu.playground')" placement="top">
          <router-link class="mini-icon" to="/playground"><ExperimentOutlined /></router-link>
        </a-tooltip>
      </div>
    </div>
    <a-layout>
      <a-layout-header class="header">
        {{ t(`menu.${getCurrentMenu()}`) }}
      </a-layout-header>
      <a-layout-content style="position: relative; overflow: auto;padding: 16px; display: flex;">
        <router-view />
      </a-layout-content>
    </a-layout>

  </a-layout>

  <div v-else style="min-height: 100vh; max-height: 100vh;height: 100vh;">
    <router-view />
  </div>

</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  MessageOutlined,
  DashboardOutlined,
  ToolOutlined,
  RobotOutlined,
  ApartmentOutlined,
  SettingOutlined,
  FileTextOutlined,
  ExperimentOutlined,
} from '@ant-design/icons-vue'

const route = useRoute()
const { t, locale } = useI18n()

const currentLocale = ref(locale.value || 'zh')
const collapsed = ref(false)
const isHovering = ref(false)
const hoverEnterTimer = ref<number | null>(null)
const hoverLeaveTimer = ref<number | null>(null)

const changeLanguage = (lang: string) => {
  locale.value = lang
}

const getCurrentMenu = () => {
  const path = route.path
  if (path === '/') return 'chat'
  return path.substring(1)
}

const isStandalone = computed(() => Boolean(route.meta && (route.meta as any).standalone))
// 悬停自动展开：折叠状态下鼠标移入暂时展开
const effectiveCollapsed = computed(() => collapsed.value && !isHovering.value)

const onMouseEnter = () => {
  if (hoverLeaveTimer.value) { window.clearTimeout(hoverLeaveTimer.value); hoverLeaveTimer.value = null }
  if (!collapsed.value) return
  if (hoverEnterTimer.value) window.clearTimeout(hoverEnterTimer.value)
  hoverEnterTimer.value = window.setTimeout(() => { isHovering.value = true }, 120)
}

const onMouseLeave = () => {
  if (hoverEnterTimer.value) { window.clearTimeout(hoverEnterTimer.value); hoverEnterTimer.value = null }
  if (!collapsed.value) return
  if (hoverLeaveTimer.value) window.clearTimeout(hoverLeaveTimer.value)
  hoverLeaveTimer.value = window.setTimeout(() => { isHovering.value = false }, 80)
}

const toggleCollapse = () => {
  // 点击切换时取消悬停展开，避免视觉抖动
  if (hoverEnterTimer.value) { window.clearTimeout(hoverEnterTimer.value); hoverEnterTimer.value = null }
  if (hoverLeaveTimer.value) { window.clearTimeout(hoverLeaveTimer.value); hoverLeaveTimer.value = null }
  isHovering.value = false
  collapsed.value = !collapsed.value
}
</script>

<style scoped lang="scss">
.brand{font-weight:700;font-size:18px;padding:8px 8px 0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:24px;height:54px}
.header{background:#fff}
.sider-inner{display:flex;flex-direction:column;height:100%;padding:8px}
.sider-top{display:grid;grid-auto-rows:min-content;gap:8px}
.collapse-btn{width:32px;height:32px;border:1px solid #e6eaf0;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:background-color .2s ease}
.collapse-btn:hover{background:#f6f9ff}
.lang{padding:0 0 8px}
.sider-spacer{flex:1}
.sider-bottom{display:grid;gap:6px;transition:all .25s ease}
.sider-bottom--collapsed{display:flex;gap:8px;padding:6px;border:1px solid #eef2f7;background:#fff;border-radius:16px;justify-content:center;align-items:center}
.app-icon{display:flex;align-items:center;gap:8px;border:1px solid #eef2f7;background:#fff;color:#222;padding:8px 10px;border-radius:10px;text-decoration:none;transition:all .25s ease}
.app-icon--collapsed{border-radius:999px;padding:6px;border-color:transparent;background:transparent}
.app-icon--collapsed :deep(svg){font-size:18px}
.app-icon--collapsed.router-link-active{background:#f5faff;border-color:#1677ff}
.app-icon.router-link-active{border-color:#1677ff;background:#f5faff;color:#1677ff}

/* Floating mini bar when collapsed */
.sider-mini{position:fixed;left:8px;bottom:12px;z-index:20;display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #eef2f7;border-radius:18px;padding:6px 8px;box-shadow:0 4px 20px rgba(0,0,0,.06);transition:transform .25s ease, opacity .25s ease}
.sider-mini .mini{width:28px;height:28px;border:1px solid #e6eaf0;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.mini-icons{display:flex;gap:8px}
.mini-icon{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:transparent;border:0;color:#222;text-decoration:none;transition:background-color .2s ease}
.mini-icon:hover{background:#f5faff}
.mini-icon.router-link-active{background:#f0f7ff;color:#1677ff}
</style>
