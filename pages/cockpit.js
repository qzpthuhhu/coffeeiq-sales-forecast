/**
 * 经营驾驶舱页面 v2.1
 * 基于 direct-tweedie-sparse 新模型（Global LightGBM）
 * 35天五窗口滚动回测，实际销量 vs 预测销量
 */

const CockpitPage = (function() {
    let charts = {};
    let currentCategory = 'all';
    let currentSku = 'all';

    function render(container) {
        const data = DataLoader.getData();
        const summary = data.summary;
        const bt = summary.backtest;
        const store = App.getCurrentStore();

        const dailyData = DataLoader.getStoreDailyData(store);
        const categoryData = DataLoader.getCategoryData(store);

        const storeStats = data.storeNames.map(name => {
            const storeDaily = data.dailyStore.filter(d => d.store_location === name);
            return {
                name,
                qty: storeDaily.reduce((s, d) => s + d.qty, 0),
                revenue: storeDaily.reduce((s, d) => s + d.revenue, 0)
            };
        }).sort((a, b) => b.qty - a.qty);

        const topSkus = data.skuList.slice(0, 5);

        // 风险门店：从 quality_report store 级取 WAPE
        const storeQuality = DataLoader.getQualityRows('store', 'lightgbm') || [];
        const riskStores = storeStats.map(s => {
            const qRow = storeQuality.find(q => q.entity_name === s.name || q.entity_id === s.name);
            return {
                name: s.name,
                wape: qRow ? qRow.wape : 0,
                mae: qRow ? qRow.mae : 0,
                sampleCount: qRow ? qRow.sample_count : 0,
                actual: s.qty
            };
        }).sort((a, b) => b.wape - a.wape);

        const categories = data.categories || [];
        const skuOptions = getSkuOptions(currentCategory);

        const series = DataLoader.getForecastSeries(store, currentCategory, currentSku);
        const fcMetrics = DataLoader.calcForecastMetrics(series.dates, series.actuals, series.predictions);

        container.innerHTML = `
            <!-- Hero 区域 -->
            <div class="cockpit-hero">
                <div class="cockpit-hero-content">
                    <h2>门店销量智能预测驾驶舱</h2>
                    <p>基于 149,116 条真实交易数据 · 直接多步Tweedie稀疏模型 · 五窗口滚动回测验证</p>
                    <div class="hero-stats">
                        <div class="hero-stat">
                            <div class="stat-value">${summary.totalQty.toLocaleString()}</div>
                            <div class="stat-label">累计销量（杯）</div>
                        </div>
                        <div class="hero-stat">
                            <div class="stat-value">$${(summary.totalRevenue / 1000).toFixed(0)}K</div>
                            <div class="stat-label">累计营收</div>
                        </div>
                        <div class="hero-stat">
                            <div class="stat-value">${bt.r2.toFixed(3)}</div>
                            <div class="stat-label">门店×SKU×日 R² · 8,400 样本</div>
                        </div>
                        <div class="hero-stat">
                            <div class="stat-value">${bt.directionAccuracy.toFixed(1)}%</div>
                            <div class="stat-label">方向命中率 · 5 窗口滚动回测</div>
                        </div>
                    </div>
                </div>
            </div>

             <!-- KPI 指标行 -->
             <div class="grid grid-4" style="margin-bottom:20px">
                 <div class="kpi-card">
                     <div class="kpi-card-top">
                         <span class="data-badge real">真实数据</span>
                         <div class="kpi-icon">
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                 <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                             </svg>
                         </div>
                     </div>
                     <div class="kpi-label">门店数量</div>
                     <div class="kpi-value">${summary.storeCount}<span class="kpi-unit">家</span></div>
                     <div class="kpi-change neutral">纽约 · 3 店</div>
                 </div>
                 <div class="kpi-card">
                     <div class="kpi-card-top">
                         <span class="data-badge real">真实数据</span>
                         <div class="kpi-icon">
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                 <rect x="3" y="4" width="18" height="16" rx="2"/>
                                 <path d="M3 10h18M9 4v6"/>
                             </svg>
                         </div>
                     </div>
                     <div class="kpi-label">SKU 数量</div>
                     <div class="kpi-value">${summary.skuCount}<span class="kpi-unit">个</span></div>
                     <div class="kpi-change neutral">9 品类 · 29 子类型</div>
                 </div>
                 <div class="kpi-card">
                     <div class="kpi-card-top">
                         <span class="data-badge real">真实数据</span>
                         <div class="kpi-icon">
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                 <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                             </svg>
                         </div>
                     </div>
                     <div class="kpi-label">日均销量</div>
                     <div class="kpi-value">${Math.round(summary.totalQty / summary.dayCount).toLocaleString()}<span class="kpi-unit">杯/天</span></div>
                     <div class="kpi-change neutral">181 天 · 2023 H1</div>
                 </div>
                 <div class="kpi-card">
                     <div class="kpi-card-top">
                         <span class="data-badge model">模型输出</span>
                         <div class="kpi-icon">
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                 <circle cx="12" cy="12" r="9"/>
                                 <path d="M12 7v5l3 3"/>
                             </svg>
                         </div>
                     </div>
                     <div class="kpi-label">回测天数</div>
                     <div class="kpi-value">${bt.validationDays}<span class="kpi-unit">天</span></div>
                     <div class="kpi-change neutral">5 窗口 · 滚动回测</div>
                 </div>
             </div>

            <!-- 主图区域：实际 vs 预测（35天滚动回测） -->
            <div class="grid grid-main" style="margin-bottom:20px">
                 <div class="card forecast-main-card" id="demo-forecastMainCard">
                     <div class="card-header">
                         <div>
                              <div class="card-title">实际销量 vs 点预测</div>
                             <div class="card-subtitle">五窗口滚动回测 · ${bt.validationStart} ~ ${bt.validationEnd.slice(5)} · ${store === 'all' ? '全部门店' : store} · 历史回测，不是未来预测</div>
                         </div>
                         <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
                             <span class="data-badge model">LightGBM Tweedie</span>
                         </div>
                     </div>
                     <div class="forecast-filter-bar">
                         <div class="filter-item">
                             <label class="filter-label">品类</label>
                             <select id="categorySelect" class="filter-select" onchange="CockpitPage.onCategoryChange(this.value)" title="选择品类">
                                  <option value="all" ${currentCategory === 'all' ? 'selected' : ''}>全部品类</option>
                                  ${categories.map(c => `<option value="${c}" ${currentCategory === c ? 'selected' : ''} title="${DataLoader.getCategoryDisplayName(c)}｜${c}">${DataLoader.getCategoryDisplayName(c)}</option>`).join('')}
                             </select>
                         </div>
                         <div class="filter-item">
                             <label class="filter-label">商品</label>
                             <select id="skuSelect" class="filter-select" onchange="CockpitPage.onSkuChange(this.value)" title="选择商品">
                                  <option value="all" ${currentSku === 'all' ? 'selected' : ''}>全部商品</option>
                                  ${skuOptions.map(s => `<option value="${s.product_id}" title="${DataLoader.getSkuTooltip(s)}" ${currentSku == s.product_id ? 'selected' : ''}>${s.label}</option>`).join('')}
                             </select>
                         </div>
                         <div class="forecast-level-tag" id="forecastLevelTag">
                             ${series.levelLabel}
                         </div>
                     </div>
                     <div class="card-body">
                         <div id="forecastMainChart" class="chart-container large"></div>
                         <!-- 指标行 -->
                         <div class="forecast-metrics-row">
                             <div class="forecast-metric">
                                 <div class="forecast-metric-label">MAE</div>
                                 <div class="forecast-metric-value" id="metricMAE">${fcMetrics.mae.toFixed(2)} <span class="metric-unit">杯/天</span></div>
                             </div>
                             <div class="forecast-metric">
                                 <div class="forecast-metric-label">WAPE</div>
                                 <div class="forecast-metric-value" id="metricWAPE">${fcMetrics.wape.toFixed(1)}%</div>
                             </div>
                             <div class="forecast-metric">
                                 <div class="forecast-metric-label">R²</div>
                                 <div class="forecast-metric-value r2" id="metricR2">${fcMetrics.r2.toFixed(3)}</div>
                             </div>
                              <div class="forecast-metric">
                                  <div class="forecast-metric-label">方向命中</div>
                                  <div class="forecast-metric-value hit" id="metricDir">—</div>
                              </div>
                          </div>
                         <div class="forecast-note" id="forecastNote">
                             展示 2023-05-27 至 06-30 五个滚动窗口的回测结果，不是未来预测。数据来源：8,400 条逐商品预测按当前筛选范围按日聚合。<span id="forecastAggNote" style="color:var(--gray-400)"></span>
                         </div>
                     </div>
                 </div>

                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">品类结构</div>
                         <span class="data-badge real">真实数据</span>
                     </div>
                    <div class="card-body">
                        <div id="categoryDonut" class="chart-container" style="min-height:260px"></div>
                        <div class="divider"></div>
                        <div class="rank-list" id="categoryRank">
                             ${categoryData.slice(0, 5).map((cat, i) => `
                                 <div class="rank-item top-${i + 1}">
                                     <div class="rank-num">${i + 1}</div>
                                     <div class="rank-name">${DataLoader.getCategoryDisplayName(cat.category)}</div>
                                     <div class="rank-value">${cat.qty.toLocaleString()}</div>
                                 </div>
                             `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 下排：门店排名 + 全局效果概览 + TOP SKU -->
            <div class="grid grid-3">
                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">
                             <span class="status-dot success"></span>
                             热销门店
                         </div>
                         <span class="data-badge real">真实数据</span>
                     </div>
                    <div class="card-body">
                        <div class="rank-list">
                            ${storeStats.map((s, i) => `
                                <div class="rank-item top-${i + 1}">
                                    <div class="rank-num">${i + 1}</div>
                                    <div class="rank-name">${s.name}</div>
                                    <div class="rank-value">${s.qty.toLocaleString()} 杯</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="divider"></div>
                        <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px">门店销量占比</div>
                        ${storeStats.map(s => `
                            <div class="metric-bar-row">
                                <div class="metric-bar-label">
                                    <span>${s.name}</span>
                                    <span>${(s.qty / summary.totalQty * 100).toFixed(1)}%</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width:${s.qty / summary.totalQty * 100}%;background:${ChartUtils.storeColors[s.name]}"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                 <div class="card">
                     <div class="card-header">
                         <div>
                             <div class="card-title">
                                 <span class="status-dot warning"></span>
                                 模型效果概览（五窗口）
                             </div>
                             <div class="card-subtitle">8,400 样本 · 门店×SKU×日 · 更多详见 <span style="color:var(--coffee-700);cursor:pointer;text-decoration:underline" onclick="App.navigateTo('model-performance')">模型效果中心</span></div>
                         </div>
                         <span class="data-badge model">模型输出</span>
                     </div>
                    <div class="card-body">
                        <div class="grid grid-2" style="gap:12px;margin-bottom:16px">
                            <div>
                                  <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px">MAE</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--coffee-700)">${bt.mae.toFixed(2)} <span style="font-size:14px;font-weight:400;color:var(--gray-500)">杯</span></div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px">WAPE</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--coffee-700)">${bt.wape.toFixed(1)}%</div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px">方向命中</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--data-teal)">${bt.directionAccuracy.toFixed(1)}%</div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px">P10-P90 覆盖</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--amber-600)">${bt.intervalCoverage.toFixed(1)}%</div>
                            </div>
                        </div>
                        <div id="windowBarChart" class="chart-container small"></div>
                         <div style="margin-top:10px;font-size:11px;color:var(--gray-400);line-height:1.6">
                             五窗口滚动回测，每窗口 7 天前瞻，共 35 天验证；所有样本为门店×SKU×日最细粒度。
                        </div>
                    </div>
                </div>

                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">
                             <span class="status-dot info"></span>
                             TOP 5 商品
                         </div>
                         <span class="data-badge real">真实数据</span>
                     </div>
                    <div class="card-body">
                        <div class="rank-list">
                            ${topSkus.map((sku, i) => `
                                <div class="rank-item top-${i + 1}">
                                    <div class="rank-num">${i + 1}</div>
                                    <div class="rank-name" style="display:flex;flex-direction:column" title="${DataLoader.getSkuTooltip(sku)}">
                                        <span>${DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id)}</span>
                                        <span style="font-size:11px;color:var(--gray-400)">${DataLoader.getCategoryDisplayName(sku.product_category)} · $${sku.avg_price.toFixed(2)}</span>
                                    </div>
                                    <div class="rank-value" style="text-align:right">
                                        <div>${sku.total_qty.toLocaleString()}</div>
                                        <div style="font-size:11px;color:var(--gray-400);font-weight:400">杯</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 风险门店 + 关键洞察 -->
            <div class="grid grid-2" style="margin-top:20px">
                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">
                             <span class="status-dot danger"></span>
                             门店预测误差排名
                         </div>
                         <span class="data-badge model">模型输出</span>
                     </div>
                    <div class="card-body">
                        <div class="rank-list">
                            ${riskStores.map((s, i) => `
                                <div class="rank-item">
                                    <div class="rank-num" style="background:${s.wape > 0.4 ? 'var(--danger-light)' : 'var(--warning-light)'};color:${s.wape > 0.4 ? 'var(--danger)' : 'var(--warning)'}">${i + 1}</div>
                                    <div class="rank-name">
                                        ${s.name}
                                        <div style="font-size:11px;color:var(--gray-400);font-weight:400">MAE ${s.mae.toFixed(2)} 杯 · ${s.sampleCount} 样本</div>
                                    </div>
                                    <div style="text-align:right">
                                        <div style="font-family:'JetBrains Mono',monospace;font-weight:600;color:${s.wape > 0.4 ? 'var(--danger)' : 'var(--warning)'}">${(s.wape * 100).toFixed(1)}%</div>
                                        <div style="font-size:11px;color:var(--gray-400)">WAPE</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 9v4M12 17h.01"/>
                                <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
                            </svg>
                            关键洞察
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="timeline">
                             <div class="timeline-item">
                                 <div class="timeline-date">模型架构</div>
                                 <div class="timeline-title">直接多步 Tweedie 稀疏模型</div>
                                 <div class="timeline-desc">Global LightGBM · 直接多步预测 · Tweedie 分布 · 稀疏标签 · 五窗口滚动回测验证。MAE 2.411 杯、WAPE 34.7%、R² 0.661、方向命中率 61.4%</div>
                             </div>
                             <div class="timeline-item">
                                 <div class="timeline-date">稀疏需求</div>
                                 <div class="timeline-title">77/240 个门店商品组合为稀疏品</div>
                                 <div class="timeline-desc">模型通过 zero_rate、adi、mean_qty、is_sparse 四个稀疏标签特征区分稀疏与稠密，两类精度同时改善</div>
                             </div>
                            <div class="timeline-item">
                                <div class="timeline-date">区间校准</div>
                                <div class="timeline-title">P10-P90 总体覆盖率 80.6%</div>
                                <div class="timeline-desc">通过 split conformal 校准后达到目标 80% 边际覆盖；区间是模型不确定性度量，不是业务承诺</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        initCharts(dailyData, categoryData);
    }

    function getSkuOptions(category) {
        const data = DataLoader.getData();
        const skuList = data.skuList || [];
        let list = skuList;
        if (category && category !== 'all') {
            list = skuList.filter(s => s.product_category === category);
        }
        return list.map(s => ({
            product_id: s.product_id,
            product_detail: s.product_detail,
            product_category: s.product_category,
            label: DataLoader.getSkuDisplayName(s.product_detail, s.product_id),
            fullName: DataLoader.getSkuDisplayName(s.product_detail, s.product_id)
        })).sort((a, b) => a.label.localeCompare(b.label, 'zh'));
    }

    function getLevelLabel(store, category, skuId, dayCount) {
        let parts = [];
        if (skuId && skuId !== 'all') {
            const sku = DataLoader.getData().skuList.find(s => s.product_id == skuId);
            parts.push(DataLoader.getSkuDisplayName(sku ? sku.product_detail : '', sku ? sku.product_id : ''));
        } else if (category && category !== 'all') {
            parts.push(DataLoader.getCategoryDisplayName(category) + '品类');
        } else {
            parts.push('全品类');
        }
        if (store === 'all') {
            parts.push('跨3店');
        } else {
            parts.push(store);
        }
        parts.push(dayCount + '个日聚合点');
        return parts.join(' · ');
    }

    function initCharts(dailyData, categoryData) {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        const store = App.getCurrentStore();

        // 1. 主图：实际 vs 预测（两条线，无区间带）
        const mainDom = document.getElementById('forecastMainChart');
        if (mainDom) {
            const series = DataLoader.getForecastSeries(store, currentCategory, currentSku);
            if (series.dates.length === 0) {
                mainDom.innerHTML = '<div class="empty-state"><h3>无数据</h3><p>当前筛选条件下没有找到预测数据</p></div>';
            } else {
                const dates = formatDateLabels(series.dates);
                charts.mainForecast = ChartUtils.createForecastLineChart(
                    mainDom, dates, series.actuals, series.predictions,
                    series.p10, series.p50, series.p90,
                    { yAxisName: '销量（杯）' }
                );
                if (charts.mainForecast) {
                    charts.mainForecast.setOption({
                        tooltip: {
                            trigger: 'axis',
                            formatter: function(params) {
                                if (!params || params.length === 0) return '';
                                let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;

                                // 按顺序：实际 → 点预测 → P90 → P50 → P10
                                const order = ['实际销量', '点预测', 'P10–P90区间上界', 'P50预测', 'P10–P90区间'];
                                const labelMap = {
                                    '实际销量': '实际销量',
                                    '点预测': '点预测',
                                    'P50预测': 'P50预测',
                                    'P10–P90区间': 'P10（下界）',
                                    'P10–P90区间上界': 'P90（上界）'
                                };
                                const colorMap = {
                                    'P10–P90区间': '#E8CFA8',
                                    'P10–P90区间上界': '#E8CFA8'
                                };

                                order.forEach(name => {
                                    const p = params.find(x => x.seriesName === name);
                                    if (!p) return;
                                    if (p.value == null || isNaN(p.value)) return;
                                    const val = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
                                    const label = labelMap[name] || name;
                                    const dotColor = colorMap[name] || p.color;
                                    html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
                                        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></span>
                                        <span>${label}：</span>
                                        <span style="font-weight:600;font-family:'JetBrains Mono',monospace">${val} 杯</span>
                                    </div>`;
                                });

                                // 偏差计算（点预测 vs 实际）
                                const actualP = params.find(p => p.seriesName === '实际销量');
                                const predP = params.find(p => p.seriesName === '点预测');
                                if (actualP && predP && actualP.value != null && predP.value != null
                                    && !isNaN(actualP.value) && !isNaN(predP.value)) {
                                    const actual = actualP.value;
                                    const predicted = predP.value;
                                    const diff = predicted - actual;
                                    const diffPct = actual > 0 ? diff / actual * 100 : 0;
                                    const absDiffPct = Math.abs(diff) / (actual + 1) * 100;
                                    const sign = diff >= 0 ? '+' : '−';
                                    const diffColor = diff >= 0 ? 'var(--data-teal)' : 'var(--danger)';
                                    html += `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #EEE">
                                        <div style="display:flex;justify-content:space-between;gap:12px;font-size:12px">
                                            <span style="color:var(--gray-500)">点预测偏差</span>
                                            <span style="font-family:'JetBrains Mono',monospace;color:${diffColor};font-weight:600">${sign}${Math.abs(diff).toFixed(1)} 杯 (${diffPct >= 0 ? '+' : '−'}${Math.abs(diffPct).toFixed(1)}%)</span>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;margin-top:2px">
                                            <span style="color:var(--gray-500)">绝对偏差率</span>
                                            <span style="font-family:'JetBrains Mono',monospace;font-weight:600">${absDiffPct.toFixed(1)}%</span>
                                        </div>
                                    </div>`;
                                }
                                return html;
                            }
                        }
                    });
                }
            }
        }

        // 2. 品类环形图
        const donutDom = document.getElementById('categoryDonut');
        if (donutDom) {
            charts.donut = ChartUtils.createDonutChart(donutDom,
                categoryData.map(c => ({
                    name: DataLoader.getCategoryDisplayName(c.category),
                    value: c.qty,
                    color: ChartUtils.categoryColors[c.category]
                }))
            );
        }

        // 3. 五窗口 MAE 柱状图
        const winDom = document.getElementById('windowBarChart');
        if (winDom) {
            const windows = DataLoader.getWindowMetrics();
            charts.windowBar = ChartUtils.createBarChart(winDom,
                windows.map(w => w.windowStart.slice(5)),
                windows.map(w => +w.mae.toFixed(2)),
                {
                    horizontal: false,
                    color: 'var(--coffee-500)',
                    xAxisName: '回测窗口起点（月-日）',
                    yAxisName: 'MAE（杯）'
                }
            );
            if (charts.windowBar) {
                charts.windowBar.setOption({
                    tooltip: {
                        trigger: 'axis',
                        formatter: function(params) {
                            const p = params[0];
                            const w = windows[p.dataIndex];
                            return `<div style="font-weight:600;margin-bottom:4px">窗口起点：${w.windowStart}</div>
                                MAE：<b>${w.mae.toFixed(3)}</b> 杯<br>
                                R²：<b>${w.r2.toFixed(3)}</b><br>
                                样本：${w.sampleCount} 条`;
                        }
                    }
                });
            }
        }
    }

    // 日期标签：35天用稀疏标签，避免拥挤
    function formatDateLabels(dates) {
        return dates.map((d, i) => {
            const mmdd = d.slice(5);
            // 每 5 天显示一次标签 + 开头结尾
            if (i === 0 || i === dates.length - 1 || i % 5 === 0) return mmdd;
            return '';
        });
    }

    function onCategoryChange(value) {
        currentCategory = value;
        currentSku = 'all';

        const skuSelect = document.getElementById('skuSelect');
        if (skuSelect) {
            const skuOptions = getSkuOptions(currentCategory);
            skuSelect.innerHTML =
                `<option value="all">全部商品</option>` +
                skuOptions.map(s => `<option value="${s.product_id}" title="${DataLoader.getSkuTooltip(s)}">${s.label}</option>`).join('');
            skuSelect.value = 'all';
        }

        updateMainChart();
    }

    function onSkuChange(value) {
        currentSku = value;
        updateMainChart();
    }

    function updateMainChart() {
        const store = App.getCurrentStore();
        const series = DataLoader.getForecastSeries(store, currentCategory, currentSku);
        const metrics = DataLoader.calcForecastMetrics(series.dates, series.actuals, series.predictions);

         const levelTag = document.getElementById('forecastLevelTag');
         if (levelTag) levelTag.textContent = series.levelLabel;

         // 更新指标
        const maeEl = document.getElementById('metricMAE');
        if (maeEl) maeEl.innerHTML = metrics.mae.toFixed(2) + ' <span class="metric-unit">杯/天</span>';
        const wapeEl = document.getElementById('metricWAPE');
        if (wapeEl) wapeEl.textContent = metrics.wape.toFixed(1) + '%';
         const r2El = document.getElementById('metricR2');
         if (r2El) r2El.textContent = metrics.r2.toFixed(3);

         // 聚合口径提示（多 SKU 聚合时展示，单店×单商品隐藏）
         const aggNoteEl = document.getElementById('forecastAggNote');
         if (aggNoteEl) {
             aggNoteEl.textContent = series.isAggregate
                 ? ' 分位区间为分项预测求和，作为组合需求区间近似。'
                 : '';
         }

         const mainDom = document.getElementById('forecastMainChart');
        if (!mainDom) return;

        if (series.dates.length === 0) {
            if (charts.mainForecast) {
                charts.mainForecast.dispose();
                charts.mainForecast = null;
            }
            mainDom.innerHTML = '<div class="empty-state"><h3>无数据</h3><p>当前筛选条件下没有找到预测数据</p></div>';
            return;
        }

          const dates = formatDateLabels(series.dates);

           if (!charts.mainForecast) {
                charts.mainForecast = ChartUtils.createForecastLineChart(
                    mainDom, dates, series.actuals, series.predictions,
                    series.p10, series.p50, series.p90,
                    { yAxisName: '销量（杯）' }
                );
           } else {
               // 计算差值带：基线 = P10，填充 = P90-P10（与 createForecastLineChart 内部一致）
               const p10Num = series.p10.map(v => (v == null || isNaN(v) || v === '' ? null : +v));
               const p90Num = series.p90.map(v => (v == null || isNaN(v) || v === '' ? null : +v));
               const bandDelta = p90Num.map((p90, i) => {
                   const p10 = p10Num[i];
                   if (p10 == null || p90 == null) return null;
                   return Math.max(0, p90 - p10);
               });
               charts.mainForecast.setOption({
                   xAxis: { data: dates },
                   series: [
                       { name: '实际销量', data: series.actuals },
                       { name: '点预测', data: series.predictions },
                       { name: 'P10–P90区间_基线', data: p10Num },
                       { name: 'P10–P90区间', data: bandDelta },
                       { name: 'P50预测', data: series.p50 }
                   ]
               });
          }
    }

     return {
         render,
         onCategoryChange,
         onSkuChange,
         getState: function() {
             return { category: currentCategory, sku: currentSku };
         }
     };
})();
