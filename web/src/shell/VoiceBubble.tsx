import { useEffect, useRef, useState } from 'react'
import { audioUrl } from '../lib/api'
import { playBlob, stopSpeech, unlockAudio, speechPlayer } from '../lib/voice'

export default function VoiceBubble({ name, seconds }: { name: string; seconds: number }) {
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState(0)
  const raf = useRef(0)
  const bars = useRef(
    Array.from({ length: Math.min(28, Math.max(10, Math.round(seconds * 2.2))) },
      (_, i) => 26 + Math.abs(Math.sin(i * 2.7) * 0.6 + Math.sin(i * 0.9) * 0.4) * 70),
  )
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (playing) { stopSpeech(); cancelAnimationFrame(raf.current); setPlaying(false); setProg(0); return }
    stopSpeech(); setPlaying(true); setProg(0); unlockAudio()
    const loop = () => {
      const el = speechPlayer
      if (el && el.duration && !Number.isNaN(el.duration)) setProg(Math.min(1, el.currentTime / el.duration))
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    try {
      const r = await fetch(audioUrl(name))
      await playBlob(await r.blob())
    } catch { /* 放不出来 */ }
    cancelAnimationFrame(raf.current)
    setPlaying(false); setProg(0)
  }

  const total = Math.max(1, Math.round(seconds))
  const left = playing ? Math.max(0, Math.ceil(total * (1 - prog))) : total
  const Bars = ({ cls }: { cls: string }) => (
    <span className={`flex h-[20px] items-center gap-[2.5px] ${cls}`}>
      {bars.current.map((h, i) => <i key={i} style={{ height: `${h}%` }} className="w-[2.5px] shrink-0 rounded-full bg-current" />)}
    </span>
  )

  return (
    <button onClick={(e) => void toggle(e)} aria-label={playing ? '暂停语音' : '播放语音'}
      className="mb-1 flex items-center gap-2.5 py-0.5 text-left text-current">
      {/* 小圆钮：淡淡一圈气泡字色的底 */}
      <span className="relative grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full">
        <span className="absolute inset-0 rounded-full bg-current opacity-[.14]" />
        <svg viewBox="0 0 24 24" className="relative h-[12px] w-[12px]" fill="currentColor" aria-hidden>
          {playing
            ? <><rect x="6" y="5" width="4" height="14" rx="1.3" /><rect x="14" y="5" width="4" height="14" rx="1.3" /></>
            : <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.1-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6z" />}
        </svg>
      </span>
      {/* 小条条：淡的一层 + 实色一层按进度扫过去 */}
      <span className="relative">
        <Bars cls="opacity-[.32]" />
        <span className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - prog * 100}% 0 0)` }}>
          <Bars cls="" />
        </span>
      </span>
      <span className="min-w-[2.2em] text-[11.5px] tabular-nums opacity-70">{left}"</span>
    </button>
  )
}
