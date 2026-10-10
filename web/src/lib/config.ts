/* Perigee 前端配置：都可以用 .env 里的 VITE_* 覆盖（见 web/.env.example）。 */
const env = import.meta.env as Record<string, string | undefined>

/** 网关（gateway/）在浏览器里的地址前缀，一般由反向代理转到 gateway 的 HOST:PORT */
export const API_BASE = (env.VITE_API_BASE || '/api').replace(/\/+$/, '')
/** 可选：mousecrew 群聊后端的地址前缀（群聊房间、终端里的群成员状态用；没部署就是空的） */
export const CREW_API_BASE = (env.VITE_CREW_API_BASE || '/crew-api').replace(/\/+$/, '')
/** 站点根路径（vite base），静态资源从这里拼 */
export const ASSET_BASE = import.meta.env.BASE_URL
