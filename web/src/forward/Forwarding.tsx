import { aiAvatar, userAvatar, userName, aiName } from '../lib/identity'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fetchRooms, type Room } from '../lib/api'
import { BASE, dateLabel, fetchRecord, notifyRecipient, parseRecord, recordUrl, type ChatRecord, type Selection } from './records'
import './forwarding.css'


const avatarOf = (who: string) => who === userName() ? userAvatar() : who === aiName() ? aiAvatar() : ''
const Face = ({ who, size = 36 }: { who: string; size?: number }) => avatarOf(who)
  ? <img className="fw-face" src={avatarOf(who)} alt="" style={{ width: size, height: size }} />
  : <span className="fw-face fw-letter" style={{ width: size, height: size, fontSize: size * .42 }}>{who.slice(0, 1)}</span>
const hm = (ts?: string) => ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
const day = (ts?: string) => ts ? new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

function Layer({ title, children, onClose, page = false }: { title: string; children: ReactNode; onClose: () => void; page?: boolean }) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const escape = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('.fw-layer')).at(-1) !== panel.current) return
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close.current() }
      if (e.key === 'Tab' && panel.current) {
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,[tabindex="0"]'))
        const first = nodes[0], last = nodes.at(-1)
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('keydown', escape, true); previous?.focus() }
  }, [])
  return createPortal(<div className={page ? 'fw-page-wrap' : 'fw-overlay'} onClick={page ? undefined : onClose}>
    <section ref={panel} tabIndex={-1} className={`fw-layer ${page ? 'fw-page' : 'fw-sheet'}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
      {page
        ? <header className="fw-page-head"><button onClick={onClose} aria-label="返回">‹</button><h2>{title}</h2><span /></header>
        : <><div className="fw-grabber" /><header className="fw-sheet-head"><h2>{title}</h2><button onClick={onClose} aria-label="关闭">×</button></header></>}
      {children}
    </section>
  </div>, document.body)
}

/** 聊天里的那张卡：标题 + 三行预览 + "聊天记录 · N 条" */
export function RecordCard({ id, title, room, root, depth = 0 }: { id: string; title: string; room: string; root?: string; depth?: number }) {
  const [record, setRecord] = useState<ChatRecord | null>(null), [error, setError] = useState(''), [open, setOpen] = useState(false)
  useEffect(() => { let alive = true; fetchRecord(id, room, root).then(r => { if (alive) setRecord(r) }).catch(e => { if (alive) setError(e.message) }); return () => { alive = false } }, [id, room, root])
  return <>
    <button className="fw-card" onClick={() => setOpen(true)}>
      <h3>{record?.title || title}</h3>
      {record?.topic && <p className="fw-card-topic">{record.topic}</p>}
      <div className="fw-card-lines">
        {record?.lines.map((line, i) => <p key={i}>{line.who}：{line.text}</p>)}
        {!record && <p>{error ? '暂时打不开，点一下重试' : '读取中…'}</p>}
      </div>
      <footer>聊天记录{record ? ` · ${record.count} 条` : ''}</footer>
    </button>
    {open && <RecordDetail id={id} room={room} root={root || id} depth={depth} onClose={() => setOpen(false)} />}
  </>
}

/** 点开：整页，像微信的聊天记录页 */
function RecordDetail({ id, room, root, depth, onClose }: { id: string; room: string; root: string; depth: number; onClose: () => void }) {
  const [record, setRecord] = useState<ChatRecord | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => { let live = true; setError(''); fetchRecord(id, room, root, true).then(r => { if (live) setRecord(r) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [id, room, root, retry])
  const msgs = record?.messages ?? []
  return <Layer page title={record?.title || '聊天记录'} onClose={onClose}>
    <div className="fw-page-body">
      {error ? <p className="fw-muted" role="alert">{error} <button className="fw-link" onClick={() => setRetry(v => v + 1)}>重试</button></p>
        : !record ? <p className="fw-muted">载入中…</p> : <>
        <p className="fw-page-meta">转自「{record.sourceTitle}」 · {record.count} 条 · {dateLabel(record.start)} — {dateLabel(record.end)}</p>
        {record.topic && <p className="fw-page-topic">{record.topic}</p>}
        <div className="fw-list">
          {msgs.map((m, i) => {
            const newDay = i === 0 || day(m.ts) !== day(msgs[i - 1].ts)
            return <div key={i}>
              {newDay && <div className="fw-day"><span>{day(m.ts)}</span></div>}
              <article className="fw-row">
                <Face who={m.who} />
                <div className="fw-row-main">
                  <div className="fw-row-head"><span>{m.who}</span><time>{hm(m.ts)}</time></div>
                  {m.recordId && depth < 8
                    ? <RecordCard id={m.recordId} title={parseRecord(m.text)?.title || '聊天记录'} room={room} root={root} depth={depth + 1} />
                    : m.text && <p className="fw-text">{m.text}</p>}
                  {m.recordId && parseRecord(m.text)?.comment && <p className="fw-text">{parseRecord(m.text)?.comment}</p>}
                  {m.images.map((url, k) => <button className="fw-img" key={k} onClick={() => setImage(url)}><img src={url} alt={`${m.who}发的图片`} loading="lazy" /></button>)}
                  {m.attachments.map((a, k) => a.mime.startsWith('image/')
                    ? <button className="fw-img" key={k} onClick={() => setImage(a.url)}><img src={a.url} alt={a.name} loading="lazy" /></button>
                    : <a className="fw-file" key={k} href={a.url} download={a.name}>{a.name}</a>)}
                  {m.audio && <audio controls preload="none" src={m.audio} />}
                </div>
              </article>
            </div>
          })}
        </div>
        <a className="fw-download" href={recordUrl(id, room, root, true)}>下载 TXT</a>
      </>}
    </div>
    {image && <div className="fw-lightbox" role="dialog" aria-label="图片预览" onClick={() => setImage(null)}><button onClick={() => setImage(null)} aria-label="关闭图片">×</button><img src={image} alt="聊天图片原图" /></div>}
  </Layer>
}

/** 多选时底下那条 */
export function SelectionBar({ count, onCancel, onForward }: { count: number; onCancel: () => void; onForward: () => void }) {
  return <div className="fw-selection">
    <button className="fw-ghost" onClick={onCancel}>取消</button>
    <span aria-live="polite">已选 {count} 条<small> / 20</small></span>
    <button className="fw-solid" disabled={!count} onClick={onForward}>合并转发</button>
  </div>
}

/** 转发面板：选人 → 看一眼要发的 → 留言 → 发送 */
export function ForwardSheet({ source, messages, onClose, onSent }: { source: string; messages: Selection[]; onClose: () => void; onSent: (target: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]), [allRooms, setAllRooms] = useState<Room[]>([]), [target, setTarget] = useState(''), [topic, setTopic] = useState(''), [comment, setComment] = useState('')
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [delivered, setDelivered] = useState(false), [error, setError] = useState('')
  const id = useRef(crypto.randomUUID()), lock = useRef(false), submitted = useRef<string | null>(null)
  const load = () => { setError(''); fetchRooms().then(d => { setAllRooms(d.rooms); setRooms(d.rooms.filter(r => r.type === 'direct').sort((a,b) => (b.last_ts || '').localeCompare(a.last_ts || ''))); if (!d.rooms.length) setError('会话列表加载失败，请重试') }) }
  useEffect(load, [])
  async function send() {
    if (!target || lock.current || delivered) return
    lock.current = true; setBusy(true); setError('')
    const body = JSON.stringify({ id: id.current, source, target, messages, topic, comment })
    if (submitted.current && submitted.current !== body) { setError('上次发送结果待确认，请先保持原内容重试，避免重复发送'); setBusy(false); lock.current = false; return }
    submitted.current = body
    try {
      const r = await fetch(`${BASE}/forwards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message || '转发未成功')
      setDelivered(true); onSent(target); setStatus('已送达，正在叫对方来看。可以关掉了。')
      try { await notifyRecipient(target, d.text); setStatus('已送达，对方也回过话了，进那个房间就能看到。') }
      catch { setStatus('已送达，但对方回话没确认上。进那个房间接着问就行，不用再转一次。') }
    } catch (e) { setError(e instanceof Error ? e.message : '网络异常，请保持原内容重试') }
    finally { setBusy(false); lock.current = false }
  }
  const sourceTitle = allRooms.find(r => r.id === source)?.title || aiName()
  const locked = busy || delivered || !!submitted.current
  return <Layer title="转发给" onClose={() => { if (!lock.current || delivered) onClose() }}>
    <div className="fw-people">
      {rooms.map(r => <button aria-pressed={target === r.id} key={r.id} disabled={locked} onClick={() => setTarget(r.id)}>
        <span className={target === r.id ? 'fw-person fw-chosen' : 'fw-person'}>
          {r.id === 'home' ? <img src={aiAvatar()} alt="" /> : r.title.slice(0, 1)}
        </span>
        <span className="fw-person-name">{r.title}</span>
      </button>)}
      {!rooms.length && <button className="fw-link" onClick={load}>重新加载会话</button>}
    </div>
    <div className="fw-preview">
      <b>[聊天记录] {userName()}和{sourceTitle}的聊天记录</b>
      {messages.slice(0, 3).map((m, i) => <p key={i}>{m.role === 'user' ? userName() : sourceTitle}：{m.content || '[图片]'}</p>)}
      <small>共 {messages.length} 条</small>
    </div>
    <input className="fw-input" maxLength={4000} value={comment} disabled={locked} onChange={e => setComment(e.target.value)} placeholder="给对方留言（可不写）" />
    <input className="fw-input" maxLength={120} value={topic} disabled={locked} onChange={e => setTopic(e.target.value)} placeholder="关于什么（可不写，比如：今晚聊到的那本书）" />
    {error && <p className="fw-error" role="alert">{error}</p>}
    {status && <p className="fw-status" role="status">{status}</p>}
    <div className="fw-actions">
      {!delivered ? <>
        <button className="fw-ghost" onClick={onClose} disabled={busy}>取消</button>
        <button className="fw-solid" disabled={busy || !target} onClick={() => void send()}>{busy ? '发送中…' : submitted.current ? '重试发送' : '发送'}</button>
      </> : <button className="fw-solid" onClick={onClose}>完成</button>}
    </div>
  </Layer>
}
