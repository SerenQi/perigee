import { useEffect, useState } from 'react'
import { SKIN_CHANGED, currentSkin, type Skin } from './skin'

/* 组件里问"现在是哪套皮肤"：设置里一换，所有用到它的地方跟着重画成另一套布局 */
export function useSkin(): Skin {
  const [s, set] = useState<Skin>(currentSkin)
  useEffect(() => {
    const on = () => set(currentSkin())
    window.addEventListener(SKIN_CHANGED, on)
    return () => window.removeEventListener(SKIN_CHANGED, on)
  }, [])
  return s
}
