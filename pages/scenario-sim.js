/**
 * 情景模拟 v2.1
 * 基于 226800 条真实受控重评分结果（8,400 × 27 组合）
 */

const ScenarioSimPage = (function() {
    let charts = {};
    let scenarioReady = false;
    let params = {
        temperature: 'observed',
        rain: 'observed',
        holiday: 'observed',
        store: 'all',
        category: 'all'
    };

    // 情景选项映射（与 scenario_contract 对齐）
    const TEMP_OPTIONS = [
        { id: 'cooler_5c', label: '−5°C' },
        { id: 'observed', label: '实际温度（基线）' },
        { id: 'warmer_5c', label: '+5°C' }
    ];
    const RAIN_OPTIONS = [
        { id: 'dry', label: '无雨' },
        { id: 'observed', label: '实际降雨（基线）' },
        { id: 'heavy_20mm', label: '强降雨 20mm' }
    ];
    const HOLIDAY_OPTIONS = [
        { id: 'ordinary_day', label: '平日' },
        { id: 'observed', label: '实际节假日（基线）' },
        { id: 'long_weekend', label: '长周末' }
    ];

    function render(container) {
        const data = DataLoader.getData();
        const contract = data.dashboard.scenario_contract || {};

        container.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">情景模拟</h2>
                <p class="page-subtitle">
                    受控模型响应 · ${contract.row_count?.toLocaleString() || '226,800'} 条重评分结果 · ${contract.combination_count || 27} 种情景组合
                </p>
                <span class="data-badge sim">模型响应 · 非因果</span>
            </div>

            <div class="grid grid-main" style="margin-bottom:20px">
                <!-- 左：控制面板 -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">情景参数</div>
                        <span id="scenarioLoadBadge" class="data-badge">加载中…</span>
                    </div>
                    <div class="card-body">
                        <div class="sim-controls">
                            <div class="sim-control-group">
                                <label class="sim-control-label">温度调整</label>
                                <div class="sim-control-options">
                                    ${TEMP_OPTIONS.map(o => `
                                        <button class="sim-option ${params.temperature === o.id ? 'active' : ''}"
                                            data-param="temperature" data-value="${o.id}"
                                            onclick="ScenarioSimPage.updateParam('temperature', '${o.id}')">
                                            ${o.label}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="sim-control-group">
                                <label class="sim-control-label">降雨</label>
                                <div class="sim-control-options">
                                    ${RAIN_OPTIONS.map(o => `
                                        <button class="sim-option ${params.rain === o.id ? 'active' : ''}"
                                            data-param="rain" data-value="${o.id}"
                                            onclick="ScenarioSimPage.updateParam('rain', '${o.id}')">
                                            ${o.label}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="sim-control-group">
                                <label class="sim-control-label">节假日</label>
                                <div class="sim-control-options">
                                    ${HOLIDAY_OPTIONS.map(o => `
                                        <button class="sim-option ${params.holiday === o.id ? 'active' : ''}"
                                            data-param="holiday" data-value="${o.id}"
                                            onclick="ScenarioSimPage.updateParam('holiday', '${o.id}')">
                                            ${o.label}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="sim-control-group">
                                <label class="sim-control-label">门店范围</label>
                                <select class="sim-select" onchange="ScenarioSimPage.updateParam('store', this.value)">
                                    <option value="all" ${params.store === 'all' ? 'selected' : ''}>全部门店</option>
                                    ${data.storeNames.map(s =>
                                        `<option value="${s}" ${params.store === s ? 'selected' : ''}>${DataLoader.getStoreDisplayName(s)}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="sim-control-group">
                                <label class="sim-control-label">品类范围</label>
                                <select class="sim-select" onchange="ScenarioSimPage.updateParam('category', this.value)">
                                    <option value="all" ${params.category === 'all' ? 'selected' : ''}>全部品类</option>
                                    ${data.categories.map(c =>
                                        `<option value="${c}" ${params.category === c ? 'selected' : ''}>${DataLoader.getCategoryDisplayName(c)}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div>

                        <div style="margin-top:16px;padding:12px;background:var(--warning-light);color:var(--warning-700);border-radius:8px;font-size:12px;line-height:1.6">
                            <b>注意：</b>情景模拟为<b>受控模型响应</b>，固定历史需求、价格、稀疏标签和门店校准不变。
                            结果反映的是模型学到的关联关系，<b>不代表因果</b>，也不是真实经营承诺。
                        </div>
                    </div>
                </div>

                <!-- 右：KPI + 图表 -->
                <div>
                    <div class="card" style="margin-bottom:20px">
                        <div class="card-header">
                            <div class="card-title">情景影响概览</div>
                        </div>
                        <div class="card-body">
                            <div class="grid grid-2" style="gap:16px">
                                <div class="sim-kpi">
                                    <div class="sim-kpi-label">基线预测总量</div>
                                    <div class="sim-kpi-value" id="simBaselineTotal">—</div>
                                </div>
                                <div class="sim-kpi">
                                    <div class="sim-kpi-label">情景预测总量</div>
                                    <div class="sim-kpi-value" id="simScenarioTotal">—</div>
                                </div>
                                <div class="sim-kpi">
                                    <div class="sim-kpi-label">绝对变化</div>
                                    <div class="sim-kpi-value" id="simAbsChange">—</div>
                                </div>
                                <div class="sim-kpi">
                                    <div class="sim-kpi-label">变化幅度</div>
                                    <div class="sim-kpi-value" id="simPctChange">—</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">情景对比（日维度）</div>
                        </div>
                        <div class="card-body">
                            <div id="scenarioCompareChart" class="chart-container" style="min-height:280px"></div>
                            <div id="scenarioEmpty" style="display:none" class="empty-state-mini">
                                请先等待情景数据加载完成
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 受影响商品排名 -->
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">商品敏感度排名</div>
                        <div class="card-subtitle">按绝对变化量排序 · 仅反映模型响应</div>
                    </div>
                </div>
                <div class="card-body">
                    <div id="skuImpactList" class="sku-impact-list">
                        <div class="empty-state-mini">情景数据加载中…</div>
                    </div>
                </div>
            </div>
        `;

        // 懒加载情景数据
        if (DataLoader.isScenarioLoaded()) {
            scenarioReady = true;
            updateScenarioBadge(true);
            updateSimulation();
        } else {
            updateScenarioBadge('loading');
            startScenarioLoad();
        }
    }

    function startScenarioLoad() {
        updateScenarioBadge('loading');
        const chartEl = document.getElementById('scenarioImpactChart');
        if (chartEl) {
            chartEl.innerHTML = '<div class="shap-loading-state"><div class="shap-loading-spinner"></div><div class="shap-loading-text">正在加载情景数据（226,800 条）…</div><div class="shap-loading-sub">首次加载需数秒，之后会缓存</div></div>';
        }
        DataLoader.loadScenarios().then(() => {
            scenarioReady = true;
            updateScenarioBadge(true);
            updateSimulation();
        }).catch(e => {
            console.error('情景数据加载失败', e);
            updateScenarioBadge('error');
            if (chartEl) {
                chartEl.innerHTML = '<div class="shap-loading-state error"><div style="font-weight:600;color:var(--danger);margin-bottom:8px">情景数据加载失败</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">' + (e.message || String(e)) + '</div><button class="btn btn-secondary" onclick="ScenarioSimPage.retryScenarioLoad()">重试加载</button></div>';
            }
        });
    }

    function retryScenarioLoad() {
        startScenarioLoad();
    }

    function updateScenarioBadge(success) {
        const badge = document.getElementById('scenarioLoadBadge');
        if (!badge) return;
        if (success === true) {
            badge.textContent = '数据已加载';
            badge.className = 'data-badge real';
        } else if (success === 'loading') {
            badge.textContent = '加载中…';
            badge.className = 'data-badge sim';
        } else {
            badge.textContent = '加载失败';
            badge.className = 'data-badge sim';
        }
    }

    function updateParam(param, value) {
        params[param] = value;
        document.querySelectorAll(`.sim-option[data-param="${param}"]`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
        if (scenarioReady) updateSimulation();
    }

    function updateSimulation() {
        const data = DataLoader.getData();

        // 筛选 skuForecast 中的 baseline（observed = scenario_index 0）
        let skuFiltered = data.skuForecast;
        if (params.store !== 'all') {
            skuFiltered = skuFiltered.filter(d => d.store_name === params.store);
        }
        if (params.category !== 'all') {
            skuFiltered = skuFiltered.filter(d => d.category === params.category);
        }

        // baseline（来自 sku_forecast pred_lightgbm）
        const baselineByDate = {};
        const baselineBySku = {};
        skuFiltered.forEach(d => {
            if (!baselineByDate[d.date]) baselineByDate[d.date] = 0;
            baselineByDate[d.date] += d.pred_lightgbm;
            const key = d.product_id;
            if (!baselineBySku[key]) baselineBySku[key] = 0;
            baselineBySku[key] += d.pred_lightgbm;
        });

        // 情景：从 scenarioResults 找匹配的 prediction_id
        const pids = new Set(skuFiltered.map(d => d.prediction_id));
        const scenarioRows = DataLoader.getScenariosForPrediction ? [] : [];

        // 使用 scenarioIndex
        let scenarioByDate = {};
        let scenarioBySku = {};
        let count = 0;

        // 遍历每个 pid 找对应情景
        const idx = data.scenarioIndex;
        if (idx) {
            pids.forEach(pid => {
                const rows = idx[pid];
                if (!rows) return;
                // 找匹配当前参数的情景
                for (const row of rows) {
                    const tempMatch = params.temperature === 'observed'
                        ? row.temperature_id === 'observed'
                        : row.temperature_id === params.temperature;
                    const rainMatch = params.rain === 'observed'
                        ? row.rain_id === 'observed'
                        : row.rain_id === params.rain;
                    const holMatch = params.holiday === 'observed'
                        ? row.holiday_id === 'observed'
                        : row.holiday_id === params.holiday;

                    if (tempMatch && rainMatch && holMatch) {
                        // 从 pid 解析日期
                        const dateMatch = pid.match(/_d(\d{8})_/);
                        const skuMatch = pid.match(/_sku(\d+)/);
                        if (dateMatch && skuMatch) {
                            const date = dateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
                            const skuId = skuMatch[1];
                            const val = +row.simulated_prediction;

                            if (!scenarioByDate[date]) scenarioByDate[date] = 0;
                            scenarioByDate[date] += val;

                            if (!scenarioBySku[skuId]) scenarioBySku[skuId] = 0;
                            scenarioBySku[skuId] += val;
                            count++;
                        }
                        break;
                    }
                }
            });
        }

        const dates = Object.keys(baselineByDate).sort();
        const baselineVals = dates.map(d => baselineByDate[d] || 0);
        const scenarioVals = dates.map(d => scenarioByDate[d] || 0);

        const totalBaseline = baselineVals.reduce((s, v) => s + v, 0);
        const totalScenario = scenarioVals.reduce((s, v) => s + v, 0);
        const absChange = totalScenario - totalBaseline;
        const pctChange = totalBaseline > 0 ? absChange / totalBaseline * 100 : 0;

        // 更新 KPI
        const blEl = document.getElementById('simBaselineTotal');
        if (blEl) blEl.textContent = totalBaseline.toFixed(0) + ' 杯';
        const scEl = document.getElementById('simScenarioTotal');
        if (scEl) scEl.textContent = totalScenario.toFixed(0) + ' 杯';
        const abEl = document.getElementById('simAbsChange');
        if (abEl) {
            abEl.textContent = (absChange >= 0 ? '+' : '−') + Math.abs(absChange).toFixed(0) + ' 杯';
            abEl.style.color = absChange >= 0 ? 'var(--data-teal)' : 'var(--danger)';
        }
        const pcEl = document.getElementById('simPctChange');
        if (pcEl) {
            pcEl.textContent = (pctChange >= 0 ? '+' : '−') + Math.abs(pctChange).toFixed(1) + '%';
            pcEl.style.color = pctChange >= 0 ? 'var(--data-teal)' : 'var(--danger)';
        }

        // 更新图表
        const chartDom = document.getElementById('scenarioCompareChart');
        if (chartDom && dates.length > 0) {
            const dateLabels = dates.map((d, i) => i % 5 === 0 || i === dates.length - 1 ? d.slice(5) : '');

            if (charts.scenarioCompare) {
                charts.scenarioCompare.dispose();
            }

            charts.scenarioCompare = echarts.init(chartDom);
            charts.scenarioCompare.setOption({
                tooltip: { trigger: 'axis' },
                legend: { data: ['基线预测', '情景预测'], top: 0 },
                grid: { left: 50, right: 20, top: 30, bottom: 34 },
                xAxis: {
                    type: 'category',
                    name: '未来日期（月-日）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    data: dateLabels,
                    axisLabel: { color: 'var(--gray-500)', fontSize: 11 },
                    axisLine: { lineStyle: { color: 'var(--gray-200)' } }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    name: '预测日销量（杯）',
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    axisLabel: { color: 'var(--gray-500)', fontSize: 11 },
                    splitLine: { lineStyle: { color: 'var(--gray-100)' } }
                },
                series: [
                    {
                        name: '基线预测',
                        type: 'line',
                        data: baselineVals.map(v => +v.toFixed(1)),
                        smooth: false,
                        symbol: 'none',
                        lineStyle: { color: '#5D4037', width: 2 }
                    },
                    {
                        name: '情景预测',
                        type: 'line',
                        data: scenarioVals.map(v => +v.toFixed(1)),
                        smooth: false,
                        symbol: 'none',
                        lineStyle: { color: '#D4A574', width: 2, type: 'dashed' },
                        areaStyle: {
                            color: 'rgba(212, 165, 116, 0.1)'
                        }
                    }
                ]
            });
            ChartUtils.setupResize(chartDom, charts.scenarioCompare);
        }

        // 更新商品敏感度排名
        renderSkuImpact(baselineBySku, scenarioBySku);
    }

    function renderSkuImpact(baselineBySku, scenarioBySku) {
        const listDom = document.getElementById('skuImpactList');
        if (!listDom) return;

        const data = DataLoader.getData();
        const impacts = Object.keys(baselineBySku).map(skuId => {
            const base = baselineBySku[skuId] || 0;
            const scen = scenarioBySku[skuId] || 0;
            const diff = scen - base;
            return { skuId, base, scen, diff, absDiff: Math.abs(diff) };
        }).sort((a, b) => b.absDiff - a.absDiff).slice(0, 15);

        if (impacts.length === 0) {
            listDom.innerHTML = '<div class="empty-state-mini">无数据</div>';
            return;
        }

        listDom.innerHTML = impacts.map((item, i) => {
            const sku = data.skuList.find(s => s.product_id == item.skuId);
            const name = sku ? DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id) : DataLoader.getSkuDisplayName('', item.skuId);
            const cat = sku ? DataLoader.getCategoryDisplayName(sku.product_category) : '';
            const diffColor = item.diff >= 0 ? 'var(--data-teal)' : 'var(--danger)';
            const diffSign = item.diff >= 0 ? '+' : '−';
            const pctDiff = item.base > 0 ? item.diff / item.base * 100 : 0;

            return `
                <div class="sku-impact-item">
                    <div class="sku-impact-rank">${i + 1}</div>
                    <div class="sku-impact-info">
                        <div class="sku-impact-name">${name}</div>
                        <div class="sku-impact-cat">${cat}</div>
                    </div>
                    <div class="sku-impact-change" style="color:${diffColor}">
                        ${diffSign}${Math.abs(item.diff).toFixed(1)} 杯
                        <span style="opacity:0.7">(${pctDiff >= 0 ? '+' : '−'}${Math.abs(pctDiff).toFixed(1)}%)</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    return {
        render,
        updateParam,
        retryScenarioLoad
    };
})();
