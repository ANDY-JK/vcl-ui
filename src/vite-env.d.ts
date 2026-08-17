/// <reference types="vite/client" />

// Supabase 云端存储配置类型（值来自根目录 .env.local，已 gitignore）
interface ImportMetaEnv {
  /** Supabase 项目 URL */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon / publishable key */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Storage bucket 名称（需在控制台手动创建 public bucket） */
  readonly VITE_SUPABASE_BUCKET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
