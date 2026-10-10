import { useEffect, useState } from 'react'
import { ANIM } from '../lib/anniversary'

/** SVG 圆环：stroke-dashoffset 绘制，顺时针从 12 点开始 */
export default function ProgressRing({
  progress, size = 88, stroke = 6, run, reduced, delay = ANIM.ring.delay, children,
  color = 'var(--color-ink)', track = 'var(--color-line)',
}: {
  progress: number; size?: number; stroke?: number; run: boolean; reduced: boolean
  delay?: number; children?: React.ReactNode; color?: string; track?: string
}) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const [drawn, setDrawn] = useState(reduced ? progress : 0)

  useEffect(() => {
    if (!run) return
    if (reduced) { setDrawn(progress); return }
    const t = window.setTimeout(() => setDrawn(progress), delay)
    return () => clearTimeout(t)
  }, [run, progress, reduced, delay])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ transformOrigin: 'center' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, drawn)))}
          style={{ transition: reduced ? 'none' : `stroke-dashoffset ${ANIM.ring.duration}ms ${ANIM.ease}` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">{children}</div>
    </div>
  )
}
