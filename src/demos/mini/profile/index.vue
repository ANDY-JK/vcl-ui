<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Divider from '@/components/data/Divider.vue'

const router = useRouter()

const user = ref({
  name: '管理员',
  role: '系统管理员',
  phone: '138****8888',
})

const menuGroups = [
  {
    title: '账户',
    items: [
      { icon: 'user', label: '个人信息', desc: '查看和修改账户信息', route: '/mini/settings' },
      { icon: 'shield', label: '安全中心', desc: '密码、登录记录、设备管理', route: '/mini/settings' },
    ],
  },
  {
    title: '数据',
    items: [
      { icon: 'database', label: '数据管理', desc: '备份、恢复、数据导出', route: '/mini/settings' },
      { icon: 'chart-bar', label: '数据报表', desc: '入库/出库/库存统计分析', route: '/mini/settings' },
    ],
  },
  {
    title: '其他',
    items: [
      { icon: 'bell', label: '消息通知', desc: '系统消息、预警通知', route: '/mini/notifications', badge: 3 },
      { icon: 'settings', label: '系统设置', desc: '权限、通知、偏好配置', route: '/mini/settings' },
      { icon: 'circle-question-mark', label: '帮助与反馈', desc: '使用文档、问题反馈', route: '/mini/settings' },
    ],
  },
]
</script>

<template>
  <div class="page">
    <!-- 用户卡片 -->
    <div class="user-card" @click="router.push('/mini/settings')">
      <div class="avatar"><IconSvg type="user" size="lg" color="white" /></div>
      <div class="user-info">
        <div class="user-name">{{ user.name }}</div>
        <div class="user-meta">
          <span>{{ user.role }}</span>
          <span class="dot-sep">·</span>
          <span>{{ user.phone }}</span>
        </div>
      </div>
      <IconSvg type="chevron-right" size="sm" color="var(--color-text-muted)" />
    </div>

    <!-- 快捷网格 -->
    <div class="shortcut-grid">
      <button class="shortcut" @click="router.push('/mini/orders')">
        <IconSvg type="file-text" size="md" color="var(--color-primary)" />
        <span>我的订单</span>
      </button>
      <button class="shortcut" @click="router.push('/mini/scan')">
        <IconSvg type="upload" size="md" color="var(--color-success)" />
        <span>扫码出入库</span>
      </button>
      <button class="shortcut" @click="router.push('/mini/favorites')">
        <IconSvg type="star" size="md" color="var(--color-warning)" />
        <span>我的收藏</span>
      </button>
      <button class="shortcut" @click="router.push('/mini/notifications')">
        <IconSvg type="bell" size="md" color="var(--color-danger)" />
        <span>消息中心</span>
      </button>
    </div>

    <!-- 菜单 -->
    <div v-for="group in menuGroups" :key="group.title" class="menu-group">
      <div class="menu-group-title">{{ group.title }}</div>
      <div class="menu-list">
        <button
          v-for="m in group.items" :key="m.label"
          class="menu-item"
          @click="router.push(m.route)"
        >
          <div class="menu-icon"><IconSvg :type="m.icon" size="md" /></div>
          <div class="menu-info">
            <div class="menu-label">{{ m.label }}</div>
            <div class="menu-desc">{{ m.desc }}</div>
          </div>
          <span v-if="m.badge" class="menu-badge">{{ m.badge }}</span>
          <IconSvg type="chevron-right" size="sm" color="var(--color-text-muted)" />
        </button>
      </div>
    </div>

    <Divider />

    <button class="logout-btn">
      <IconSvg type="x" size="sm" />
      退出登录
    </button>
  </div>
</template>

<style scoped>
.page { padding: 12px; }

.user-card {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 16px; margin-bottom: 12px;
  background: var(--color-surface); border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light); cursor: pointer;
  transition: border-color 120ms;
}
.user-card:hover { border-color: var(--color-primary); }
.avatar {
  display: flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--color-primary); flex-shrink: 0;
}
.user-info { flex: 1; }
.user-name { font-size: 18px; font-weight: 600; color: var(--color-text); }
.user-meta { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.dot-sep { color: var(--color-border); }

.shortcut-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  margin-bottom: 16px;
}
.shortcut {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 4px; border: none; border-radius: var(--radius-md);
  background: var(--color-surface); font-size: 11px; color: var(--color-text-secondary);
  cursor: pointer; font-family: inherit;
  transition: background 120ms;
}
.shortcut:hover { background: var(--color-bg-alt); }

.menu-group { margin-bottom: 12px; }
.menu-group-title { font-size: 12px; color: var(--color-text-muted); padding: 0 4px; margin-bottom: 4px; }
.menu-list { background: var(--color-surface); border-radius: var(--radius-md); overflow: hidden; }
.menu-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 14px 12px; border: none; background: transparent;
  cursor: pointer; transition: background 120ms ease; font-family: inherit; text-align: left;
}
.menu-item + .menu-item { border-top: 1px solid var(--color-border-light); }
.menu-item:hover { background: var(--color-bg-alt); }
.menu-icon {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: var(--radius-sm);
  background: var(--color-bg); color: var(--color-text-secondary); flex-shrink: 0;
}
.menu-info { flex: 1; min-width: 0; }
.menu-label { font-size: 14px; color: var(--color-text); }
.menu-desc { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.menu-badge {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--color-danger); color: #fff; font-size: 10px; font-weight: 600;
}

.logout-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 12px; margin-top: 12px;
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-text-muted);
  font-size: 14px; cursor: pointer; transition: all 150ms ease; font-family: inherit;
}
.logout-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }
</style>
