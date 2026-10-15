/**
 * SKU 预测中心页面 v2.1
 * 8400 条滚动回测预测 · 稀疏标签 · 35天五窗口
 */

const SkuForecastPage = (function() {
    let charts = {};
    let currentCategory = 'all';
    let currentProductType = 'all';
    let currentPageNum = 1;
    const pageSize = 12;

    function render(container) {
        const data = DataLoader.getData();
        const store = App.getCurrentStore();

        // 获取 SKU 聚合数据
        let skuData = aggregateSkuData(store, currentCategory);

        // 分页
        const totalPages = Math.ceil(skuData.length / pageSize);
        const pageData = skuData.slice((currentPageNum - 1) * pageSize, currentPageNum * pageSize);

        // 全局SKU层级指标
        const totalActual = skuData.reduce((s, d) => s + d.actual_total, 0);
        const totalPred = skuData.reduce((s, d) => s + d.pred_total, 0);
        const globalMAE = skuData.reduce((s, d) => s + d.mae * d.days, 0) / skuData.reduce((s, d) => s + d.days, 0);
        const globalWAPE = totalActual > 0 ? Math.abs(totalPred - totalActual) / totalActual * 100 : 0;

        const sparseCount = skuData.filter(d => d.is_sparse).length;

        container.innerHTML = `
            <!-- 筛选栏 -->
            <div class="card" style="margin-bottom:20px">
                <div class="card-body" style="padding:16px 20px">
                    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="font-size:13px;font-weight:500;color:var(--gray-600)">品类：</span>
                            <div class="tag-group" id="categoryFilter">
                                <span class="tag ${currentCategory === 'all' ? 'amber' : ''}" style="cursor:pointer" onclick="SkuForecastPage.filterCategory('all')">全部</span>
                                ${data.categories.map(c => `
                                    <span class="tag ${currentCategory === c ? 'amber' : ''}" style="cursor:pointer" onclick="SkuForecastPage.filterCategory('${c}')">${DataLoader.getCategoryDisplayName(c)}</span>
                                `).join('')}
                            </div>
                        </div>
                        <div style="margin-left:auto;font-size:12px;color:var(--gray-500)">
                            共 <b style="color:var(--coffee-700);font-family:'JetBrains Mono',monospace">${skuData.length}</b> 个门店商品组合
                        </div>
                    </div>
                </div>
            </div>

            <!-- SKU层级精度概览 -->
            <div class="grid grid-4" style="margin-bottom:20px">
                <div class="kpi-card">
                    <div class="kpi-label">门店×SKU×日 样本</div>
                    <div class="kpi-value small">${(skuData.length * 35).toLocaleString()}<span class="kpi-unit">条</span></div>
                    <div class="kpi-change neutral">35 天 · 五窗口滚动</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">SKU 层级 MAE</div>
                    <div class="kpi-value small" style="color:var(--coffee-700)">${globalMAE.toFixed(2)}<span class="kpi-unit">杯/天</span></div>
                    <div class="kpi-change neutral">商品颗粒度</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">SKU 层级 WAPE</div>
                    <div class="kpi-value small" style="color:var(--amber-600)">${globalWAPE.toFixed(1)}<span class="kpi-unit">%</span></div>
                    <div class="kpi-change neutral">加权绝对误差</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">稀疏组合</div>
                    <div class="kpi-value small" style="color:var(--data-teal)">${sparseCount}<span class="kpi-unit">个</span></div>
                    <div class="kpi-change neutral">占比 ${(sparseCount/skuData.length*100).toFixed(1)}%</div>
                </div>
            </div>

            <!-- SKU 列表卡 -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">商品预测明细</div>
                    <span class="data-badge real">真实销售数据</span>
                </div>
                <div class="card-body">
                    <div class="sku-grid">
                        ${pageData.map((sku, i) => renderSkuCard(sku, i)).join('')}
                    </div>
                    <!-- 分页 -->
                    <div class="pagination" style="margin-top:20px">
                        <button class="page-btn" onclick="SkuForecastPage.prevPage()" ${currentPageNum === 1 ? 'disabled' : ''}>上一页</button>
                        <span class="page-info">第 ${currentPageNum} / ${totalPages} 页</span>
                        <button class="page-btn" onclick="SkuForecastPage.nextPage()" ${currentPageNum === totalPages ? 'disabled' : ''}>下一页</button>
                    </div>
                </div>
            </div>
        `;
    }

    function aggregateSkuData(store, category) {
        const data = DataLoader.getData();
        let rows = data.skuForecast;
        if (store !== 'all') rows = rows.filter(d => d.store_name === store);
        if (category !== 'all') rows = rows.filter(d => d.category === category);

        const grouped = {};
        rows.forEach(d => {
            const key = d.store_id + '_' + d.product_id;
            if (!grouped[key]) {
                grouped[key] = {
                    product_id: d.product_id,
                    product_detail: d.product_detail,
                    product_name: d.product_name,
                    store_name: d.store_name,
                    category: d.category,
                    product_type: d.product_type,
                    actual_total: 0,
                    pred_total: 0,
                    abs_error_sum: 0,
                    days: 0,
                    is_sparse: d.is_sparse == 1,
                    zero_rate: d.zero_rate,
                    adi: d.adi,
                    mean_qty: d.mean_qty
                };
            }
            grouped[key].actual_total += d.qty;
            grouped[key].pred_total += d.pred_lightgbm;
            grouped[key].abs_error_sum += Math.abs(d.qty - d.pred_lightgbm);
            grouped[key].days++;
        });

        return Object.values(grouped).map(g => ({
            ...g,
            mae: g.days > 0 ? g.abs_error_sum / g.days : 0,
            wape: g.actual_total > 0 ? g.abs_error_sum / g.actual_total * 100 : 0
        })).sort((a, b) => b.actual_total - a.actual_total);
    }

    function renderSkuCard(sku, idx) {
        const skuName = DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id);
        const catName = DataLoader.getCategoryDisplayName(sku.category);
        const wapeColor = sku.wape > 50 ? 'var(--danger)' : sku.wape > 30 ? 'var(--warning)' : 'var(--success)';
        const maeRank = sku.mae;

        // 迷你图数据（取最后7天）
        const data = DataLoader.getData();
        const skuRows = data.skuForecast.filter(d =>
            d.product_id == sku.product_id && d.store_name === sku.store_name
        ).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

        return `
            <div class="sku-card" data-comment-anchor="sku-${sku.product_id}">
                <div class="sku-card-header">
                    <div class="sku-rank">${(currentPageNum - 1) * pageSize + idx + 1}</div>
                    <div class="sku-card-info">
                        <div class="sku-card-name">${skuName}</div>
                        <div class="sku-card-meta">
                            ${catName} · ${DataLoader.getStoreDisplayName(sku.store_name)}
                            ${sku.is_sparse ? '<span class="sparse-tag">稀疏需求</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="sku-card-body">
                    <div class="sku-mini-chart" id="skuMini_${idx}">
                        <div style="font-size:11px;color:var(--gray-400)">最近 7 天趋势</div>
                    </div>
                    <div class="sku-stats">
                        <div class="sku-stat">
                            <span class="sku-stat-label">实际</span>
                            <span class="sku-stat-value">${sku.actual_total.toFixed(0)}</span>
                        </div>
                        <div class="sku-stat">
                            <span class="sku-stat-label">预测</span>
                            <span class="sku-stat-value">${sku.pred_total.toFixed(0)}</span>
                        </div>
                        <div class="sku-stat">
                            <span class="sku-stat-label">MAE</span>
                            <span class="sku-stat-value" style="color:var(--coffee-600)">${sku.mae.toFixed(2)}</span>
                        </div>
                        <div class="sku-stat">
                            <span class="sku-stat-label">WAPE</span>
                            <span class="sku-stat-value" style="color:${wapeColor}">${sku.wape.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                ${sku.is_sparse ? `
                <div class="sku-card-footer">
                    <span>zero_rate: ${(sku.zero_rate || 0).toFixed(2)}</span>
                    <span>ADI: ${(sku.adi || 0).toFixed(1)}</span>
                    <span>mean_qty: ${(sku.mean_qty || 0).toFixed(2)}</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    function filterCategory(cat) {
        currentCategory = cat;
        currentPageNum = 1;
        App.onCategoryChange(cat);
    }

    function prevPage() {
        if (currentPageNum > 1) {
            currentPageNum--;
            render(App.getContentContainer());
        }
    }

    function nextPage() {
        currentPageNum++;
        render(App.getContentContainer());
    }

    return {
        render,
        filterCategory,
        prevPage,
        nextPage
    };
})();
