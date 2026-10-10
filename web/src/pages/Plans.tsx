import { useEffect, useMemo, useState } from 'react'
import { colList, colAdd, colDel, colPatch, type ColItem } from '../lib/api'


const CATS = [
  { key: 'life', label: '生活' },
  { key: 'money', label: '搞钱' },
  { key: 'home', label: '前端装修' },
  { key: 'us', label: '共同' },
  { key: 'ideas', label: '点子池' },
] as const
type CatKey = typeof CATS[number]['key']
type Tab = 'daily' | 'buy' | 'todo'
const s = (v: unknown) => (v == null ? '' : String(v))
const pad = (n: number) => String(n).padStart(2, '0')

/* 提醒时间的展示（有 due 才显示）与备忘桥的真实状态（数据就是 bridge 对象，不编不猜） */
const dueLabel = (due: string) => {
  const d = new Date(due)
  if (isNaN(+d)) return due
  const now = new Date()
  const head = d.toDateString() === now.toDateString() ? '今天'
    : `${d.getMonth() + 1}月${d.getDate()}日`
  return `${head} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const bridgeLabel = (it: ColItem) => {
  if (!it.share) return ''
  const b = it.bridge as { state?: string; at?: string } | undefined
  if (!b) return ' · 到点会告诉他'
  if (b.state === 'sent') return ` · 已告诉他 ${s(b.at)}`
  if (b.state === 'skipped_stale') return ' · 错过没递'
  if (b.state === 'failed') return ' · 递送失败'
  return ''
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = today()
  if (iso === t) return `今天 · ${m}月${d}日`
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  if (iso === `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`) return `昨天 · ${m}月${d}日`
  return `${y !== new Date().getFullYear() ? y + '年' : ''}${m}月${d}日`
}

function MonthCal({ byDay }: { byDay: Record<string, ColItem[]> }) {
  const [off, setOff] = useState(0)
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off)
  const y = base.getFullYear(), m = base.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7 /* 周一开头 */
  const t = today()
  const cells: (string | null)[] = [...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`)]
  return <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
    <div className="mb-3 flex items-center justify-between">
      <button onClick={() => setOff(o => o - 1)} className="px-2 text-[color:var(--color-ink-3)]">‹</button>
      <p className="text-[11px] tracking-[2px] text-[color:var(--color-ink-2)]">{y}年{m + 1}月 · 打卡账本</p>
      <button onClick={() => setOff(o => Math.min(0, o + 1))} className="px-2 text-[color:var(--color-ink-3)]" style={{ opacity: off ? 1 : 0.25 }}>›</button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">
      {['一', '二', '三', '四', '五', '六', '日'].map(w => <span key={w} className="text-[9px] text-[color:var(--color-ink-4)]">{w}</span>)}
      {cells.map((d, i) => {
        if (!d) return <span key={i} />
        const list = byDay[d]
        const doneN = list?.filter(x => x.done).length ?? 0
        const all = list && list.length > 0 && doneN === list.length
        return <div key={i} className={`grid aspect-square place-items-center rounded-[6px] text-[9px]
          ${all ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]'
            : list?.length ? 'bg-[var(--color-card)] text-[color:var(--color-ink-2)]' : 'text-[color:var(--color-ink-4)]'}
          ${d === t ? 'ring-1 ring-[var(--color-ink-2)]' : ''}`}>
          {all ? '✓' : list?.length ? `${doneN}/${list.length}` : new Date(d) <= new Date() ? '·' : ''}
        </div>
      })}
    </div>
  </div>
}

function Row({ it, onToggle, onDel, dim }: { it: ColItem; onToggle: () => void; onDel: () => void; dim?: boolean }) {
  const done = !!it.done
  return <div className={`flex items-start gap-3 border-b border-[var(--color-line)] py-3.5 ${dim ? 'opacity-45' : ''}`}>
    <button onClick={onToggle} className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${done ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[10px] text-[color:var(--color-surface)]' : 'border-[var(--color-ink-3)]'}`}>{done ? '✓' : ''}</button>
    <div className="min-w-0 flex-1">
      <p className={`whitespace-pre-wrap text-[14px] leading-relaxed ${done ? 'line-through text-[color:var(--color-ink-2)]' : ''}`}>{s(it.text)}</p>
      {s(it.note) && <p className="mt-1 border-l-2 border-[var(--color-ink-4)] pl-2 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">{s(it.note)}</p>}
      {Boolean(s(it.due) || it.share) && <p className="mt-0.5 text-[11px] tracking-[.5px] text-[color:var(--color-ink-3)]">
        {s(it.due) ? dueLabel(s(it.due)) : ''}{it.notified ? ' · 已提醒' : ''}{bridgeLabel(it)}
      </p>}
    </div>
    <button onClick={onDel} className="px-1 text-[color:var(--color-ink-4)]">✕</button>
  </div>
}

export default function Plans({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [tab, setTab] = useState<Tab>('daily')
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [cat, setCat] = useState<CatKey>('life')
  const [due, setDue] = useState('')
  const [share, setShare] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = () => colList('plans').then(setItems)
  useEffect(() => { void load() }, [])

  const kindOf = (it: ColItem): Tab => (s(it.kind) === 'daily' ? 'daily' : s(it.kind) === 'buy' ? 'buy' : 'todo')

  const daily = useMemo(() => {
    const rows = items.filter(i => kindOf(i) === 'daily')
    const byDay: Record<string, ColItem[]> = {}
    for (const r of rows) { const d = s(r.date) || s(r.ts).slice(0, 10); (byDay[d] ||= []).push(r) }
    const days = Object.keys(byDay).sort().reverse()
    return { byDay, days }
  }, [items])

  const buys = useMemo(() => {
    const rows = items.filter(i => kindOf(i) === 'buy')
    return { open: rows.filter(i => !i.done), done: rows.filter(i => i.done) }
  }, [items])

  const todos = useMemo(() => {
    const rows = items.filter(i => kindOf(i) === 'todo')
    const open = rows.filter(i => !i.done)
    const by: Record<string, ColItem[]> = {}
    for (const c of CATS) by[c.key] = open.filter(i => s(i.category) === c.key)
      .sort((x, y) => +new Date(s(y.ts)) - +new Date(s(x.ts)))
    return { by, open, done: rows.filter(i => i.done).sort((x, y) => +new Date(s(y.ts)) - +new Date(s(x.ts))) }
  }, [items])

  const add = async () => {
    const t = text.trim()
    if (!t) return
    const base: Record<string, unknown> = { text: t, done: false, kind: tab }
    if (note.trim()) base.note = note.trim()
    if (tab === 'daily') base.date = today()
    if (tab === 'todo') base.category = cat
    if (due) base.due = due            /* 到点 Bark 推我 */
    if (share) base.share = true
    await colAdd('plans', base)
    setText(''); setNote(''); setDue(''); setShare(false); setAdding(false); await load()
  }
  const toggle = (it: ColItem) => colPatch('plans', s(it.id), { done: !it.done }).then(load)
  const remove = (it: ColItem) => { if (confirm('划掉这条？')) void colDel('plans', s(it.id)).then(load) }

  return <section className="absolute inset-0 overflow-y-auto bg-[var(--color-bg)] px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <header className="mb-4 flex items-center justify-between">
      <button onClick={onBack} className="loop-back grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">‹</button>
      <div className="flex rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5 text-[12px]">
        {([['daily', '每天计划'], ['buy', '待购'], ['todo', '待办']] as [Tab, string][]).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 ${tab === k ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{l}</button>)}
      </div>
      <button onClick={() => setAdding(true)} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-lg shadow-[var(--shadow-xs)]">＋</button>
    </header>

    {tab === 'daily' && <>
      <MonthCal byDay={daily.byDay} />
      {!daily.byDay[today()]?.length && <p className="py-10 text-center font-[family-name:var(--font-display)] text-[color:var(--color-ink-3)]">今天的计划还空着——点右上角＋开张。</p>}
      {daily.days.map(d => { const list = daily.byDay[d]; const doneN = list.filter(i => i.done).length; return <section key={d} className="mb-6">
        <p className="mb-1 flex items-baseline justify-between text-[10px] tracking-[2px] text-[color:var(--color-ink-3)]">
          <span>{dayLabel(d)}</span><span>{doneN}/{list.length} 打卡</span></p>
        {list.map(it => <Row key={s(it.id)} it={it} onToggle={() => void toggle(it)} onDel={() => remove(it)} />)}
      </section> })}
    </>}

    {tab === 'buy' && <>
      {buys.open.map(it => <Row key={s(it.id)} it={it} onToggle={() => void toggle(it)} onDel={() => remove(it)} />)}
      {!buys.open.length && <p className="py-10 text-center font-[family-name:var(--font-display)] text-[color:var(--color-ink-3)]">购物袋空空。想买什么倒进来。</p>}
      {buys.done.length > 0 && <div className="mt-6">
        <button onClick={() => setShowDone(v => !v)} className="text-[10px] tracking-[1px] text-[color:var(--color-ink-3)]">已买到 {buys.done.length} 件 {showDone ? '▴' : '▾'}</button>
        {showDone && buys.done.map(it => <Row key={s(it.id)} it={it} dim onToggle={() => void toggle(it)} onDel={() => remove(it)} />)}
      </div>}
    </>}

    {tab === 'todo' && <>
      {CATS.map(c => { const list = todos.by[c.key]; return list.length ? <section key={c.key} className="mb-6">
        <p className="mb-1 text-[10px] tracking-[2px] text-[color:var(--color-ink-3)]">{c.label}</p>
        {list.map(it => <Row key={s(it.id)} it={it} onToggle={() => void toggle(it)} onDel={() => remove(it)} />)}
      </section> : null })}
      {!todos.open.length && <p className="py-10 text-center font-[family-name:var(--font-display)] text-[color:var(--color-ink-3)]">待办清零。这可是历史性时刻。</p>}
      {todos.done.length > 0 && <div className="mt-6">
        <button onClick={() => setShowDone(v => !v)} className="text-[10px] tracking-[1px] text-[color:var(--color-ink-3)]">已完成 {todos.done.length} 条 {showDone ? '▴' : '▾'}</button>
        {showDone && todos.done.map(it => <Row key={s(it.id)} it={it} dim onToggle={() => void toggle(it)} onDel={() => remove(it)} />)}
      </div>}
      {todos.open.length > 0 && <p className="mt-8 text-center text-[10px] tracking-[1px] text-[color:var(--color-ink-3)]">
        {CATS.map(c => `${c.label} ${todos.by[c.key].length}`).join(' · ')}</p>}
    </>}

    {adding && <div className="fixed inset-0 z-[160] flex items-end bg-black/20" onClick={() => setAdding(false)}>
      <div onClick={e => e.stopPropagation()} className="w-full rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <p className="mb-3 text-[11px] tracking-[2px] text-[color:var(--color-ink-3)]">
          {tab === 'daily' ? `记到「每天计划 · ${dayLabel(today())}」` : tab === 'buy' ? '记到「待购」' : '记到「待办」'}</p>
        {tab === 'todo' && <div className="mb-3 flex flex-wrap gap-2">
          {CATS.map(c => <button key={c.key} onClick={() => setCat(c.key)}
            className={`rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[12px] ${cat === c.key ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{c.label}</button>)}
        </div>}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="要做的事 / 要买的东西"
          className="mb-2 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 outline-none" />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注（可空）——对方的批注也放这儿"
          className="mb-3 w-full rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line)] bg-[var(--color-card)] px-4 py-2.5 text-[12px] outline-none" />
        <div className="mb-3 flex items-center gap-2">
          <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)}
            className="min-w-0 flex-1 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-2 text-[12px] text-[color:var(--color-ink-2)] outline-none" />
          <button onClick={() => setShare(v => !v)} aria-pressed={share}
            className={`shrink-0 rounded-full border px-3 py-2 text-[12px] transition-colors
              ${share ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                      : 'border-[var(--color-line)] text-[color:var(--color-ink-3)]'}`}>
            也告诉他
          </button>
        </div>
        <p className="mb-3 text-[10px] leading-relaxed text-[color:var(--color-ink-4)]">
          时间可空。填了到点推你手机；点亮「也告诉他」他才知道有这条，到点会看情况关心你一句。
        </p>
        <button onClick={() => void add()} disabled={!text.trim()} className="w-full rounded-full bg-[var(--color-ink)] py-3.5 text-[color:var(--color-surface)] disabled:opacity-30">记上</button>
      </div>
    </div>}
  </section>
}
