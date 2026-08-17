<script setup lang="ts">
import IconSvg from '@/components/basic/IconSvg.vue'
import Divider from '@/components/data/Divider.vue'

interface SettingItem {
  label: string
  desc?: string
  type: 'nav' | 'toggle' | 'value'
  value?: string | boolean
  route?: string
}

const settings: { title: string; items: SettingItem[] }[] = [
  {
    title: '账户设置',
    items: [
      { label: '个人信息', desc: '姓名、手机、邮箱', type: 'nav', route: '' },
      { label: '修改密码', type: 'nav', route: '' },
      { label: '指纹/面容登录', type: 'toggle', value: false },
    ],
  },
  {
    title: '通知设置',
    items: [
      { label: '新订单通知', type: 'toggle', value: true },
      { label: '库存预警通知', type: 'toggle', value: true },
      { label: '系统消息通知', type: 'toggle', value: false },
    ],
  },
  {
    title: '通用',
    items: [
      { label: '语言', type: 'value', value: '简体中文' },
      { label: '清空缓存', desc: '当前缓存 128MB', type: 'nav' },
      { label: '检查更新', desc: '当前版本 v2.1.0', type: 'nav' },
    ],
  },
]

function toggleItem(item: SettingItem) {
  if (item.type === 'toggle') {
    item.value = !item.value as boolean
  }
}
</script>

<template>
  <div class="page">
    <div v-for="group in settings" :key="group.title" class="setting-group">
      <div class="group-title">{{ group.title }}</div>
      <div class="setting-list">
        <div
          v-for="item in group.items" :key="item.label"
          class="setting-item"
          @click="toggleItem(item)"
        >
          <div class="setting-info">
            <div class="setting-label">{{ item.label }}</div>
            <div v-if="item.desc" class="setting-desc">{{ item.desc }}</div>
          </div>
          <template v-if="item.type === 'toggle'">
            <span class="toggle" :class="{ on: item.value }">
              <span class="toggle-knob" />
            </span>
          </template>
          <template v-else-if="item.type === 'value'">
            <span class="setting-value">{{ item.value }}</span>
          </template>
          <template v-else>
            <IconSvg type="chevron-right" size="sm" color="var(--color-text-muted)" />
          </template>
        </div>
      </div>
    </div>

    <Divider />

    <div class="about">
      <p>仓储管理系统 WMS v2.1.0</p>
      <p class="about-sub">© 2024 WMS Team. All rights reserved.</p>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 12px; }

.setting-group { margin-bottom: 16px; }
.group-title { font-size: 12px; color: var(--color-text-muted); padding: 0 4px; margin-bottom: 6px; }

.setting-list { background: var(--color-surface); border-radius: var(--radius-md); overflow: hidden; }
.setting-item {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 12px; cursor: pointer;
  transition: background 120ms;
}
.setting-item + .setting-item { border-top: 1px solid var(--color-border-light); }
.setting-item:hover { background: var(--color-bg-alt); }
.setting-info { flex: 1; }
.setting-label { font-size: 14px; color: var(--color-text); }
.setting-desc { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.setting-value { font-size: 13px; color: var(--color-text-muted); }

/* 开关 */
.toggle {
  width: 44px; height: 24px; border-radius: 12px;
  background: var(--color-border); position: relative; flex-shrink: 0;
  transition: background 200ms;
}
.toggle.on { background: var(--color-primary); }
.toggle-knob {
  position: absolute; top: 2px; left: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 200ms;
}
.toggle.on .toggle-knob { transform: translateX(20px); }

.about { text-align: center; padding: 24px 0; color: var(--color-text-muted); font-size: 12px; }
.about-sub { font-size: 11px; margin-top: 4px; }
</style>
