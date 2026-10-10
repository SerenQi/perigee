import { aiName } from '../lib/identity'
import { useEffect, useRef, useState } from 'react'
import { fetchRing, answerCall, declineCall, ringUrl } from '../lib/api'
import { playBlob, stopSpeech, unlockAudio } from '../lib/voice'

export default function CallBanner({ onAnswer }: { onAnswer: () => void }) {
  const [opening, setOpening] = useState<string | null>(null)
  const blob = useRef<Blob | null>(null)
  const loop = useRef<number | null>(null)

  useEffect(() => {
    const poll = async () => {
      if (document.hidden || opening !== null) return
      const d = await fetchRing()
      if (d.ring) setOpening(d.ring.opening ?? '')
    }
    const t = setInterval(() => void poll(), 12_000)
    const vis = () => { if (!document.hidden) void poll() }
    document.addEventListener('visibilitychange', vis)
    void poll()
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [opening])

  useEffect(() => {
    if (opening === null) { if (loop.current) { clearInterval(loop.current); loop.current = null } return }
    const ringOnce = async () => {
      try {
        if (!blob.current) { const r = await fetch(ringUrl); if (r.ok) blob.current = await r.blob() }
        if (blob.current) await playBlob(blob.current)
      } catch { /* 响不了就算了 */ }
    }
    unlockAudio(); void ringOnce()
    loop.current = window.setInterval(() => void ringOnce(), 4200)
    return () => { if (loop.current) clearInterval(loop.current) }
  }, [opening])

  if (opening === null) return null
  const close = () => { stopSpeech(); setOpening(null) }

  return (
    <div className="fixed left-1/2 z-[130] w-[min(92%,360px)] -translate-x-1/2 rounded-[var(--radius-lg)]
                    border border-[var(--color-ink)] bg-[var(--color-surface)] px-4 pb-3 pt-3 shadow-[var(--shadow-md)]"
         style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-ink)]" />
        <span className="flex-1 font-medium">{aiName()} 打来电话…</span>
      </div>
      {opening && <p className="mb-3 text-[length:var(--text-sub)] leading-relaxed text-[color:var(--color-ink-3)]">{opening}</p>}
      <div className="flex gap-2">
        <button onClick={async () => { await answerCall(); close(); onAnswer() }}
          className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] py-2.5 text-[color:var(--color-surface)]">接听</button>
        <button onClick={async () => { await declineCall(); close() }}
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-line)] py-2.5">按掉</button>
      </div>
    </div>
  )
}
