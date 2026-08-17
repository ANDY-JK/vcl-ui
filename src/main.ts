import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// 开发时用源码样式，构建后用 dist 产物
import '@/styles/global.css'
// 外部项目引用: import 'vue-component-lib/dist/vue-component-lib.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
