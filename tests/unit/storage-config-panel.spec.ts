/**
 * 存储后端配置面板 · 行为锁（第 160 轮）
 *
 * 为什么盯这个面板：它是**用户"对接自己数据库/对象存储"的唯一入口**（合同收集 / 目标收集共用），
 * 也是低代码那条线上"数据往哪存"的唯一开关。此前它**没有任何直接用例**，只被
 * `FormTargetCollect` 的集成用例顺带渲染过（分支覆盖 30.2%），
 * 于是下面两条真问题一直没被发现：
 *
 * ① **保存出去的配置违反 `StorageConfig` 自己写明的契约**：字段注释写着
 *    「supabase 后端配置（**非 supabase 时为空串**）」「S3 兼容后端配置（**非 s3 时为空串**）」
 *    （`defaultStorageConfigFromEnv()` 也遵守）。但面板在编辑副本上切后端时不清旧字段，
 *    保存后整份交给宿主 → 宿主落 localStorage（只脱敏 `secretAccessKey`，
 *    `url`/`anonKey`/`accessKeyId`/`endpoint` 照存）→ 用户以为"切到 local 就干净了"，
 *    磁盘上还留着别的后端的地址与凭据标识；来回切时旧地址还会被静默复用。
 * ② **切换后端后旧报错不消失**：在 supabase 上点保存被拒（"URL 必填"），改切到 S3 ——
 *    面板仍显示"URL 必填"，而那个字段此刻根本没渲染、也无处可填。错误指错字段比没错误更费解。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import StorageConfigPanel from '@/components/storage/StorageConfigPanel.vue'
import {
  emptyStorageConfig,
  normalizeForBackend,
  validateStorageConfig,
  type StorageConfig,
} from '@/components/storage/contract-storage'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const supabaseCfg: StorageConfig = {
  backend: 'supabase',
  url: 'https://proj.supabase.co',
  anonKey: 'anon-key-value',
  bucket: 'contracts',
  endpoint: '',
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
}

const s3Cfg: StorageConfig = {
  backend: 's3',
  url: '',
  anonKey: '',
  bucket: 'my-bucket',
  endpoint: 'https://my-bucket.s3.bitiful.net',
  region: 'us-east-1',
  accessKeyId: 'AKID-example',
  secretAccessKey: 'SK-example',
}

function mountPanel(config: StorageConfig, visible = true) {
  return mount(StorageConfigPanel, {
    props: { config, visible },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

/** 点"保存并切换"（按文案找按钮，避免依赖 DOM 顺序） */
async function clickSave(w: ReturnType<typeof mountPanel>) {
  const btn = w.findAll('button').find((b) => b.text().includes(t('storage.panelSave')))
  expect(btn, '找不到保存按钮').toBeTruthy()
  await btn!.trigger('click')
  await nextTick()
}

/** 切后端 radio */
async function pickBackend(w: ReturnType<typeof mountPanel>, backend: string) {
  const radios = w.findAll('input[type="radio"]')
  const target = radios.find((r) => (r.element as HTMLInputElement).value === backend)
  expect(target, `找不到 ${backend} 的 radio`).toBeTruthy()
  await target!.setValue()
  await nextTick()
}

/** 已 emit 的保存载荷（最后一次） */
function savedPayload(w: ReturnType<typeof mountPanel>): StorageConfig | undefined {
  const ev = w.emitted('save') as [StorageConfig][] | undefined
  return ev?.at(-1)?.[0]
}

let errors: unknown[] = []
beforeEach(() => {
  errors = []
  // 面板内部有 watch → 断言失败时别让 Vue 的告警混进来干扰噪音棘轮
  vi.spyOn(console, 'warn').mockImplementation((...args) => errors.push(args))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('StorageConfigPanel · 显隐与回填', () => {
  it('visible=false 不渲染；置 true 才出现', async () => {
    const w = mountPanel(supabaseCfg, false)
    expect(w.find('.scp-panel').exists(), '关闭状态不应渲染').toBe(false)
    await w.setProps({ visible: true })
    expect(w.find('.scp-panel').exists(), '打开后应渲染').toBe(true)
    w.unmount()
  })

  it('打开时用当前配置回填输入框（不是空白面板）', async () => {
    const w = mountPanel(supabaseCfg)
    const inputs = w.findAll('input.f-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe(supabaseCfg.url)
    expect((inputs[1]!.element as HTMLInputElement).value).toBe(supabaseCfg.anonKey)
    expect((inputs[2]!.element as HTMLInputElement).value).toBe(supabaseCfg.bucket)
    w.unmount()
  })

  it('关闭再打开会丢弃未保存的编辑（重开回到 props.config）', async () => {
    const w = mountPanel(supabaseCfg)
    const urlInput = w.findAll('input.f-input')[0]!
    await urlInput.setValue('https://typed-but-not-saved.supabase.co')
    await w.setProps({ visible: false })
    await w.setProps({ visible: true })
    expect((w.findAll('input.f-input')[0]!.element as HTMLInputElement).value, '未保存的编辑不该残留').toBe(
      supabaseCfg.url,
    )
    w.unmount()
  })

  it('S3 的 Secret Key 用密码框（防旁观者窥屏 / 密码管理器误存）', async () => {
    const w = mountPanel(s3Cfg)
    const pwd = w.findAll('input').filter((i) => (i.element as HTMLInputElement).type === 'password')
    expect(pwd.length, 'Secret Key 必须是 type=password').toBe(1)
    w.unmount()
  })
})

describe('StorageConfigPanel · 校验与报错', () => {
  it('校验失败：不 emit save，并显示对应错误文案', async () => {
    const w = mountPanel(emptyStorageConfig()) // backend=local → 先切到 supabase 且留空
    await pickBackend(w, 'supabase')
    await clickSave(w)
    expect(w.emitted('save'), '校验没过就不能发出去').toBeUndefined()
    expect(w.find('.scp-error').text()).toBe(t('storage.supabaseUrlRequired'))
    w.unmount()
  })

  it('切换后端后旧报错立刻消失（错误不该指着一个没渲染的字段）', async () => {
    const w = mountPanel(emptyStorageConfig())
    await pickBackend(w, 'supabase')
    await clickSave(w)
    expect(w.find('.scp-error').exists(), '前置：先制造一条 supabase 的报错').toBe(true)

    await pickBackend(w, 's3')
    expect(w.find('.scp-error').exists(), '切到 S3 后不该再显示"URL 必填"').toBe(false)
    w.unmount()
  })

  it('补齐后重试：错误消失且 emit 成功', async () => {
    const w = mountPanel(emptyStorageConfig())
    await pickBackend(w, 's3')
    await clickSave(w)
    expect(w.find('.scp-error').exists()).toBe(true)

    const inputs = w.findAll('input.f-input')
    await inputs[0]!.setValue('https://bucket.s3.bitiful.net') // endpoint
    await inputs[1]!.setValue('us-east-1') // region
    await inputs[2]!.setValue('b1') // bucket
    await inputs[3]!.setValue('AKID') // AK
    await inputs[4]!.setValue('SK') // SK
    await clickSave(w)

    expect(w.find('.scp-error').exists(), '成功后不该留着旧错误').toBe(false)
    expect(savedPayload(w)?.backend).toBe('s3')
    w.unmount()
  })

  it('取消只 emit cancel，不 emit save', async () => {
    const w = mountPanel(s3Cfg)
    const cancelBtn = w.findAll('button').find((b) => b.text().includes(t('common.cancel')))
    await cancelBtn!.trigger('click')
    expect(w.emitted('cancel')).toBeTruthy()
    expect(w.emitted('save')).toBeUndefined()
    w.unmount()
  })
})

describe('StorageConfigPanel · 保存的配置必须满足 StorageConfig 契约', () => {
  it('supabase → s3：不带 url/anonKey，带 s3 字段，bucket 复用', async () => {
    const w = mountPanel(supabaseCfg)
    await pickBackend(w, 's3')
    // 用户补 s3 必填（bucket 沿用 supabase 的 'contracts'，这是共字段的既有设计）
    const inputs = w.findAll('input.f-input')
    await inputs[0]!.setValue('https://bucket.s3.bitiful.net')
    await inputs[1]!.setValue('us-east-1')
    await inputs[3]!.setValue('AKID')
    await inputs[4]!.setValue('SK')
    await clickSave(w)

    const p = savedPayload(w)!
    expect(p.backend).toBe('s3')
    expect(p.url, '非 supabase 时 url 必须为空串（契约）').toBe('')
    expect(p.anonKey, '非 supabase 时 anonKey 必须为空串（契约）').toBe('')
    expect(p.endpoint).toBe('https://bucket.s3.bitiful.net')
    expect(p.bucket, 'bucket 是两个云后端共用的字段').toBe('contracts')
    expect(validateStorageConfig(p), '发出去的配置本身必须能过校验').toBeNull()
    w.unmount()
  })

  it('s3 → supabase：不带 endpoint/region/accessKeyId/secretAccessKey', async () => {
    const w = mountPanel(s3Cfg)
    await pickBackend(w, 'supabase')
    const inputs = w.findAll('input.f-input')
    await inputs[0]!.setValue('https://proj.supabase.co')
    await inputs[1]!.setValue('anon-key')
    await clickSave(w)

    const p = savedPayload(w)!
    expect(p.backend).toBe('supabase')
    for (const k of ['endpoint', 'region', 'accessKeyId', 'secretAccessKey'] as const) {
      expect(p[k], `非 s3 时 ${k} 必须为空串（否则会随配置落盘/被复用）`).toBe('')
    }
    expect(p.url).toBe('https://proj.supabase.co')
    expect(validateStorageConfig(p)).toBeNull()
    w.unmount()
  })

  it('s3 → local：所有后端字段清空（"切到本地"就该是干净的）', async () => {
    const w = mountPanel(s3Cfg)
    await pickBackend(w, 'local')
    await clickSave(w)

    const p = savedPayload(w)!
    expect(p).toEqual(emptyStorageConfig())
    expect(validateStorageConfig(p)).toBeNull()
    w.unmount()
  })

  it('宿主给的配置本身就带残留字段时，保存也只剩当前后端（不让脏数据顺流而下）', async () => {
    // 模拟历史脏配置：backend=supabase，却带着 s3 的 endpoint/AK
    const dirty: StorageConfig = { ...supabaseCfg, endpoint: 'https://old.s3.bitiful.net', accessKeyId: 'OLD-AK' }
    const w = mountPanel(dirty)
    await clickSave(w)

    const p = savedPayload(w)!
    expect(p.endpoint).toBe('')
    expect(p.accessKeyId).toBe('')
    expect(p.url).toBe(supabaseCfg.url)
    w.unmount()
  })
})

describe('normalizeForBackend（纯函数）', () => {
  it('local → 全空；不改动入参', () => {
    const src: StorageConfig = { ...s3Cfg, backend: 'local' }
    const out = normalizeForBackend(src)
    expect(out).toEqual(emptyStorageConfig())
    expect(src.endpoint, '不能改传入对象').toBe(s3Cfg.endpoint)
  })

  it('三个后端各自只保留自己的字段（bucket 为共用字段）', () => {
    const fromSupabase = normalizeForBackend(supabaseCfg)
    expect(fromSupabase.endpoint).toBe('')
    expect(fromSupabase.region).toBe('')
    expect(fromSupabase.bucket).toBe('contracts')

    const fromS3 = normalizeForBackend(s3Cfg)
    expect(fromS3.url).toBe('')
    expect(fromS3.anonKey).toBe('')
    expect(fromS3.bucket).toBe('my-bucket')
    expect(fromS3.secretAccessKey).toBe('SK-example')
  })

  it('收敛后的配置对当前后端仍然可校验通过（收敛不破坏有效配置）', () => {
    expect(validateStorageConfig(normalizeForBackend(supabaseCfg))).toBeNull()
    expect(validateStorageConfig(normalizeForBackend(s3Cfg))).toBeNull()
    expect(validateStorageConfig(normalizeForBackend(emptyStorageConfig()))).toBeNull()
  })
})