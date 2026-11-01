export async function consumed(): Promise<void> {
  const ok = await downloadBlob('a')
  if (!ok) return
  if (await copyText('b')) return
  void downloadScreenshot('c').then((r) => r)
  return copyText('d')
}
