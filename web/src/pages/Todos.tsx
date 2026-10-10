import { useEffect, useMemo, useState } from 'react'
import { colList, colAdd, colDel, colPatch, type ColItem } from '../lib/api'


const s = (v: unknown) => (v == null ? '' : String(v))
const pad = (n: number) => String(n).padStart(2, '0')
/* datetime-local 要的格式：YYYY-MM-DDTHH:MM */
const localValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const when = (due: string) => {
  if (!due) return ''
  const d = new Date(due)
  if (isNaN(+d)) return due
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const head = sameDay ? '今天' : d.toDateString() === tomorrow.toDateString() ? '明天'
    : `${d.getMonth() + 1}月${d.getDate()}日`
  return `${head} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* 备忘桥的真实状态（不编、不猜，数据就是 bridge 对象） */
const bridgeLabel = (i: ColItem) => {
  if (!i.share) return ''
  const b = i.bridge as { state?: string; at?: string } | undefined
  if (!b) return ' · 到点会告诉他'
  if (b.state === 'sent') return ` · 已告诉他 ${s(b.at)}`
  if (b.state === 'skipped_stale') return ' · 错过没递'
  if (b.state === 'failed') return ' · 递送失败'
  return ''
}

export default function Todos({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [share, setShare] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => colList('todos').then(setItems)
  useEffect(() => { void load() }, [])

  const [open, done] = useMemo(() => {
    const a = items.filter(i => !i.done)
    const b = items.filter(i => i.done)
    a.sort((x, y) => {
      const dx = s(x.due), dy = s(y.due)
      if (!dx && !dy) return +new Date(s(y.ts)) - +new Date(s(x.ts))
      if (!dx) return 1
      if (!dy) return -1
      return +new Date(dx) - +new Date(dy)
    })
    b.sort((x, y) => +new Date(s(y.ts)) - +new Date(s(x.ts)))
    return [a, b]
  }, [items])

  const add = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    await colAdd('todos', { text: t, due, done: false, by: 'user', ...(share ? { share: true } : {}) })
    setText(''); setDue(''); setShare(false); setBusy(false); void load()
  }

  const toggle = async (i: ColItem) => {
    await colPatch('todos', i.id, { done: !i.done })
    void load()
  }

  const now = Date.now()

  const row = (i: ColItem) => {
    const overdue = !i.done && s(i.due) && +new Date(s(i.due)) < now
    return (
      <li key={i.id} className="flex items-start gap-3 border-b border-[var(--color-line)] px-1 py-3 last:border-b-0">
        <button onClick={() => void toggle(i)} aria-label="完成"
          className={`mt-[3px] h-[17px] w-[17px] shrink-0 rounded-full border transition-colors
            ${i.done ? 'border-[var(--color-ink)] bg-[var(--color-ink)]' : 'border-[var(--color-ink-3)]'}`}>
          {i.done ? <span className="block text-[10px] leading-[15px] text-[color:var(--color-surface)]">✓</span> : null}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`break-words text-[14px] leading-relaxed
            ${i.done ? 'text-[color:var(--color-ink-3)] line-through' : ''}`}>{s(i.text)}</p>
          {s(i.due) && (
            <p className={`mt-0.5 text-[11px] tracking-[.5px]
              ${overdue ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-3)]'}`}>
              {when(s(i.due))}{overdue ? ' · 过点了' : ''}{i.notified ? ' · 已提醒' : ''}{bridgeLabel(i)}
            </p>
          )}
        </div>
        <button onClick={async () => { await colDel('todos', i.id); void load() }}
          className="shrink-0 px-1 text-[15px] leading-none text-[color:var(--color-ink-4)]">×</button>
      </li>
    )
  }

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>

      <div className="mb-1 font-script text-[21px] leading-none">To-do</div>
      <p className="mb-5 text-[11px] tracking-[1.5px] text-[color:var(--color-ink-3)]">
        记下来 · 到点我推你手机
      </p>

      {/* 添加 */}
      <div className="mb-6 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void add() }}
          placeholder="要做什么…" maxLength={200}
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-[color:var(--color-ink-4)]" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)}
            className="min-w-0 basis-full rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-card)]
                       px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink-2)] outline-none" />
          <button onClick={() => setDue(localValue(new Date(Date.now() + 3600_000)))}
            className="whitespace-nowrap rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] text-[color:var(--color-ink-2)]">
            一小时后
          </button>
          <button onClick={() => setShare(v => !v)} aria-pressed={share}
            title="勾了他才知道有这条；到点他会看情况关心你一句"
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] transition-colors
              ${share ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                      : 'border-[var(--color-line)] text-[color:var(--color-ink-3)]'}`}>
            也告诉他
          </button>
          <button onClick={() => void add()} disabled={busy || !text.trim()}
            className="ml-auto whitespace-nowrap rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-[12px] tracking-[1px]
                       text-[color:var(--color-surface)] disabled:opacity-30">记下</button>
        </div>
      </div>

      {/* 未完成 */}
      {open.length === 0 && done.length === 0 && (
        <p className="py-10 text-center text-[12px] text-[color:var(--color-ink-3)]">还没有待办。空着也挺好。</p>
      )}
      <ul className="mb-8">{open.map(row)}</ul>

      {/* 已完成 */}
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none pb-2 text-[11px] tracking-[1.5px] text-[color:var(--color-ink-3)]">
            做完的 {done.length} 件 ▾
          </summary>
          <ul>{done.map(row)}</ul>
        </details>
      )}
    </section>
  )
}
