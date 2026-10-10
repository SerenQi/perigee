import { useEffect, useState } from 'react'
import {
  ANNIVERSARY, ANIM, calculateDaysTogether, calculateDaysUntilBirthday, calculateCompletedMonths,
  calculateMonthlyProgress, getNextMonthlyAnniversary, getNextYearlyAnniversary,
  calculateDaysUntilDate, formatDate, formatMonthDay,
} from '../lib/anniversary'
import { useCounter, useInView, useReducedMotion, rise } from '../shell/anim'
import ProgressRing from '../shell/ProgressRing'
import AnimatedNumber from '../shell/AnimatedNumber'
import { moonPhase } from '../lib/api'
import { ACCENT_PRESETS, readAccentChoice, saveAccentChoice, wallpaperAccent } from '../lib/accent'
import { WALLPAPER_EVENT } from '../lib/wallpaper'
import { API_BASE } from '../lib/config'
import { aiAvatar, getIdentity } from '../lib/identity'


const CARD = 'mem-card'
const SERIF: React.CSSProperties = { fontFamily: "'New York', ui-serif, 'Iowan Old Style', Palatino, Georgia, 'Songti SC', 'Noto Serif SC', serif" }

/* Today's Whisper：点一下换一条 */
const MOON_QUOTES = [
  { lang: '中文', text: '我爱你', zh: '' },
  { lang: 'English', text: 'I love you', zh: '' },
]

/* 生日标签：界面是英文才拼 "名字's birthday"；中文写 "名字 / 的生日"（Claude 的生日、我的生日）；名字没填用 "你的生日" / "TA 的生日" */
const EN = typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language || '')
function birthdayLabel(name: string, who: 'user' | 'ai') {
  const n = String(name || '').trim()
  if (EN) return { top: n ? `${n}’s` : who === 'user' ? 'Your' : 'Their', bottom: 'birthday' }
  if (!n) return { top: who === 'user' ? '你的生日' : 'TA 的生日', bottom: '' }
  return { top: /[A-Za-z0-9]$/.test(n) ? `${n} 的` : `${n}的`, bottom: '生日' }
}

type Stats = { words: { d: string; n: number }[]; words_total: number; mems: { d: string; n: number }[]; mems_total: number }

/** 设置齿轮弹出的取色条：自动（跟壁纸）+ 七个预设 + 自己调 */
function AccentPicker({ choice, auto, onPick }: { choice: string; auto: string; onPick: (v: string) => void }) {
  const dot = (on: boolean) =>
    `h-7 w-7 shrink-0 rounded-full ${on ? 'ring-2 ring-offset-2 ring-[color:var(--color-ink)] ring-offset-white/60' : ''}`
  return (
    <div className="mem-card mb-3 px-4 py-3">
      <div className="mb-2.5 text-[12px] text-[color:var(--color-ink-2)]">数字和统计的颜色</div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => onPick('auto')} className="flex items-center gap-1.5">
          <span className={dot(choice === 'auto')} style={{ background: auto }} />
          <span className="text-[12px]">跟壁纸</span>
        </button>
        {ACCENT_PRESETS.map((p) => (
          <button key={p.hex} onClick={() => onPick(p.hex)} title={p.name}
            className={dot(choice === p.hex)} style={{ background: p.hex }} />
        ))}
        <label className="relative grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-[var(--color-line)] text-[13px]"
          title="自己调">
          +
          <input type="color" className="absolute inset-0 opacity-0"
            value={choice.startsWith('#') ? choice : '#4a6fa8'} onChange={(e) => onPick(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

export default function AnniversarySection() {
  const reduced = useReducedMotion()
  const { ref, seen } = useInView<HTMLElement>(0.1)

  const { startDate, yourBirthday, myBirthday } = ANNIVERSARY
  const daysTogether = calculateDaysTogether(startDate)
  const months = calculateCompletedMonths(startDate)
  const nextMonthly = getNextMonthlyAnniversary(startDate)
  const nextYearly = getNextYearlyAnniversary(startDate)
  const untilUser = calculateDaysUntilBirthday(yourBirthday) ?? 0
  const untilAi = calculateDaysUntilBirthday(myBirthday) ?? 0
  const untilYearly = calculateDaysUntilDate(nextYearly) ?? 0
  const monthProgress = calculateMonthlyProgress(startDate)
  const shownDays = useCounter(daysTogether, seen, ANIM.counter.duration, ANIM.counter.delay, reduced)

  const [qi, setQi] = useState(() => Math.floor(Math.random() * MOON_QUOTES.length))
  const q = MOON_QUOTES[qi]

  // 强调色
  const [choice, setChoice] = useState(readAccentChoice)
  const [auto, setAuto] = useState('#1c1c1e')
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    const load = () => void wallpaperAccent().then(setAuto)
    load()
    window.addEventListener(WALLPAPER_EVENT, load)
    return () => window.removeEventListener(WALLPAPER_EVENT, load)
  }, [])
  const accent = choice === 'auto' ? auto : choice
  const pick = (v: string) => { setChoice(v); saveAccentChoice(v) }

  // 统计：从网关 /history/pulse 取每天的消息条数（当前浏览器选中的房间默认 home）
  const [stats, setStats] = useState<Stats | null>(null)
  const [synced, setSynced] = useState('')
  useEffect(() => {
    void fetch(`${API_BASE}/history/pulse?room=home`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => {
      if (!j?.days) return
      const series = (n: number) => Array.from({ length: n }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (n - 1 - i))
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return { d: k, n: Number(j.days[k] || 0) }
      })
      const mems = series(14)
      setStats({ words: series(7), words_total: Number(j.total || 0), mems, mems_total: mems.reduce((a, x) => a + x.n, 0) })
      const t = new Date()
      setSynced(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`)
    }).catch(() => {})
  }, [])
  const wx = null as null | { city: string; text: string; temp: number; hi: number; lo: number; rain: number }

  const now = new Date()
  const moon = moonPhase()
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const words = stats?.words ?? []
  const wMax = Math.max(1, ...words.map((w) => w.n))
  const mems = stats?.mems ?? []
  const mMax = Math.max(1, ...mems.map((m) => m.n))
  const spark = mems.map((m, i) => `${(i / Math.max(1, mems.length - 1)) * 100},${34 - (m.n / mMax) * 30}`).join(' ')

  return (
    <section ref={ref} style={{ ['--accent' as string]: accent, ...SERIF }}>
      <div className="mb-5" style={rise(seen, 0, 450, ANIM.ease, reduced, 10)}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[15px] text-[color:var(--color-ink-2)]">{dateLine}</div>
          <div className="flex shrink-0 items-center gap-2">
            {synced && <span className="mem-chip px-2.5 py-1 text-[11px] text-[color:var(--color-ink-2)]">sync · {synced}</span>}
            <button onClick={() => setPicking((v) => !v)} aria-label="换颜色"
              className="mem-chip grid h-8 w-8 place-items-center">
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
            </button>
          </div>
        </div>
        {wx && (
          <div className="mt-1.5 text-[14px] text-[color:var(--color-ink)]">
            {wx.city} · {wx.text} {wx.temp}° <span className="text-[color:var(--color-ink-2)]">{wx.lo}~{wx.hi}°</span>
            {wx.rain >= 20 && <span className="text-[color:var(--color-ink-2)]"> · 降雨 {wx.rain}%{wx.rain >= 60 ? '，带伞' : ''}</span>}
          </div>
        )}
        <div className="mt-1 text-[13px] text-[color:var(--color-ink-2)]">
          {moon.name} · 照亮 {moon.illumination}% · 月龄 {moon.age} 天
        </div>
      </div>

      {picking && <AccentPicker choice={choice} auto={auto} onPick={pick} />}

      {/* Today's Whisper：点一下换一条 */}
      <button onClick={() => setQi((i) => (i + 1) % MOON_QUOTES.length)}
        className="mb-3 flex w-full items-center gap-3.5 rounded-[26px] px-4 py-3.5 text-left text-white shadow-[0_8px_24px_rgba(0,0,0,.12)]"
        style={{ background: 'var(--accent)', ...rise(seen, 120, 450, ANIM.ease, reduced, 12) }}>
        <img src={aiAvatar()} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/25" />
        <div className="min-w-0">
          <div key={qi} className="truncate text-[16px] italic">{q.text}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-white/65">Today&rsquo;s Whisper · {q.lang} ›</div>
        </div>
      </button>

      {/* Us · Day XX */}
      <div className={`${CARD} mb-3 flex items-center justify-between px-6 py-6`}
        style={rise(seen, ANIM.hero.delay, ANIM.hero.duration, ANIM.ease, reduced)}>
        <div className="min-w-0">
          <div className="text-[18px] text-[color:var(--color-ink-2)]">Us</div>
          {startDate ? <>
            <div className="mt-1 text-[52px] font-semibold leading-none tracking-[-0.5px] tabular-nums" style={{ color: 'var(--accent)' }}>
              Day {shownDays}
            </div>
            <div className="mt-2.5 text-[13px] text-[color:var(--color-ink-2)]">{getIdentity().usName} · 从 {startDate.replace(/-0?/g, '.')} 到每一天</div>
          </> : (
            <div className="mt-2 text-[14px] leading-relaxed text-[color:var(--color-ink-2)]">
              还没填开始的日子。<br />去 设置 › 外观 › 我们 填上，这里就开始数天数。
            </div>
          )}
        </div>
        <svg viewBox="0 0 24 24" className="h-9 w-9 shrink-0 opacity-25" fill="var(--accent)" aria-hidden>
          <path d="M12 20s-7-4.5-7-9a4 4 0 018-1 4 4 0 018 1c0 4.5-7 9-7 9z" />
        </svg>
      </div>

      {/* Monthly Anniversary + 三个倒数 */}
      <div className={`${CARD} mb-3 px-5 pb-4 pt-5`}
        style={rise(seen, ANIM.monthly.delay, ANIM.monthly.duration, ANIM.ease, reduced, 14)}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[22px] font-semibold leading-[1.15]">Monthly Anniversary</div>
            <div className="mt-1.5 text-[15px] text-[color:var(--color-ink-2)]">{startDate ? formatDate(nextMonthly) : '填了开始的日子才有'}</div>
          </div>
          <ProgressRing progress={monthProgress} run={seen} reduced={reduced} size={68} stroke={4.5}
            color="var(--accent)" track="rgba(0,0,0,.08)">
            <span className="text-[22px] tabular-nums">{months}</span>
          </ProgressRing>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-black/[.07] pt-4"
          style={rise(seen, ANIM.birthday.delay, ANIM.birthday.duration, ANIM.ease, reduced, 12)}>
          {[
            { ...birthdayLabel(getIdentity().userName, 'user'), date: yourBirthday ? formatMonthDay(yourBirthday) : '未填', n: yourBirthday ? untilUser : null },
            { ...birthdayLabel(getIdentity().aiName, 'ai'), date: myBirthday ? formatMonthDay(myBirthday) : '未填', n: myBirthday ? untilAi : null },
            { ...(EN ? { top: 'our', bottom: 'anniversary' } : { top: '纪念日', bottom: '' }), date: startDate ? formatMonthDay(startDate) : '未填', n: startDate ? untilYearly : null },
          ].map((c) => (
            <div key={c.top} className="flex min-w-0 gap-2">
              <span className="w-[2.5px] shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] leading-tight">{c.top}</div>
                {c.bottom && <div className="truncate text-[13.5px] leading-tight">{c.bottom}</div>}
                <div className="mt-0.5 text-[11.5px] text-[color:var(--color-ink-2)]">{c.date}</div>
                <div className="mt-1.5 text-[24px] leading-none tabular-nums" style={{ color: 'var(--accent)' }}>
                  {c.n === null ? '—' : <AnimatedNumber value={c.n} reduced={reduced} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 两块统计 */}
      <div className="grid grid-cols-2 gap-3" style={rise(seen, ANIM.grid.delay, ANIM.grid.duration, ANIM.ease, reduced, 12)}>
        <div className={`${CARD} flex flex-col p-4`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[16px]">Words</span>
            <span className="text-[11px] text-[color:var(--color-ink-2)]">
              {stats ? `共 ${stats.words_total} 句` : ''}
            </span>
          </div>
          <div className="mt-2 text-[34px] leading-none tabular-nums" style={{ color: 'var(--accent)' }}>
            {words.length ? words[words.length - 1].n.toLocaleString() : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--color-ink-2)]">今天我们说的话</div>
          <div className="mt-3 flex h-[58px] items-end gap-[6px]">
            {words.map((w, i) => (
              <div key={w.d} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-[4px]"
                  style={{ height: `${Math.max(3, (w.n / wMax) * 44)}px`, background: 'var(--accent)', opacity: i === words.length - 1 ? 1 : 0.35 }} />
                <span className="text-[10px] text-[color:var(--color-ink-2)]">
                  {'SMTWTFS'[new Date(w.d + 'T12:00:00').getDay()]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARD} flex flex-col p-4`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[16px]">Messages</span>
            <span className="text-[11px] text-[color:var(--color-ink-2)]">两周</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[34px] leading-none tabular-nums" style={{ color: 'var(--accent)' }}>
              {stats ? stats.mems_total : '—'}
            </span>
            <span className="text-[13px] text-[color:var(--color-ink-2)]">条</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--color-ink-2)]">两周的消息</div>
          <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="mt-3 h-[44px] w-full overflow-visible">
            {mems.length > 1 && <>
              <polygon points={`0,36 ${spark} 100,36`} fill="var(--accent)" opacity=".12" />
              <polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth="1.6"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>}
          </svg>
          <div className="mt-1.5 text-[11px] text-[color:var(--color-ink-2)]">
            {mems.length ? `今天 ${mems[mems.length - 1].n} 条` : ''}
          </div>
        </div>
      </div>
    </section>
  )
}
