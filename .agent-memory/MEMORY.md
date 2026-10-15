# 项目记忆 · CoffeeIQ 门店销量预测平台

## 平台运行时边界（design-html 创意栈）

- 现象：页面显示「未检测到全栈服务(HTTP 404)/后端离线」，`/api/*`、`/mcp` 在预览与发布后均 404。
- 根因：应用 `app_type=modern_html`、`.spark/meta.json` stack=`design-html`。沙箱预览由 coding-static-server(8001) 只托管静态文件；发布管线只执行 `npm install` + `npm run build` 并把 `build_output_dir=dist` 静态托管，**两者都不运行 Node/Express 后端**。无 spark.json、无 source_package。
- 关键事实：CLI（lark-cli apps）**没有** modern_html→full_stack 的本地转换命令；`+init-template --type full_stack` 拉取的模板包 404（未发布）。本地会话无法自行完成全栈升级。
- 正确升级路径：到**妙搭 Web 的云端会话**用自然语言提出（如「升级为全栈应用 / 加后端与数据库」）触发平台转换（见 lark-apps-local-dev.md）。升级后才有 Node 运行时（handoff 曾注入 `SERVER_PORT=3000`，但未完成工程转换）。
- 注意：`+release-create` 对当前栈还会因 package.json 缺 `build` script 在「依赖安装」步失败；即使补 build 产出 dist 也仍是纯静态，MCP 不会运行。

## 后端代码本身正常（server/）

- `server/index.js`（Express ESM，npm start，监听 PORT/PUBLIC_PORT/3000）+ `mcp-server.js` + `data-service.js`；本地起服务后 `/api/mcp/info|ping|keys`、`POST /mcp`（Bearer，tools/list、tools/call）端到端全部验证通过。
- 密钥持久化在 `server/.mcp-keys.json`（gitignore，勿提交）；当前已注册 10 个 MCP 工具。
- MCP 前端页：`pages/mcp-center.js`（IIFE），样式 `styles.css` 中 `.mcp-*`（约 6084 行起）。
