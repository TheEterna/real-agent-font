<template>
  <a-card :title="t('tools.title')">
    <a-row :gutter="16">
      <a-col :span="10">
        <a-input-search v-model:value="search" :placeholder="t('tools.search')" style="margin-bottom:12px" />
        <template v-if="mcpItems.length">
          <a-typography-title :level="5" style="margin-top:0">MCP</a-typography-title>
          <a-list :data-source="mcpItems" :loading="loadingList">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-card class="tool-item" hoverable :bordered="false" @click="pick(item)">
                  <div class="title">
                    <strong>{{ item.spec.name }}</strong>
                    <a-tag color="purple" style="margin-left: 8px">MCP</a-tag>
                  </div>
                  <div class="desc" style="margin-top: 8px">{{ item.spec.description || '' }}</div>
                  <div class="meta" v-if="item.spec.mcpToolSpec">
                    <a-tag color="geekblue">server: {{ item.spec.mcpToolSpec.server }}</a-tag>
                    <a-tag color="cyan" style="margin-left:6px">client: {{ item.spec.mcpToolSpec.client }}</a-tag>
                  </div>
                </a-card>
              </a-list-item>
            </template>
          </a-list>
          <a-divider />
        </template>

        <a-typography-title :level="5">System</a-typography-title>
        <a-list :data-source="systemItems" :loading="loadingList">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-card class="tool-item" hoverable :bordered="false" @click="pick(item)">
                <div class="title">
                  <strong>{{ item.spec.name }}</strong>
                  <a-tag color="blue" style="margin-left: 8px">{{ item.spec.category || 'system' }}</a-tag>
                </div>
                <div class="desc" style="margin-top: 8px">{{ item.spec.description || '' }}</div>
              </a-card>
            </a-list-item>
          </template>
        </a-list>
      </a-col>

      <a-col :span="14">
        <a-space direction="vertical" style="width:100%">
          <a-select v-model:value="exec.toolName" :placeholder="t('tools.selectTool')">
            <a-select-option v-for="t in items" :key="t.id" :value="t.spec.name">
              <template v-if="isMcp(t)">
                {{ t.spec.name }} ({{ t.spec.mcpToolSpec?.server }} / {{ t.spec.mcpToolSpec?.client }})
              </template>
              <template v-else>
                {{ t.spec.name }} (system)
              </template>
            </a-select-option>
          </a-select>
          <a-textarea v-model:value="exec.argsText" :rows="8" :placeholder="t('tools.toolArgs')" />
          <a-space>
            <a-button type="primary" :loading="executing" @click="onExecute">{{ t('tools.execute') }}</a-button>
            <a-button @click="onReset">{{ t('tools.reset') }}</a-button>
          </a-space>

          <ToolResultViewer v-if="resultRaw"
            :tool-name="exec.toolName"
            :args="safeArgs"
            :raw="resultRaw"
            :loading="executing"
          />
        </a-space>
      </a-col>
    </a-row>
  </a-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listTools, executeTool, type ToolListItem } from '@/services/tools'
import ToolResultViewer from '@/components/ToolResultViewer.vue'

const { t } = useI18n()
const items = ref<ToolListItem[]>([])
const loadingList = ref(false)
const search = ref('')

const exec = ref<{toolName?: string; argsText: string}>({ argsText: '{"": ""}' })
const executing = ref(false)
const resultRaw = ref<any>(null)

onMounted(async () => {
  try {
    loadingList.value = true
    items.value = await listTools()
  } catch (e) {
    console.warn(e)
  } finally {
    loadingList.value = false
  }
})

async function onExecute(){
  if(!exec.value.toolName){
    // 简单提示，结果区显示错误
    resultRaw.value = { ok:false, message: t('tools.noToolSelected') }
    return
  }
  let args: any = {}
  try{ args = exec.value.argsText? JSON.parse(exec.value.argsText): {} }catch(e){
    resultRaw.value = { ok:false, message: t('tools.invalidJson') + ': ' + (e as Error).message }
    return
  }
  executing.value = true
  try{
    const res = await executeTool({ toolName: exec.value.toolName!, args })
    resultRaw.value = res
  }catch(e){
    resultRaw.value = { ok:false, message: t('tools.execError') + ': ' + (e as Error).toString() }
  }finally{
    executing.value = false
  }
}

function onReset(){
  exec.value = { argsText: '{"": ""}' }
  resultRaw.value = null
}

function pick(item: ToolListItem){
  exec.value.toolName = item.spec.name
  // 若 schema 存在，可给出示例（此处仅放空模板，后续可增强）
}

const filteredItems = computed(() => {
  const q = (search.value||'').toLowerCase()
  if (!q) return items.value
  return items.value.filter(it => (it.spec.name||'').toLowerCase().includes(q) || (it.spec.description||'').toLowerCase().includes(q))
})

const safeArgs = computed(() => {
  try{ return exec.value.argsText? JSON.parse(exec.value.argsText): {} }catch{ return {} }
})

function isMcp(item: ToolListItem){
  return (item.spec.category === 'MCP')
}

const mcpItems = computed(() => filteredItems.value.filter(it => isMcp(it)))
const systemItems = computed(() => filteredItems.value.filter(it => !isMcp(it)))
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
.meta {
  margin-top: 8px;
}
</style>