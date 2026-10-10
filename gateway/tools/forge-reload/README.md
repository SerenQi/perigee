# forge-reload（随 Perigee 附带的第三方脚本）

来源：[Vivi-Seth/forge-reload](https://github.com/Vivi-Seth/forge-reload)，MIT 许可，版权归原作者（见同目录 LICENSE）。这里原样附带，没有改动。

Perigee 的「自动换窗」用它做实际的剪切：把当前 Claude Code 会话 jsonl 最近 N token 的原文（包括 thinking）搬进一个新会话、注入交接包，再 `--resume` 接上。

- 网关默认调用这个文件（`gateway/tools/forge-reload/forge-reload.js`），可以用环境变量 `FORGE_SCRIPT` 换成别的路径。
- 交接包（handoff.md）和滚动摘要（rolling-summary.md）写在 `FORGE_DIR`，默认 `gateway/data/forge/`。
- 开关、水位、保留多少原文在前端「设置 › Claude 会话」里改，**默认关**。
- ⚠ 它依赖 Claude Code 当前的 jsonl 存储格式，Claude Code 升级后可能失效。网关每次换窗前都会先备份旧 jsonl，新会话验活失败会自动回滚。

手动用法（预演，不写文件）：

```bash
node forge-reload.js <session-id> --retain 100000 --dry-run
```
