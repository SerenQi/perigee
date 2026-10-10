import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './skin/loop.css'
import App from './App'
import { applyWallpaper } from './lib/wallpaper'
import { bootSkin } from './skin/skin'

applyWallpaper()   // 全屋壁纸先铺上，再渲染，免得白一下
bootSkin()         // 皮肤也先挂上（设置 · 外观 · 风格）

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
