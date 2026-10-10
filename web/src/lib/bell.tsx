
export const BELL_USER = '（摇了摇铃铛）'
export const OPEN_BELL_EVENT = 'perigee:bell'
const BELL_MARK = /\[\[铃铛(?:[:：]([^\]\n]*))?\]\]/g

/** 摘出我回复里的铃铛标记；流式时半截的标记先藏起来 */
export function takeBells(text: string): { text: string; bells: string[] } {
  const bells: string[] = []
  const t = String(text || '')
    .replace(BELL_MARK, (_w, s) => { bells.push(String(s || '').trim()); return '' })
    .replace(/\[\[铃[^\]\n]*\]?$/, '')
    .replace(/[ \t]+\n/g, '\n').trim()
  return { text: t, bells }
}

let actx: AudioContext | null = null
export function ringBell() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    actx = actx || new AC()
    void actx.resume()
    const ctx = actx
    const t0 = ctx.currentTime + 0.02
    // 小铜铃：一个基音加三个不和谐的泛音，各自很快衰减；连敲四下像摇了一下
    const strike = (t: number, base: number, gain: number) => {
      for (const [mul, g, dec] of [[1, 1, 1.5], [2.76, 0.42, 0.7], [5.4, 0.2, 0.35], [8.93, 0.08, 0.18]] as const) {
        const o = ctx.createOscillator(), v = ctx.createGain()
        o.type = 'sine'; o.frequency.value = base * mul
        v.gain.setValueAtTime(0.0001, t)
        v.gain.exponentialRampToValueAtTime(gain * g, t + 0.006)
        v.gain.exponentialRampToValueAtTime(0.0001, t + dec)
        o.connect(v).connect(ctx.destination); o.start(t); o.stop(t + dec + 0.05)
      }
    }
    strike(t0, 1318, 0.2); strike(t0 + 0.12, 1568, 0.16); strike(t0 + 0.24, 1318, 0.13); strike(t0 + 0.4, 1760, 0.1)
  } catch { /* 没声卡也不碍事 */ }
  try { navigator.vibrate?.([25, 50, 25]) } catch { /* iOS 不震 */ }
}

/* 铃铛图标：内联线条 SVG，跟着 currentColor 走 */
export function BellIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className={`${className} select-none`} aria-hidden>
      <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 004 0" />
      <path d="M12 3v2" />
    </svg>
  )
}

export function BellLine({ who, text }: { who: string; text: string }) {
  return (
    <p className="my-2.5 flex justify-center">
      <span className="inline-flex max-w-[86%] items-center gap-1.5 text-[11.5px] leading-snug text-[color:var(--color-ink-3)]">
        <span className="bell-swing inline-flex shrink-0"><BellIcon className="h-[17px] w-[17px]" /></span>
        <span>{who}摇了摇铃铛{text}</span>
      </span>
    </p>
  )
}
