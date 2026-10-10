import { useRef, useState } from 'react'
import { colDel, stickerAdd, type Sticker } from '../lib/api'

export default function StickerPanel({ stickers, onPick, onChanged, onClose }: {
  stickers: Sticker[]
  onPick: (name: string) => void
  onChanged: () => void
  onClose: () => void
}) {
  const [managing, setManaging] = useState(false)
  const [draft, setDraft] = useState<{ file: File; preview: string } | null>(null)
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const taken = stickers.some((s) => s.name === name.trim())

  async function save() {
    const n = name.trim()
    if (!draft || !n || taken || saving) return
    setSaving(true); setErr('')
    const ok = await stickerAdd(draft.file, n, tags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean))
    setSaving(false)
    if (!ok) { setErr('没存上，等会儿再试'); return }
    URL.revokeObjectURL(draft.preview)
    setDraft(null); setName(''); setTags('')
    onChanged()
  }

  async function remove(s: Sticker) {
    if (!window.confirm(`把「${s.name}」从表情包库里拿掉？`)) return
    if (await colDel('stickers', s.id)) onChanged()
  }

  return (
    <div className="mx-2.5 mb-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]
                    bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <b className="flex-1 text-[13px]">表情包</b>
        {stickers.length > 0 && (
          <button onClick={() => setManaging((v) => !v)} className="text-[12px] text-[color:var(--color-ink-3)]">
            {managing ? '完成' : '整理'}
          </button>
        )}
        <button onClick={onClose} aria-label="收起表情包" className="px-1 text-[color:var(--color-ink-3)]">×</button>
      </div>

      {draft ? (
        <div className="flex gap-3 p-3">
          <img src={draft.preview} alt="" className="h-20 w-20 shrink-0 rounded-[var(--radius-xs)] object-contain" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名字（我靠它来发）" maxLength={24}
              className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-1.5 text-[13px] outline-none" />
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签，逗号隔开（撒娇、生气…）"
              className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-1.5 text-[13px] outline-none" />
            {(taken || err) && <span className="text-[11px] text-[color:var(--color-ink-3)]">{taken ? '这个名字已经有了' : err}</span>}
            <div className="flex gap-2">
              <button onClick={() => { URL.revokeObjectURL(draft.preview); setDraft(null) }}
                className="flex-1 rounded-full border border-[var(--color-line)] py-1.5 text-[12px]">算了</button>
              <button onClick={() => void save()} disabled={!name.trim() || taken || saving}
                className="flex-1 rounded-full bg-[var(--color-ink)] py-1.5 text-[12px] text-[color:var(--color-surface)] disabled:opacity-40">
                {saving ? '存着呢…' : '放进库里'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid max-h-[240px] grid-cols-4 gap-2 overflow-y-auto p-3">
          <button onClick={() => file.current?.click()} aria-label="添加表情包"
            className="grid aspect-square place-items-center rounded-[var(--radius-sm)] border border-dashed
                       border-[var(--color-line)] text-[22px] text-[color:var(--color-ink-3)]">+</button>
          {stickers.map((s) => (
            <button key={s.id} title={s.name}
              onClick={() => managing ? void remove(s) : onPick(s.name)}
              className="relative flex aspect-square flex-col items-center justify-center rounded-[var(--radius-sm)]
                         bg-[var(--color-card)] p-1 active:scale-95">
              <img src={s.url} alt={s.name} loading="lazy" className="min-h-0 w-full flex-1 object-contain" />
              <span className="w-full truncate text-center text-[10px] text-[color:var(--color-ink-3)]">{s.name}</span>
              {managing && (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full
                                 bg-[var(--color-ink)] text-[11px] text-[color:var(--color-surface)]">×</span>
              )}
            </button>
          ))}
        </div>
      )}

      <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
        onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          setDraft({ file: f, preview: URL.createObjectURL(f) })
          setName(f.name.replace(/\.[^.]+$/, '').slice(0, 24)); setErr('')
        }} />
    </div>
  )
}
