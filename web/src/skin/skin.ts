export type Skin = 'glass' | 'loop'

export const SKINS: { id: Skin; name: string; sub: string }[] = [
  { id: 'glass', name: '纯白玻璃', sub: '原来的样子' },
  { id: 'loop', name: '灰阶浮雕', sub: 'Endless Loop' },
]

const KEY = 'perigee.skin'
export const SKIN_CHANGED = 'perigee:skin'

export function currentSkin(): Skin {
  try { return localStorage.getItem(KEY) === 'loop' ? 'loop' : 'glass' } catch { return 'glass' }
}

export function applySkin(s: Skin, animate = false) {
  const run = () => {
    const root = document.documentElement
    if (s === 'loop') root.dataset.skin = 'loop'
    else delete root.dataset.skin
    try { localStorage.setItem(KEY, s) } catch { /* 无痕模式存不住，本次照样生效 */ }
    window.dispatchEvent(new Event(SKIN_CHANGED))
  }
  // 切换时整页交叉淡入（浏览器支持 View Transitions 才有，不支持就直接换）
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (animate && d.startViewTransition && !calm) d.startViewTransition(run)
  else run()
}

/* 点哪儿，哪儿漾开一圈。挂在 body 上用 fixed 定位，不往按钮里塞东西——不会挤歪任何布局 */
function installRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (document.documentElement.dataset.skin !== 'loop') return
    const hit = (e.target as Element | null)?.closest('button, a, [role="button"], [role="switch"]')
    if (!hit) return
    const r = document.createElement('span')
    r.className = 'loop-ripple'
    r.style.left = e.clientX + 'px'
    r.style.top = e.clientY + 'px'
    document.body.appendChild(r)
    const done = () => r.remove()
    r.addEventListener('animationend', done)
    window.setTimeout(done, 900)
    navigator.vibrate?.(6)   // 安卓上轻轻一震；iPhone 不支持，没有副作用
  }, { passive: true })
}

export function bootSkin() {
  applySkin(currentSkin())
  installRipple()
}
