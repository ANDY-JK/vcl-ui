/**
 * 生成自签名 HTTPS 证书（开发用）
 *
 * 用法：node scripts/gen-cert.cjs
 * 生成 key.pem + cert.pem 到项目根目录
 * vite.config.ts 的 server.https 会自动读取这两个文件
 *
 * 为什么需要 HTTPS：浏览器 getUserMedia（摄像头/扫码）在非 HTTPS/非 localhost 下
 * 被安全策略阻止（SecurityError），dev server 必须走 HTTPS 才能让局域网设备访问
 */
const { generate } = require('selfsigned')
const { writeFileSync } = require('fs')
const { resolve } = require('path')

async function main() {
  const attrs = [{ name: 'commonName', value: 'localhost' }]

  const pems = await generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' }, // DNS
          { type: 7, ip: '127.0.0.1' },    // IP
        ],
      },
    ],
  })

  const keyPath = resolve(__dirname, '..', 'key.pem')
  const certPath = resolve(__dirname, '..', 'cert.pem')

  writeFileSync(keyPath, pems.private, { mode: 0o600 })
  writeFileSync(certPath, pems.cert)

  console.log('HTTPS 证书已生成:')
  console.log('  key.pem  ->', keyPath)
  console.log('  cert.pem ->', certPath)
  console.log('  有效期: 365 天')
}

main().catch((err) => {
  console.error('证书生成失败:', err)
  process.exit(1)
})
