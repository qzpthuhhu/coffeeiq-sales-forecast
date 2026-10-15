/**
 * CoffeeIQ AI 问答面板
 * 基于官方 @lark-apaas/aily-web-sdk 嵌入"门店销量预测归因助手"
 *
 * 关键约束：
 *  - 单例：同一时间只有一个 SDK 实例，打开复用、关闭不销毁（切换页面也保持会话）
 *  - channelToken 仅在内存中使用，不写入 DOM、日志、自检导出
 *  - 错误态：SDK 加载失败 / ready 超时 / iframe 报错 均展示用户可理解的错误 + 重试
 *  - 演示模式：进入演示时自动收起面板、隐藏悬浮入口；退出后恢复原状态
 *  - 自定义上下文：通过 customParams 注入当前页面/门店/品类等低敏信息
 */

// 注意：SDK 采用动态 import（而非静态 import），
// 这样即使 vendor/aily-web-sdk.js 加载失败，入口按钮仍能正常渲染，
// 用户点击后展示错误态和重试按钮，不会静默消失。
//
// 路径说明：使用同源绝对路径而非相对路径。
// 原因：妙搭发布时 .js 模块文件可能被重写到签名 CDN 域名
// （lf-miaoda-compiled-static.feishucdn.com/...），相对 import 会
// 相对于模块自身的 CDN URL 解析，导致请求落到无签名的 CDN 路径并被 403 拒绝。
// 改为基于 window.location 构造的同源路径，由妙搭运行时处理发布资源分发。
function getSdkBaseUrl() {
    // 从当前页面 URL 中可靠提取妙搭应用根路径。
    // 妙搭应用公开路径格式：/app/app_<id>/<页面>
    // 用正则匹配 /app/app_xxx 段（后面可以是 /、文件名、或字符串结尾），
    // 无论 pathname 是否以 / 结尾、是否带文件名，都能正确提取应用根目录。
    // 匹配失败时抛错，由调用方的 showError 展示 load 错误态，绝不回退到错误路径。
    const path = window.location.pathname;
    const match = path.match(/^(\/app\/app_[^/]+)(\/|$)/);
    if (!match) {
        throw new Error('无法定位应用根路径');
    }
    // 确保返回的根路径以 / 结尾，便于拼接相对路径
    return window.location.origin + match[1] + '/';
}

const SDK_URL = 'vendor/aily-web-sdk.js'; // 相对应用根路径

// —— 配置 ——
// channelToken 仅存于闭包，绝不写入 DOM / console / 自检 / 导出
// eslint-disable-next-line no-unused-vars
const CHANNEL_TOKEN = 'wsk_383QAQWbU2CjdmMgfy1RTN';

const PANEL_TITLE = '门店销量预测归因助手';

// —— 内部状态 ——
let sdkInstance = null;           // SDK 实例（单例）
let panelOpen = false;            // 面板是否打开
let wasOpenBeforeDemo = false;    // 进入演示模式前面板状态
let initPromise = null;           // 正在进行的初始化 Promise（防并发）
let readyTimer = null;            // 就绪超时计时器
let readyResolved = false;        // ready 是否已收到
let errorState = null;            // 当前错误类型：null | 'load' | 'timeout' | 'auth' | 'unknown'

const READY_TIMEOUT_MS = 30000;   // 与 SDK 默认 MESSAGE_TIMEOUT 一致

// —— DOM 引用缓存 ——
let fabEl = null;
let panelEl = null;
let panelBodyEl = null;
let panelCloseBtn = null;
let overlayEl = null;
let errorEl = null;
let errorTitleEl = null;
let errorDescEl = null;
let errorRetryBtn = null;
let panelHeaderEl = null;
let panelGripEl = null;
let panelResizeEl = null;

// 浮窗位置 + 尺寸持久化 key（仅保存几何信息，不存任何业务数据）
const PANEL_POS_KEY = 'aichat.panel.pos.v1';
// 桌面端浮窗默认停靠边距
const PANEL_MARGIN = 24;
// 浮窗设计基准尺寸（与 CSS 默认宽高一致）与等比缩放范围
const PANEL_BASE_W = 400;
const PANEL_BASE_H = 600;
const PANEL_MIN_SCALE = 0.7;
const PANEL_MAX_SCALE = 2.2;

// —— 公共 API ——
const AiChat = {
    open,
    close,
    toggle,
    isOpen: () => panelOpen,
    hasInstance: () => sdkInstance !== null,
    getError: () => errorState,
    /**
     * 演示模式进入/退出通知
     * @param {'enter'|'exit'} phase
     */
    onDemoModeChange(phase) {
        if (phase === 'enter') {
            wasOpenBeforeDemo = panelOpen;
            if (panelOpen) close();
            if (fabEl) fabEl.classList.add('aichat-fab--demo-hidden');
        } else {
            if (fabEl) fabEl.classList.remove('aichat-fab--demo-hidden');
            if (wasOpenBeforeDemo) open();
            wasOpenBeforeDemo = false;
        }
    },
    /**
     * 收集当前低敏上下文，供 customParams 注入
     * 只放公开、低敏、非隐私的筛选条件
     */
    _collectContext() {
        const ctx = {};
        try {
            if (typeof App !== 'undefined' && App.getCurrentPage) {
                ctx.current_page = {
                    value: App.getCurrentPage(),
                    desc: '用户当前所在的页面 id'
                };
            }
            if (typeof App !== 'undefined' && App.getCurrentStore) {
                const store = App.getCurrentStore();
                ctx.current_store = {
                    value: store === 'all' ? '全部门店' : store,
                    desc: '全局门店筛选值'
                };
            }
            // 从驾驶舱/门店预测页读取的品类与商品
            if (typeof CockpitPage !== 'undefined' && CockpitPage.getState) {
                try {
                    const st = CockpitPage.getState();
                    if (st) {
                        if (st.category) {
                            ctx.cockpit_category = {
                                value: st.category === 'all' ? '全部品类' : st.category,
                                desc: '驾驶舱页面的品类筛选'
                            };
                        }
                        if (st.sku) {
                            ctx.cockpit_sku = {
                                value: st.sku === 'all' ? '全部商品' : String(st.sku),
                                desc: '驾驶舱页面的商品筛选（product_id）'
                            };
                        }
                    }
                } catch (_) { /* 忽略 */ }
            }
            ctx.data_basis = {
                value: '35天五窗口滚动回测',
                desc: '所有预测与指标均来自历史回测，不是未来预测'
            };
        } catch (_) { /* 上下文失败不影响主流程 */ }
        return ctx;
    }
};

// —— 初始化 DOM（只执行一次）——
function ensureDom() {
    if (fabEl) return;

    // 遮罩（移动端用）
    overlayEl = document.createElement('div');
    overlayEl.className = 'aichat-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.addEventListener('click', () => {
        // 仅移动端点击遮罩关闭
        if (window.innerWidth < 768) close();
    });

    // 悬浮按钮
    fabEl = document.createElement('button');
    fabEl.className = 'aichat-fab';
    fabEl.setAttribute('aria-label', '打开 AI 问答');
    fabEl.title = '问 AI · 门店销量预测归因助手';
    fabEl.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <path d="M8 10h.01M12 10h.01M16 10h.01"/>
        </svg>
        <span class="aichat-fab__label">问 AI</span>
    `;
    fabEl.addEventListener('click', toggle);

    // 面板容器
    panelEl = document.createElement('aside');
    panelEl.className = 'aichat-panel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-label', PANEL_TITLE);
    panelEl.innerHTML = `
        <header class="aichat-panel__header">
            <span class="aichat-panel__grip" title="拖动可移动窗口" aria-label="拖动移动窗口">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                </svg>
            </span>
            <button class="aichat-panel__close" aria-label="关闭">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </header>
        <div class="aichat-panel__body">
            <div class="aichat-loading" aria-hidden="true">
                <div class="aichat-loading__spinner"></div>
                <div class="aichat-loading__text">正在连接智能体…</div>
            </div>
            <div class="aichat-error" hidden>
                <div class="aichat-error__icon">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="13"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <div class="aichat-error__title">无法连接</div>
                <div class="aichat-error__desc">请检查网络或稍后重试</div>
                <button type="button" class="aichat-error__retry">重新连接</button>
                <div class="aichat-error__hint">
                    提示：请确认当前域名已加入智能体渠道白名单，且你具有可用访问范围。
                </div>
            </div>
        </div>
        <footer class="aichat-panel__footer">
            AI 回答由飞书智能体生成，仅供参考，不代表经营承诺。
        </footer>
        <div class="aichat-panel__resize" title="拖拽等比例缩放" role="separator" aria-orientation="both" aria-label="等比例缩放窗口">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M21 15v6h-6"/>
                <path d="M21 21l-7-7"/>
            </svg>
        </div>
    `;

    document.body.appendChild(overlayEl);
    document.body.appendChild(fabEl);
    document.body.appendChild(panelEl);

    // 缓存引用
    panelBodyEl = panelEl.querySelector('.aichat-panel__body');
    panelHeaderEl = panelEl.querySelector('.aichat-panel__header');
    panelGripEl = panelEl.querySelector('.aichat-panel__grip');
    panelCloseBtn = panelEl.querySelector('.aichat-panel__close');
    panelResizeEl = panelEl.querySelector('.aichat-panel__resize');
    errorEl = panelEl.querySelector('.aichat-error');
    errorTitleEl = panelEl.querySelector('.aichat-error__title');
    errorDescEl = panelEl.querySelector('.aichat-error__desc');
    errorRetryBtn = panelEl.querySelector('.aichat-error__retry');

    panelCloseBtn.addEventListener('click', close);
    errorRetryBtn.addEventListener('click', () => retry());

    // 拖拽移动浮窗（顶部工具条 / grip 把手）
    installPanelDrag();
    // 右下角等比例缩放
    installPanelResize();

    // 监听 SDK 内部的 postMessage 错误事件（agent SDK 不暴露 onError，但我们自己也可监听）
    installErrorEavesdropper();
}

// —— 打开 / 关闭 ——
async function open() {
    ensureDom();
    if (panelOpen) return;
    panelOpen = true;

    // 桌面端：浮窗不使用遮罩，避免拦截主界面的鼠标操作与切换；
    // 移动端：保留全屏遮罩，点击空白处可关闭。
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        clearPanelPosition();
        overlayEl.classList.add('aichat-overlay--show');
    } else {
        overlayEl.classList.remove('aichat-overlay--show');
        applySavedPanelGeometry();
    }
    panelEl.classList.add('aichat-panel--open');
    fabEl.classList.add('aichat-fab--active');

    // 已存在实例：直接展示（保留历史会话）
    if (sdkInstance) {
        hideError();
        hideLoading();
        // 确保 iframe 在 body 内可见
        const iframe = panelBodyEl.querySelector('iframe');
        if (iframe) iframe.style.display = '';
        return;
    }

    // 首次打开：初始化 SDK
    showLoading();
    hideError();
    errorState = null;

    // 注意：initSdk 内部已处理所有错误分支（加载失败 / 超时 / 鉴权失败），
    // 失败会自动调用 showError 展示错误态和重试按钮。
    // 这里不需要额外 catch —— 避免重复处理导致错误类型被覆盖为 generic 'unknown'。
    await initSdk();
}

function close() {
    if (!panelOpen) return;
    panelOpen = false;

    overlayEl.classList.remove('aichat-overlay--show');
    panelEl.classList.remove('aichat-panel--open', 'aichat-panel--dragging', 'aichat-panel--resizing');
    fabEl.classList.remove('aichat-fab--active');

    // 注意：不销毁 SDK 实例，只关闭面板。
    // 这样用户切换页面再打开，对话历史保留；destroy 只在页面卸载或需要强制重建时调用。
}

function toggle() {
    if (panelOpen) close();
    else open();
}

// —— 浮窗拖拽移动（仅桌面端）——
// 拖动标题栏即可改变浮窗位置，位置会持久化到 localStorage；
// 浮窗本身只是一个普通 fixed 元素，不遮挡时鼠标仍可操作下方主界面。
function installPanelDrag() {
    if (!panelHeaderEl || !panelEl) return;

    panelHeaderEl.addEventListener('pointerdown', (e) => {
        // 移动端是全屏抽屉，不支持拖拽
        if (window.innerWidth < 768) return;
        // 点击关闭按钮不触发拖拽
        if (e.target.closest('.aichat-panel__close')) return;
        // 仅响应主键（鼠标左键 / 触摸 / 笔）
        if (e.button !== undefined && e.button !== 0) return;

        const rect = panelEl.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = rect.left;
        const startTop = rect.top;
        let moved = false;

        // 切换为显式 left/top 定位，脱离 CSS 默认的 right/bottom
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            // 小阈值，避免点击标题时误判为拖拽
            if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            if (!moved) {
                moved = true;
                panelEl.classList.add('aichat-panel--dragging');
            }
            const pos = clampPanelPosition(startLeft + dx, startTop + dy);
            panelEl.style.left = pos.x + 'px';
            panelEl.style.top = pos.y + 'px';
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            panelEl.classList.remove('aichat-panel--dragging');
            if (moved) savePanelPosition();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        // 阻止标题文本被选中或触发原生拖拽
        e.preventDefault();
    });

    // 视口尺寸变化时，把浮窗收回可视区域 / 在移动与桌面布局间切换
    window.addEventListener('resize', () => {
        if (!panelEl || !panelOpen) return;
        if (window.innerWidth < 768) {
            // 切到移动布局：全屏抽屉，清除桌面浮窗的内联定位与尺寸
            clearPanelPosition();
            overlayEl.classList.add('aichat-overlay--show');
            return;
        }
        // 切到桌面布局：去掉遮罩，恢复浮窗位置与尺寸
        overlayEl.classList.remove('aichat-overlay--show');
        if (!panelEl.style.left) {
            applySavedPanelGeometry();
            return;
        }
        const rect = panelEl.getBoundingClientRect();
        const pos = clampPanelPosition(rect.left, rect.top);
        panelEl.style.left = pos.x + 'px';
        panelEl.style.top = pos.y + 'px';
        savePanelPosition();
    });
}

// —— 浮窗等比例缩放（仅桌面端，右下角手柄）——
// 以浮窗基准宽高比（400:600）等比缩放，左上角保持不动，
// 缩放范围受最小值与当前视口共同约束，尺寸持久化到 localStorage。
function installPanelResize() {
    if (!panelResizeEl || !panelEl) return;

    panelResizeEl.addEventListener('pointerdown', (e) => {
        if (window.innerWidth < 768) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = panelEl.offsetWidth || PANEL_BASE_W;
        const startH = panelEl.offsetHeight || PANEL_BASE_H;
        const startScale = startW / PANEL_BASE_W;
        let applied = false;

        panelEl.classList.add('aichat-panel--resizing');

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            // 宽、高两个方向的缩放取平均，斜向 / 横向 / 纵向拖拽都跟手；
            // 因锁定宽高比，两者结果一致。
            const scaleX = (startW + dx) / PANEL_BASE_W;
            const scaleY = (startH + dy) / PANEL_BASE_H;
            let scale = (scaleX + scaleY) / 2;
            scale = clampPanelScale(scale);

            const w = Math.round(PANEL_BASE_W * scale);
            const h = Math.round(PANEL_BASE_H * scale);
            panelEl.style.width = w + 'px';
            panelEl.style.height = h + 'px';
            applied = true;

            // 放大后把超出视口的左上边界收回（若已用 left/top 定位）
            if (panelEl.style.left) {
                const rect = panelEl.getBoundingClientRect();
                const pos = clampPanelPosition(rect.left, rect.top);
                panelEl.style.left = pos.x + 'px';
                panelEl.style.top = pos.y + 'px';
            }
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            panelEl.classList.remove('aichat-panel--resizing');
            if (applied) savePanelGeometry();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    });
}

// 缩放范围：不小于最小值，不超过视口可容纳范围
function clampPanelScale(scale) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxByW = (vw - 16) / PANEL_BASE_W;
    const maxByH = (vh - 16) / PANEL_BASE_H;
    const max = Math.min(PANEL_MAX_SCALE, maxByW, maxByH);
    return Math.min(Math.max(scale, PANEL_MIN_SCALE), Math.max(PANEL_MIN_SCALE, max));
}

// 限制浮窗始终停留在视口内（至少保留标题栏可达）
function clampPanelPosition(x, y) {
    const w = panelEl.offsetWidth || 400;
    const h = panelEl.offsetHeight || 600;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = Math.min(8, vw - 80);
    const maxX = Math.max(minX, vw - w - 8);
    const minY = 8;
    const maxY = Math.max(minY, vh - h - 8);
    return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY)
    };
}

// 恢复上次的位置与尺寸；无记录或非法时回到右下角默认尺寸
function applySavedPanelGeometry() {
    try {
        const raw = localStorage.getItem(PANEL_POS_KEY);
        if (!raw) { clearPanelPosition(); return; }
        const saved = JSON.parse(raw);

        // 先恢复尺寸（等比）
        if (typeof saved.w === 'number' && saved.w > 0) {
            const scale = clampPanelScale(saved.w / PANEL_BASE_W);
            panelEl.style.width = Math.round(PANEL_BASE_W * scale) + 'px';
            panelEl.style.height = Math.round(PANEL_BASE_H * scale) + 'px';
        } else {
            resetPanelSize();
        }

        // 再恢复位置
        if (typeof saved.x !== 'number' || typeof saved.y !== 'number') {
            // 无位置记录：保持 CSS 右下角停靠，但尺寸已恢复
            if (typeof saved.w !== 'number') clearPanelPosition();
            return;
        }
        const pos = clampPanelPosition(saved.x, saved.y);
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        panelEl.style.left = pos.x + 'px';
        panelEl.style.top = pos.y + 'px';
    } catch (_) {
        clearPanelPosition();
    }
}

function resetPanelSize() {
    if (!panelEl) return;
    panelEl.style.width = '';
    panelEl.style.height = '';
}

// 清除内联定位与尺寸，回退到 CSS 默认的右下角停靠
function clearPanelPosition() {
    if (!panelEl) return;
    resetPanelSize();
    panelEl.style.left = '';
    panelEl.style.top = '';
    panelEl.style.right = '';
    panelEl.style.bottom = '';
}

function savePanelGeometry() {
    try {
        const rect = panelEl.getBoundingClientRect();
        localStorage.setItem(
            PANEL_POS_KEY,
            JSON.stringify({
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
            })
        );
    } catch (_) { /* localStorage 不可用时静默忽略 */ }
}

// 兼容拖拽逻辑中的旧命名
function savePanelPosition() {
    savePanelGeometry();
}

// —— SDK 初始化（单例 + 防并发）——
function initSdk() {
    if (initPromise) return initPromise;

    // 清理可能的旧 body 内容（非 iframe 元素）
    Array.from(panelBodyEl.children).forEach(child => {
        if (child.tagName !== 'IFRAME') {
            // 保留 loading/error 等非 iframe 节点也没事，下面会重新显示
        }
    });

    initPromise = doInit().finally(() => {
        initPromise = null;
    });
    return initPromise;
}

async function doInit() {
    // 清除可能的旧 iframe（理论上不会有）
    const oldIframe = panelBodyEl.querySelector('iframe');
    if (oldIframe && oldIframe.parentNode) {
        oldIframe.parentNode.removeChild(oldIframe);
    }

    // 就绪超时：agent SDK 内部超时只是 warn，我们自己再兜一层，用于展示错误态
    readyResolved = false;
    clearTimeout(readyTimer);

    // 注入低敏上下文
    const customParams = AiChat._collectContext();

    const container = panelBodyEl;

    // —— 第一步：动态加载 SDK ——
    // 使用同源绝对路径，避免相对路径被解析到签名 CDN 导致 403。
    // SDK 内部的 import './internal-slardar.js' 会相对于 SDK 自身 URL 解析，
    // 因此也会落在同源路径下，正确加载。
    let initAgentChat;
    try {
        const sdkUrl = getSdkBaseUrl() + SDK_URL;
        const mod = await import(sdkUrl);
        initAgentChat = mod.initAgentChat;
        if (typeof initAgentChat !== 'function') {
            throw new Error('SDK 导出缺失 initAgentChat 方法');
        }
    } catch (err) {
        // import 失败：网络错误、MIME 类型错误、403/404、模块解析错误等
        showError('load', err && err.message ? err.message : '智能体脚本未能正常加载，请检查网络后重试。');
        throw err; // 让调用方知道失败了（用于 initPromise 状态流转）
    }

    // —— 第二步：初始化 SDK 实例（创建 iframe 并等待 ready）——
    try {
        const inst = await initAgentChat(container, {
            channelToken: CHANNEL_TOKEN,
            customParams: customParams
        });
        sdkInstance = inst;

        // 等待一小段时间，如果 iframe 已经 ready 就算成功
        // 如果 30s 内未收到 ready 事件，则报错（agent SDK 内部 catch 了不暴露，我们自己检测）
        await new Promise((resolve) => {
            const check = setInterval(() => {
                const iframe = panelBodyEl.querySelector('iframe');
                if (iframe && iframe.complete !== false) {
                    // 有了 iframe 元素就算基本成功（是否可用由 iframe 内 UI 保证）
                    clearInterval(check);
                    clearTimeout(readyTimer);
                    readyResolved = true;
                    hideLoading();
                    resolve();
                }
            }, 200);
            readyTimer = setTimeout(() => {
                clearInterval(check);
                if (!readyResolved) {
                    showError('timeout', '连接超时，智能体响应较慢或网络受限');
                }
                resolve(); // 不阻塞 init 流程
            }, READY_TIMEOUT_MS);
        });

        return inst;
    } catch (err) {
        // initAgentChat 抛错：SDK 内部初始化异常（极少见，因为 SDK 内部大多 catch 了）
        showError('load', err && err.message ? err.message : '智能体初始化失败，请稍后重试。');
        throw err;
    }
}

// —— 销毁（仅在明确需要重建时调用）——
async function destroyInstance() {
    if (sdkInstance) {
        try {
            await sdkInstance.destroy();
        } catch (_) { /* 忽略 */ }
        sdkInstance = null;
    }
    initPromise = null;
    clearTimeout(readyTimer);
    readyResolved = false;
    // 清除 DOM 中的 iframe
    if (panelBodyEl) {
        const iframe = panelBodyEl.querySelector('iframe');
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
}

// —— 重试 ——
async function retry() {
    hideError();
    showLoading();
    errorState = null;
    // 清理可能残留的 iframe（失败场景下可能只有部分 DOM）
    if (panelBodyEl) {
        const iframe = panelBodyEl.querySelector('iframe');
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
    await destroyInstance();
    // destroyInstance 会清 sdkInstance，但失败场景下 sdkInstance 本来就是 null，
    // 主要靠上面的手动清理确保 iframe 被移除。
    await initSdk();
}

// —— 错误态 ——
function showError(type, desc) {
    errorState = type;
    if (!errorEl) {
        // 极端情况：error 元素未初始化（ensureDom 异常中断），
        // 此时至少设置 errorState 供 getError() 返回，
        // 并尝试直接从 DOM 查找 error 元素兜底
        const fallback = panelBodyEl && panelBodyEl.querySelector('.aichat-error');
        if (fallback) {
            fallback.hidden = false;
            fallback.style.display = 'flex';
        }
        return;
    }

    const messages = {
        load: { title: 'SDK 加载失败', desc: desc || '智能体脚本未能正常加载，请检查网络后重试。' },
        timeout: { title: '连接超时', desc: desc || '等待智能体响应超时，可能是网络较慢或渠道配置异常。' },
        auth: { title: '无法访问', desc: desc || '你当前没有该智能体的访问权限，或当前域名不在白名单内。' },
        unknown: { title: '无法连接', desc: desc || '发生未知错误，请稍后重试。' }
    };
    const m = messages[type] || messages.unknown;

    // 防御性设置：任一元素失败不影响整体显示
    try { if (errorTitleEl) errorTitleEl.textContent = m.title; } catch (_) {}
    try { if (errorDescEl) errorDescEl.textContent = m.desc; } catch (_) {}

    hideLoading();
    errorEl.hidden = false;
    // 显式 display:flex：不依赖 [hidden] 的 UA 默认行为，
    // 避免作者样式表 display:flex 与 hidden 属性冲突导致隐藏/显示异常
    errorEl.style.display = 'flex';
    errorEl.style.zIndex = '3';
    // 隐藏 iframe（如果有）
    const iframe = panelBodyEl && panelBodyEl.querySelector('iframe');
    if (iframe) iframe.style.display = 'none';
}

function hideError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.style.display = 'none';
    errorState = null;
    const iframe = panelBodyEl.querySelector('iframe');
    if (iframe) iframe.style.display = '';
}

function showLoading() {
    const el = panelBodyEl && panelBodyEl.querySelector('.aichat-loading');
    if (el) {
        el.hidden = false;
        el.style.display = 'flex';
    }
}

function hideLoading() {
    const el = panelBodyEl && panelBodyEl.querySelector('.aichat-loading');
    if (el) {
        el.hidden = true;
        el.style.display = 'none';
    }
}

// —— 错误拦截：监听 postMessage 中的 error 事件 ——
// agent SDK 不暴露 onError，但 iframe 与 SDK 内部通信也走 postMessage（MESSAGE_BIZ_ID = 'cui-sdk-message'）
// 我们自己也监听 message 事件，捕获 error 类型事件并向用户展示
function installErrorEavesdropper() {
    if (installErrorEavesdropper._installed) return;
    installErrorEavesdropper._installed = true;

    window.addEventListener('message', (event) => {
        if (!panelOpen) return;
        const data = event.data;
        if (!data || data.messageBizId !== 'cui-sdk-message') return;
        if (data.type !== 'event') return;

        if (data.eventName === 'error') {
            const msg = data.data && data.data.message ? data.data.message : '';
            // 根据错误文案分类
            let type = 'unknown';
            if (/白名单|域名|domain|not allowed|未授权/.test(msg)) type = 'auth';
            else if (/timeout|超时/.test(msg)) type = 'timeout';
            else if (/login|登录|unauthorized|forbidden|无权限/.test(msg)) type = 'auth';
            showError(type, msg);
        }
        // ready 事件：清除 loading
        if (data.eventName === 'ready') {
            readyResolved = true;
            clearTimeout(readyTimer);
            hideLoading();
            hideError();
        }
        // inited / initedWithWelcome 也视为成功
        if (data.eventName === 'inited' || data.eventName === 'initedWithWelcome') {
            readyResolved = true;
            hideLoading();
            hideError();
        }
    });
}

// —— 页面卸载时销毁，避免内存泄漏 ——
window.addEventListener('beforeunload', () => {
    if (sdkInstance) {
        // fire-and-forget，beforeunload 不保证异步完成
        sdkInstance.destroy().catch(() => {});
        sdkInstance = null;
    }
});

// 暴露到全局
window.AiChat = AiChat;

// —— 启动初始化：DOM 就绪后自动渲染悬浮入口 ——
// SDK 保持懒加载（首次打开面板才初始化），入口按钮立即可见。
// 兼容两种情况：脚本在 DOMContentLoaded 之前加载（监听事件），
// 或之后加载（直接执行）。ensureDom 本身幂等，重复调用安全。
AiChat._bootstrapped = false;
function bootIfReady() {
    if (AiChat._bootstrapped) return;
    if (document.readyState === 'loading') return; // 再等 DOMContentLoaded
    AiChat._bootstrapped = true;
    ensureDom();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady);
        bootIfReady();
    });
} else {
    bootIfReady();
}
// 双重保险：load 事件后再兜底检查一次（防止 DOMContentLoaded 漏触发的极端情况）
window.addEventListener('load', function onLoad() {
    window.removeEventListener('load', onLoad);
    bootIfReady();
});

export default AiChat;
