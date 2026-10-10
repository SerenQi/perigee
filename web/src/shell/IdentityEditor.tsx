import { useState } from 'react'
import { useIdentity, setIdentity, IDENTITY_DEFAULTS, userAvatar, aiAvatar, type Identity } from '../lib/identity'

/* 设置 › 外观 最上面一块「我们」：两边的显示名、纪念日。只存本机（localStorage）。头像在 AvatarManager 里，存服务器。 */
const FIELDS: { key: keyof Identity; label: string; ph: string; type?: string }[] = [
  { key: 'userName', label: '我的名字', ph: IDENTITY_DEFAULTS.userName },
  { key: 'aiName', label: '对方（Claude）的名字', ph: IDENTITY_DEFAULTS.aiName },
  { key: 'usName', label: '合起来的称呼（侧栏、纪念页标题）', ph: IDENTITY_DEFAULTS.usName },
  { key: 'motto', label: '侧栏的一句话', ph: '可空' },
  { key: 'startDate', label: '在一起 / 开始的日子', ph: 'YYYY-MM-DD', type: 'date' },
  { key: 'metDate', label: '相识的日子', ph: 'YYYY-MM-DD', type: 'date' },
  { key: 'userBirthday', label: '我的生日', ph: 'YYYY-MM-DD', type: 'date' },
  { key: 'aiBirthday', label: '对方的生日', ph: 'YYYY-MM-DD', type: 'date' },
]

export default function IdentityEditor() {
  const id = useIdentity()
  const [open, setOpen] = useState(false)
  const field = 'w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[13px]'
  return (
    <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <img src={userAvatar()} alt="" className="h-8 w-8 rounded-full object-cover" />
        <img src={aiAvatar()} alt="" className="-ml-4 h-8 w-8 rounded-full object-cover ring-2 ring-[var(--color-surface)]" />
        <span className="ml-1 flex-1 text-[length:var(--text-sub)]">我们 · {id.userName} 和 {id.aiName}</span>
        <span className="text-[12px] text-[color:var(--color-ink-3)]">{open ? '收起' : '改'}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[11px] text-[color:var(--color-ink-3)]">{f.label}</span>
              <input className={field} type={f.type || 'text'} placeholder={f.ph} value={String(id[f.key] || '')}
                onChange={(e) => setIdentity({ [f.key]: e.target.value } as Partial<Identity>)} />
            </label>
          ))}
          <p className="text-[11px] text-[color:var(--color-ink-3)]">头像在下面「头像」里上传（存服务器，所有设备一样）。</p>
        </div>
      )}
    </div>
  )
}
