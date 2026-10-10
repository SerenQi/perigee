import { userName } from '../lib/identity'
import { API_BASE, CREW_API_BASE } from '../lib/config'
import { useEffect, useMemo, useRef, useState } from 'react'
import { answerPermission, fetchHistory, fetchRooms, type Room } from '../lib/api'
const BASE = API_BASE
const CREW_BASE = CREW_API_BASE
const CREW_ROOMS: { id: string; title: string; agent: string }[] = []   // 想在终端里看某个 mousecrew 成员的独立会话，就往这里加 { id, title, agent }
type Kind='system'|'user'|'assistant'|'thinking'|'tool'|'shell'|'error'
type Line={id:string;kind:Kind;text:string}
type Perm={request_id:string;display_name?:string;title?:string;tool_name?:string;description?:string;input?:unknown}
let n=0; const nid=()=>`nx-${Date.now()}-${++n}`
const ansi=(s:string)=>s.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'').replace(/\r/g,'')

export default function Terminal(){
 const [rooms,setRooms]=useState<Room[]>([]),[active,setActive]=useState('home')
 const [logs,setLogs]=useState<Record<string,Line[]>>({}),[perms,setPerms]=useState<Record<string,Perm[]>>({})
 const [cmd,setCmd]=useState(''),[live,setLive]=useState(false); const box=useRef<HTMLDivElement>(null)
 const last=useRef<{room:string;id:string;kind:Kind}|null>(null), direct=useMemo(()=>[...rooms.filter(r=>r.type==='direct'),...CREW_ROOMS.map(r=>({...r,type:'direct'} as Room))],[rooms]), lines=logs[active]||[], crewAgent=CREW_ROOMS.find(r=>r.id===active)?.agent||null, crewTitle=CREW_ROOMS.find(r=>r.id===active)?.title||''
 const add=(room:string,kind:Kind,text:string,append=false)=>{if(!text)return;setLogs(all=>{const list=all[room]||[];if(append&&last.current?.room===room&&last.current.kind===kind)return{...all,[room]:list.map(x=>x.id===last.current?.id?{...x,text:x.text+text}:x)};const x={id:nid(),kind,text};last.current=append?{room,id:x.id,kind}:null;return{...all,[room]:[...list.slice(-999),x]}})}
 useEffect(()=>{void fetchRooms().then(d=>{setRooms(d.rooms);if(!d.rooms.some(r=>r.id===active&&r.type==='direct'))setActive(d.rooms.find(r=>r.type==='direct')?.id||'home')})},[])
 useEffect(()=>{requestAnimationFrame(()=>{if(box.current)box.current.scrollTop=box.current.scrollHeight})},[lines.length,lines.at(-1)?.text])
 useEffect(()=>{let closed=false
  if(crewAgent){
   const belongs=(m:any)=>String(m.sender||'').toLowerCase()===crewAgent||String(m.content||'').toLowerCase().includes(`@${crewAgent}`)
   const kind=(m:any):Kind=>String(m.sender||'').toLowerCase()===crewAgent?'assistant':'user'
   if(!logs[active])void fetch(`${CREW_BASE}/api/group/history?limit=200`,{cache:'no-store'}).then(r=>r.json()).then(d=>{if(closed)return;const ms=(d.messages||[]).map((m:any)=>{let meta:any={};try{const raw=m.meta??m.metadata;meta=typeof raw==='string'?JSON.parse(raw):(raw||{})}catch{};return{...m,sender:meta.sender||m.sender||'system'}}).filter(belongs);setLogs(a=>({...a,[active]:ms.map((m:any)=>({id:String(m.id||`${m.ts}-${m.sender}-${m.content}`||nid()),kind:kind(m),text:String(m.content||'')}))}))})
   const es=new EventSource(`${CREW_BASE}/api/group/events`);es.onopen=()=>setLive(true);es.onerror=()=>setLive(false);es.onmessage=e=>{let d:any;try{d=JSON.parse(e.data)}catch{return};if(d.type==='message'&&belongs(d))add(active,kind(d),String(d.content||''));else if((d.type==='typing'||d.type==='waiting')&&d.sender===crewAgent)add(active,'system',`${crewTitle} · ${d.type==='typing'?'working…':'idle'}`)};return()=>{closed=true;es.close();last.current=null}
  }
  if(!logs[active])void fetchHistory(active).then(ms=>{if(!closed)setLogs(a=>({...a,[active]:ms.map(m=>({id:m.id,kind:m.role==='user'?'user':'assistant',text:m.content}))}))})
  const me=new EventSource(`${BASE}/session/events?room=${encodeURIComponent(active)}`), se=new EventSource(`${BASE}/terminal/events?room=${encodeURIComponent(active)}`)
  me.onopen=()=>setLive(true);me.onerror=()=>setLive(false);me.onmessage=e=>{let d:any;try{d=JSON.parse(e.data)}catch{return}if(d.type==='connected'){setLive(true);setPerms(p=>({...p,[active]:Array.isArray(d.pending)?d.pending:[]}))}else if(d.type==='user_message')add(active,'user',String(d.text||''));else if(d.type==='assistant_delta')add(active,'assistant',String(d.text||''),true);else if(d.type==='thinking_delta')add(active,'thinking',String(d.text||''),true);else if(d.type==='tool_start')add(active,'tool',`▸ ${d.name||'工具'}…`);else if(d.type==='tool_done')add(active,'tool',`✓ ${d.name||'工具'} 完成`);else if(d.type==='permission_request'){const r=(d.request||d) as Perm;if(r.request_id)setPerms(p=>({...p,[active]:[...(p[active]||[]).filter(x=>x.request_id!==r.request_id),r]}))}else if(d.type==='permission_cancelled'||d.type==='permission_resolved')setPerms(p=>({...p,[active]:(p[active]||[]).filter(x=>x.request_id!==d.request_id)}));else if(d.type==='turn_done')last.current=null}
  se.onmessage=e=>{let d:any;try{d=JSON.parse(e.data)}catch{return}if(d.type==='connected')add(active,'system',`shell · ${d.cwd||''}`);if(d.type==='output')add(active,'shell',ansi(String(d.text||'')),true)}
  return()=>{closed=true;me.close();se.close();last.current=null}},[active,crewAgent])
 const write=(input:string)=>crewAgent
  ? fetch(`${CREW_BASE}/api/group/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender:userName(),message:`@${crewTitle} ${input.trim()}`})})
  : fetch(`${BASE}/terminal/write`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:active,input})})
 const run=async()=>{if(!cmd)return;if(cmd==='/clear'){setLogs(p=>({...p,[active]:[]}));setCmd('');return}const x=cmd;setCmd('');await write(x+'\n')}
 const answer=async(r:Perm,b:'allow'|'deny')=>{await answerPermission(r.request_id,b,active);setPerms(p=>({...p,[active]:(p[active]||[]).filter(x=>x.request_id!==r.request_id)}));add(active,'system',`${b==='allow'?'已批准':'已拒绝'} · ${r.display_name||r.tool_name||'工具'}`)}
 return <div className="absolute inset-0 flex flex-col bg-[var(--color-bg)] px-3 pt-[max(.75rem,env(safe-area-inset-top))]">
  <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-black/15 bg-[#1c1c1e] shadow-[0_18px_55px_rgba(0,0,0,.12)]">
   <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/10 px-4 py-3 text-[12px] text-[#a8a8a8]"><span className="mr-2 flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#df7167]"/><i className="h-2.5 w-2.5 rounded-full bg-[#e7b650]"/><i className="h-2.5 w-2.5 rounded-full bg-[#79b58a]"/></span>{direct.map(r=><button key={r.id} onClick={()=>setActive(r.id)} className={`shrink-0 rounded-xl px-3 py-1.5 font-semibold ${active===r.id?'bg-[#3a3a3c] text-[#e8e8e8]':''}`}>{r.title}</button>)}<span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${live?'bg-[#7fb88c]':'bg-white/25'}`}/><span className="shrink-0">{lines.length} lines</span></div>
   <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-mono text-[12px] leading-[1.65] text-[#c9c9c9]">{lines.map(l=><div key={l.id} className={`mb-2 whitespace-pre-wrap break-words ${l.kind==='user'?'text-[#d8e5d8]':l.kind==='assistant'?'text-[#dcdcdc]':l.kind==='thinking'?'italic text-[#8a8a8a]':l.kind==='tool'?'text-[#e2bc6b]':l.kind==='error'?'text-[#ef8c88]':l.kind==='system'?'text-[#7a7a7a]':'text-[#aabf9f]'}`}>{l.kind==='user'?'♥ ':l.kind==='assistant'?'◆ ':''}{l.text}</div>)}
   {(perms[active]||[]).map(r=><div key={r.request_id} className="my-3 rounded-2xl border border-white/20 bg-[#2a2a2c] p-3"><b>需要权限 · {r.display_name||r.title||r.tool_name||'工具'}</b><div className="mt-1 text-[#a8a8a8]">{r.description||'模型请求执行受保护操作'}</div>{r.input!=null&&<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(r.input,null,2)}</pre>}<div className="mt-3 flex gap-2"><button onClick={()=>void answer(r,'allow')} className="flex-1 rounded-xl bg-[#e8e8e8] py-2 text-[#1c1c1e]">批准</button><button onClick={()=>void answer(r,'deny')} className="flex-1 rounded-xl border border-white/20 py-2">拒绝</button></div></div>)}</div>
  </section>
  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-4 py-2 shadow-[var(--shadow-xs)]"><span className="text-[color:var(--color-ink-3)]">✦</span><input value={cmd} onChange={e=>setCmd(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run()}} placeholder={crewAgent?`给 ${crewTitle} 的消息…`:'命令…'} className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[13px] outline-none"/><button onClick={()=>void run()} className="text-[color:var(--color-ink-2)]">〉_</button></div>
  <div className="flex gap-2 overflow-x-auto py-3">{!crewAgent&&[['Esc','\x1b'],['Ctrl-C','\x03'],['↑','\x1b[A'],['↓','\x1b[B'],['Enter','\n']].map(([a,b])=><button key={a} onClick={()=>void write(b)} className="shrink-0 rounded-xl bg-[var(--color-surface)] px-4 py-2 text-[12px] text-[color:var(--color-ink-2)] shadow-[var(--shadow-xs)]">{a}</button>)}{crewAgent&&<span className="px-2 py-2 text-[11px] text-[color:var(--color-ink-3)]">{crewTitle} · 独立安全会话</span>}<button onClick={()=>setLogs(p=>({...p,[active]:[]}))} className="rounded-xl bg-white/65 px-4 py-2 text-[12px]">Clear</button></div>
 </div>
}
