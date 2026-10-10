import { useEffect, useRef, useState } from 'react'
import { colDel, colPatch, stickerAdd, stickerList, type Sticker } from '../lib/api'

export const STICKERS_UPDATED = 'perigee:stickers-updated'
const announce = () => window.dispatchEvent(new Event(STICKERS_UPDATED))

const splitTags = (s: string) => s.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)

// 同名就往后加数字：贴贴 → 贴贴2 → 贴贴3（名字是我发表情包的钥匙，不能撞）
function freeName(base: string, taken: Set<string>) {
  const b = base.trim().slice(0, 24) || '表情包'
  if (!taken.has(b)) return b
  for (let i = 2; ; i++) if (!taken.has(`${b}${i}`)) return `${b}${i}`
}

export default function StickerManager() {
  const [items, setItems] = useState<Sticker[]>([])
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState<{ s: Sticker; name: string; tags: string } | null>(null)
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const reload = () => stickerList().then(setItems)
  useEffect(() => { void reload() }, [])

  async function addMany(files: File[]) {
    const taken = new Set(items.map((s) => s.name))
    let ok = 0
    for (let i = 0; i < files.length; i++) {
      setBusy(`存第 ${i + 1} / ${files.length} 张…`)
      const name = freeName(files[i].name.replace(/\.[^.]+$/, ''), taken)
      if (await stickerAdd(files[i], name, [])) { ok++; taken.add(name) }
    }
    setBusy('')
    setNote(ok === files.length ? `放进去 ${ok} 张` : `放进去 ${ok} 张，${files.length - ok} 张没存上`)
    await reload(); announce()
  }

  async function saveEdit() {
    if (!edit) return
    const name = edit.name.trim()
    if (!name) return
    if (items.some((s) => s.id !== edit.s.id && s.name === name)) { setNote('这个名字已经有了'); return }
    setBusy('保存中…')
    const ok = await colPatch('stickers', edit.s.id, { name, tags: splitTags(edit.tags) })
    setBusy('')
    if (!ok) { setNote('没存上，等会儿再试'); return }
    setEdit(null); setNote('')
    await reload(); announce()
  }

  async function remove(s: Sticker) {
    if (!confirm(`把「${s.name}」从表情包库里拿掉？`)) return
    if (await colDel('stickers', s.id)) { setEdit(null); await reload(); announce() }
  }

  return (
    <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <b className="text-[13px]">表情包库</b>
        <span className="text-[10px] text-[color:var(--color-ink-3)]">{items.length} 张</span>
      </div>

      <button disabled={!!busy} onClick={() => file.current?.click()}
        className="mb-3 w-full rounded-full bg-[var(--color-ink)] py-2 text-[11px] text-[color:var(--color-surface)] disabled:opacity-40">
        {busy || '添加表情包（可以一次选很多张）'}
      </button>
      <input ref={file} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void addMany(fs) }} />

      {edit && (
        <div className="mb-3 flex gap-3 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-3">
          <img src={edit.s.url} alt="" className="h-16 w-16 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input value={edit.name} maxLength={24} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="名字"
              className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] outline-none" />
            <input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="标签，逗号隔开（撒娇、生气…）"
              className="rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] outline-none" />
            <div className="flex gap-2">
              <button onClick={() => void saveEdit()} disabled={!!busy || !edit.name.trim()}
                className="flex-1 rounded-full bg-[var(--color-ink)] py-1.5 text-[11px] text-[color:var(--color-surface)] disabled:opacity-40">保存</button>
              <button onClick={() => setEdit(null)} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px]">取消</button>
              <button onClick={() => void remove(edit.s)} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px]">删除</button>
            </div>
          </div>
        </div>
      )}

      {items.length ? (
        <div className="grid grid-cols-4 gap-2">
          {items.map((s) => (
            <button key={s.id} onClick={() => { setNote(''); setEdit({ s, name: s.name, tags: (s.tags ?? []).join('、') }) }}
              className={`flex aspect-square flex-col items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1
                ${edit?.s.id === s.id ? 'ring-2 ring-[var(--color-ink)]' : ''}`}>
              <img src={s.url} alt={s.name} loading="lazy" className="min-h-0 w-full flex-1 object-contain" />
              <span className="w-full truncate text-center text-[10px] text-[color:var(--color-ink-3)]">
                {s.name}{s.tags?.length ? '' : ' ·'}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[color:var(--color-ink-3)]">还是空的。存进来的表情包，聊天里点表情包按钮就能发，Claude 也能挑着发。</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        {note || '点一张可以改名字、加标签。名字后面带 · 的还没标签——标签是 Claude 挑表情包时看的，写上它发得更准。'}
      </p>
    </div>
  )
}
