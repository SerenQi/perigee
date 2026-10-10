# Perigee

> **v0.1.0 · 早期版本（early preview）**：能用，但还在快速变化，升级时请先备份 `gateway/data/`。

**让 Claude Code 住进你手机里的家。**
Perigee 是一个 PWA 前端，加一个跑在你服务器上的小网关。网关替你管理常驻的 Claude Code（CC）进程。你在手机上打开网页，就能和满配的 Claude Code 聊天：工具、MCP、Skills、终端都在。它还带着日记、心情、计划表、图库、朋友圈这些"家里的房间"。

> English: [README.en.md](README.en.md)

<!-- 截图位：聊天页 / 侧栏 / 设置页，各一张（请放你自己的截图，别放带真实对话的图） -->
| 聊天 | 房间 | 设置 |
|---|---|---|
| *(截图占位)* | *(截图占位)* | *(截图占位)* |

---

## 功能

**CC 通道（满配）**：每个房间是一个常驻的 `claude` 进程，会话自动续接。
- 工具 / MCP / Skills 跟你在命令行里用 Claude Code 一样。每个房间都挂同一份 MCP 配置，前端「MCP 连接」页可以增删改、重连。
- 终端：每个房间一个真 shell（就是服务器的 shell，见[安全提示](#安全提示)）。
- **每个房间单独设权限**：每步询问（默认）/ 改文件自动、其他询问 / 只读规划 / 全放行。Claude 要用工具时，手机上弹审批卡。
- 自动换窗（可选，默认关）：上下文快满时，让 Claude 先写交接包，再换到新会话、保留最近的原文（附带的剪切脚本见下文）。
- 模型、思考强度在聊天顶栏随时切；额度用量在「设置 › 此刻」。

**API 通道（纯聊天）**：OpenRouter、DeepSeek、OpenAI、Claude 官方 API。key 在设置里填，能聊天、发图。这个通道不调工具。

**群聊**：几个不同人设的 CC 一起聊，依赖 mousecrew（链接待补）（另装，见下文）。

**聊天里的小玩法**（Claude 在回复里写标记，前端渲染成卡片，写法见 [docs/给你的Claude看.md](docs/给你的Claude看.md)）：
- 语音条 `[[voice]]`：回复合成语音。声音可选 Edge（免费）/ ElevenLabs / MOSI。
- 摇铃铛 `[[铃铛:…]]`：手机会响会震。你也可以从顶栏摇它。
- 邀请卡 `[invite: …]`、选择卡 `[choices: …]`、表情包 `[sticker:名字]`（共用表情包库，自己上传）、文件卡 `[[file:…]]`、歌曲卡 `[song:…]`。
- 打电话：实时语音通话。语音识别可选自建服务 / OpenAI 兼容 / Gemini，Gemini 可听语气和环境音（笑声、叹气、背景里的雨声车流…，附给 Claude 当感受）。
- 生图（可选）：配了生图服务，Claude 就能画图递给你。

**头像**：你自己、每个单聊房间的 AI、群聊里每个成员都能上传头像（存服务器，所有设备一样），没传就用名字首字占位。

**房间**：涨落（一页由你自己推数据的"此刻状态"：天色、指标、活动、时间线，见 [docs/涨落.md](docs/涨落.md)）、朋友圈、纪念日、双人日记、心情记录、计划表（带到点提醒）、图库、小金库、共读小屋（epub/txt 阅读器）、项目小屋、MCP 连接、Skills、设置。
每间房怎么用见 [docs/使用说明.md](docs/使用说明.md)，网关接口见 [docs/API.md](docs/API.md)。

## 环境要求

- 一台 Linux 服务器（2 核 2G 起；CC 进程每个几百 MB）
- Node.js ≥ 20.19（或 ≥ 22.12）。前端构建工具 Vite 要求这个版本，网关本身 ≥ 20.6 就行（用到 `--env-file`）。`node -v` 看一下
- 已登录的 [Claude Code](https://docs.claude.com/en/docs/claude-code)（`claude` 命令能用，订阅或 API key 都行）
- nginx（或任何能做反向代理 + 访问密码的东西）和一个 HTTPS 域名（PWA、麦克风都要求 HTTPS）
- 可选：`edge-tts`（`pip install edge-tts`，免费 TTS）、`ffmpeg`（MOSI 调语速）、`script`（终端用，util-linux 自带）、Codex CLI、mousecrew

## 安装部署

下面假设仓库放在 `/opt/perigee`，用一个普通用户 `perigee` 运行。

### 0. 取代码

```bash
sudo useradd -m -s /bin/bash perigee           # 已经有合适的用户就跳过
sudo git clone <本仓库地址> /opt/perigee
sudo chown -R perigee:perigee /opt/perigee
sudo -u perigee -i                             # 后面的命令都用这个用户执行
claude                                         # 第一次运行会让你登录 Claude Code；登录好退出
which claude node                              # 记下这两个路径，后面要用
```

### 1. 网关

```bash
cd /opt/perigee/gateway
cp .env.example .env        # 只有"部署"那几项需要改，其他都能在前端设置里填
# 至少确认：
#   PERIGEE_PORT（默认 3003，被占用就换一个，nginx 里的端口要跟着改）
#   CLAUDE_BIN  填上面 `which claude` 的绝对路径（systemd 里的 PATH 很短，不填多半找不到 claude）
#   CLAUDE_CWD  Claude 的工作目录，它的 CLAUDE.md 放这里；不填就是这个用户的家目录
node --env-file=.env server.js   # 先手动跑一下，看到 "Perigee gateway listening on 127.0.0.1:3003" 就对了
```

网关没有 npm 依赖，不用 `npm install`。运行数据都在 `gateway/data/`（`PERIGEE_DATA_DIR` 可改），备份它就行。确认能起来后按 Ctrl-C 停掉，交给下面的 systemd。

**MCP**：网关给每个房间挂的 MCP 配置是 `gateway/data/mcp.json`（`PERIGEE_MCP_CONFIG` 可改）。这个文件不存在时，Claude Code 会照常用你在命令行里配好的那些 MCP（`claude mcp list` 能看到的）。一旦在前端「MCP 连接」页添加了服务，网关就会建这个文件，之后每个房间**只用**这里列的 MCP。

systemd 示例（`/etc/systemd/system/perigee-gateway.service`）：

```ini
[Unit]
Description=Perigee gateway
After=network.target

[Service]
User=perigee
WorkingDirectory=/opt/perigee/gateway
EnvironmentFile=/opt/perigee/gateway/.env
ExecStart=/usr/bin/node server.js     # 换成 `which node` 的结果（用 nvm 装的 node 不在 /usr/bin）
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now perigee-gateway
sudo systemctl status perigee-gateway      # 看到 active (running)
curl -s http://127.0.0.1:3003/rooms        # 返回一段 JSON 就通了
```

> `claude` 要用 `perigee` 这个用户登录过一次（`sudo -u perigee claude` 走一遍登录）。

### 2. 前端

```bash
cd /opt/perigee/web
cp .env.example .env     # 一般不用改；部署在子路径下才需要 PERIGEE_BASE
npm ci
npm run build            # 产物在 web/dist/；最后那条 "Some chunks are larger than 500 kB" 是提示，不是错误
```

nginx 是用 `www-data` 之类的用户读文件的：要保证它能读到 `web/dist/`（放在 `/opt` 下一般没问题；放在 `/home/xxx` 下要给目录加上可执行权限）。

### 3. nginx：反向代理 + 访问密码

前端**必须**加访问密码：门后面是一个能在你服务器上执行命令的 Claude，还有你的日记。最简单的是 HTTP Basic Auth：

```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.perigee-htpasswd 你的用户名
```

```nginx
server {
    listen 443 ssl;
    http2 on;                      # nginx 1.25 以前的版本：删掉这行，改写成 listen 443 ssl http2;
    server_name perigee.example.com;
    # ssl_certificate / ssl_certificate_key ...（推荐 certbot）

    auth_basic "Perigee";
    auth_basic_user_file /etc/nginx/.perigee-htpasswd;

    root /opt/perigee/web/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }

    # 网关（流式回复：关缓冲、拉长超时）
    location /api/ {
        proxy_pass http://127.0.0.1:3003/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        client_max_body_size 50m;
    }

    # 可选：mousecrew 群聊后端
    # location /crew-api/ { proxy_pass http://127.0.0.1:8787/; proxy_buffering off; proxy_read_timeout 3600s; }
}
```

改了路径前缀的话，前端 `VITE_API_BASE`、网关 `PERIGEE_API_PUBLIC_BASE` 要和这里一致。改了网关端口，`proxy_pass` 里的 3003 也要改。

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -s -u 你的用户名:你的密码 https://perigee.example.com/api/rooms   # 返回 JSON 就说明前端、密码、网关三段都通了
```

### 4. 第一次打开

1. 手机浏览器打开你的域名，输入密码，然后"添加到主屏幕"。
2. **设置 › 外观 › 我们**：填两边的名字、头像、纪念日（只存在这台设备上）。
3. **设置 › Claude 会话**：填写进提示里的名字和时区，确认默认权限是"每步询问"。
4. 要用 API 通道、语音、生图、推送、群聊，就去对应的设置页填。**需要人来配的东西都在设置里**，每项旁边写了干嘛用、不填会怎样。key 只存服务器（`gateway/data/`，600 权限），不回显；`.env` 里的同名变量只是没填时的兜底。只有部署层面的东西（监听端口、数据目录、claude 路径、工作目录、公网地址）留在 `.env`。
5. 把 [docs/给你的Claude看.md](docs/给你的Claude看.md) 里的那段抄进 `CLAUDE_CWD/CLAUDE.md`，Claude 就知道怎么用语音条、铃铛、卡片这些标记。

### 群聊（mousecrew）

群聊房间跑在 mousecrew（链接待补） 上，安装和配置按它自己的 README。装好之后：
- nginx 加一段 `/crew-api/` 反代到 mousecrew（见上面注释掉的那段），前端默认就从 `/crew-api` 访问。路径不一样就改 `VITE_CREW_API_BASE` 再 build。
- 「设置 › 生图 · 推送 · 群聊」里填 mousecrew 在服务器上的地址和 token，网关合并转发群聊记录时要用。

### 自动换窗（可选，默认关）

Claude Code 的上下文快满时，自带的压缩会把对话揉成一段摘要。自动换窗换一种做法：
1. 水位到设定值（默认 80%）且空闲时，先让当前会话里的 Claude 写交接包：增量更新 `rolling-summary.md`、重写 `handoff.md`（对方此刻 / 进行中 / 对方最后一句 / 答应了还没做的）。**没写完就不换。**
2. 备份旧会话的 jsonl。
3. 用仓库附带的 `gateway/tools/forge-reload/forge-reload.js`（第三方 MIT 脚本，见该目录 README）把最近 N token 的原文（包括 thinking）搬进新会话，并注入交接包。
4. 新会话接着续；验活失败自动回滚到旧会话。

开启：「设置 › Claude 会话 › 自动换窗」，同一处能调水位、保留多少原文、工具输出压缩阈值。交接包写在 `FORGE_DIR`（默认 `gateway/data/forge/`），换别的剪切脚本用 `FORGE_SCRIPT`。聊天页 ⋯ 菜单里有"手动换窗"。
⚠ 它依赖 Claude Code 当前的会话文件格式，Claude Code 升级后可能失效。所以默认关，开之前先自己试一次。

## 安全提示

- **终端 = 服务器 shell。** 终端页是网关用 `script` 开的真 bash，权限等于运行网关的用户。所以前端一定要加访问密码（上面的 Basic Auth），网关用一个普通用户跑，不要用 root。
- **权限默认每步询问。** 改成"全放行"后，Claude 改文件、跑命令都不会再问你。只给你信得过的房间开。
- **别把网关端口裸露到公网。** 网关自己不做登录，`PERIGEE_HOST` 保持 `127.0.0.1`，只让 nginx 访问它。
- key 都存在 `gateway/data/` 下（600 权限），前端只能看到"已配置/未配置"。备份 `data/` 时注意它里面有 key。
- 聊天里收到的图片、文件会存进 `data/inbox*`，告诉 Claude 路径。Claude 能读服务器上的文件，这是设计如此。

## FAQ

**能不用订阅、只用 API key 吗？**
可以。CC 通道里选"Claude API"，在「设置 › 通道与 API」填 Claude 官方 key，Claude Code 就走按量计费。

**API 通道为什么不能用工具？**
API 通道是直连各家的聊天接口，不经过 Claude Code，所以没有工具、MCP、终端。要满配就用 CC 通道。

**回复说到一半我锁屏了，会丢吗？**
不会。网关会把整轮回复存完，你回来时前端从服务器补拉。

**语音条/通话没声音？**
先去「设置 › 语音与通话」点"试听"。Edge 需要服务器装 `edge-tts`。iPhone 上第一次要点一下页面才能放声音。

**说话转不了文字？**
「设置 › 语音与通话 › 语音识别」默认是关的，选一家填上就行。

**Skills 页面怎么装插件？**
Skills 页只用来浏览插件目录。安装请在终端里跑 `claude plugin install <插件名>@<市场名>`（或者在 claude 里输入 `/plugin`），装好后新开会话生效。也可以直接让 Claude 帮你装。

**模型列表里没有我想用的模型？**
CC 通道的模型目录写在 `gateway/lib/store.js` 的 `MODEL_CATALOG`，加一行重启网关就有。API 通道的模型在设置里按家填。

**到点提醒怎么用？**
计划表/待办里填时间。到点后网关推一条 Bark（要先配 Bark）。勾了"也告诉他"的，还会悄悄递给 Claude 一句。

## 许可

[MIT](LICENSE) © Perigee contributors

附带的第三方代码：`gateway/tools/forge-reload/`，来自 Vivi-Seth/forge-reload，MIT，版权归原作者（见该目录 LICENSE）。
