import { motion } from 'framer-motion'
import { IconMoments, IconChat, IconEbb, IconHeart, IconTerm } from './icons'
import { useSkin } from '../skin/useSkin'
import LoopTabBar from '../skin/layouts/LoopTabBar'

export type TabKey = 'moments' | 'chat' | 'ebb' | 'memory' | 'terminal'

const TABS: { key: TabKey; label: string; Icon: () => React.ReactElement }[] = [
  { key: 'moments',  label: '朋友圈', Icon: IconMoments },
  { key: 'chat',     label: '聊天', Icon: IconChat },
  { key: 'ebb',      label: '涨落', Icon: IconEbb },
  { key: 'memory',   label: '纪念', Icon: IconHeart },
  { key: 'terminal', label: '终端', Icon: IconTerm },
]

export default function TabBar({ active, onChange, onMenu }: { active: TabKey; onChange: (k: TabKey) => void; onMenu?: () => void }) {
  const skin = useSkin()
  if (skin === 'loop') return <LoopTabBar active={active} onChange={onChange} onMenu={onMenu} />
  return (
    <nav className="loop-tabbar mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-0.5 rounded-[var(--radius-lg)]
                    border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)]">
      {TABS.map(({ key, label, Icon }) => {
        const on = key === active
        return (
          <motion.button key={key} onClick={() => onChange(key)}
            whileTap={{ scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="relative flex h-[58px] flex-1 flex-col items-center justify-center gap-1 bg-transparent">
            <span className="relative grid h-[34px] w-[34px] place-items-center">
              {on && (
                <motion.span layoutId="tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-[var(--color-ink)]" />
              )}
              <span className={`relative z-10 grid h-[34px] w-[34px] place-items-center rounded-full
                ${on ? 'text-[color:var(--color-surface)]' : 'text-[color:var(--color-ink-2)]'}`}>
                <Icon />
              </span>
            </span>
            <span className={`text-[10px] ${on ? 'font-medium text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-3)]'}`}>
              {label}
            </span>
          </motion.button>
        )
      })}
    </nav>
  )
}
