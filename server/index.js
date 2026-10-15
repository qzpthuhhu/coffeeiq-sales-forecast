/**
 * CoffeeIQ 全栈服务入口
 *  - 托管前端静态资源（项目根）
 *  - /mcp        MCP over Streamable HTTP（无状态，Bearer Token 鉴权）
 *  - /api/mcp    API Key 管理 + 连接信息（供站内「MCP 开放接口」页使用）
 *
 * 启动：npm start  （端口取 process.env.PORT，默认 3000）
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { DataService } from './data-service.js';
import { createMcpServer, toolCatalog } from './mcp-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const KEYS_FILE = path.join(__dirname, '.mcp-keys.json');

DataService.init();

// ---------- API Key 存储（文件持久化） ----------
function loadKeys() {
    try {
        return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    } catch {
        return { keys: [] };
    }
}
function saveKeys(store) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}
function mask(token) {
    return token.slice(0, 10) + '••••••••' + token.slice(-4);
}
const keyStore = loadKeys();
if (keyStore.keys.length === 0) {
    console.log('[CoffeeIQ] 尚未创建 MCP API Key：请在站内「MCP 开放接口」页新建（明文仅展示一次）。');
}
function findValidKey(token) {
    return keyStore.keys.find(k => !k.revoked && k.token === token) || null;
}

const app = express();

// ---------- MCP 端点（放在 json 解析之前，传输层自行读取原始报文） ----------
function unauthorized(res) {
    res.status(401).json({
        jsonrpc: '2.0', error: { code: -32001, message: '未授权：请在 Authorization 头提供 Bearer Token（可在站内「MCP 开放接口」页创建）' }, id: null,
    });
}

async function handleMcp(req, res) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || !findValidKey(token)) return unauthorized(res);

    // 无状态：每个请求新建 server + transport，响应结束即销毁
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
        transport.close();
        server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
}

app.post('/mcp', handleMcp);
app.get('/mcp', handleMcp);
app.delete('/mcp', handleMcp);

// ---------- 其余路由使用 JSON 解析 ----------
app.use(express.json());

// 连接信息（不含密钥）
app.get('/api/mcp/info', (req, res) => {
    res.json({
        name: 'coffeeiq-demand-forecast',
        version: '1.0.0',
        transport: 'Streamable HTTP (stateless)',
        endpoint_path: '/mcp',
        auth: 'Authorization: Bearer <API_KEY>',
        tools: toolCatalog(),
    });
});

// 自检：真实跑一次数据层查询，确认 MCP 工具链路可用
app.get('/api/mcp/ping', (req, res) => {
    try {
        const overview = DataService.getOverview();
        const activeKeys = keyStore.keys.filter(k => !k.revoked).length;
        res.json({
            ok: true,
            server: 'coffeeiq-demand-forecast',
            tools: toolCatalog().length,
            active_keys: activeKeys,
            model_run_id: overview.model_run_id,
            checked_at: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// 列出密钥（脱敏）
app.get('/api/mcp/keys', (req, res) => {
    res.json({
        keys: keyStore.keys.map(k => ({
            id: k.id, name: k.name, token_preview: mask(k.token),
            created: k.created, revoked: !!k.revoked,
        })),
    });
});

// 创建密钥（返回完整 token 仅一次）
app.post('/api/mcp/keys', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 40) || '外部 Agent 密钥';
    const token = 'ciq_' + crypto.randomBytes(24).toString('hex');
    const record = {
        id: crypto.randomBytes(6).toString('hex'),
        name, token, created: new Date().toISOString(), revoked: false,
    };
    keyStore.keys.push(record);
    saveKeys(keyStore);
    res.status(201).json({
        id: record.id, name: record.name, token: record.token, created: record.created,
        message: '请立即复制保存，完整密钥仅此返回一次。',
    });
});

// 吊销密钥
app.delete('/api/mcp/keys/:id', (req, res) => {
    const k = keyStore.keys.find(x => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: '密钥不存在' });
    k.revoked = true;
    saveKeys(keyStore);
    res.json({ ok: true, id: k.id, revoked: true });
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'coffeeiq', mcp: '/mcp' }));

// ---------- 安全：禁止对外暴露后端目录（含 .mcp-keys.json 明文密钥） ----------
app.use('/server', (req, res) => res.status(404).type('text/plain').send('Not Found'));

// ---------- 静态前端 ----------
app.use(express.static(ROOT, {
    index: 'index.html',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.jsx')) res.setHeader('Content-Type', 'text/javascript');
    },
}));

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || process.env.PUBLIC_PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CoffeeIQ] 全栈服务已启动：http://0.0.0.0:${PORT}`);
    console.log(`[CoffeeIQ] MCP 端点：http://0.0.0.0:${PORT}/mcp（Streamable HTTP，Bearer 鉴权）`);
    console.log('[CoffeeIQ] 首次使用请在站内「MCP 开放接口」页创建 API Key。');
});
