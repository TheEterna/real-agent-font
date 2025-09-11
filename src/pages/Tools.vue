<template>
  <a-card :title="t('tools.title')">
    <a-list :data-source="items">
      <template #renderItem="{ item }">
        <a-list-item>
          <template #actions>
          </template>
          <a-card class="tool-item" hoverable :bordered="false">
            <div class="title">
              <strong>{{ item.name }}</strong>
              <a-tag color="blue" style="margin-left: 8px">{{ item.category || 'general' }}</a-tag>
            </div>
            <div class="desc" style="margin-top: 8px">{{ item.description || '' }}</div>
          </a-card>
        </a-list-item>
      </template>
    </a-list>

    <a-divider />
    <a-space direction="vertical" style="width:100%">
      <a-select v-model:value="exec.toolName" :placeholder="t('tools.selectTool')">
        <a-select-option v-for="t in items" :key="t.name" :value="t.name">{{t.name}}</a-select-option>
      </a-select>
      <a-textarea v-model:value="exec.argsText" :rows="6" :placeholder="t('tools.toolArgs')" />
      <a-space>
        <a-button type="primary" @click="onExecute">{{ t('tools.execute') }}</a-button>
        <a-button @click="onReset">{{ t('tools.reset') }}</a-button>
      </a-space>
    </a-space>
  </a-card>

  <a-modal v-model:open="resultOpen" :title="t('tools.result')" width="720px" footer-null>
    <pre style="white-space:pre-wrap">{{ resultText }}</pre>
  </a-modal>
</template>

<script setup lang="ts">
import { onMounted, ref, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { listTools, executeTool } from '@/services/tools'

const { t } = useI18n()

interface ToolItem { name: string; description?: string; category?: string }
const items = ref<ToolItem[]>([])
const exec = ref<{toolName?: string; argsText: string}>({ argsText: '{"": ""}' })
const resultOpen = ref(false)
const resultText = ref('')

onMounted(async () => {
  try {
    items.value = await listTools()
  } catch (e) {
    console.warn(e)
  }
})

async function onExecute(){
  if(!exec.value.toolName){ resultText.value = t('tools.noToolSelected'); resultOpen.value = true; return }
  let args: any = {}
  try{ args = exec.value.argsText? JSON.parse(exec.value.argsText): {} }catch(e){
    resultText.value = t('tools.invalidJson') + ': ' + (e as Error).message
    resultOpen.value = true
    return
  }
  try{
    const res = await executeTool({ toolName: exec.value.toolName!, args })
    resultText.value = JSON.stringify(res, null, 2)
  }catch(e){
    resultText.value = t('tools.execError') + ': ' + (e as Error).toString()
  }finally{
    resultOpen.value = true
  }
}

function onReset(){
  exec.value = { argsText: '{"": ""}' }
}
</script>

<style scoped>
.tool-item {
  margin-bottom: 16px;
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.desc {
  color: #666;
  font-size: 14px;
}
.cat {
  color: #1677ff;
}
</style>