import { useEffect, useRef, useState } from 'react'
import { patchRoom, deleteRoom, type Room } from '../lib/api'


const HOLD_MS = 500
const SLOP = 10
let timer: number | null = null
let origin: { x: number; y: number } | null = null
let fired = false

/** 给房间按钮用的长按事件：长按触发 onLong；长按之后松手的那一下"点击"吞掉，不会顺手进房间 */
export function longPress(onLong: () => void) {
  const cancel = () => { if (timer !== null) { window.clearTimeout(timer); timer = null } }
  return {
    onTouchStart: (e: React.TouchEvent) => {
      cancel(); fired = false
      const t = e.touches[0]; origin = { x: t.clientX, y: t.clientY }
      timer = window.setTimeout(() => { timer = null; fired = true; navigator.vibrate?.(12); onLong() }, HOLD_MS)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (origin && (Math.abs(t.clientX - origin.x) > SLOP || Math.abs(t.clientY - origin.y) > SLOP)) cancel()
    },
    // 长按之后松手：取消浏览器补发的那次点击——不然它会落在刚弹出来的遮罩上，把操作单当场关掉
    onTouchEnd: (e: React.TouchEvent) => { cancel(); if (fired) e.preventDefault() },
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      if (fired) return          // 手机上长按已经弹过了，系统补发的右键不再弹一次
      onLong()
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired) { fired = false; e.preventDefault(); e.stopPropagation() }
    },
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
  }
}

const UNDELETABLE = new Set(['home', 'group'])

/** 底部操作单：改名 / 删除 / 取消。done() = 房间有变化，列表要重拉 */
export function RoomActionSheet({ room, onClose, done }: { room: Room | null; onClose: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false)
  // 刚弹出来的半秒里不认遮罩上的点击（长按松手那一下别把自己关掉）
  const openedAt = useRef(0)
  useEffect(() => { if (room) openedAt.current = Date.now() }, [room])
  if (!room) return null
  const canDelete = !UNDELETABLE.has(room.id)

  async function rename() {
    const title = prompt('改名：', room!.title)?.trim()
    if (!title || title === room!.title) return
    setBusy(true)
    if (await patchRoom(room!.id, { title })) done()
    setBusy(false); onClose()
  }
  async function remove() {
    if (!confirm(`删掉房间「${room!.title}」？\n这个房间的会话会断开，删了不能恢复。`)) return
    setBusy(true)
    const ok = await deleteRoom(room!.id)
    setBusy(false)
    if (!ok) { alert('没删掉，稍后再试'); return }
    done(); onClose()
  }

  const item = 'w-full py-3.5 text-center text-[16px] active:bg-black/[.04] disabled:opacity-40'
  return (
    <div className="fixed inset-0 z-[130] flex items-end bg-black/25 backdrop-blur-[2px]"
      onClick={() => { if (Date.now() - openedAt.current > 500) onClose() }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg)]">
          <p className="border-b border-[var(--color-line)] px-4 py-2.5 text-center text-[12px] text-[color:var(--color-ink-3)]">
            房间「{room.title}」
          </p>
          <button disabled={busy} onClick={() => void rename()} className={`${item} border-b border-[var(--color-line)]`}>改名</button>
          {canDelete
            ? <button disabled={busy} onClick={() => void remove()} className={`${item} text-[#d93025]`}>删除房间</button>
            : <p className="py-3 text-center text-[12px] text-[color:var(--color-ink-3)]">{room.id === 'home' ? '家' : '群聊'}不能删</p>}
        </div>
        <button onClick={onClose} className={`${item} mt-2 rounded-[var(--radius-xl)] bg-[var(--color-bg)] font-semibold`}>取消</button>
      </div>
    </div>
  )
}
