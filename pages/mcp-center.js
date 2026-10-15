/**
 * MCP 开放接口中心
 * 面向外部 AI Agent：展示 MCP 连接信息、管理 API Key、浏览工具目录与接入示例。
 * 数据来自全栈服务 /api/mcp/*；若后端未运行（纯静态预览）则优雅降级提示。
 */
const McpCenterPage = (function () {
    let info = null;
    let lastCreatedToken = '';

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function endpoint() {
        return location.origin + '/mcp';
    }

    async function fetchJSON(url, options) {
        const res = await fetch(url, options);
        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try { msg = (await res.json()).error || msg; } catch (e) { /* ignore */ }
            throw new Error(msg);
        }
        return res.json();
    }

    function copy(text, btn) {
        const done = () => {
            if (btn) {
                const old = btn.textContent;
                btn.textContent = '已复制';
                btn.classList.add('copied');
                setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1400);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }
    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
    }

    function render(container) {
        container.innerHTML = `
            <div class="mcp-wrap">
                <div class="card mcp-hero">
                    <div class="mcp-hero-left">
                        <div class="mcp-hero-badge">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8z"/><path d="M12 17v5M8 22h8"/>
                            </svg>
                        </div>
                        <div>
                            <h2 class="mcp-hero-title">MCP 开放接口</h2>
                            <p class="mcp-hero-desc">把 CoffeeIQ 的销量预测、模型解释与情景模拟能力，通过标准 <b>Model Context Protocol</b> 开放给外部 AI Agent 调用。采用 Streamable HTTP 传输，Bearer API Key 鉴权。</p>
                        </div>
                    </div>
                    <button class="mcp-btn ghost" id="mcpTestBtn">
                        <span class="mcp-dot" id="mcpTestDot"></span>
                        <span id="mcpTestText">测试连通性</span>
                    </button>
                </div>

                <div id="mcpBanner"></div>

                <div class="grid grid-2 mcp-grid">
                    <div class="card">
                        <div class="card-header"><div class="card-title">连接信息</div><span class="data-badge real">Server</span></div>
                        <div class="card-body mcp-conn">
                            <div class="mcp-field">
                                <label>Endpoint URL</label>
                                <div class="mcp-code-row">
                                    <code class="mcp-code" id="mcpEndpoint">${esc(endpoint())}</code>
                                    <button class="mcp-btn sm" data-copy="${esc(endpoint())}">复制</button>
                                </div>
                            </div>
                            <div class="mcp-field">
                                <label>传输协议</label>
                                <div class="mcp-kv">Streamable HTTP（无状态 · POST/GET/DELETE）</div>
                            </div>
                            <div class="mcp-field">
                                <label>鉴权方式</label>
                                <div class="mcp-code-row">
                                    <code class="mcp-code">Authorization: Bearer &lt;API_KEY&gt;</code>
                                </div>
                            </div>
                            <div class="mcp-tip">外部 Agent 需通过公网可达的<b>发布域名</b>接入；开发期可先用当前预览地址联调，发布后以正式域名替换。</div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">API Key 管理</div>
                            <button class="mcp-btn sm primary" id="mcpCreateBtn">+ 新建密钥</button>
                        </div>
                        <div class="card-body">
                            <div id="mcpKeys" class="mcp-keys"><div class="mcp-loading">加载中…</div></div>
                        </div>
                        <div class="card-footer">密钥仅用于服务端到服务端调用，请勿写入前端代码或客户端；泄露后可立即吊销。</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><div class="card-title">开放工具目录</div><span class="data-badge real" id="mcpToolCount">10 个工具</span></div>
                    <div class="card-body">
                        <div id="mcpTools" class="mcp-tools"><div class="mcp-loading">加载中…</div></div>
                    </div>
                </div>

                <div class="grid grid-2 mcp-grid">
                    <div class="card">
                        <div class="card-header"><div class="card-title">客户端配置示例</div><span class="tag">mcpServers</span></div>
                        <div class="card-body">
                            <div class="mcp-code-row block">
                                <pre class="mcp-pre" id="mcpClientJson"></pre>
                                <button class="mcp-btn sm mcp-copy-abs" data-copy-target="mcpClientJson">复制</button>
                            </div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><div class="card-title">命令行快速验证</div><span class="tag">curl</span></div>
                        <div class="card-body">
                            <div class="mcp-code-row block">
                                <pre class="mcp-pre" id="mcpCurl"></pre>
                                <button class="mcp-btn sm mcp-copy-abs" data-copy-target="mcpCurl">复制</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        bindStatic(container);
        loadAll(container);
    }

    function bindStatic(container) {
        container.querySelector('#mcpTestBtn').addEventListener('click', testConnection);
        container.querySelector('#mcpCreateBtn').addEventListener('click', openCreate);
        container.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy]');
            if (copyBtn) { copy(copyBtn.getAttribute('data-copy'), copyBtn); return; }
            const copyTarget = e.target.closest('[data-copy-target]');
            if (copyTarget) {
                const el = document.getElementById(copyTarget.getAttribute('data-copy-target'));
                if (el) copy(el.textContent, copyTarget);
            }
        });
    }

    function snippets() {
        const url = endpoint();
        const client = {
            mcpServers: {
                coffeeiq: {
                    url: url + '/mcp',
                    headers: { Authorization: 'Bearer <在此填入 API_KEY>' }
                }
            }
        };
        const curl =
`curl -X POST '${url}/mcp' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;
        return { client: JSON.stringify(client, null, 2), curl };
    }

    async function loadAll(container) {
        const sn = snippets();
        document.getElementById('mcpClientJson').textContent = sn.client;
        document.getElementById('mcpCurl').textContent = sn.curl;
        try {
            const [infoData, keysData] = await Promise.all([
                fetchJSON('/api/mcp/info'),
                fetchJSON('/api/mcp/keys'),
            ]);
            info = infoData;
            hideBanner();
            renderTools(infoData.tools || []);
            renderKeys(keysData.keys || []);
        } catch (e) {
            showBanner('未检测到全栈服务（' + e.message + '）。当前为纯静态预览；执行 <code>npm start</code> 或部署发布后，MCP 接口与密钥管理才会生效。');
            document.getElementById('mcpTools').innerHTML = toolFallback();
            document.getElementById('mcpKeys').innerHTML = '<div class="mcp-empty">后端离线，暂不可用</div>';
        }
    }

    function toolFallback() {
        const groups = {
            '概览': ['get_platform_overview · 平台与模型概览'],
            '预测查询': ['get_daily_demand_forecast · 日级销量预测', 'get_sku_demand_forecast · SKU 点预测与 P10/P90'],
            '模型评估': ['get_model_quality · 分层精度指标', 'get_feature_importance · 特征重要性'],
            '经营洞察': ['get_restock_risks · 备货关注清单', 'get_weather_forecast · 天气与节假日'],
            '基础数据': ['list_products · 商品目录检索'],
            'AI 解释': ['explain_prediction · SHAP 归因', 'simulate_scenario · 情景模拟'],
        };
        return Object.entries(groups).map(([g, items]) => `
            <div class="mcp-tool-group">
                <div class="mcp-tool-group-name">${esc(g)}</div>
                <div class="mcp-tool-list">
                    ${items.map(t => `<div class="mcp-tool"><code>${esc(t.split(' · ')[0])}</code><span>${esc(t.split(' · ')[1])}</span></div>`).join('')}
                </div>
            </div>`).join('');
    }

    function renderTools(tools) {
        document.getElementById('mcpToolCount').textContent = tools.length + ' 个工具';
        const groups = new Map();
        tools.forEach(t => {
            if (!groups.has(t.group)) groups.set(t.group, []);
            groups.get(t.group).push(t);
        });
        document.getElementById('mcpTools').innerHTML = [...groups.entries()].map(([g, list]) => `
            <div class="mcp-tool-group">
                <div class="mcp-tool-group-name">${esc(g)}</div>
                <div class="mcp-tool-list">
                    ${list.map(t => `
                        <div class="mcp-tool">
                            <code>${esc(t.name)}</code>
                            <span>${esc(t.summary)}</span>
                        </div>`).join('')}
                </div>
            </div>`).join('');
    }

    function renderKeys(keys) {
        const el = document.getElementById('mcpKeys');
        if (!keys.length) {
            el.innerHTML = '<div class="mcp-empty">还没有密钥，点击右上角「新建密钥」生成。</div>';
            return;
        }
        el.innerHTML = keys.map(k => `
            <div class="mcp-key ${k.revoked ? 'revoked' : ''}">
                <div class="mcp-key-main">
                    <div class="mcp-key-name">${esc(k.name)}</div>
                    <code class="mcp-key-token">${esc(k.token_preview)}${k.revoked ? ' · 已吊销' : ''}</code>
                    <div class="mcp-key-date">${esc((k.created || '').replace('T', ' ').slice(0, 16))}</div>
                </div>
                ${k.revoked
                ? '<span class="badge badge-secondary">已停用</span>'
                : `<button class="mcp-btn sm danger" data-revoke="${esc(k.id)}">吊销</button>`}
            </div>`).join('');
        el.querySelectorAll('[data-revoke]').forEach(btn => {
            btn.addEventListener('click', () => revokeKey(btn.getAttribute('data-revoke')));
        });
    }

    function openCreate() {
        const name = window.prompt('给新密钥起个名字（便于识别调用方，如：研发助手 / 订货 Agent）', '外部 Agent 密钥');
        if (name === null) return;
        fetchJSON('/api/mcp/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() || '外部 Agent 密钥' }),
        }).then(rec => {
            lastCreatedToken = rec.token;
            showTokenModal(rec);
            return fetchJSON('/api/mcp/keys');
        }).then(data => renderKeys(data.keys || []))
          .catch(e => window.alert('创建失败：' + e.message));
    }

    function showTokenModal(rec) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay show';
        overlay.innerHTML = `
            <div class="modal mcp-modal">
                <div class="modal-header">
                    <div class="modal-title">密钥已创建</div>
                    <button class="modal-close" aria-label="关闭">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="mcp-warn">完整密钥仅显示这一次，关闭后无法再次查看，请立即复制保存。</div>
                    <div class="mcp-code-row block" style="margin-top:12px">
                        <pre class="mcp-pre key">${esc(rec.token)}</pre>
                        <button class="mcp-btn sm primary mcp-copy-abs" id="mcpCopyNewKey">复制密钥</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="mcp-btn primary" id="mcpGotKey">我已保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('.modal-close').addEventListener('click', close);
        overlay.querySelector('#mcpGotKey').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#mcpCopyNewKey').addEventListener('click', (e) => copy(rec.token, e.currentTarget));
    }

    async function revokeKey(id) {
        if (!window.confirm('确定吊销该密钥吗？使用它的外部 Agent 将立即无法调用。')) return;
        try {
            await fetchJSON('/api/mcp/keys/' + encodeURIComponent(id), { method: 'DELETE' });
            const data = await fetchJSON('/api/mcp/keys');
            renderKeys(data.keys || []);
        } catch (e) {
            window.alert('吊销失败：' + e.message);
        }
    }

    async function testConnection() {
        const dot = document.getElementById('mcpTestDot');
        const txt = document.getElementById('mcpTestText');
        dot.className = 'mcp-dot testing';
        txt.textContent = '检测中…';
        try {
            const ping = await fetchJSON('/api/mcp/ping');
            if (ping.ok) {
                dot.className = 'mcp-dot ok';
                txt.textContent = 'MCP 在线 · ' + ping.tools + ' 工具 · 有效密钥 ' + ping.active_keys;
            } else {
                dot.className = 'mcp-dot bad';
                txt.textContent = '自检失败';
            }
        } catch (e) {
            dot.className = 'mcp-dot bad';
            txt.textContent = '后端离线';
        }
    }

    function showBanner(html) {
        const b = document.getElementById('mcpBanner');
        if (b) b.innerHTML = '<div class="mcp-banner">' + html + '</div>';
    }
    function hideBanner() {
        const b = document.getElementById('mcpBanner');
        if (b) b.innerHTML = '';
    }

    return { render };
})();
