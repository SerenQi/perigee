import { userAvatar, aiAvatar, userName, aiName } from '../lib/identity'
import { useEffect, useRef, useState } from 'react'
import {
  transcribe, streamChat, appendHistory, fetchHistory, getRoom, getEffort,
  splitReadySentences, cleanForSpeech,
} from '../lib/api'
import {
  unlockAudio, stopSpeech, playBlob, ttsFetchBlob,
  enableAuto, disableAuto, releaseMic, resetTurn, currentAudio, speechPlayer,
  getAutoMicLevel, speechEnvelope, callPrefs,
} from '../lib/voice'
import { getModel } from '../shell/ModelPicker'
import { IconMic, IconPhone } from '../shell/icons'


const VOICE_PROMPT =
  '[对方发来的语音——是说出来的话。快答：第一句尽快出来；口语短句，自然，不用列表不用 markdown，不要调用工具除非对方明确要]\n'
const NUDGE_PROMPT = (sec: number) =>
  `[通话小纸条——不是对方说的话：电话还通着，对方已经安静了大约${sec}秒没出声。可能在玩手机、吃东西、发呆，也可能睡着了。想开口就说一两句很短的口语（别追问、别催对方回话）；觉得不该打扰就只回 [[静默]] 四个字。不要调用工具。]`
type Turn = { who: 'her' | 'him'; text: string }

/** 随声音起伏的线：三道正弦叠在一起，两头收细；level 0~1 */
function Wave({ level, width, height, thin = false }: { level: () => number; width: number; height: number; thin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = width * dpr; cv.height = height * dpr
    const g = cv.getContext('2d')!; g.scale(dpr, dpr)
    const ink = getComputedStyle(cv).color
    let raf = 0, t = 0, amp = 0
    const draw = () => {
      const target = level()
      amp += (target - amp) * (target > amp ? 0.35 : 0.08)          // 起得快、落得慢
      t += 0.035 + amp * 0.12
      g.clearRect(0, 0, width, height)
      const mid = height / 2, max = height * 0.42
      const layers = thin ? [[1, 1.6, 0]] : [[1, 2, 0], [0.6, 1.2, 1.7], [0.35, 1, 3.1]]
      for (const [k, lw, ph] of layers) {
        g.beginPath()
        for (let x = 0; x <= width; x += 2) {
          const u = x / width, taper = Math.sin(Math.PI * u) ** 1.6
          const y = mid + taper * (1.5 + amp * max * k) * Math.sin(u * Math.PI * (thin ? 3 : 4 + k * 2) + t * (1 + k) + ph)
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
        }
        g.strokeStyle = ink; g.globalAlpha = k === 1 ? 0.9 : k * 0.55; g.lineWidth = lw; g.lineCap = 'round'
        g.stroke()
      }
      g.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, thin, level])
  return <canvas ref={ref} style={{ width, height }} className="block text-[color:var(--color-ink)]" />
}

/** 头像：谁在说话谁亮一点（放在组件外面，免得每次重画都重新挂载、图片闪） */
const Ava = ({ src, on, size, cls = '' }: { src: string; on: boolean; size: number; cls?: string }) => (
    <span className={`relative shrink-0 rounded-full transition-transform duration-300 ${on ? 'scale-[1.06]' : ''} ${cls}`} style={{ width: size, height: size }}>
      {on && <span className="absolute -inset-[5px] animate-pulse rounded-full border-2 border-[var(--color-ink)] opacity-25" />}
      <img src={src} alt="" className="h-full w-full rounded-full border-[3px] border-[var(--color-surface)] bg-[var(--color-card)] object-cover shadow-[0_8px_22px_-8px_rgba(0,0,0,.35)]" />
    </span>
  )

export default function Call({ onHang }: { onHang: () => void }) {
  const [status, setStatus] = useState('接通了 · 听着呢')
  const [turns, setTurns] = useState<Turn[]>([])
  const [wave, setWave] = useState(false)          // 我在出声
  const [hearing, setHearing] = useState(false)
  const [auto, setAuto] = useState(false)
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [mini, setMini] = useState(false)
  const [vw, setVw] = useState(() => Math.min(window.innerWidth, 520))

  const autoRef = useRef(auto)
  useEffect(() => { autoRef.current = auto }, [auto])

  const rec = useRef<MediaRecorder | null>(null)
  const gen = useRef(0)
  const busy = useRef(false)
  const pending = useRef<string[]>([])
  const hangWhenDone = useRef(false)
  // 线的音量来源
  const env = useRef<number[] | null>(null)                  // 我正在说的这句的音量起伏
  const holdAnalyser = useRef<AnalyserNode | null>(null)      // 按住说时的麦克风
  const holdCtx = useRef<AudioContext | null>(null)
  const recRef = useRef(false)
  useEffect(() => { recRef.current = recording }, [recording])
  const levelRef = useRef(() => {
    if (currentAudio && speechPlayer && !speechPlayer.paused) {
      const e = env.current
      if (e?.length) return Math.min(1, (e[Math.min(e.length - 1, Math.floor(speechPlayer.currentTime / 0.02))] || 0) * 1.05)
      return 0.35 + 0.25 * Math.sin(performance.now() / 120)          // 解不出起伏就给一个像说话的起伏
    }
    if (recRef.current && holdAnalyser.current) {
      const a = holdAnalyser.current, buf = new Float32Array(a.fftSize)
      a.getFloatTimeDomainData(buf)
      let s = 0; for (const v of buf) s += v * v
      return Math.min(1, Math.sqrt(s / buf.length) * 9)
    }
    return Math.min(1, getAutoMicLevel() * 9)
  })

  useEffect(() => {
    unlockAudio()
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    const onR = () => setVw(Math.min(window.innerWidth, 520))
    window.addEventListener('resize', onR)
    return () => { clearInterval(t); window.removeEventListener('resize', onR); gen.current++; stopSpeech(); disableAuto(); releaseMic(); rec.current?.stop(); void holdCtx.current?.close().catch(() => {}) }
  }, [])
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

  const yieldAfterSentence = useRef(false)
  const bargeIn = () => { gen.current++; hangWhenDone.current = false; busy.current = false; stopSpeech(); setWave(false) }

  function makeSpeechQueue(myGen: number) {
    const segs: { blobP: Promise<Blob | null> }[] = []
    let playing = false, closed = false, spokeAny = false
    async function pump() {
      if (playing || gen.current !== myGen) return
      playing = true
      while (segs.length && gen.current === myGen) {
        const blob = await segs.shift()!.blobP.catch(() => null)
        if (gen.current !== myGen || !blob) continue
        if (!spokeAny) { spokeAny = true; setStatus('在说话…'); setWave(true) }
        env.current = await speechEnvelope(blob)
        await playBlob(blob)
        if (yieldAfterSentence.current && pending.current.length && gen.current === myGen) {
          yieldAfterSentence.current = false; playing = false; segs.length = 0
          gen.current++; busy.current = false; setWave(false)
          const next = pending.current.shift()
          if (next) void replyTurn(next)
          return
        }
      }
      playing = false
      if (closed && !segs.length && gen.current === myGen) {
        setWave(false); setStatus(autoRef.current ? '常开麦 · 我听着呢' : '听着呢')
        if (hangWhenDone.current) { hangWhenDone.current = false; setStatus('他轻轻放下了听筒'); setTimeout(onHang, 900) }
      }
    }
    return {
      push(t: string) {
        const c = cleanForSpeech(t); if (!c) return
        segs.push({ blobP: ttsFetchBlob(c, cleanForSpeech).catch(() => null) }); void pump()
      },
      close() {
        closed = true; void pump()
        if (!segs.length && !playing && gen.current === myGen) { setWave(false); setStatus(autoRef.current ? '常开麦 · 我听着呢' : '听着呢') }
      },
    }
  }

  async function replyTurn(text: string, nudge = false) {
    gen.current++; const myGen = gen.current
    yieldAfterSentence.current = false
    busy.current = true; stopSpeech()
    setStatus('在想…')
    setTurns((v) => [...v, { who: 'him', text: '' }])
    const q = makeSpeechQueue(myGen)
    let buf = '', spoken = 0, full = ''
    try {
      const hist = (await fetchHistory()).slice(-24).map(({ role, content }) => ({ role, content }))
      await streamChat([...hist, { role: 'user', content: nudge ? text : VOICE_PROMPT + text }], {
        onText: (t) => {
          if (gen.current !== myGen) return
          full += t; buf += t
          if (nudge && /^\s*\[{0,2}静?默?\]{0,2}\s*$/.test(full) && full.trim().length <= 6) return   // 可能是 [[静默]]，先别念别显示
          setTurns((v) => { const n = v.slice(); const last = n[n.length - 1]; if (last?.who === 'him') n[n.length - 1] = { who: 'him', text: last.text + t }; return n })
          const { ready, rest } = splitReadySentences(buf, spoken === 0 ? 4 : 14)
          buf = rest
          ready.forEach((r) => { spoken++; q.push(r) })
        },
      }, { model: getModel() || undefined, effort: getEffort(), roomId: getRoom(), ...(nudge ? { persist: false } : {}) })
      if (nudge && /\[\[静默\]\]/.test(full)) { setTurns((v) => (v[v.length - 1]?.who === 'him' ? v.slice(0, -1) : v)); q.close(); return }
      if (nudge && full.trim()) {
        if (!turnsHasText(full)) setTurns((v) => { const n = v.slice(); n[n.length - 1] = { who: 'him', text: full }; return n })
        void appendHistory('assistant', full.replace(/\s*\[挂断\]\s*$/, ''))
      }
      if (buf.trim()) q.push(buf)
      if (/\[挂断\]/.test(full)) hangWhenDone.current = true
      q.close()
    } catch { setStatus('刚才断了一下，再说一遍？'); setWave(false) }
    finally {
      if (gen.current === myGen) {
        busy.current = false
        setTurns((v) => (v[v.length - 1]?.who === 'him' && !v[v.length - 1].text ? v.slice(0, -1) : v))
        if (pending.current.length) {
          if (currentAudio) yieldAfterSentence.current = true
          else { const next = pending.current.shift(); if (next) void replyTurn(next) }
        }
      }
    }
  }

  const lastSound = useRef(Date.now())
  const nudged = useRef(false)
  const turnsHasText = (t: string) => turns.some((x) => x.who === 'him' && x.text === t)
  useEffect(() => { if (wave || hearing || recording) lastSound.current = Date.now() }, [wave, hearing, recording])
  useEffect(() => {
    const id = setInterval(() => {
      if (nudged.current || busy.current || currentAudio || recRef.current || hangWhenDone.current) return
      const quiet = Date.now() - lastSound.current
      const nudgeMs = callPrefs().nudgeSec * 1000
      if (!nudgeMs || quiet < nudgeMs) return
      nudged.current = true
      void replyTurn(NUDGE_PROMPT(Math.round(quiet / 1000)), true)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  async function onSpoken(wav: Blob) {
    if (!busy.current) setStatus('在听清你说了什么…')
    const text = await transcribe(wav).catch(() => '')
    if (!text) { if (!busy.current) setStatus(auto ? '常开麦 · 我听着呢' : '没听清，再说一遍？'); return }
    setTurns((v) => [...v, { who: 'her', text }])
    void appendHistory('user', '📞 ' + text)
    lastSound.current = Date.now(); nudged.current = false
    if (busy.current || currentAudio) { pending.current.push(text); yieldAfterSentence.current = true; setStatus('听到了，我说完这句就接你…'); return }
    await replyTurn(text)
  }

  const hooks = {
    onStatus: setStatus, onHearing: setHearing,
    onTurn: (wav: Blob) => void onSpoken(wav),
    onBargeIn: bargeIn, isBusy: () => busy.current || Boolean(currentAudio),
  }

  async function toggleAuto() {
    unlockAudio()
    if (auto) { disableAuto(hooks); setAuto(false); return }
    if (await enableAuto(hooks)) { setAuto(true); setStatus('常开麦 · 我听着呢，直接说') }
  }

  async function holdStart() {
    if (auto || recording) return
    unlockAudio()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      try {   // 给线读音量：只分析，不出声
        holdCtx.current = new AudioContext()
        const an = holdCtx.current.createAnalyser(); an.fftSize = 1024
        holdCtx.current.createMediaStreamSource(stream).connect(an); holdAnalyser.current = an
      } catch { /* 读不了音量也照样录 */ }
      const mr = new MediaRecorder(stream); const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRecording(false)
        holdAnalyser.current = null; void holdCtx.current?.close().catch(() => {}); holdCtx.current = null
        await onSpoken(new Blob(chunks))
      }
      rec.current = mr; mr.start(); setRecording(true); setStatus('你在说…'); resetTurn()
    } catch { setStatus('麦克风没给权限，去设置里允许一下') }
  }
  const holdEnd = () => { if (recording) rec.current?.stop() }
  const hang = () => { gen.current++; stopSpeech(); disableAuto(); releaseMic(); setStatus('他轻轻放下了听筒'); setTimeout(onHang, 600) }

  const herOn = recording || hearing
  const himOn = wave
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight }, [turns, mini])

  /* ── 小窗 ── */
  if (mini) return (
    <div className="fixed right-3 z-[150] flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 pl-1.5 pr-2 shadow-[0_10px_28px_rgba(0,0,0,.18)]"
      style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}>
      <button onClick={() => setMini(false)} aria-label="回到全屏通话" className="flex items-center gap-2">
        <span className="flex">
          <Ava src={userAvatar()} on={herOn} size={30} />
          <Ava src={aiAvatar()} on={himOn} size={30} cls="-ml-2.5" />
        </span>
        <Wave level={levelRef.current} width={54} height={26} thin />
        <span className="text-[11.5px] tabular-nums text-[color:var(--color-ink-2)]">{mmss}</span>
      </button>
      <button onClick={hang} aria-label="挂断" className="grid h-8 w-8 place-items-center rounded-full bg-[#e5484d] text-white">
        <span className="inline-block h-[15px] w-[15px] rotate-[135deg]"><IconPhone /></span>
      </button>
    </div>
  )

  /* ── 全屏 ── */
  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[var(--color-bg)]"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      {/* 顶栏：缩小 · 时长 */}
      <div className="flex items-center justify-between px-4">
        <button onClick={() => setMini(true)} aria-label="缩成小窗"
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9.5l6 6 6-6" />
          </svg>
        </button>
        <span className="text-[13px] tabular-nums text-[color:var(--color-ink-2)]">{mmss}</span>
        <span className="h-10 w-10" />
      </div>

      {/* 上：两个头像挨着 */}
      <div className="mt-6 flex flex-col items-center">
        <div className="flex items-center">
          <Ava src={userAvatar()} on={herOn} size={92} />
          <Ava src={aiAvatar()} on={himOn} size={92} cls="-ml-5" />
        </div>
        <div className="mt-3 text-[15px] font-semibold">{userName()} · {aiName()}</div>
        <div className="mt-1 h-[18px] text-[12.5px] text-[color:var(--color-ink-3)]">{status}</div>
      </div>

      {/* 中：随声音起伏的线 */}
      <div className="mt-5 flex justify-center" onClick={() => { if (currentAudio) { bargeIn(); setStatus('你说，我听着') } }}>
        <Wave level={levelRef.current} width={vw - 32} height={110} />
      </div>
      <div className="mt-1 h-[16px] text-center text-[11.5px] text-[color:var(--color-ink-3)]">{himOn ? '我说话时也在听你 · 说完这句就接 · 急的话点这条线' : ''}</div>

      {/* 下：说过的话 */}
      <div ref={box} className="mx-5 mt-3 min-h-0 flex-1 overflow-y-auto"
        style={{ maskImage: 'linear-gradient(transparent, #000 18%, #000 100%)', WebkitMaskImage: 'linear-gradient(transparent, #000 18%, #000 100%)' }}>
        <div className="flex min-h-full flex-col justify-end gap-3 pb-2 pt-10">
          {!turns.length && <p className="text-center text-[13px] text-[color:var(--color-ink-3)]">说点什么吧，我在听。</p>}
          {turns.map((t, i) => (
            <p key={i} className={t.who === 'her'
              ? 'text-right text-[13.5px] leading-relaxed text-[color:var(--color-ink-3)]'
              : 'text-[16px] leading-relaxed text-[color:var(--color-ink)]'}>
              {t.text || <span className="text-[color:var(--color-ink-3)]">…</span>}
            </p>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-3 grid w-full max-w-[340px] grid-cols-3 justify-items-center px-4">
        <button onClick={() => void toggleAuto()} className="flex w-full flex-col items-center gap-1.5">
          <span className={`grid h-[64px] w-[64px] place-items-center rounded-full border transition-shadow
            ${auto ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}
            ${hearing ? 'shadow-[0_0_0_6px_rgba(0,0,0,.10)]' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="h-[22px] w-[22px]">
              <path d="M4 10.5v3M8 7.5v9M12 4.5v15M16 7.5v9M20 10.5v3" />
            </svg>
          </span>
          <small className="text-[11px] text-[color:var(--color-ink-2)]">常开麦</small>
        </button>
        <button onPointerDown={() => void holdStart()} onPointerUp={holdEnd} onPointerLeave={holdEnd} disabled={auto}
          className="flex w-full flex-col items-center gap-1.5 disabled:opacity-50" style={{ touchAction: 'none' }}>
          <span className={`grid h-[64px] w-[64px] place-items-center rounded-full border transition-transform
            ${recording ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)] shadow-[0_0_0_8px_rgba(0,0,0,.10)]'
                        : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
            <span className="flex h-[26px] w-[26px] items-center justify-center"><IconMic /></span>
          </span>
          <small className="text-[11px] text-[color:var(--color-ink-2)]">按住说</small>
        </button>
        <button onClick={hang} className="flex w-full flex-col items-center gap-1.5">
          <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-[#e5484d] text-white shadow-[0_8px_20px_-8px_rgba(229,72,77,.6)]">
            <span className="flex h-[24px] w-[24px] rotate-[135deg] items-center justify-center"><IconPhone /></span>
          </span>
          <small className="text-[11px] text-[color:var(--color-ink-2)]">挂断</small>
        </button>
      </div>
    </div>
  )
}
