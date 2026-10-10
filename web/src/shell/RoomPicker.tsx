import { aiName } from '../lib/identity'
import { useEffect, useState } from 'react'
import { fetchRooms, getRoom, setRoom, createRoom, type Room } from '../lib/api'
import { longPress, RoomActionSheet } from './RoomActions'

export default function RoomPicker({ onSwitch }: { onSwitch: (id: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [cur, setCur] = useState(getRoom())
  const [open, setOpen] = useState(false)
  const [act, setAct] = useState<Room | null>(null)
  const reload = () => void fetchRooms().then((d) => setRooms(d.rooms))
  useEffect(reload, [])

  async function onCreate() {
    const title = prompt('新建房间，名字：')?.trim()
    if (!title) return
    const agent = confirm(`要让「${title}」使用 Codex 吗？\n\n确定：Codex\n取消：Claude`) ? 'codex' : 'claude'
    if (await createRoom(title, agent)) reload()
  }
  const title = rooms.find((r) => r.id === cur)?.title ?? aiName()

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-script text-[19px]">{title}</button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/25 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="max-h-[70vh] w-full overflow-y-auto rounded-t-[var(--radius-xl)] bg-[var(--color-bg)]
                       p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="px-3 py-2 text-[length:var(--text-cap)] tracking-[2px] text-[color:var(--color-ink-3)]">房间</div>
            {rooms.map((r) => (
              <button key={r.id}
                {...longPress(() => setAct(r))}
                onClick={() => { setRoom(r.id); setCur(r.id); setOpen(false); onSwitch(r.id) }}
                className={`mb-1.5 flex w-full items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left
                  ${r.id === cur ? 'border-[var(--color-ink)]' : 'border-[var(--color-line)]'} bg-[var(--color-surface)]`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.online ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-ink-4)]'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {r.title}
                    {r.agent === 'codex' && <span className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-ink-3)]">Codex</span>}
                  </span>
                  <span className="block truncate text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">
                    {r.count ?? 0} 条 · {r.last_text?.slice(0, 20) ?? ''}
                  </span>
                </span>
                {r.id === cur && <span className="shrink-0">✓</span>}
              </button>
            ))}
            <button onClick={() => void onCreate()}
              className="mb-1.5 flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-dashed
                         border-[var(--color-line)] p-3 text-left text-[color:var(--color-ink-3)]">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-card)]">+</span>
              新建房间
            </button>
          </div>
        </div>
      )}
      <RoomActionSheet room={act} onClose={() => setAct(null)} done={reload} />
    </>
  )
}
