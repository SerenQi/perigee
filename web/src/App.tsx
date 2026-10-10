import { aiAvatarFor, useAvatars } from './lib/avatars'
import { groupAvatar, aiName } from './lib/identity'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import TabBar, { type TabKey } from './shell/TabBar'
import Sidebar from './shell/Sidebar'

import ModelPicker from './shell/ModelPicker'
import MoreMenu from './shell/MoreMenu'
import Call from './pages/Call'
import Chat from './pages/Chat'
import ChatList from './pages/ChatList'
import CrewChat from './pages/CrewChat'
import Terminal from './pages/Terminal'
import { BellIcon, OPEN_BELL_EVENT } from './lib/bell'
import Pins from './pages/Pins'
import Ebb from './pages/Ebb'
import Moments from './pages/Moments'
import Memory from './pages/Memory'
import Gallery from './pages/Gallery'
import Locker, { LOCKERS } from './pages/Locker'
import Settings, { bootTheme } from './shell/Settings'
import CallBanner from './shell/CallBanner'
import Registry from './pages/Registry'
import Diary from './pages/Diary'
import Pulse from './pages/Pulse'
import Todos from './pages/Todos'
import Plans from './pages/Plans'
import Mood from './pages/Mood'
import Treasury from './pages/Treasury'
import Books from './pages/Books'
import Studio from './pages/Studio'
import Skills from './pages/Skills'
import { startWatching, askNotify } from './lib/notify'
import { getRoom, setRoom as saveRoom } from './lib/api'
import { useSkin } from './skin/useSkin'

bootTheme()

const TITLE: Record<TabKey, string> = {
  moments: '动态', chat: '聊天', ebb: '涨落', memory: '纪念', terminal: '终端',
}

export default function App() {
  const [tab, setTab] = useState<TabKey>('chat')
  const [chatOpen, setChatOpen] = useState(false)
  const [roomTitle, setRoomTitle] = useState(aiName())
  const [menu, setMenu] = useState(false)
  const [room, setRoom] = useState<string | null>(() => /\/books\/[^/]+\/read\/?$/.test(location.pathname) ? '共读小屋' : null)
  const [preset, setPreset] = useState('')
  const [calling, setCalling] = useState(false)
  const [stale, setStale] = useState(false)
  const skin = useSkin()
  useAvatars()
  useEffect(() => { void askNotify(); return startWatching() }, [])
  useEffect(() => {
    const cur = (document.querySelector('script[type="module"]') as HTMLScriptElement | null)?.src || ''
    const check = async () => {
      try {
        const r = await fetch(import.meta.env.BASE_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const { bundle } = await r.json()
        if (bundle && cur && !cur.includes(bundle)) setStale(true)
      } catch { /* 网络波动不打扰 */ }
    }
    const t = setInterval(check, 60000)
    window.addEventListener('focus', check)
    return () => { clearInterval(t); window.removeEventListener('focus', check) }
  }, [])

  useEffect(() => {
    let sx = 0, sy = 0
    const ts = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx
      const dy = Math.abs(e.changedTouches[0].clientY - sy)
      if (sx < 30 && dx > 60 && dy < 80) setMenu(true)
      if (dx < -60 && dy < 80) setMenu((m) => m ? false : m)
    }
    document.addEventListener('touchstart', ts, { passive: true })
    document.addEventListener('touchend', te, { passive: true })
    return () => { document.removeEventListener('touchstart', ts); document.removeEventListener('touchend', te) }
  }, [])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {stale && (
        <button onClick={() => location.reload()}
          className="fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[300] -translate-x-1/2 rounded-full
                     bg-[var(--color-ink)] px-5 py-[9px] text-[12.5px] tracking-[1px] text-[color:var(--color-surface)]
                     shadow-[0_6px_24px_rgba(0,0,0,.25)]">
          家里上新了 · 点我焕新 ✨
        </button>
      )}
      {tab === 'chat' && chatOpen && skin === 'loop' && (
        /* 灰阶浮雕：顶栏拆成三颗浮起的胶囊——返回圆钮｜头像+房间名+模型｜更多 */
        <header className="loop-roomhead flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <button onClick={() => setChatOpen(false)} aria-label="返回"
            className="loop-circle grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-[22px] leading-none">‹</button>
          <div className="loop-pill flex min-w-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3">
            {getRoom() === 'home'
              ? <img src={aiAvatarFor(getRoom())} alt="" className="h-[32px] w-[32px] shrink-0 rounded-full object-cover" />
              : getRoom() === 'group'
              ? <img src={groupAvatar()} alt="" className="h-[32px] w-[32px] shrink-0 rounded-full object-cover" />
              : <span className="loop-face grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full text-[13px]">{roomTitle[0]}</span>}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-script text-[16px]">{roomTitle}</span>
              <span className="loop-model -ml-1 origin-left scale-[.86]"><ModelPicker /></span>
            </span>
          </div>
          <span className="flex-1" />
          {getRoom() !== 'group' && <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new Event(OPEN_BELL_EVENT)) }} aria-label="摇铃铛"
            className="loop-circle grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full"><BellIcon className="h-[24px] w-[24px]" /></button>}
          <span className="loop-circle grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full">
            <MoreMenu onSearch={() => window.dispatchEvent(new Event('perigee:search'))} onCall={() => setCalling(true)} />
          </span>
        </header>
      )}
      {tab === 'chat' && chatOpen && skin !== 'loop' && (
        <header className="loop-chathead flex shrink-0 items-center gap-2.5 border-b border-[var(--color-line)] px-3
                           pb-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <button onClick={() => setChatOpen(false)} className="px-1 text-[22px] leading-none text-[color:var(--color-ink)]">‹</button>
          <span className="font-script text-[18px]">{roomTitle}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-3)]" />
          <ModelPicker />
          <span className="flex-1" />
          {getRoom() !== 'group' && <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new Event(OPEN_BELL_EVENT)) }} aria-label="摇铃铛"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]"><BellIcon className="h-[21px] w-[21px]" /></button>}
          <MoreMenu onSearch={() => window.dispatchEvent(new Event('perigee:search'))}
                    onCall={() => setCalling(true)} />
        </header>
      )}

      <main className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab + (tab === 'chat' && chatOpen ? ':' + getRoom() : '')} className="absolute inset-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}>
        {tab === 'chat' ? (
          !chatOpen
            ? <ChatList onMenu={() => setMenu(true)}
                        onEnter={(id, title) => { saveRoom(id); setRoomTitle(title); setChatOpen(true) }} />
            : getRoom() === 'group' ? <CrewChat /> : <Chat preset={preset} onPreset={() => setPreset('')} />
        ) : tab === 'terminal' ? <Terminal /> : tab === 'ebb' ? <Ebb /> : tab === 'moments' ? <Moments /> : tab === 'memory' ? <Memory /> : (
          <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <h2 className="mb-1 text-[20px] font-bold tracking-tight">{TITLE[tab]}</h2>
            <p className="mb-6 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">骨架已就位 · 内容待搬</p>
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-line)]
                                      bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                第 {i + 1} 行 · 用来验证滚动
              </div>
            ))}
          </section>
        )}
        </motion.div>
        </AnimatePresence>
      </main>

      {calling && <Call onHang={() => setCalling(false)} />}
      <CallBanner onAnswer={() => setCalling(true)} />
      {!(tab === 'chat' && chatOpen) && <TabBar active={tab} onChange={setTab} onMenu={() => setMenu(true)} />}
      <Sidebar open={menu} onClose={() => setMenu(false)}
               onPick={(name) => {
                 setMenu(false)
                 setRoom(name)
               }} />
      {room && (
        <div className="loop-room fixed inset-0 z-[110] bg-[var(--color-bg)]">
          {room === 'MCP 连接' ? <Registry onBack={() => setRoom(null)} />
           : room === 'Skills' ? <Skills onBack={() => setRoom(null)} />
           : room === '钉选板' ? <Pins onBack={() => setRoom(null)} />
           : room === '图库' ? <Gallery onBack={() => setRoom(null)} />
           : room === '双人日记' ? <Diary onBack={() => setRoom(null)} />
           : room === '聊天热力图' ? <Pulse onBack={() => setRoom(null)} />
           : room === '待办' ? <Todos onBack={() => setRoom(null)} />
           : room === '计划表' ? <Plans onBack={() => setRoom(null)} />
           : room === '心情记录' ? <Mood onBack={() => setRoom(null)} />
           : room === '小金库' ? <Treasury onBack={() => setRoom(null)} />
           : room === '共读小屋' ? <Books onBack={() => { history.replaceState({}, '', import.meta.env.BASE_URL); setRoom(null) }} />
           : room === '项目小屋' ? <Studio onBack={() => setRoom(null)} />
           : room === '设置' ? <Settings onBack={() => setRoom(null)} />
           : LOCKERS[room] ? <Locker def={LOCKERS[room]} onBack={() => setRoom(null)} />
           : (
            <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <button onClick={() => setRoom(null)} className="mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>
              <h2 className="mb-1 text-[20px] font-bold tracking-tight">{room}</h2>
              <p className="text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">这间在服务器上，没有独立数据，先留门</p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
