import { motion } from 'framer-motion'
import type { Moment } from '../../lib/api'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nth = (n: number) => n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'

export default function LoopMomentsHero({ list, onPost }: { list: Moment[]; onPost: () => void }) {
  const pics = list.flatMap((m) => m.images || []).slice(0, 2)
  const withText = list.filter((m) => m.content?.trim())
  const latest = withText[0]
  const second = withText[1]
  const d = latest?.ts ? new Date(latest.ts) : null
  const card = 'loop-card h-[118px] w-[104px] shrink-0 overflow-hidden rounded-[14px]'
  return (
    <div className="pb-2">
      <div className="flex items-baseline gap-2 px-5">
        <h1 className="text-[34px] font-semibold italic leading-none tracking-tight" style={{ fontFamily: 'ScriptEn, var(--font-display)' }}>Moments</h1>
        <span className="text-[11px] text-[color:var(--color-ink-3)]">▸ 各自路过同一面墙…</span>
      </div>

      <div className="mt-4 flex gap-2.5 overflow-x-auto px-4 pb-3 pt-1">
        {pics.map((src, i) => (
          <motion.a key={src} href={src} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }} className={card}>
            <img src={src} alt="" className="h-full w-full object-cover grayscale" />
          </motion.a>
        ))}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={`${card} flex items-center p-3.5`}>
          <p className="line-clamp-4 text-[15px] leading-snug text-[color:var(--color-ink-2)]" style={{ fontFamily: 'ScriptEn, var(--font-display)' }}>
            {second?.content || 'Take your time.'}
          </p>
        </motion.div>
        <motion.button whileTap={{ scale: 0.92 }} onClick={onPost} aria-label="发动态" className={`${card} grid place-items-center text-[#8a8a8e]`}>
          <svg viewBox="0 0 24 24" className="h-[34px] w-[34px]" fill="currentColor" aria-hidden>
            <path d="M9.2 4.5h5.6l1.4 2H19a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5a2 2 0 012-2h2.8zM12 17a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </motion.button>
      </div>

      {latest && (
        <div className="loop-card relative mx-4 mt-1 rounded-[14px] px-5 pb-5 pt-4">
          <p className="line-clamp-2 text-[17px] leading-snug text-[color:var(--color-ink-2)]" style={{ fontFamily: 'ScriptEn, var(--font-display)' }}>{latest.content}</p>
          {d && <span className="absolute bottom-2 right-3 text-[9px] text-[color:var(--color-ink-3)]">编辑时间：{MON[d.getMonth()]} {d.getDate()}{nth(d.getDate())}</span>}
        </div>
      )}

      <div className="mb-3 mt-6 flex items-center px-5">
        <b className="flex-1 text-[22px] font-semibold tracking-tight">My Wall</b>
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3 rounded-full bg-[#c8c8cb]" /><span className="h-[3px] w-3 rounded-full bg-[#c8c8cb]" />
          <span className="h-[3px] w-6 rounded-full bg-[#111]" /><span className="h-[3px] w-3 rounded-full bg-[#c8c8cb]" />
        </span>
      </div>
    </div>
  )
}
