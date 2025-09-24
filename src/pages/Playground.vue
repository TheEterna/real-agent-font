<template>
  <a-card title="Playground">
    <a-list :data-source="apps" :grid="{ gutter: 16, column: 3 }">
      <template #renderItem="{ item }">
        <a-list-item>
          <a-card hoverable @click="go(item.route)">
            <a-card-meta
              :title="item.title"
              :description="item.description"
            />
          </a-card>
        </a-list-item>
      </template>
    </a-list>
  </a-card>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

type PgApp = { id: string; title: string; description: string; route: string }

// 暂时硬编码一个应用，后续可从后端获取清单
const apps: PgApp[] = [
  {
    id: 'data-lab',
    title: 'Data Lab',
    description: '数据实验室：用最小代价验证数据与可视化的想法',
    route: '/playground/data-lab',
  },
]

function go(path: string){
  router.push(path)
}
</script>