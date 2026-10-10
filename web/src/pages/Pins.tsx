import { useCallback, useEffect, useState } from 'react'
import { colAdd, colDel, colList } from '../lib/api'

const KEY = 'pin-board'
type Pin = { id: string; text: string; date: string; ts?: string }
const readLocal = (): Pin[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const ROT = [-1.5, 1.2, -0.8, 1.6, -1.1, 0.9]

export default function Pins({ onBack }: { onBack?: () => void } = {}) {
  const [pins, setPins] = useState<Pin[]>([])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const load = useCallback(async () => {
    const local = readLocal()
    if (local.length) {
      let ok = true
      for (const p of [...local].reverse()) ok = (await colAdd('pinboard', { text: p.text, date: p.date }).catch(() => false)) && ok
      // 全搬上去了才清手机里的；有一条没上去就留着，下次再搬（宁可重复一条，不丢）
      if (ok) try { localStorage.setItem(KEY + '.migrated', JSON.stringify(local)); localStorage.removeItem(KEY) } catch { /* 无痕模式 */ }
    }
    const items = (await colList('pinboard')) as unknown as Pin[]
    setPins(items.sort((a, b) => String(b.ts).localeCompare(String(a.ts))))
  }, [])
  useEffect(() => { void load() }, [load])

  const add = async () => {
    const t = text.trim(); if (!t) return
    setText(''); setOpen(false)
    await colAdd('pinboard', { text: t, date: new Date().toLocaleDateString('zh-CN') }); void load()
  }
  const remove = async (id: string) => { if (!confirm('要取下这张纸条吗？')) return; await colDel('pinboard', id); void load() }

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {onBack && <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>}
      <div className="mb-1 flex items-start justify-between">
        <h2 className="text-[20px] font-bold tracking-tight">Pin Board</h2>
        <button onClick={() => setOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-ink)]
                     text-[22px] leading-none text-[color:var(--color-surface)]">+</button>
      </div>
      <p className="mb-5 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">钉住重要的话 · 长按纸条取下</p>

      {pins.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line)] p-8 text-center
                        text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">还没有钉住的话</div>
      )}

      <div className="columns-2 gap-3">
        {pins.map((p, i) => (
          <article key={p.id}
            onContextMenu={(e) => { e.preventDefault(); void remove(p.id) }}
            style={{ rotate: `${ROT[i % ROT.length]}deg` }}
            className="mb-3 inline-block w-full break-inside-avoid rounded-[var(--radius-md)] border
                       border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
            <p className="whitespace-pre-wrap break-words leading-relaxed">{p.text}</p>
            <div className="mt-3 flex items-center justify-between text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
              <span>{p.date}</span>
              <button onClick={() => void remove(p.id)}>取下</button>
            </div>
          </article>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]"
             onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-[360px] rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4">
            <textarea autoFocus rows={4} value={text} placeholder="钉一句话上去…"
              onChange={(e) => setText(e.target.value)}
              className="mb-3 w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-line)]
                         bg-[var(--color-card)] px-3 py-2.5 outline-none focus:border-[var(--color-ink)]" />
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)}
                className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-line)] py-2.5">取消</button>
              <button onClick={() => void add()}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] py-2.5 text-[color:var(--color-surface)]">钉上</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
