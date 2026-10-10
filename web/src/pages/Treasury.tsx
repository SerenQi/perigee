import { userName, aiName } from '../lib/identity'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { colList, colDel, byLabel, type ColItem } from '../lib/api'
import { drawInvoice } from '../lib/invoice'


const s = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => Math.abs(Number(v) || 0)
const yuan = (v: number) => '¥' + v.toFixed(2)
const dayKey = (t: unknown) => s(t).slice(0, 10)

export default function Treasury({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [who, setWho] = useState<'all' | 'user' | 'ai'>('all')
  const [invoice, setInvoice] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = () => colList('ledger').then(setItems)
  useEffect(() => { void load() }, [])

  /* 谁花的（owner）优先；没写 owner 的老账，退回"谁记的"（by） */
  const ownerOf = (i: ColItem) => (s(i.owner) || s(i.by) || 'user')

  const shown = useMemo(() => {
    const list = who === 'all' ? items : items.filter(i => ownerOf(i) === who)
    return list.slice().sort((a, b) => +new Date(s(b.ts)) - +new Date(s(a.ts)))
  }, [items, who])

  const sum = useMemo(() => {
    let out = 0, income = 0
    const p = { user: { in: 0, out: 0 }, ai: { in: 0, out: 0 } }
    items.forEach(i => {
      const v = num(i.amount)
      const o = ownerOf(i) === 'ai' ? 'ai' : 'user'
      if (s(i.kind) === 'in') { income += v; p[o].in += v } else { out += v; p[o].out += v }
    })
    return {
      out, income, hers: p.user.out, mine: p.ai.out, net: income - out,
      hersIn: p.user.in, mineIn: p.ai.in,
      hersBal: p.user.in - p.user.out, mineBal: p.ai.in - p.ai.out,
    }
  }, [items])

  /* 折线图：最近 30 天，每天的支出合计 */
  const line = useMemo(() => {
    const days: { key: string; label: string; v: number }[] = []
    const d = new Date(); d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 29)
    for (let i = 0; i < 30; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, v: 0 })
      d.setDate(d.getDate() + 1)
    }
    shown.forEach(i => {
      if (s(i.kind) === 'in') return
      const g = days.find(x => x.key === dayKey(i.ts))
      if (g) g.v += num(i.amount)
    })
    const max = Math.max(1, ...days.map(x => x.v))
    const W = 300, H = 64
    const pts = days.map((x, idx) => [
      (idx / (days.length - 1)) * W,
      H - (x.v / max) * (H - 8) - 4,
    ] as const)
    const path = pts.map(([px, py], idx) => `${idx ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
    const area = `${path} L${W},${H} L0,${H} Z`
    return { days, max, path, area, W, H, spent: days.reduce((a, b) => a + b.v, 0) }
  }, [shown])

  /* 年 → 月 → 日 三层折叠 */
  const tree = useMemo(() => {
    const years: { y: string; total: number; months: { m: string; label: string; total: number; days: { d: string; label: string; total: number; list: ColItem[] }[] }[] }[] = []
    shown.forEach(i => {
      const t = s(i.ts)
      const y = t.slice(0, 4), m = t.slice(0, 7), d = t.slice(0, 10)
      const v = s(i.kind) === 'in' ? 0 : num(i.amount)
      let Y = years.find(x => x.y === y)
      if (!Y) { Y = { y, total: 0, months: [] }; years.push(Y) }
      Y.total += v
      let M = Y.months.find(x => x.m === m)
      if (!M) { M = { m, label: `${Number(m.slice(5, 7))}月`, total: 0, days: [] }; Y.months.push(M) }
      M.total += v
      let D = M.days.find(x => x.d === d)
      if (!D) { D = { d, label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, total: 0, list: [] }; M.days.push(D) }
      D.total += v
      D.list.push(i)
    })
    return years
  }, [shown])

  const nowMonth = new Date().toISOString().slice(0, 7)
  const isOpen = (k: string, dflt = false) => open[k] ?? dflt

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>

      <div className="mb-1 font-script text-[21px] leading-none">Treasury</div>
      <p className="mb-5 text-[11px] tracking-[1.5px] text-[color:var(--color-ink-3)]">小金库 · 账房是我，这页给你看</p>

      {/* 总览 */}
      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="grid grid-cols-2 gap-3">
          {([[userName(), sum.hersBal, sum.hersIn, sum.hers], [aiName(), sum.mineBal, sum.mineIn, sum.mine]] as const).map(([name, bal, inc, spent]) => (
            <div key={name}>
              <p className="text-[10px] tracking-[1.5px] text-[color:var(--color-ink-3)]">{name} · 余额</p>
              <p className="mt-1 text-[22px] font-medium leading-none">{(bal < 0 ? '−' : '') + yuan(Math.abs(bal))}</p>
              <p className="mt-1.5 text-[10.5px] text-[color:var(--color-ink-3)]">进 {yuan(inc)} · 出 {yuan(spent)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-[var(--color-line)] pt-2 text-[10.5px] text-[color:var(--color-ink-3)]">
          <span>支出合计 {yuan(sum.out)}</span>
          <span>进账合计 {yuan(sum.income)}</span>
        </div>
        {/* 两人分开：谁花的 */}
        <div className="mt-3 flex h-[6px] overflow-hidden rounded-full bg-[var(--color-ink-4)]">
          <span className="bg-[var(--color-ink)]"
            style={{ width: `${sum.out ? (sum.hers / sum.out) * 100 : 50}%` }} />
          <span className="flex-1 bg-[var(--color-ink-3)]" />
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-[color:var(--color-ink-3)]">
          <span>{userName()} {yuan(sum.hers)}</span>
          <span>{aiName()} {yuan(sum.mine)}</span>
        </div>
      </div>

      {/* 流水折线 */}
      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3">
        <div className="mb-1.5 flex justify-between text-[10px] tracking-[1.2px] text-[color:var(--color-ink-3)]">
          <span>近 30 天流水</span>
          <span>{yuan(line.spent)} · 峰值 {yuan(line.max)}</span>
        </div>
        <svg viewBox={`0 0 ${line.W} ${line.H}`} className="w-full" style={{ height: 64 }} preserveAspectRatio="none">
          <path d={line.area} fill="color-mix(in srgb, var(--color-ink) 8%, transparent)" />
          <path d={line.path} fill="none" stroke="var(--color-ink)" strokeWidth="1.4"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[9.5px] text-[color:var(--color-ink-4)]">
          <span>{line.days[0]?.label}</span><span>今天</span>
        </div>
      </div>

      {/* 谁花的 · 筛选 */}
      <div className="mb-4 flex gap-1.5">
        {([['all', '全部'], ['user', `${userName()}花的`], ['ai', `${aiName()}花的`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setWho(k)}
            className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors
              ${who === k ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                          : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[color:var(--color-ink-2)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 年 → 月 → 日 折叠 */}
      {tree.length === 0 && (
        <p className="py-10 text-center text-[12px] text-[color:var(--color-ink-3)]">还没有账。花了钱告诉我，我记。</p>
      )}
      {tree.map(Y => (
        <div key={Y.y} className="mb-3">
          <button onClick={() => setOpen(v => ({ ...v, [Y.y]: !isOpen(Y.y, true) }))}
            className="mb-2 flex w-full items-center gap-2">
            <span className="text-[13px] tracking-[1px] text-[color:var(--color-ink-2)]">{Y.y}</span>
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            <span className="text-[11px] text-[color:var(--color-ink-3)]">{yuan(Y.total)}</span>
          </button>
          {isOpen(Y.y, true) && Y.months.map(M => (
            <div key={M.m} className="mb-2 pl-1">
              <button onClick={() => setOpen(v => ({ ...v, [M.m]: !isOpen(M.m, M.m === nowMonth) }))}
                className="mb-1.5 flex w-full items-center gap-2">
                <span className="rounded-[6px] bg-[var(--color-ink)] px-2 py-[3px] text-[11px] text-[color:var(--color-surface)]">
                  {M.label}
                </span>
                <span className="h-px flex-1 bg-[var(--color-line)]" />
                <span className="text-[11px] text-[color:var(--color-ink-3)]">
                  {yuan(M.total)} {isOpen(M.m, M.m === nowMonth) ? '▾' : '▸'}
                </span>
              </button>
              {isOpen(M.m, M.m === nowMonth) && M.days.map(D => (
                <div key={D.d} className="mb-1.5 pl-2">
                  <button onClick={() => setOpen(v => ({ ...v, [D.d]: !isOpen(D.d, true) }))}
                    className="flex w-full items-center gap-2 py-1">
                    <span className="text-[11px] text-[color:var(--color-ink-3)]">{D.label}</span>
                    <span className="h-px flex-1 bg-[var(--color-line)] opacity-60" />
                    <span className="text-[11px] text-[color:var(--color-ink-3)]">{yuan(D.total)}</span>
                  </button>
                  {isOpen(D.d, true) && (
                    <ul className="rounded-[var(--radius-xs)] bg-[var(--color-surface)]">
                      {D.list.map(i => (
                        <li key={i.id} className="flex items-center gap-3 border-b border-[var(--color-line)] px-3 py-2.5 last:border-b-0">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px]">{s(i.desc) || '（没写名目）'}</p>
                            <p className="text-[10.5px] text-[color:var(--color-ink-3)]">
                              {[s(i.category), byLabel(ownerOf(i)) + ' 花的', '记账 ' + byLabel(s(i.by))].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 text-[13px]">
                            {s(i.kind) === 'in' ? '+' : '-'}{yuan(num(i.amount))}
                          </span>
                          <button onClick={async () => setInvoice(await drawInvoice(i))}
                            className="shrink-0 text-[13px]" title="开发票">🧾</button>
                          <button onClick={async () => { if (confirm('删掉这笔账？')) { await colDel('ledger', i.id); void load() } }}
                            className="shrink-0 text-[13px] text-[color:var(--color-ink-4)]">×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {invoice && createPortal(
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/92 p-5"
             onClick={() => setInvoice('')}>
          <img src={invoice} alt="小票" className="max-h-[80vh] max-w-full rounded-[var(--radius-sm)]" />
          <a href={invoice} download="invoice.png" onClick={e => e.stopPropagation()}
            className="mt-4 rounded-full bg-white/90 px-5 py-2 text-[12px] text-black">存下来</a>
        </div>, document.body)}
    </section>
  )
}
