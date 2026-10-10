import { useEffect, useState } from 'react'
import { fetchRooms, type Room } from '../lib/api'
import { useAvatars, avatarUrl, pickAndUpload, clearAvatar, aiAvatarFor, userAvatarFor, crewAvatarFor } from '../lib/avatars'
import { userAvatar, groupAvatar, userName } from '../lib/identity'
import { loadCrew, useCrew } from '../lib/crew'

/* 设置 › 外观 › 头像：所有头像都传到服务器（网关 data/avatars/），每台设备看到的一样。
   我的默认头像；每个单聊房间里 AI 的头像、我在这个房间的头像；群聊的房间图标、我在群里的头像、每个群成员的头像。
   没传就用名字首字的占位圆。图片在手机上先压成 256×256 再上传。 */
type Slot = { key: string; label: string; src: string }

function Row({ s }: { s: Slot }) {
  const [busy, setBusy] = useState(false)
  const has = Boolean(avatarUrl(s.key))
  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-line)] py-2.5 first:border-t-0">
      <img src={s.src} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{s.label}</span>
      <button disabled={busy} onClick={async () => { setBusy(true); await pickAndUpload(s.key); setBusy(false) }}
        className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1 text-[11.5px] disabled:opacity-40">{busy ? '上传中…' : has ? '替换' : '上传'}</button>
      {has && <button onClick={() => { if (confirm('清除这个头像？')) void clearAvatar(s.key) }}
        className="shrink-0 text-[11.5px] text-[color:var(--color-ink-3)]">清除</button>}
    </div>
  )
}

export default function AvatarManager() {
  useAvatars()
  const crew = useCrew()
  const [rooms, setRooms] = useState<Room[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open) { void fetchRooms().then((d) => setRooms(d.rooms)); void loadCrew() } }, [open])
  const direct = rooms.filter((r) => r.type === 'direct')
  const groups: { title: string; slots: Slot[] }[] = [
    { title: '我', slots: [{ key: 'user', label: `${userName()}（默认，哪里没单独设就用它）`, src: userAvatar() }] },
    ...direct.map((r) => ({
      title: `单聊 · ${r.title}`,
      slots: [
        { key: `room:${r.id}`, label: `${r.title} 的头像`, src: aiAvatarFor(r.id, r.title) },
        { key: `room:${r.id}:user`, label: '我在这个房间的头像（可空）', src: userAvatarFor(r.id) },
      ],
    })),
    {
      title: '群聊',
      slots: [
        { key: 'room:group', label: '群聊房间图标', src: groupAvatar() },
        { key: 'group:user', label: '我在群聊里的头像（可空）', src: userAvatarFor('group') },
        ...crew.map((m) => ({ key: `crew:${m.id}`, label: `成员 · ${m.displayName}`, src: crewAvatarFor(m.id, m.displayName) })),
      ],
    },
  ]
  return (
    <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[length:var(--text-sub)]">头像（单聊 · 群聊）</span>
        <span className="text-[12px] text-[color:var(--color-ink-3)]">{open ? '收起' : '改'}</span>
      </button>
      {open && (
        <div className="mt-2">
          <p className="mb-2 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
            传到服务器，所有设备一样。png / jpg / webp，会自动裁成方形压缩成小图。没传的用名字首字占位。
            {crew.length === 0 && ' 群成员要等群聊后端（mousecrew）连上才列得出来。'}
          </p>
          {groups.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="mb-0.5 text-[10.5px] tracking-[1px] text-[color:var(--color-ink-3)]">{g.title}</div>
              {g.slots.map((s) => <Row key={s.key} s={s} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
