import { userName, aiName, userAvatar, aiAvatar, useIdentity } from '../lib/identity'
import { useEffect, useRef, useState } from 'react'
import {
  fetchMoments, postMoment, likeMoment, commentMoment, uploadImages, type Moment,
} from '../lib/api'
import { useSkin } from '../skin/useSkin'
import LoopMomentsHero from '../skin/layouts/LoopMomentsHero'

const when = (t?: string) => {
  if (!t) return ''
  const d = new Date(t), diff = (Date.now() - d.getTime()) / 60000
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${Math.floor(diff)} 分钟前`
  if (diff < 1440) return `${Math.floor(diff / 60)} 小时前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/* 朋友圈只有两个身份：user / ai，名字头像跟「设置 › 外观 › 我们」走 */
const person = (id?: string) => String(id || '').toLowerCase() === 'ai' ? aiName() : userName()
const scriptName = (_id?: string) => 'font-medium'

function Avatar({ id, size = 42 }: { id: string; size?: number }) {
  const src = String(id || '').toLowerCase() === 'ai' ? aiAvatar() : userAvatar()
  return src
    ? <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
    : <span style={{ width: size, height: size }}
        className="grid shrink-0 place-items-center rounded-full bg-[var(--color-card)] text-[15px] font-bold">{person(id).slice(0, 1)}</span>
}
const Ico = ({ d, fill = false }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="h-[16px] w-[16px]"><path d={d} /></svg>
)
const HEART = 'M12 20s-7-4.5-7-9a4 4 0 018-1 4 4 0 018 1c0 4.5-7 9-7 9z'
const BUBBLE = 'M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z'
const PHOTO = 'M4 5h16v14H4zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 17l5-4.5 3.5 3 3-2.5L20 17'

export default function Moments() {
  const [list, setList] = useState<Moment[]>([])
  const loop = useSkin() === 'loop'
  useIdentity()                               // 名字/头像改了就重画
  const [text, setText] = useState('')
  const [pics, setPics] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [replying, setReplying] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const file = useRef<HTMLInputElement>(null)

  // 每次进来拉一次 —— 后端会顺手把到点的回复生成掉
  const reload = () => void fetchMoments().then((d) => setList([...d.entries].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))))
  useEffect(() => { reload(); const t = setInterval(reload, 60_000); return () => clearInterval(t) }, [])

  async function send() {
    const body = text.trim()
    if (!body && !pics.length) return
    if (await postMoment(body, pics)) { setText(''); setPics([]); setOpen(false); reload() }
  }

  return (
    <section className="absolute inset-0 overflow-y-auto pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {loop ? <LoopMomentsHero list={list} onPost={() => setOpen(true)} /> : <>
      <div className="mb-1 flex items-start justify-between px-5">
        <h2 className="text-[20px] font-bold tracking-tight">空间动态</h2>
        <button onClick={() => setOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-ink)]
                     text-[22px] leading-none text-[color:var(--color-surface)]">+</button>
      </div>
      <p className="mb-5 px-5 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">
        各自路过同一面墙，在上面留痕迹
      </p>
      </>}

      {list.length === 0 && (
        <div className="mx-5 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line)] p-8 text-center
                        text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">还没有人说话</div>
      )}

      {list.map((m) => {
        const author = m.author || (m as Moment & { by?: string }).by || 'user'
        const mine = author === 'user'
        const likes = m.likes || []
        const userLiked = likes.includes('user') || (author === 'ai' && m.ai_liked === true)
        return (
          <article key={m.id} className="mx-3 mb-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-4 py-4 shadow-[var(--shadow-xs)]">
            <div className="mb-3 flex items-center gap-3">
              <Avatar id={author} />
              <div className="min-w-0 flex-1">
                <b className="text-[15px] font-semibold">{person(author)}</b>
                <span className="mt-0.5 block text-[11px] text-[color:var(--color-ink-3)]">{when(m.ts)}</span>
              </div>
              {mine && m.reply_status === 'pending' && <span className="text-[11px] text-[color:var(--color-ink-3)]">他还没看到</span>}
            </div>
            {m.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>}
            {!!m.images?.length && <div className={`mt-3 grid gap-1 ${m.images.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>{m.images.slice(0,9).map((src,i)=><a key={src+i} href={src} target="_blank" rel="noreferrer" className={m.images.length===1?'block max-w-[78%]':''}><img src={src} alt="" loading="lazy" decoding="async" className={`w-full object-cover ${m.images.length===1?'max-h-[430px] rounded-[var(--radius-sm)]':'aspect-square rounded-[6px]'}`}/></a>)}</div>}

            <div className="mt-3 flex items-center justify-end gap-5 text-[12px] text-[color:var(--color-ink-3)]">
              {!mine && (
                <button onClick={async () => { await likeMoment(m.id, !userLiked); reload() }}
                  className={`flex items-center gap-1 ${userLiked ? 'text-[color:var(--color-ink)]' : ''}`}>
                  <Ico d={HEART} fill={userLiked} />{userLiked ? '已赞' : '赞'}
                </button>
              )}
              <button onClick={() => { setReplying(replying === m.id ? null : m.id); setReply('') }} className="flex items-center gap-1">
                <Ico d={BUBBLE} />评论
              </button>
            </div>

            {/* 赞、旧版自动回复、评论链 —— 并进同一个框 */}
            {(likes.length > 0 || m.reply_content || m.comments?.length) ? (
              <div className="mt-2.5 rounded-[var(--radius-sm)] bg-[var(--color-card)] px-3 py-2 text-[13.5px] leading-relaxed">
                {likes.length > 0 && (
                  <div className="flex items-start gap-1.5 text-[12px] text-[color:var(--color-ink-2)]">
                    <span className="mt-[3px] shrink-0"><Ico d={HEART} /></span>
                    <span>{likes.map(person).join('、')}</span>
                  </div>
                )}
                {likes.length > 0 && (m.reply_content || m.comments?.length) ? <div className="my-1.5 h-px bg-[var(--color-line)]" /> : null}
                {m.reply_content && (
                  <div><span className="font-script text-[15px]">{aiName()}</span>：{m.reply_content}</div>
                )}
                {m.comments?.map((c) => (
                  <div key={c.id} className="mt-0.5 first:mt-0">
                    <span className={scriptName(c.author)}>{person(c.author)}</span>：{c.content}
                  </div>
                ))}
              </div>
            ) : null}

            {replying === m.id && (
              <div className="mt-2 flex gap-2">
                <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="说点什么…"
                  onKeyDown={(e) => { if (e.key === 'Enter') void (async () => {
                    if (reply.trim() && await commentMoment(m.id, reply.trim())) { setReply(''); setReplying(null); reload() }
                  })() }}
                  className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)]
                             bg-[var(--color-card)] px-3 py-2 outline-none focus:border-[var(--color-ink)]" />
                <button onClick={async () => {
                  if (reply.trim() && await commentMoment(m.id, reply.trim())) { setReply(''); setReplying(null); reload() }
                }} className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-ink)] px-4 text-[color:var(--color-surface)]">发</button>
              </div>
            )}
          </article>
        )
      })}

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]"
             onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-[380px] rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4">
            <textarea autoFocus rows={4} value={text} placeholder="这一刻的想法…"
              onChange={(e) => setText(e.target.value)}
              className="mb-3 w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-line)]
                         bg-[var(--color-card)] px-3 py-2.5 outline-none focus:border-[var(--color-ink)]" />
            {!!pics.length && <div className="mb-3 grid grid-cols-3 gap-1">{pics.map((src,i)=><div key={src} className="relative"><img src={src} alt="" className="aspect-square w-full object-cover"/><button onClick={()=>setPics(pics.filter((_,k)=>k!==i))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-xs text-white">×</button></div>)}</div>}
            <div className="flex gap-2">
              <button onClick={() => file.current?.click()}
                aria-label="添加图片"
                className="grid place-items-center rounded-[var(--radius-md)] border border-[var(--color-line)] px-4 py-2.5"><Ico d={PHOTO} /></button>
              <input ref={file} type="file" accept="image/*" multiple hidden onChange={async (e) => {
                const fs = e.target.files; if (!fs?.length) return
                const added = await uploadImages(Array.from(fs).slice(0, 9 - pics.length))
                setPics((p)=>[...p,...added.map(x=>x.url)].slice(0,9)); e.target.value=''
              }} />
              <button onClick={() => setOpen(false)}
                className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-line)] py-2.5">取消</button>
              <button onClick={() => void send()}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] py-2.5 text-[color:var(--color-surface)]">发</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
