/* 灰阶浮雕主屏的歌曲卡：最近在聊天里分享过的歌（[song:歌名|歌手] 卡片）。
   从网关聊天记录里找最新的一首，点卡片去音乐网站听；没有分享过就是一张空状态卡。尺寸和位置跟主屏原来那张卡一样。 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { API_BASE } from '../lib/config'
import { extractSong, songUrl, type SongCard } from '../lib/api'
import { aiName, userName } from '../lib/identity'

type Shared = { song: SongCard; by: 'user' | 'ai'; ts: string; count: number }

const linkOf = (s: SongCard) => s.ncm ? `https://music.163.com/#/song?id=${encodeURIComponent(s.ncm)}` : songUrl(s)
const when = (ts: string) => {
  const t = Date.parse(ts); if (Number.isNaN(t)) return ''
  const d = Math.floor((Date.now() - t) / 86400e3)
  return d <= 0 ? '今天' : d === 1 ? '昨天' : `${d} 天前`
}

export default function SongShareCard() {
  const [shared, setShared] = useState<Shared | null | undefined>(undefined)
  useEffect(() => {
    void fetch(`${API_BASE}/history?room=all&limit=200`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const rows: { role: string; text?: string; ts?: string }[] = j?.messages || []
      const hits = rows.map((m) => ({ m, song: extractSong(String(m.text || '')).song })).filter((x) => x.song)
      const last = hits[hits.length - 1]
      setShared(last ? { song: last.song!, by: last.m.role === 'assistant' ? 'ai' : 'user', ts: String(last.m.ts || ''), count: hits.length } : null)
    }).catch(() => setShared(null))
  }, [])
  const s = shared?.song
  const open = () => { if (s) window.open(linkOf(s), '_blank', 'noopener') }

  return (
    <motion.div role={s ? 'button' : undefined} tabIndex={s ? 0 : -1} aria-label="最近分享的歌" whileTap={s ? { scale: 0.985 } : undefined}
      onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}
      className={`loop-card relative mt-5 h-[150px] overflow-hidden rounded-[26px] ${s ? 'cursor-pointer' : ''}`}>
      <div className="relative flex h-full items-center gap-4 px-4">
        {/* 一张黑胶：有歌时慢慢转 */}
        <div className={`grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full border-[4px] border-[var(--color-ink)] shadow-[0_6px_18px_rgba(0,0,0,.2)]
                         ${s ? 'animate-[spin_14s_linear_infinite]' : ''}`}
          style={{ background: 'repeating-radial-gradient(circle at center, #1c1c1e 0 2px, #2a2a2d 2px 4px)' }}>
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--color-surface)]">
            <span className="h-[6px] w-[6px] rounded-full bg-[var(--color-ink)]" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[.2em] text-[color:var(--color-ink-3)]">SHARED · 最近分享的歌</p>
          {shared === undefined ? (
            <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">读取中…</p>
          ) : s ? (
            <>
              <p className="mt-1 truncate text-[16px] font-semibold leading-tight">{s.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-[color:var(--color-ink-2)]">
                {[s.artist, `${shared!.by === 'ai' ? aiName() : userName()}分享的`, when(shared!.ts)].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[11px] text-[color:var(--color-surface)]">去听</span>
                {shared!.count > 1 && <span className="text-[11px] text-[color:var(--color-ink-3)]">一共分享过 {shared!.count} 首</span>}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-[16px] font-semibold leading-tight">还没有分享过歌</p>
              <p className="mt-1 text-[12px] leading-snug text-[color:var(--color-ink-2)]">在聊天里发一张歌曲卡（[song:歌名|歌手]），最新的一首会放在这里。</p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
