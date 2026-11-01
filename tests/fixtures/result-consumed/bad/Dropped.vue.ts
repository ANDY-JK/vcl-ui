export async function dropped(): Promise<void> {
  await downloadBlob('a')
  copyText('b')
  void downloadScreenshot('c')
}
