# Perigee

> **v0.1.0 · early preview.** Works, but still changing fast. Back up `gateway/data/` before upgrading.

**Let Claude Code live in a little home on your phone.**
Perigee is a PWA front end plus a small gateway on your server. The gateway keeps Claude Code (CC) processes running for you. From your phone you get full Claude Code chat (tools, MCP, Skills, a terminal) plus "rooms": diary, mood log, planner, gallery, moments feed, anniversaries and more.

> The UI and the main docs are in Chinese. This page is a short English overview; see [README.md](README.md) for the full guide.

## Features
- **CC channel (full power):** one long-running `claude` process per room with session resume, shared MCP config, a per-room shell terminal, **per-room permission mode** (ask every step by default / accept edits / plan / bypass) with approval cards in chat, optional auto "window switch" when the context fills up (off by default; uses the bundled third-party MIT script `gateway/tools/forge-reload`).
- **API channels (chat only):** OpenRouter, DeepSeek, OpenAI, Anthropic API. Keys are entered in Settings.
- **Group chat** via [mousecrew](https://github.com/anqinou-art/mousecrew) (installed separately).
- **Chat markers** rendered as UI: voice notes `[[voice]]`, bell `[[铃铛:…]]`, invite cards `[invite: …]`, choice cards `[choices: …]`, stickers `[sticker:name]`, file cards `[[file:…]]`, song cards `[song:…]`. See `docs/给你的Claude看.md` for a snippet to paste into your `CLAUDE.md`.
- Voice calls (TTS: Edge / ElevenLabs / MOSI; speech-to-text: self-hosted / OpenAI-compatible / Gemini, which can also pick up tone of voice and background sounds), optional image generation, Bark push, todo reminders.

## Quick start
1. `cd gateway && cp .env.example .env && node --env-file=.env server.js` (Node ≥ 20.6 for the gateway, Node ≥ 20.19 / 22.12 to build the web app; logged-in `claude` CLI; set `CLAUDE_BIN` to an absolute path when running under systemd; no npm deps).
2. `cd web && npm ci && npm run build`, then serve `web/dist` with nginx and proxy `/api/` to `127.0.0.1:3003` (see the nginx example in README.md).
3. **Put a password in front of it** (e.g. nginx Basic Auth). The terminal is a real shell on your server.
4. Open the site on your phone, add it to the home screen, and fill in names and keys under Settings. Keys are stored server-side and never echoed back.

## Security
- The terminal is a real server shell, so always require a password and run the gateway as an unprivileged user.
- Rooms default to "ask every step". Only switch a room to "bypass" if you trust it.
- Keep the gateway on `127.0.0.1` and never expose its port directly.

## License
[MIT](LICENSE) © Perigee contributors

## Thanks

- **[forge-reload](https://github.com/Vivi-Seth/forge-reload)** by Vivi & Seth (MIT) — the context-switch script, bundled (paths made configurable) under `gateway/tools/forge-reload/`.
- **[mousecrew](https://github.com/anqinou-art/mousecrew)** by anqinou-art (MIT) — the group-chat backend. Not bundled; Perigee talks to it over its API, install it separately.
