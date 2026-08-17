import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './demos/router'
// 组件库设计令牌（CSS 变量）
import '@/components/tokens.css'
// Demo 站点全局重置 + 工具类
import './demos/site.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
