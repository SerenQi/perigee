import { useEffect, useRef, useState } from 'react'

/** 用户开了「减少动态效果」就不做位移和计数 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** 20% 进入视口时点火，只点一次；卸载时清理 observer */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      if (!seen && typeof window !== 'undefined' && !('IntersectionObserver' in window)) setSeen(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, threshold])
  return { ref, seen }
}

/** 首次入场从 0 递增；之后数据变化只做短切换，不重播 */
export function useCounter(target: number, run: boolean, duration: number, delay: number, reduced: boolean) {
  const [value, setValue] = useState(reduced ? target : 0)
  const played = useRef(false)
  const raf = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!run) return
    if (played.current) { setValue(target); return }      // 数据刷新：直接落位，不重播
    played.current = true
    if (reduced) { setValue(target); return }

    timer.current = window.setTimeout(() => {
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration)
        const eased = 1 - Math.pow(1 - p, 3)               // 先快后慢
        setValue(p >= 1 ? target : Math.round(target * eased))
        if (p < 1) raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    }, delay)

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [run, target, duration, delay, reduced])

  return value
}

/** 卡片错峰淡入：返回内联样式 */
export function rise(seen: boolean, delay: number, duration: number, ease: string, reduced: boolean, y = 16) {
  if (reduced) {
    return { opacity: seen ? 1 : 0, transition: `opacity 140ms linear ${seen ? delay : 0}ms` }
  }
  return {
    opacity: seen ? 1 : 0,
    transform: seen ? 'translateY(0)' : `translateY(${y}px)`,
    transition: `opacity ${duration}ms ${ease} ${delay}ms, transform ${duration}ms ${ease} ${delay}ms`,
  }
}
