import { aiAvatarFor, useAvatars } from '../lib/avatars'
import { groupAvatar } from '../lib/identity'
import { useEffect, useState } from 'react'
import { fetchRooms, createRoom, type Room } from '../lib/api'
import { longPress, RoomActionSheet } from '../shell/RoomActions'
import { IconMenu } from '../shell/icons'
import { useSkin } from '../skin/useSkin'
import LoopChatList from '../skin/layouts/LoopChatList'


function stamp(ts?: string) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(+d)) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function Face({ r }: { r: Room }) {
  useAvatars()
  if (r.type === 'direct')
    return <img src={aiAvatarFor(r.id, r.title)} alt="" className="h-[46px] w-[46px] shrink-0 rounded-full object-cover" />
  if (r.type === 'group')
    return <img src={groupAvatar()} alt="" className="h-[46px] w-[46px] shrink-0 rounded-full object-cover" />
  const label = r.type === 'group' ? '群' : (r.title?.[0] ?? '?')
  return (
    <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border border-[var(--color-line)] bg-white
                     text-[17px] font-medium text-[color:var(--color-ink)]">{label}</span>
  )
}

export default function ChatList({ onMenu, onEnter }: { onMenu: () => void; onEnter: (id: string, title: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const reload = () => void fetchRooms().then((d) => setRooms(d.rooms))
  const skin = useSkin()
  const [act, setAct] = useState<Room | null>(null)   // 长按出来的操作单：改名 / 删除
  useEffect(reload, [])

  async function onCreate() {
    const title = prompt('新建房间，名字：')?.trim()
    if (!title) return
    const agent = confirm(`要让「${title}」使用 Codex 吗？\n\n确定：Codex\n取消：Claude`) ? 'codex' : 'claude'
    if (await createRoom(title, agent)) reload()
  }

  // 灰阶浮雕：同一份房间数据、同一套进房/新建/改名，换一种摆法
  const sheet = <RoomActionSheet room={act} onClose={() => setAct(null)} done={reload} />
  if (skin === 'loop') return (
    <>
      <LoopChatList rooms={rooms} onMenu={onMenu} onEnter={onEnter}
        onCreate={() => void onCreate()} onEdit={(r) => setAct(r)} />
      {sheet}
    </>
  )

  return (
    // 整页不铺雾（整页磨砂被说"都看不到背景了"，薄雾整页又"雾蒙蒙的不喜欢"）。
    <div className="absolute inset-0 flex flex-col">
      <header className="list-bar flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onMenu} className="text-[color:var(--color-ink)]"><IconMenu /></button>
        <h2 className="flex-1 text-center text-[17px] font-bold tracking-[1px]">聊天</h2>
        <button onClick={() => void onCreate()}
          className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[var(--color-line)]
                     bg-[var(--color-surface)] text-[16px] leading-none">+</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="list-fog">
        {rooms.map((r) => (
          <button key={r.id}
            onClick={() => onEnter(r.id, r.title)}
            {...longPress(() => setAct(r))}
            className="flex w-full items-center gap-3.5 px-4 py-1.5 text-left transition-colors active:bg-[var(--color-card-hover)]">
            <Face r={r} />
            <span className="flex min-w-0 flex-1 flex-col gap-1 pb-3.5 pt-2.5">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {r.title}
                  {r.agent === 'codex' && <span className="ml-1.5 align-middle rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] font-normal text-[color:var(--color-ink-3)]">Codex</span>}
                </span>
                <span className="shrink-0 text-[11.5px] text-[color:var(--color-ink-3)]">{stamp(r.last_ts)}</span>
              </span>
              <span className="truncate text-[13px] leading-snug text-[color:var(--color-ink-2)]">
                {r.last_text || '还没说过话'}
              </span>
            </span>
          </button>
        ))}
        </div>
        {rooms.length === 0 && (
          <p className="px-5 py-8 text-center text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">加载中…</p>
        )}
      </div>
      {sheet}
    </div>
  )
}
