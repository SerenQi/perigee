import { useEffect, useState } from 'react'
import { SKINS, SKIN_CHANGED, applySkin, currentSkin, type Skin } from './skin'

function Mini({ id }: { id: Skin }) {
  const loop = id === 'loop'
  const card = loop
    ? { background: 'linear-gradient(150deg,#fdfdfe,#eceef1)', boxShadow: '3px 3px 7px rgba(150,156,170,.45), -2px -2px 6px #fff' }
    : { background: 'rgba(255,255,255,.9)', boxShadow: '0 0 0 .5px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.05)' }
  const dark = loop
    ? { background: 'linear-gradient(180deg,#3b3c41,#050506)', boxShadow: '0 3px 6px rgba(0,0,0,.25)' }
    : { background: '#111' }
  return (
    <div className="relative h-[124px] overflow-hidden rounded-[14px]"
         style={{ background: loop ? 'radial-gradient(130% 90% at 18% 0%,#fbfbfc,#eef0f3 48%,#e3e5e9)' : '#fff',
                  boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.1)' }}>
      <div className="absolute left-3 top-2.5 text-[11px] italic" style={{ fontFamily: 'ScriptEn, serif' }}>{loop ? 'Endless Loop' : 'Classic'}</div>
      <div className="absolute inset-x-3 top-8 h-[22px]" style={{ ...card, borderRadius: loop ? 11 : 7 }} />
      <div className="absolute right-3 top-[60px] h-[16px] w-[58%]" style={{ ...dark, borderRadius: 999 }} />
      <div className="absolute left-3 top-[82px] h-[16px] w-[46%]" style={{ ...card, borderRadius: loop ? 999 : 7 }} />
      <div className="absolute inset-x-5 bottom-2 h-[12px]" style={{ ...card, borderRadius: 999 }} />
    </div>
  )
}

export default function SkinPicker() {
  const [skin, setSkin] = useState<Skin>(currentSkin)
  useEffect(() => {
    const on = () => setSkin(currentSkin())
    window.addEventListener(SKIN_CHANGED, on)
    return () => window.removeEventListener(SKIN_CHANGED, on)
  }, [])
  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] text-[color:var(--color-ink-3)]">风格 · 全屋所有房间一起换，随时换回来</p>
      <div className="grid grid-cols-2 gap-3">
        {SKINS.map((s) => {
          const on = s.id === skin
          return (
            <button key={s.id} type="button" onClick={() => applySkin(s.id, true)} aria-pressed={on}
              className={`rounded-[var(--radius-md)] p-2 text-left transition-shadow
                ${on ? 'ring-2 ring-[var(--color-ink)]' : 'ring-1 ring-[var(--color-line)]'}`}>
              <Mini id={s.id} />
              <span className="mt-2 flex items-center gap-1.5 px-1">
                <b className="flex-1 text-[14px] font-semibold">{s.name}</b>
                {on && <span className="h-2 w-2 rounded-full bg-[var(--color-ink)]" />}
              </span>
              <span className="block px-1 pb-1 text-[11px] italic text-[color:var(--color-ink-3)]"
                    style={{ fontFamily: 'ScriptEn, var(--font-sans)' }}>{s.sub}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
