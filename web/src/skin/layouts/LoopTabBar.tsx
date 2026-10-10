import { aiAvatar, userAvatar } from '../../lib/identity'
import { motion, LayoutGroup } from 'framer-motion'
import { IconMoments, IconChat, IconEbb, IconHeart, IconTerm } from '../../shell/icons'
import type { TabKey } from '../../shell/TabBar'

const TABS: { key: TabKey; label: string; en: string; Icon: () => React.ReactElement }[] = [
  { key: 'moments', label: '朋友圈', en: 'Moments', Icon: IconMoments },
  { key: 'chat', label: '聊天', en: 'Chats', Icon: IconChat },
  { key: 'ebb', label: '涨落', en: 'Ebb', Icon: IconEbb },
  { key: 'memory', label: '纪念', en: 'Us', Icon: IconHeart },
  { key: 'terminal', label: '终端', en: 'Shell', Icon: IconTerm },
]
const spring = { type: 'spring', stiffness: 460, damping: 34 } as const

export default function LoopTabBar({ active, onChange, onMenu }: { active: TabKey; onChange: (k: TabKey) => void; onMenu?: () => void }) {
  const cur = TABS.find((t) => t.key === active) ?? TABS[1]
  const rest = TABS.filter((t) => t.key !== active)
  return (
    <LayoutGroup id="loop-tabbar">
      <nav className="loop-dock mx-3 mb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center gap-2.5">
        <motion.button layout transition={spring} whileTap={{ scale: 0.94 }} onClick={() => onChange(cur.key)}
          className="loop-dock-active flex h-[58px] shrink-0 items-center gap-2 rounded-full pl-4 pr-5 text-white">
          <motion.span key={cur.key} initial={{ scale: 0.4, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring} className="grid h-[26px] w-[26px] place-items-center"><cur.Icon /></motion.span>
          <span className="flex flex-col leading-none">
            <b className="text-[13px] font-semibold">{cur.label}</b>
            <i className="mt-1 text-[10px] not-italic opacity-60" style={{ fontFamily: 'ScriptEn, var(--font-sans)' }}>{cur.en}</i>
          </span>
        </motion.button>
        <motion.div layout transition={spring} className="loop-dock-group flex h-[58px] min-w-0 flex-1 items-center justify-around rounded-full px-2">
          {rest.map(({ key, label, Icon }) => (
            <motion.button key={key} layout transition={spring} whileTap={{ scale: 0.85 }} onClick={() => onChange(key)}
              aria-label={label} className="grid h-[44px] w-[44px] place-items-center rounded-full text-[color:var(--color-ink-2)]">
              <span className="grid place-items-center"><Icon /></span>
            </motion.button>
          ))}
        </motion.div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onMenu} aria-label="打开侧栏"
          className="loop-dock-us relative h-[58px] w-[58px] shrink-0 rounded-full">
          <img src={userAvatar()} alt="" className="absolute left-[7px] top-[9px] h-[32px] w-[32px] rounded-full object-cover" />
          <img src={aiAvatar()} alt="" className="absolute bottom-[8px] right-[7px] h-[30px] w-[30px] rounded-full object-cover" />
        </motion.button>
      </nav>
    </LayoutGroup>
  )
}
