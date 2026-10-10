import { useEffect, useRef, useState } from 'react'
import { ANIM } from '../lib/anniversary'

/** 数值变化时：旧的往上淡出，新的从下方淡入。宽度用 tabular-nums + ch 预留，不抖 */
export default function AnimatedNumber({
  value, reduced, className = '', minCh,
}: { value: number | string; reduced: boolean; className?: string; minCh?: number }) {
  const [shown, setShown] = useState(value)
  const [phase, setPhase] = useState<'idle' | 'out'>('idle')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; setShown(value); return }
    if (value === shown) return
    if (reduced) { setShown(value); return }
    setPhase('out')
    const t = window.setTimeout(() => { setShown(value); setPhase('idle') }, ANIM.numberSwap / 2)
    return () => clearTimeout(t)
  }, [value, shown, reduced])

  return (
    <span className={`inline-block tabular-nums ${className}`}
      style={{
        minWidth: minCh ? `${minCh}ch` : undefined,
        opacity: phase === 'out' ? 0 : 1,
        transform: phase === 'out' ? 'translateY(-6px)' : 'translateY(0)',
        transition: reduced ? 'none' : `opacity ${ANIM.numberSwap / 2}ms linear, transform ${ANIM.numberSwap / 2}ms ${ANIM.ease}`,
      }}>
      {shown}
    </span>
  )
}
