<script setup lang="ts">
/**
 * 存储后端配置面板（共享组件）——合同收集 / 目标收集等页共用
 *
 * 三后端互斥：local（零配置）/ supabase（url+anonKey+bucket）/ s3（S3 兼容对象存储，
 * 缤纷云 Bitiful 等：endpoint+region+bucket+AK/SK）。
 * 编辑在本地副本上进行：保存时经 validateStorageConfig 校验后 emit('save', 配置)，
 * 取消/关闭不落任何状态——持久化（localStorage）与后端重建（resetBackend）由页面在
 * save 回调里自理。
 */
import { ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import Input from '@/components/form/Input.vue'
import Button from '@/components/basic/Button.vue'
import { validateStorageConfig, emptyStorageConfig, type StorageConfig } from './contract-storage'

const t = useT()

const props = defineProps<{
  /** 当前生效配置（打开面板/外部变更时同步进本地编辑副本） */
  config: StorageConfig
}>()

const emit = defineEmits<{
  /** 保存：已通过校验的完整配置 */
  save: [cfg: StorageConfig]
  /** 取消 / 关闭 */
  cancel: []
}>()

const visible = defineModel<boolean>('visible', { default: false })

/** 本地编辑副本（避免未保存的输入直接污染生效配置） */
const draft = ref<StorageConfig>(emptyStorageConfig())
// 保存是同步 emit，无异步过程 — 死状态（此前恒 false，Button loading 永远不可见）
const error = ref('')

watch(
  () => [visible.value, props.config] as const,
  ([v]) => {
    if (v) {
      draft.value = { ...emptyStorageConfig(), ...props.config }
      error.value = ''
    }
  },
  { immediate: true },
)

function save(): void {
  const err = validateStorageConfig(draft.value)
  if (err) {
    error.value = err
    return
  }
  error.value = ''
  emit('save', { ...draft.value })
}
</script>

<template>
  <div v-if="visible" class="scp-panel">
    <div class="scp-row">
      <span class="scp-label">{{ t('storage.panelBackend') }}</span>
      <label class="scp-option">
        <input v-model="draft.backend" type="radio" value="local" /> {{ t('storage.panelLocalDesc') }}
      </label>
      <label class="scp-option">
        <input v-model="draft.backend" type="radio" value="supabase" /> {{ t('storage.panelSupabaseDesc') }}
      </label>
      <label class="scp-option">
        <input v-model="draft.backend" type="radio" value="s3" /> {{ t('storage.panelS3Desc') }}
      </label>
    </div>

    <template v-if="draft.backend === 'supabase'">
      <div class="scp-row">
        <span class="scp-label">URL</span>
        <Input v-model="draft.url" placeholder="https://xxxx.supabase.co" class="scp-input" />
      </div>
      <div class="scp-row">
        <span class="scp-label">anon key</span>
        <Input v-model="draft.anonKey" placeholder="eyJhbGciOi..." class="scp-input" />
      </div>
      <div class="scp-row">
        <span class="scp-label">bucket</span>
        <Input v-model="draft.bucket" placeholder="contracts" class="scp-input" />
      </div>
      <p class="scp-tip">{{ t('storage.panelSupabaseTip') }}</p>
    </template>

    <template v-else-if="draft.backend === 's3'">
      <div class="scp-row">
        <span class="scp-label">endpoint</span>
        <Input
          v-model="draft.endpoint"
          placeholder="https://my-main-oss-2026.s3.bitiful.net（桶级访问域名）"
          class="scp-input"
        />
      </div>
      <div class="scp-row">
        <span class="scp-label">region</span>
        <Input v-model="draft.region" placeholder="us-east-1（缤纷云不校验）" class="scp-input" />
      </div>
      <div class="scp-row">
        <span class="scp-label">bucket</span>
        <Input v-model="draft.bucket" placeholder="my-main-oss-2026" class="scp-input" />
      </div>
      <div class="scp-row">
        <span class="scp-label">Access Key</span>
        <Input v-model="draft.accessKeyId" placeholder="Access Key ID" class="scp-input" />
      </div>
      <div class="scp-row">
        <span class="scp-label">Secret Key</span>
        <!-- 密钥用密码输入：防旁观者窥屏 / 浏览器密码管理器误存 -->
        <Input v-model="draft.secretAccessKey" placeholder="Secret Access Key" type="password" class="scp-input" />
      </div>
      <p class="scp-tip">{{ t('storage.panelS3Tip') }}</p>
    </template>

    <div v-if="error" class="scp-error">{{ error }}</div>
    <div class="scp-actions">
      <Button size="sm" variant="primary" @click="save">{{ t('storage.panelSave') }}</Button>
      <Button size="sm" variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</Button>
    </div>
  </div>
</template>

<style scoped>
.scp-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  margin: var(--space-2) 0;
}
.scp-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.scp-label {
  flex-shrink: 0;
  width: calc(88px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  color: var(--color-text-secondary);
  text-align: right;
}
.scp-option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: calc(14px * var(--vcl-scale));
  cursor: pointer;
}
.scp-input {
  flex: 1;
  min-width: calc(200px * var(--vcl-scale));
}
.scp-tip {
  margin: 0;
  font-size: calc(13px * var(--vcl-scale));
  color: var(--color-text-muted);
  line-height: 1.5;
}
.scp-error {
  color: var(--color-danger-on-surface);
  font-size: calc(14px * var(--vcl-scale));
}
.scp-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
