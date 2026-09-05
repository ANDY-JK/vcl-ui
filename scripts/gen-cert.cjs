/**
 * 生成自签名 HTTPS 证书（开发用）
 *
 * 用法：node scripts/gen-cert.cjs
 * 生成 key.pem + cert.pem 到项目根目录
 * vite.config.ts 的 server.https 会自动读取这两个文件
 *
 * 为什么需要 HTTPS：浏览器 getUserMedia（摄像头/扫码）在非 HTTPS/非 localhost 下
 * 被安全策略阻止（SecurityError），dev server 必须走 HTTPS 才能让局域网设备访问
 *
 * 手机真机测试：SAN 自动覆盖本机全部局域网 IPv4（重新生成后需重启 dev server）。
 * 证书为自签名（basicConstraints CA:true 便于安装信任）：
 * - 安卓 Chrome：首次访问点「高级 → 继续前往」即可（或安装 cert.pem 为受信任凭据免警告）
 * - iOS Safari：需将 cert.pem 安装为描述文件并在「证书信任设置」开启完全信任
 */
const { generate } = require('selfsigned')
const { writeFileSync } = require('fs')
const { resolve } = require('path')
const { networkInterfaces } = require('os')

/** 收集本机全部非内部 IPv4（含虚拟网卡，访问不到的虚拟段也无害） */
function lanIps() {
  const ips = []
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address)
    }
  }
  return ips
}

async function main() {
  const ips = lanIps()
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
          { type: 7, ip: '127.0.0.1' }, // IP
          ...ips.map((ip) => ({ type: 7, ip })), // 局域网 IP：手机真机访问用
        ],
      },
      // CA 标记：手机「安装证书并信任」路径要求 CA，否则装了也不生效
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
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
  console.log('  SAN 覆盖: localhost, 127.0.0.1' + (ips.length ? ', ' + ips.join(', ') : ''))
}

main().catch((err) => {
  console.error('证书生成失败:', err)
  process.exit(1)
})
