/**
 * CoffeeIQ 主应用逻辑
 * 负责导航、页面切换、全局状态管理
 */

const App = (function() {
    let currentPage = 'cockpit';
    let currentStore = 'all';
    let sidebarCollapsed = false;
    let mobileSidebarOpen = false;

    // 导航配置
    const navConfig = [
        {
            group: '经营概览',
            items: [
                { id: 'cockpit', label: '经营驾驶舱', icon: 'dashboard' },
                { id: 'data-asset', label: '数据资产中心', icon: 'database' },
            ]
        },
        {
            group: '预测分析',
            items: [
                { id: 'store-forecast', label: '门店销量预测', icon: 'store' },
                { id: 'sku-forecast', label: 'SKU预测中心', icon: 'package' },
                { id: 'model-performance', label: '模型效果中心', icon: 'chart' },
                { id: 'forecast-methodology', label: '销量预测方法', icon: 'book' },
            ]
        },
        {
            group: '深度洞察',
            items: [
                { id: 'weather-impact', label: '天气影响分析', icon: 'cloud' },
                { id: 'ai-insight', label: 'AI寻因中心', icon: 'search' },
                { id: 'store-compare', label: '多门店对比', icon: 'compare' },
            ]
        },
        {
            group: '扩展能力',
            items: [
                { id: 'scenario-sim', label: '情景模拟', icon: 'sliders' },
                { id: 'extensions', label: '智能订货/排班', icon: 'cog' },
            ]
        },
        {
            group: '开放能力',
            items: [
                { id: 'mcp-center', label: 'MCP 开放接口', icon: 'plug' },
            ]
        },
        {
            group: '信息',
            items: [
                { id: 'model-trust', label: '模型可信度', icon: 'shield' },
                { id: 'migration', label: '茶饮迁移说明', icon: 'arrow-right' },
            ]
        }
    ];

    // 页面标题映射
    const pageTitles = {
        'cockpit': '经营驾驶舱',
        'data-asset': '数据资产中心',
        'store-forecast': '门店销量预测',
        'sku-forecast': 'SKU预测中心',
        'model-performance': '模型效果中心',
        'forecast-methodology': '销量预测方法',
        'weather-impact': '天气影响分析',
        'ai-insight': 'AI寻因中心',
        'store-compare': '多门店对比',
        'scenario-sim': '情景模拟',
        'extensions': '智能订货与排班',
        'model-trust': '模型可信度',
        'migration': '茶饮场景迁移',
        'mcp-center': 'MCP 开放接口'
    };

    // 图标SVG
    const icons = {
        dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
        database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/>',
        store: '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
        package: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
        chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
        cloud: '<path d="M18 10a6 6 0 0 0-11.62 1.5A4.5 4.5 0 1 0 7 20h11a4 4 0 0 0 0-8z"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        compare: '<path d="M10 3H5a2 2 0 0 0-2 2v14l4-4h3V3z"/><path d="M14 21h5a2 2 0 0 0 2-2V5l-4 4h-3v12z"/>',
        sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
        cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        shield: '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="m9 12 2 2 4-4"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        'arrow-right': '<path d="M5 12h14M13 5l7 7-7 7"/>',
        plug: '<path d="M9 2v6M15 2v6"/><path d="M7 8h10v4a5 5 0 0 1-10 0V8z"/><path d="M12 17v5M8 22h8"/>'
    };

    function init() {
        renderNav();
        setupEventListeners();

        // 加载数据并渲染首页
        DataLoader.init().then(() => {
            navigateTo('cockpit');
        }).catch(err => {
            console.error('数据加载失败:', err);
            document.getElementById('pageContainer').innerHTML =
                '<div class="empty-state"><h3>数据加载失败</h3><p>请刷新页面重试</p></div>';
        });
    }

    function renderNav() {
        const navMenu = document.getElementById('navMenu');
        let html = '';

        navConfig.forEach(group => {
            html += `<div class="nav-group">
                <div class="nav-group-title">${group.group}</div>`;
            group.items.forEach(item => {
                html += `<div class="nav-item ${item.id === currentPage ? 'active' : ''}"
                            data-page="${item.id}"
                            onclick="App.navigateTo('${item.id}')">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        ${icons[item.icon] || icons.dashboard}
                    </svg>
                    <span class="nav-label">${item.label}</span>
                </div>`;
            });
            html += '</div>';
        });

        navMenu.innerHTML = html;
    }

    function setupEventListeners() {
        // 响应式侧边栏
        window.addEventListener('resize', handleResize);

        // ESC关闭移动端侧边栏
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileSidebarOpen) {
                closeMobileSidebar();
            }
        });
    }

    function handleResize() {
        if (window.innerWidth > 992) {
            mobileSidebarOpen = false;
            document.querySelector('.sidebar').classList.remove('mobile-open');
        }
    }

    function navigateTo(pageId) {
        currentPage = pageId;

        // 更新导航激活状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        // 更新页面标题
        document.getElementById('pageTitle').textContent = pageTitles[pageId] || pageId;

        // 渲染页面内容
        const container = document.getElementById('pageContainer');
        container.innerHTML = '<div class="empty-state">加载中...</div>';

        // 调用对应页面的渲染函数
        const pageRenderers = {
            'cockpit': CockpitPage,
            'data-asset': DataAssetPage,
            'store-forecast': StoreForecastPage,
            'sku-forecast': SkuForecastPage,
            'model-performance': ModelPerformancePage,
            'forecast-methodology': ForecastMethodologyPage,
            'weather-impact': WeatherImpactPage,
            'ai-insight': AiInsightPage,
            'store-compare': StoreComparePage,
            'scenario-sim': ScenarioSimPage,
            'extensions': ExtensionsPage,
            'model-trust': ModelTrustPage,
            'migration': TeaMigrationPage,
            'mcp-center': McpCenterPage
        };

        const renderer = pageRenderers[pageId];
        if (renderer && typeof renderer.render === 'function') {
            requestAnimationFrame(() => {
                renderer.render(container);
            });
        } else {
            container.innerHTML = `<div class="empty-state"><h3>页面开发中</h3><p>${pageTitles[pageId] || pageId}</p></div>`;
        }

        // 移动端关闭侧边栏
        if (window.innerWidth <= 992) {
            closeMobileSidebar();
        }

        // 滚动到顶部
        container.scrollTop = 0;
    }

     function toggleSidebar() {
         if (window.innerWidth <= 992) {
             // 移动端
             mobileSidebarOpen = !mobileSidebarOpen;
             const sidebar = document.querySelector('.sidebar');
             const overlay = document.getElementById('sidebarOverlay');
             sidebar.classList.toggle('mobile-open', mobileSidebarOpen);
             if (overlay) overlay.classList.toggle('show', mobileSidebarOpen);
             document.body.classList.toggle('mobile-sidebar-open', mobileSidebarOpen);
         } else {
             // 桌面端折叠
             sidebarCollapsed = !sidebarCollapsed;
             document.querySelector('.sidebar').classList.toggle('collapsed', sidebarCollapsed);
         }
     }

     function closeMobileSidebar() {
         mobileSidebarOpen = false;
         const sidebar = document.querySelector('.sidebar');
         const overlay = document.getElementById('sidebarOverlay');
         sidebar.classList.remove('mobile-open');
         if (overlay) overlay.classList.remove('show');
         document.body.classList.remove('mobile-sidebar-open');
         // 恢复滚动（如果没有其他模态占用）
         if (!document.querySelector('.modal-overlay.show')) {
             document.body.style.overflow = '';
         }
     }

    function onStoreChange(store) {
        currentStore = store;
        // 重新渲染当前页面
        navigateTo(currentPage);
    }

    function getCurrentStore() {
        return currentStore;
    }

    // 仅设置门店状态，不触发导航重渲染
    // 供自检、演示模式等需要批量恢复状态的场景使用
    // 普通用户通过顶栏筛选仍走 onStoreChange 完整流程
    function setStoreSilent(store) {
        currentStore = store;
    }

    function getCurrentPage() {
        return currentPage;
    }

    // 工具函数：格式化数字
    function formatNumber(num, decimals = 0) {
        if (num >= 10000) {
            return (num / 10000).toFixed(1) + '万';
        }
        return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatCurrency(num) {
        if (num >= 10000) {
            return '$' + (num / 1000).toFixed(1) + 'K';
        }
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatPercent(num, decimals = 1) {
        return (num * 100).toFixed(decimals) + '%';
    }

    return {
         init,
         navigateTo,
         toggleSidebar,
         closeMobileSidebar,
         onStoreChange,
        getCurrentStore,
        setStoreSilent,
        getCurrentPage,
        formatNumber,
        formatCurrency,
        formatPercent
    };
})();

 // 全局函数（供HTML内联调用）
 function toggleSidebar() {
     App.toggleSidebar();
 }

 function closeSidebar() {
     App.closeMobileSidebar();
 }

function onStoreChange(value) {
    App.onStoreChange(value);
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
