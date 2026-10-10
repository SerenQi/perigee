# 网关接口（gateway）

网关默认监听 `127.0.0.1:3003`。浏览器经反向代理访问（默认前缀 `/api`），Claude 在服务器本机直接访问 `http://127.0.0.1:3003`。
网关**自己不做登录**，访问控制交给反向代理。所有请求和回复都是 JSON（流式接口是 SSE）。房间参数写 `?room=<房间id>` 或者放进请求体的 `room_id`，主房间是 `home`。

## 聊天与会话
| 方法 路径 | 说明 |
|---|---|
| `POST /chat/completions` | 发一条消息，SSE 流式回复（OpenAI chunk 格式）。body：`{ messages, room_id, channel?, model?, effort? }` |
| `POST /stop` · `POST /session/stop` | 停掉当前这轮生成 |
| `GET /status?room=` | 进程状态、上下文用量、额度 |
| `GET /session/events?room=` | SSE：这个房间会话的实时事件（思考、正文、工具、权限请求…） |
| `POST /session/permission` | 回答工具审批 `{ request_id, behavior: 'allow'|'deny', room_id }` |
| `POST /session/new` · `POST /session/switch` | 开新会话 / 切到指定 session_id |
| `POST /session/command` | 把一句话以"来自终端"的身份交给这个房间的会话 |
| `POST /forge?room=` | 手动换窗（设置里开了自动换窗才可用） |
| `POST /bridge/inject` | 静默递一句话进房间会话 `{ text, room?, mode?: 'memo'|'wake' }`，回复不进聊天（wake 模式例外） |
| `GET /models` · `GET /channels` | 模型目录 / 可用通道 |

## 房间
| 方法 路径 | 说明 |
|---|---|
| `GET /rooms` | 房间列表（含 permission_mode） |
| `POST /rooms` | 新建 `{ title, agent?: 'claude'|'codex', model?, effort?, permission_mode? }` |
| `PATCH /rooms/<id>` | 改名、通道、模型、思考强度、`permission_mode`、房间须知 `note` |
| `DELETE /rooms/<id>` | 删除（home、group 不能删） |

## 聊天记录
| 方法 路径 | 说明 |
|---|---|
| `GET /history?room=&before=&limit=` | 分页拉记录 |
| `POST /history/append` | 追加一条 `{ role, text, room_id, image?, audio? }` |
| `POST /history/attach-audio` | 把一条语音挂到这个房间最新的一条 AI 消息上 |
| `DELETE /history/clear?room=` | 清空某个房间 |
| `GET /history/pulse?room=` | 每天多少条（热力图、纪念页用） |
| `POST /forwards` · `GET /forwards/<id>` | 合并转发记录 |

## 终端
| 方法 路径 | 说明 |
|---|---|
| `GET /terminal/events?room=` | SSE：这个房间 shell 的输出 |
| `POST /terminal/write` | 往 shell 里写 `{ room_id, input }` |

## 储物柜（房间数据）
`GET /col/<名字>` 列表 · `POST /col/<名字>` 新增 · `PATCH /col/<名字>/<id>` 改 · `DELETE /col/<名字>/<id>` 删。
`by` 字段只有 `user` / `ai` 两种。可用的柜子：

| 柜子 | 房间 |
|---|---|
| `diary` | 双人日记 |
| `mood` | 心情记录 |
| `plans` · `todos` | 计划表 / 待办（`due` 到点提醒，`share` 到点递给 Claude） |
| `ledger` | 小金库 |
| `favorites` | 收藏 |
| `pinboard` | 钉选板 |
| `gallery_albums` | 图库夹子归属 |
| `books` · `book_chapters` · `book_marks` · `book_progress` | 共读小屋 |
| `projects` · `materials` · `sticky` | 项目小屋 |
| `stickers` | 表情包库 |
| `moments` · `moment_comments` | 朋友圈（建议走下面的专用接口） |

## 朋友圈
| 方法 路径 | 说明 |
|---|---|
| `GET /moments` | 全部动态（新的在前）和评论；顺便触发到期的 AI 回应 |
| `POST /moments` | 发一条 `{ content, images?, actor: 'user'|'ai' }` |
| `POST /moments/<id>/like` | `{ actor, liked }` |
| `POST /moments/<id>/comments` | `{ actor, content }` |

## 图库 · 发件箱 · 头像
| 方法 路径 | 说明 |
|---|---|
| `GET /gallery` · `POST /gallery` · `DELETE /gallery/<id>` | 图库；POST body `{ image: dataURL, name?, caption?, by? }` |
| `GET /gallery/file/<文件>` | 取图 |
| `GET /outbox/<文件名>` | 发件箱文件（聊天里 `[[file:文件名]]` 指向这里）。图片/音频/PDF 内联，其他一律下载 |
| `GET /avatars` | `{ key: url }`，key 见 [使用说明](使用说明.md#设置) |
| `PUT /avatars/<key>` · `DELETE /avatars/<key>` | 上传 `{ image: dataURL }`（png/jpeg/webp，≤512KB）/ 清除 |

## 声音 · 识别 · 通话 · 生图
| 方法 路径 | 说明 |
|---|---|
| `POST /tts` | `{ text }` → 音频（按设置里选的声音） |
| `POST /asr` | 原始音频字节 → `{ text }`（按设置里选的识别服务） |
| `POST /audio/upload` · `GET /audio/<文件>` | 语音条文件 |
| `POST /call/ring` | Claude 主动来电 `{ opening }`；`GET /call/ring` 查来电；`POST /call/answer` · `/call/decline` |
| `POST /draw` | 生图 `{ prompt, name?, aspect?, quality?, refs?: dataURL[], keep? }` → `{ file, marker }`。命令行：`gateway/bin/perigee-draw` |

## 涨落 · Ebb
| 方法 路径 | 说明 |
|---|---|
| `GET /ebb?days=7` | `{ sky, metrics, events, counts }` |
| `POST /ebb/sky` | `{ text }` 页头那行小字 |
| `POST /ebb/metrics` | `{ metrics: [{ key, label, desc?, value }] }` 整组替换，value 0~1 |
| `POST /ebb/events` · `DELETE /ebb/events` | 追加 `{ kind, text, note?, at? }` / 清空 |

详见 [涨落.md](涨落.md)。

## 设置
| 方法 路径 | 说明 |
|---|---|
| `GET/PUT /settings/server` | 名字、时区、附言、会话行为（默认权限/换窗/保活）、语音识别、生图、Bark、mousecrew。key 只写不读 |
| `GET /settings/providers` · `PUT /settings/providers/<openrouter|deepseek|openai|anthropic>` | API 通道 |
| `GET/PUT /settings/voice` | 声音（TTS） |
| `GET /mcp` · `POST /mcp/reconnect` · `GET /mcp/config` · `PATCH /mcp/config/<名字>` | MCP 状态与配置 |
| `POST /typing/ping` | 打字节奏（前端自动发，只记时间不记内容） |
