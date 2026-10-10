import { userName, aiName } from '../lib/identity'
import { useState } from 'react'
import type { Msg } from '../lib/api'

export default function Search({ all, onJump, onClose }:
  { all: Msg[]; onJump: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const hits = q.trim() ? all.filter((m) => m.content.includes(q.trim())).slice(-200).reverse() : []
  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[var(--color-bg)]">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜说过的话…"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-line)]
                     bg-[var(--color-surface)] px-3.5 py-2.5 outline-none focus:border-[var(--color-ink)]" />
        <button onClick={onClose} className="shrink-0 px-2 text-[color:var(--color-ink-2)]">取消</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {q && <p className="py-2 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{hits.length} 条</p>}
        {hits.map((m) => (
          <button key={m.id} onClick={() => { onJump(m.id); onClose() }}
            className="mb-2 block w-full rounded-[var(--radius-md)] border border-[var(--color-line)]
                       bg-[var(--color-surface)] p-3 text-left">
            <div className="mb-1 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
              {m.role === 'user' ? userName() : aiName()} · {(m.ts || '').slice(5, 16).replace('T', ' ')}
            </div>
            <div className="line-clamp-3 whitespace-pre-wrap break-words text-[length:var(--text-sub)]">{m.content}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
