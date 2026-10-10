import { aiName, userName } from './identity'
import type { ColItem } from './api'

const s = (v: unknown) => (v == null ? '' : String(v))
const money = (v: unknown) => (Math.abs(Number(v) || 0)).toFixed(2)
const stamp = (t: unknown) => {
  const d = new Date(s(t))
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function drawInvoice(item: ColItem): Promise<string> {
  const W = 560
  const MONO = '"SF Mono","DejaVu Sans Mono",Menlo,Consolas,monospace'
  const CN = '"Songti SC","Noto Serif SC",serif'
  const isIn = s(item.kind) === 'in'
  const amount = money(item.amount)
  const desc = s(item.desc) || '（没写名目）'
  const cat = s(item.category)
  const owner = s(item.owner || item.by) === 'ai' ? aiName().toUpperCase() : userName().toUpperCase()
  const by = s(item.by) === 'ai' ? aiName().toUpperCase() : userName().toUpperCase()

  // 先按内容算高度
  const lines = Math.ceil(desc.length / 16)
  const H = 820 + lines * 28

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')!

  // 纸
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)

  // 上下撕口锯齿
  const zig = (baseY: number, dir: 1 | -1) => {
    // 白纸上画黑色齿线，齿外留白 = 撕口
    x.strokeStyle = '#000000'; x.lineWidth = 2
    x.beginPath(); x.moveTo(0, baseY)
    for (let i = 0; i <= W; i += 16) { x.lineTo(i + 8, baseY + dir * 10); x.lineTo(i + 16, baseY) }
    x.stroke()
  }
  zig(30, -1)
  zig(H - 30, 1)

  const PAD = 46
  const center = (t: string, y: number, font: string, color = '#000000') => {
    x.textAlign = 'center'; x.font = font; x.fillStyle = color; x.fillText(t, W / 2, y)
  }
  const row = (l: string, r: string, y: number, font = '16px ' + MONO, color = '#000000') => {
    x.font = font; x.fillStyle = color
    x.textAlign = 'left'; x.fillText(l, PAD, y)
    x.textAlign = 'right'; x.fillText(r, W - PAD, y)
  }
  const dashed = (y: number) => {
    x.save(); x.setLineDash([5, 6]); x.strokeStyle = '#000000'; x.lineWidth = 1.6
    x.beginPath(); x.moveTo(PAD, y); x.lineTo(W - PAD, y); x.stroke(); x.restore()
  }

  // 抬头
  center('PERIGEE', 108, '700 30px ' + MONO)
  center('小 金 库', 138, '15px ' + CN, '#000000')
  center('T R E A S U R Y   R E C E I P T', 166, '11px ' + MONO, '#000000')
  dashed(196)

  // 元信息
  let y = 230
  row('NO.', s(item.id).toUpperCase().slice(0, 14), y, '14px ' + MONO, '#000000'); y += 30
  row('DATE', stamp(item.ts), y, '14px ' + MONO, '#000000'); y += 30
  row('TYPE', isIn ? 'CREDIT 收入' : 'DEBIT 支出', y, '14px ' + MONO, '#000000'); y += 30
  row('PAID BY', owner, y, '14px ' + MONO, '#000000'); y += 30
  row('CLERK', by, y, '14px ' + MONO, '#000000'); y += 26
  dashed(y); y += 40

  // 品项
  x.textAlign = 'left'; x.font = '19px ' + CN; x.fillStyle = '#000000'
  for (let i = 0; i < lines; i++) { x.fillText(desc.slice(i * 16, i * 16 + 16), PAD, y); y += 28 }
  if (cat) { x.font = '13px ' + CN; x.fillStyle = '#000000'; x.fillText('[ ' + cat + ' ]', PAD, y); y += 24 }
  y += 12
  dashed(y); y += 46

  // 金额
  x.textAlign = 'left'; x.font = '16px ' + MONO; x.fillStyle = '#000000'; x.fillText('TOTAL', PAD, y)
  x.textAlign = 'right'; x.font = '700 40px ' + MONO; x.fillStyle = '#000000'
  x.fillText((isIn ? '+' : '-') + ' ¥' + amount, W - PAD, y + 6)
  y += 40
  dashed(y); y += 44

  // 条形码（伪码，按 id 生成条宽）
  const seed = s(item.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  let bx = PAD
  x.fillStyle = '#000000'
  for (let i = 0; bx < W - PAD - 4; i++) {
    const w = ((seed >> (i % 8)) % 3) + 1
    if (i % 2 === 0) x.fillRect(bx, y, w, 58)
    bx += w + 2
  }
  y += 58 + 22
  center('*  ' + s(item.id).toUpperCase().slice(0, 12) + '  *', y, '13px ' + MONO, '#000000')
  y += 40

  // 页脚
  center('THANK  YOU  ·  谢 谢 惠 顾', y, '13px ' + MONO, '#000000'); y += 26
  center('账 房 是 我 ， 这 页 给 你 看', y, '13px ' + CN, '#000000')

  return c.toDataURL('image/png')
}
