import { API_BASE } from './config'
/* ═══ 播放器 · 解锁 ═══ */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
export const speechPlayer = typeof Audio !== 'undefined' ? new Audio() : null
let audioUnlocked = false
export let currentAudio: HTMLAudioElement | null = null

export function unlockAudio() {
  if (audioUnlocked || !speechPlayer) return
  try {
    speechPlayer.src = SILENT_WAV
    void speechPlayer.play()?.then(() => { audioUnlocked = true }).catch(() => {})
  } catch { /* 等下次手势 */ }
}
export function stopSpeech() {
  try { speechPlayer?.pause(); if (speechPlayer) { speechPlayer.onended = null; speechPlayer.onerror = null } } catch { /* noop */ }
  currentAudio = null
}
export function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    if (!speechPlayer) return resolve()
    const url = URL.createObjectURL(blob)
    currentAudio = speechPlayer
    const finish = () => { URL.revokeObjectURL(url); if (currentAudio === speechPlayer) currentAudio = null; resolve() }
    speechPlayer.onended = finish
    speechPlayer.onerror = finish
    speechPlayer.src = url
    speechPlayer.play().catch(finish)
  })
}

export function encodeWav16k(frames: Float32Array[], sourceRate: number): Blob {
  let total = 0; for (const f of frames) total += f.length
  const merged = new Float32Array(total); let off = 0
  for (const f of frames) { merged.set(f, off); off += f.length }
  const ratio = sourceRate / 16000, outLen = Math.floor(merged.length / ratio)
  const pcm = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0
    const sample = merged[i0] * (1 - frac) + (merged[i0 + 1] || merged[i0]) * frac
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
  }
  const header = new ArrayBuffer(44), view = new DataView(header)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  w(36, 'data'); view.setUint32(40, pcm.length * 2, true)
  return new Blob([header, pcm.buffer], { type: 'audio/wav' })
}

const WORKLET_CODE = `class PcmTap extends AudioWorkletProcessor{
  constructor(){super();this.buf=new Float32Array(2048);this.n=0}
  process(inputs){const ch=inputs[0]&&inputs[0][0];if(!ch)return true;
    for(let i=0;i<ch.length;i++){this.buf[this.n++]=ch[i];
      if(this.n===2048){this.port.postMessage(this.buf.slice(0));this.n=0}}
    return true}}
registerProcessor('pcm-tap',PcmTap);`

/* 通话偏好（存本机）：在「设置 › 语音与通话」里改 */
export type CallPrefs = {
  /** 收音灵敏度：low 不容易被杂音触发 / normal / high 小声说话也能收到 */
  sensitivity: 'low' | 'normal' | 'high'
  /** 停句等待：一句话说完后等多久才算说完 */
  endpoint: 'fast' | 'normal' | 'slow'
  /** 通话中对方安静多少秒后给 Claude 递一张"小纸条"让它决定要不要开口；0 = 关 */
  nudgeSec: number
}
const CALL_KEY = 'perigee.call'
export const CALL_DEFAULTS: CallPrefs = { sensitivity: 'normal', endpoint: 'normal', nudgeSec: 45 }
export function callPrefs(): CallPrefs {
  try { return { ...CALL_DEFAULTS, ...JSON.parse(localStorage.getItem(CALL_KEY) || '{}') } } catch { return CALL_DEFAULTS }
}
export function setCallPrefs(p: Partial<CallPrefs>) {
  try { localStorage.setItem(CALL_KEY, JSON.stringify({ ...callPrefs(), ...p })) } catch { /* 存不下就算了 */ }
}
const SENS = { low: 2, normal: 1, high: 0.6 }
const ENDPOINT = { fast: 0.7, normal: 1, slow: 1.5 }

// VAD + 自适应停句：短句 900ms 收口，长发言 1350ms，硬上限 45s
const vad = {
  noise: 0.004, voicedRunMs: 0, gapMs: 0, capturing: false,
  speechMs: 0, silenceMs: 0, frames: [] as Float32Array[], preRoll: [] as Float32Array[], sampleRate: 48000,
}
const frameRms = (f: Float32Array) => { let s = 0; for (let i = 0; i < f.length; i += 4) s += f[i] * f[i]; return Math.sqrt(s / (f.length / 4)) }
// 过零率：人声（浊音）低，键盘/摩擦/电流类杂音高——用来过滤"响但不是嗓子"的声音
const frameZcr = (f: Float32Array) => { let z = 0; for (let i = 1; i < f.length; i += 2) { if ((f[i] >= 0) !== (f[i - 2] >= 0)) z++ } return z / (f.length / 2) }
export const resetTurn = () => { vad.capturing = false; vad.speechMs = 0; vad.silenceMs = 0; vad.voicedRunMs = 0; vad.frames = [] }

export type AutoHooks = {
  onStatus: (s: string) => void
  onHearing: (on: boolean) => void
  onTurn: (wav: Blob) => void
  onBargeIn: () => void
  isBusy: () => boolean
}

let autoOn = false
let autoCtx: AudioContext | null = null
let autoNode: AudioWorkletNode | null = null
let autoSource: MediaStreamAudioSourceNode | null = null
let micStream: MediaStream | null = null
export const isAutoOn = () => autoOn
let autoMicLevel = 0
export const getAutoMicLevel = () => (autoOn ? autoMicLevel : 0)

function handleFrame(frame: Float32Array, h: AutoHooks) {
  if (!autoOn) return
  const frameMs = frame.length / vad.sampleRate * 1000
  const rms = frameRms(frame)
  autoMicLevel = rms
  // 我自己声音的尾巴、一点杂音都会被录成一句、排进队里，念完这句就让位 → 像被打断。整轮回复期间（在想、在合成、在念）都按"我在说话"的高门槛
  const speaking = Boolean(currentAudio) || h.isBusy()
  if (!vad.capturing && rms < vad.noise * 2) vad.noise = vad.noise * 0.995 + rms * 0.005  // 噪声底自适应
  const prefs = callPrefs(), sens = SENS[prefs.sensitivity] ?? 1
  const threshold = Math.max(vad.noise * (speaking ? 5.5 : 3.2), speaking ? 0.015 : 0.0012) * sens
  const voiced = rms > threshold && frameZcr(frame) < 0.2
  vad.preRoll.push(frame); if (vad.preRoll.length > 16) vad.preRoll.shift()   // ~680ms 前滚
  if (voiced) {
    vad.voicedRunMs += frameMs; vad.gapMs = 0
    if (!vad.capturing && vad.voicedRunMs >= (speaking ? 450 : 150)) {
      vad.capturing = true; vad.frames = [...vad.preRoll]; vad.speechMs = vad.voicedRunMs; vad.silenceMs = 0
      h.onHearing(true); h.onStatus('你在说…')
    } else if (vad.capturing) { vad.speechMs += frameMs; vad.silenceMs = 0 }
  } else {
    // 说话中的微小气口不清零——静默累计超过 220ms 才算真的停了
    vad.gapMs += frameMs
    if (vad.gapMs > 220) vad.voicedRunMs = 0
    if (vad.capturing) vad.silenceMs += frameMs
  }
  if (vad.capturing) {
    vad.frames.push(frame)
    const endpointMs = (vad.speechMs < 1800 ? 900 : 1350) * (ENDPOINT[prefs.endpoint] ?? 1)        // 自适应停句
    if (vad.silenceMs >= endpointMs || vad.speechMs >= 45_000) {
      const frames = vad.frames, speechMs = vad.speechMs
      resetTurn(); h.onHearing(false)
      if (speechMs < 320) { if (!h.isBusy()) h.onStatus('常开麦 · 我听着呢'); return }  // 咳嗽/桌子响不算话
      h.onTurn(encodeWav16k(frames, vad.sampleRate))
    }
  }
}

export async function enableAuto(h: AutoHooks): Promise<boolean> {
  try {
    micStream = micStream || await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch { h.onStatus('麦克风没给权限，去设置里允许一下'); return false }
  try {
    autoCtx = new AudioContext()
    vad.sampleRate = autoCtx.sampleRate
    await autoCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' })))
    autoSource = autoCtx.createMediaStreamSource(micStream)
    autoNode = new AudioWorkletNode(autoCtx, 'pcm-tap')
    autoNode.port.onmessage = ({ data }) => handleFrame(data as Float32Array, h)
    autoSource.connect(autoNode)
    if (autoCtx.state === 'suspended') await autoCtx.resume()
    autoOn = true
    return true
  } catch (e) { h.onStatus('这个浏览器开不了常开麦：' + (e as Error).message); return false }
}

export function disableAuto(h?: Pick<AutoHooks, 'onStatus' | 'onHearing'>) {
  autoOn = false; resetTurn(); autoMicLevel = 0
  h?.onHearing(false)
  try { autoSource?.disconnect(); autoNode?.disconnect() } catch { /* noop */ }
  void autoCtx?.close?.().catch?.(() => {})
  autoCtx = null; autoNode = null; autoSource = null
  h?.onStatus('听着呢')
}

export function releaseMic() {
  micStream?.getTracks().forEach((t) => t.stop())
  micStream = null
}

/* 一段语音的音量起伏：每 20ms 一个 RMS（0~1）。播放的时候按进度读，给通话里那条线用。
   只解码、不接进播放的走线（接 MediaElementSource 在 iPhone 上可能让声音出不来），解不了就返回 null */
let envCtx: AudioContext | null = null
export async function speechEnvelope(blob: Blob): Promise<number[] | null> {
  try {
    envCtx = envCtx || new AudioContext()
    const buf = await envCtx.decodeAudioData(await blob.arrayBuffer())
    const ch = buf.getChannelData(0), step = Math.max(1, Math.round(buf.sampleRate * 0.02)), out: number[] = []
    for (let i = 0; i < ch.length; i += step) {
      let sum = 0; const end = Math.min(ch.length, i + step)
      for (let j = i; j < end; j++) sum += ch[j] * ch[j]
      out.push(Math.sqrt(sum / (end - i)))
    }
    const peak = Math.max(0.0001, ...out)
    return out.map((v) => v / peak)
  } catch { return null }
}

/* ═══ TTS ═══ */
export async function ttsFetchBlob(text: string, clean: (t: string) => string): Promise<Blob> {
  const r = await fetch(`${API_BASE}/tts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: clean(text) }),
  })
  if (!r.ok) throw new Error('TTS ' + r.status)
  return r.blob()
}
