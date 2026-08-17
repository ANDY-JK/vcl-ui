<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
import { storageGet, storageSet, storageDelete, dbPut, dbGet, dbDelete } from '@/components/storage/indexedDB'

// localStorage 测试数据
const lsKey = ref('test_key')
const lsValue = ref('test_value')
const lsResult = ref('')
const lsAllKeys = ref<string[]>([])

// IndexedDB 测试数据
const dbKey = ref('test_record')
const dbValue = ref(JSON.stringify({ name: '张三', age: 30, items: ['苹果', '香蕉'] }, null, 2))
const dbResult = ref('')
const dbTTL = ref(0)

async function doSet() {
  storageSet(lsKey.value, lsValue.value)
  refreshLS()
}

async function doGet() {
  lsResult.value = storageGet(lsKey.value) || '(空或不存在)'
}

async function doDelete() {
  storageDelete(lsKey.value)
  lsResult.value = '(已删除)'
  refreshLS()
}

function refreshLS() {
  lsAllKeys.value = Object.keys(localStorage)
    .filter(k => !k.startsWith('_'))
    .slice(0, 20)
}

async function doDBPut() {
  try {
    const val = JSON.parse(dbValue.value)
    await dbPut('demo_store', dbKey.value, val, dbTTL.value || undefined)
    dbResult.value = '✅ 写入成功'
  } catch (e) {
    dbResult.value = `❌ ${e instanceof Error ? e.message : String(e)}`
  }
}

async function doDBGet() {
  const result = await dbGet('demo_store', dbKey.value)
  dbResult.value = result ? JSON.stringify(result, null, 2) : '(空或不存在)'
}

async function doDBDelete() {
  await dbDelete('demo_store', dbKey.value)
  dbResult.value = '(已删除)'
}

onMounted(() => {
  refreshLS()
})
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Storage 组合存储演示</h2>
    <p class="demo-desc">
      统一存储抽象层：<code>storageGet/Set/Delete</code> 走 localStorage（同步，轻量 KV），<code>dbPut/dbGet/dbDelete</code> 走 IndexedDB（异步，支持 TTL 过期、动态 Store、批量事务）。
      组合存储架构见 <code>contract-storage.ts</code>（IndexedDB 毫秒级落盘 + Supabase 异步同步 + 墓碑对账）。
    </p>

    <Card title="localStorage（storageGet / Set / Delete）" style="margin-bottom: 24px">
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:12px;align-items:end">
        <div>
          <label style="font-size:12px;color:var(--color-text-muted)">Key</label>
          <input v-model="lsKey" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-text-muted)">Value</label>
          <input v-model="lsValue" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px" />
        </div>
        <div style="display:flex;gap:6px">
          <Button text="写入" variant="primary" size="sm" @click="doSet" />
          <Button text="读取" variant="secondary" size="sm" @click="doGet" />
          <Button text="删除" variant="danger" size="sm" @click="doDelete" />
        </div>
      </div>

      <div style="margin-bottom:12px">
        <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px">读取结果：</p>
        <pre style="font-size:13px;background:var(--color-bg-alt);padding:8px;border-radius:4px;white-space:pre-wrap">{{ lsResult || '(未读取)' }}</pre>
      </div>

      <div>
        <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px">当前 localStorage 键（前20个）：</p>
        <div style="font-size:12px;font-family:monospace;color:var(--color-text-muted)">
          <span v-for="k in lsAllKeys" :key="k" style="margin-right:8px;display:inline-block;background:var(--color-bg-alt);padding:2px 6px;border-radius:3px">{{ k }}</span>
          <span v-if="!lsAllKeys.length">(空)</span>
        </div>
      </div>
    </Card>

    <Card title="IndexedDB（dbPut / dbGet / dbDelete + TTL）" style="margin-bottom: 24px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;align-items:end">
        <div>
          <label style="font-size:12px;color:var(--color-text-muted)">Key</label>
          <input v-model="dbKey" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-text-muted)">TTL（秒，0=永不过期）</label>
          <input v-model.number="dbTTL" type="number" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px" />
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;color:var(--color-text-muted)">Value（JSON）</label>
        <textarea v-model="dbValue" rows="4" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px;font-family:monospace" />
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <Button text="写入" variant="primary" size="sm" @click="doDBPut" />
        <Button text="读取" variant="secondary" size="sm" @click="doDBGet" />
        <Button text="删除" variant="danger" size="sm" @click="doDBDelete" />
      </div>

      <div>
        <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px">读取结果：</p>
        <pre style="font-size:13px;background:var(--color-bg-alt);padding:8px;border-radius:4px;white-space:pre-wrap;max-height:200px;overflow:auto">{{ dbResult || '(未读取)' }}</pre>
      </div>
    </Card>

    <Card title="存储架构说明">
      <div style="font-size:13px;line-height:1.8;color:var(--color-text-muted)">
        <p><strong>场景路由：</strong></p>
        <ul style="margin-left:20px;margin-bottom:12px">
          <li><code>storageGet/Set/Delete</code> — 纯 localStorage，同步，跨标签页感知。适合 token、开关、小配置。</li>
          <li><code>dbPut/dbGet/dbDelete</code> — IndexedDB，异步，支持 TTL 过期和动态 Store。适合业务记录、表缓存、文件。</li>
        </ul>
        <p><strong>组合存储（contract-storage.ts）：</strong></p>
        <p style="margin-left:20px">IndexedDB 毫秒级落盘（保证拍照进程被杀后数据不丢）+ Supabase 异步同步到云端 + 墓碑机制对账。完整演示见「合同收集」demo。</p>
      </div>
    </Card>

    <Card title="API" style="margin-top:24px">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--color-border);text-align:left;">
          <th style="padding:6px 8px;">函数</th><th style="padding:6px 8px;">后端</th><th style="padding:6px 8px;">说明</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>storageSet(key, value)</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">localStorage</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">同步写入</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>storageGet(key)</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">localStorage</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">同步读取</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>storageDelete(key)</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">localStorage</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">同步删除</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>dbPut(key, value, ttl?)</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">IndexedDB</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">异步写入，可选 TTL（秒）</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>dbGet(key)</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">IndexedDB</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">异步读取，过期返回 null</td></tr>
          <tr><td style="padding:6px 8px;"><code>dbDelete(key)</code></td><td style="padding:6px 8px;">IndexedDB</td><td style="padding:6px 8px;">异步删除</td></tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; line-height: 1.6; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
