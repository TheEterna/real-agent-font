import { createApp } from 'vue'
import { createPinia } from 'pinia'
// @ts-expect-error pinia-plugin-persist 类型定义存在问题
import piniaPluginPersist from 'pinia-plugin-persist'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import '@/styles/index.scss'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { getTwoToneColor, setTwoToneColor } from '@ant-design/icons-vue';
import Vue3DraggableResizable from "vue3-draggable-resizable";

setTwoToneColor('#b8ddd9');
getTwoToneColor();

const pinia = createPinia()
pinia.use(piniaPluginPersist)

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(Antd)
app.use(i18n)
app.use(Vue3DraggableResizable)
app.mount('#app')
