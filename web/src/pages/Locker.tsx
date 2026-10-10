import { API_BASE } from '../lib/config'
import { useEffect, useState } from 'react'
import { colList, colAdd, colDel, moonPhase, MOODS, byLabel, type ColItem } from '../lib/api'
import MoodCal from '../shell/MoodCal'
import { drawInvoice } from '../lib/invoice'
import { galleryAdd } from '../lib/api'

type Field = { key: string; label: string; type?: 'text' | 'number' | 'area'; ph?: string }
export type LockerDef = {
  col: string; title: string; sub: string
  fields: Field[]
  faces?: [string, string][]      // 心情：先选表情
  moon?: boolean                  // 顶上挂今晚的月相
  render: (i: ColItem) => { head: string; body?: string; tail?: string; image?: string }
}

const s = (v: unknown) => (v == null ? '' : String(v))
const money = (v: unknown) => '¥ ' + Math.abs(Number(v) || 0).toFixed(2)
const date = (t: unknown) => s(t).slice(5, 16).replace('T', ' ')

export const LOCKERS: Record<string, LockerDef> = {
  小金库: {
    col: 'ledger', title: '小金库', sub: 'Treasury',
    fields: [
      { key: 'desc', label: '花在哪', ph: '一杯咖啡' },
      { key: 'amount', label: '金额', type: 'number', ph: '11.9' },
      { key: 'category', label: '分类', ph: '餐饮' },
    ],
    render: (i) => ({
      head: s(i.desc),
      body: [s(i.category), byLabel(s(i.owner) || s(i.by))].filter(Boolean).join(' · '),
      tail: (s(i.kind) === 'in' ? '+ ' : '- ') + money(i.amount),
    }),
  },
  双人日记: {
    col: 'diary', title: '双人日记', sub: 'Diary',
    fields: [{ key: 'text', label: '今天', type: 'area', ph: '写点什么…' }],
    render: (i) => ({ head: s(i.text), body: byLabel(s(i.by)) + ' · ' + date(i.ts) }),
  },
  心情记录: {
    col: 'mood', title: '心情记录', sub: 'Mood',
    faces: MOODS,
    fields: [{ key: 'note', label: '因为', type: 'area', ph: '可选' }],
    render: (i) => ({
      head: s(i.face || '♡') + ' ' + s(i.name) + (s(i.note) ? ' · ' + s(i.note) : ''),
      body: byLabel(s(i.by)) + ' · ' + date(i.ts),
    }),
  },
  收藏夹: {
    col: 'favorites', title: '收藏夹', sub: 'Kept',
    fields: [{ key: 'text', label: '存一句', type: 'area', ph: '好话、好句子……聊天里长按气泡也能直接存' }],
    render: (i) => ({
      head: s(i.text),
      body: [byLabel(s(i.by)), date(i.ts)].filter(Boolean).join(' · '),
    }),
  },
}

function LedgerSummary({ items }: { items: ColItem[] }) {
  const now = new Date()
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  const inMonth = items.filter((i) => s(i.ts).slice(0, 7) === cur)
  const sum = (k: string) => inMonth.filter((i) => s(i.kind) === k)
    .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const out = sum('out'), income = sum('in')
  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]
                    p-4 shadow-[var(--shadow-xs)]">
      <div className="mb-3 text-center text-[length:var(--text-cap)] tracking-[3px] text-[color:var(--color-ink-3)]">
        T R E A S U R Y · {now.getMonth() + 1} 月
      </div>
      <div className="flex items-end justify-between border-t border-dashed border-[var(--color-line)] pt-3">
        <div><div className="text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">支出</div>
          <div className="text-[20px] font-bold tabular-nums">{money(out)}</div></div>
        <div className="text-right"><div className="text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">收入</div>
          <div className="text-[20px] font-bold tabular-nums">{money(income)}</div></div>
      </div>
      <div className="mt-2 text-center text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
        本月 {inMonth.length} 笔 · 共 {items.length} 笔
      </div>
    </div>
  )
}

export default function Locker({ def, onBack }: { def: LockerDef; onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [form, setForm] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [face, setFace] = useState<[string, string] | null>(null)
  const [invoice, setInvoice] = useState<string>('')
  const moon = def.moon ? moonPhase() : null

  const reload = () => { setLoading(true); void colList(def.col).then((x) => { setItems(x); setLoading(false) }) }
  useEffect(reload, [def.col])

  async function add() {
    const body: Record<string, unknown> = { by: 'user' }
    for (const f of def.fields) {
      const v = draft[f.key]?.trim()
      if (v) body[f.key] = f.type === 'number' ? Number(v) : v
    }
    if (def.faces) {
      if (!face) { alert('先选一个今天的心情'); return }
      body.face = face[0]; body.name = face[1]
    }
    if (def.moon && moon) body.moon = moon.face + ' ' + moon.name
    if (Object.keys(body).length < 2) return
    if (def.col === 'ledger') body.kind = 'out'
    if (await colAdd(def.col, body)) { setDraft({}); setFace(null); setForm(false); reload() }
  }

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>
      <h2 className="text-[20px] font-bold tracking-tight">{def.title}</h2>
      <p className="mb-5 font-script text-[length:var(--text-body)] text-[color:var(--color-ink-3)]">{def.sub}</p>

      {moon && (
        <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)]
                        bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
          <span className="text-[22px] leading-none">{moon.face}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[length:var(--text-card)] font-medium">今晚 · {moon.name}</span>
            <span className="block text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">
              月龄 {moon.age} 天 · 亮度 {moon.illumination}%
            </span>
          </span>
        </div>
      )}

      <button onClick={() => setForm((v) => !v)}
        className="mb-3 w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] py-3 text-[color:var(--color-surface)]">
        {form ? '收起' : '+ 记一笔'}
      </button>

      {form && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          {def.faces && (
            <div className="mb-3 flex flex-wrap gap-2">
              {def.faces.map(([f, n]) => (
                <button key={n} onClick={() => setFace([f, n])}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5
                    ${face?.[1] === n ? 'border-[var(--color-ink)] bg-[var(--color-card)]' : 'border-[var(--color-line)]'}`}>
                  <span className="text-[17px] leading-none">{f}</span>
                  <span className="text-[length:var(--text-sub)]">{n}</span>
                </button>
              ))}
            </div>
          )}
          {def.fields.map((f) => (
            <label key={f.key} className="mb-3 block">
              <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{f.label}</span>
              {f.type === 'area' ? (
                <textarea rows={3} value={draft[f.key] ?? ''} placeholder={f.ph}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-line)]
                             bg-[var(--color-card)] px-3 py-2.5 outline-none focus:border-[var(--color-ink)]" />
              ) : (
                <input type={f.type === 'number' ? 'number' : 'text'} value={draft[f.key] ?? ''} placeholder={f.ph}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)]
                             bg-[var(--color-card)] px-3 py-2.5 outline-none focus:border-[var(--color-ink)]" />
              )}
            </label>
          ))}
          <button onClick={add}
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] py-3 text-[color:var(--color-surface)]">存</button>
        </div>
      )}

      {invoice && (
        <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center gap-3 bg-black/80 p-5"
             onClick={(e) => { if (e.target === e.currentTarget) setInvoice('') }}>
          <img src={invoice} alt="发票" className="max-h-[72vh] max-w-full rounded-[var(--radius-md)]" />
          <div className="flex gap-2">
            <button onClick={() => setInvoice('')}
              className="rounded-full border border-white/40 px-5 py-2 text-white">关掉</button>
            <button onClick={async () => {
              const ok = await galleryAdd(invoice, 'invoice.png', '小金库发票')
              alert(ok ? '发票已存进图库 🧾' : '没存上')
              if (ok) setInvoice('')
            }} className="rounded-full bg-white px-5 py-2 text-[color:var(--color-ink)]">存进图库</button>
          </div>
        </div>
      )}
      {def.col === 'ledger' && items.length > 0 && <LedgerSummary items={items} />}
      {def.col === 'mood' && <MoodCal items={items} />}
      {loading && <p className="text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">读取中…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line)] p-8 text-center
                        text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">还是空的</div>
      )}

      {/* 梦按做梦的时间排，最新的在上（旧梦是补进来的，存进去的顺序不等于做梦的顺序） */}
      {items.slice().reverse().map((i) => {
        const r = def.render(i)
        return (
          <div key={i.id}
            className={`mb-2 rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]
              ${def.col === 'diary'
                ? (String(i.by) === 'ai'
                    ? 'ml-6 border-[var(--color-ink-4)] border-l-2 border-l-[var(--color-ink)]'
                    : 'mr-6 border-[var(--color-line)] border-r-2 border-r-[var(--color-ink-3)]')
                : 'border-[var(--color-line)]'}`}>
            {r.image && (
              <img src={`${API_BASE}/gallery/file/${encodeURIComponent(r.image)}`} alt=""
                className="mb-3 max-h-[220px] w-full rounded-[var(--radius-xs)] object-cover" />
            )}
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words leading-relaxed">{r.head}</p>
                {r.body && <p className="mt-1 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{r.body}</p>}
              </div>
              {r.tail && <span className="shrink-0 text-[length:var(--text-sub)] tabular-nums">{r.tail}</span>}
            </div>
            <div className="mt-2 flex gap-4">
              <button onClick={async () => { if (await colDel(def.col, i.id)) reload() }}
                className="text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">删除</button>
              {def.col === 'ledger' && (
                <button onClick={async () => setInvoice(await drawInvoice(i))}
                  className="text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">开发票 🧾</button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
