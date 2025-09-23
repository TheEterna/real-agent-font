<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider theme="light" :width="220">
      <div class="brand">Real Agent</div>
      <div style="padding: 0 16px 16px;">
        <a-select
            v-model:value="currentLocale"
            style="width: 100%"
            @change="changeLanguage"
        >
          <a-select-option value="zh">中文</a-select-option>
          <a-select-option value="en">English</a-select-option>
        </a-select>
      </div>
      <a-menu mode="inline" :selectedKeys="[route.path]">
        <a-menu-item key="/chat"><router-link to="/chat">{{ t('menu.chat') }}</router-link></a-menu-item>
        <a-menu-item key="/dashboard"><router-link to="/dashboard">{{ t('menu.dashboard') }}</router-link></a-menu-item>
        <a-menu-item key="/tools"><router-link to="/tools">{{ t('menu.tools') }}</router-link></a-menu-item>
        <a-menu-item key="/agents"><router-link to="/agents">{{ t('menu.agents') }}</router-link></a-menu-item>
        <a-menu-item key="/workflows"><router-link to="/workflows">{{ t('menu.workflows') }}</router-link></a-menu-item>
        <a-menu-item key="/config"><router-link to="/config">{{ t('menu.config') }}</router-link></a-menu-item>
        <a-menu-item key="/logs"><router-link to="/logs">{{ t('menu.logs') }}</router-link></a-menu-item>
        <a-menu-item key="/playground"><router-link to="/playground">{{ t('menu.playground') }}</router-link></a-menu-item>
        <a-menu-item key="/SseTest"><router-link to="/SseTest">{{ t('menu.playground') }}</router-link></a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="header">
        {{ t(`menu.${getCurrentMenu()}`) }}
      </a-layout-header>
      <a-layout-content style="padding: 16px">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t, locale } = useI18n()

const currentLocale = ref(locale.value || 'zh')

const changeLanguage = (lang: string) => {
  locale.value = lang
}

const getCurrentMenu = () => {
  const path = route.path
  if (path === '/') return 'chat'
  return path.substring(1)
}
</script>

<style scoped>
.brand{font-weight:700;font-size:18px;padding:16px}
.header{background:#fff}
</style>
