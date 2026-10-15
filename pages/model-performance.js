/**
 * 模型效果中心 v2.1
 * 基于 direct-tweedie-sparse 新模型 + quality_report 多方法对比
 */

const ModelPerformancePage = (function() {
    let charts = {};
    let currentLevel = 'sku'; // sku / store_type / category / store / window
    let currentMetric = 'mae';

    function render(container) {
        const data = DataLoader.getData();
        const bt = data.summary.backtest;
        const comp = DataLoader.getOverallBaselineComparison();
        const windows = DataLoader.getWindowMetrics();

        // 模型 vs 最佳基线的提升
        const baselineBest = comp
            .filter(c => c.method !== 'lightgbm')
            .sort((a, b) => a.mae - b.mae)[0];
        const modelLightgbm = comp.find(c => c.method === 'lightgbm') || {};

        const maeImprove = baselineBest
            ? ((baselineBest.mae - modelLightgbm.mae) / baselineBest.mae * 100).toFixed(1)
            : 0;
        const wapeImprove = baselineBest
            ? (baselineBest.wape - modelLightgbm.wape).toFixed(2)
            : 0;
        const r2Improve = baselineBest
            ? (modelLightgbm.r2 - baselineBest.r2).toFixed(3)
            : 0;

        // 各层级当前模型指标
        const levelMetrics = buildLevelMetrics();

        container.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">模型效果中心</h2>
                <p class="page-subtitle">
                    当前模型：直接多步Tweedie + 稀疏标签 Global LightGBM · 5 窗口滚动回测 · 8,400 样本
                </p>
                <span class="data-badge model">LightGBM Tweedie</span>
            </div>

            <!-- 核心指标 + 版本对比 -->
            <div class="grid grid-main" style="margin-bottom:20px">
                <div class="card" id="demo-sevenLevelCard">
                    <div class="card-header">
                        <div>
                            <div class="card-title">当前模型核心指标</div>
                            <div class="card-subtitle">门店×SKU×日 · 35 天五窗口滚动回测</div>
                        </div>
                        <span class="data-badge model">模型输出</span>
                    </div>
                    <div class="card-body">
                        <div class="grid grid-3" style="gap:16px;margin-bottom:20px">
                            <div class="metric-hero">
                                <div class="metric-hero-label">MAE</div>
                                <div class="metric-hero-value">${bt.mae.toFixed(2)} <span class="unit">杯</span></div>
                                <div class="metric-hero-sub positive">比最佳基线 ↓ ${maeImprove}%</div>
                            </div>
                            <div class="metric-hero">
                                <div class="metric-hero-label">WAPE</div>
                                <div class="metric-hero-value">${bt.wape.toFixed(1)}%</div>
                                <div class="metric-hero-sub positive">比最佳基线 ↓ ${wapeImprove}pp</div>
                            </div>
                            <div class="metric-hero">
                                <div class="metric-hero-label">R²</div>
                                <div class="metric-hero-value">${bt.r2.toFixed(3)}</div>
                                <div class="metric-hero-sub positive">比最佳基线 ↑ ${r2Improve}</div>
                            </div>
                        </div>
                        <div class="grid grid-4" style="gap:12px">
                            <div class="mini-metric">
                                <div class="mini-metric-label">RMSE</div>
                                <div class="mini-metric-value">${bt.rmse.toFixed(2)}</div>
                            </div>
                            <div class="mini-metric">
                                <div class="mini-metric-label">方向命中</div>
                                <div class="mini-metric-value hit">${bt.directionAccuracy.toFixed(1)}%</div>
                            </div>
                            <div class="mini-metric">
                                <div class="mini-metric-label">P10-P90 覆盖</div>
                                <div class="mini-metric-value">${bt.intervalCoverage.toFixed(1)}%</div>
                            </div>
                            <div class="mini-metric">
                                <div class="mini-metric-label">区间均宽</div>
                                <div class="mini-metric-value">${bt.intervalMeanWidth.toFixed(2)} 杯</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card" id="demo-methodCompareCard">
                    <div class="card-header">
                        <div>
                            <div class="card-title">方法对比（overall 级）</div>
                            <div class="card-subtitle">当前模型 + 三个起点安全基线 · 均来自同窗口滚动回测质量表</div>
                        </div>
                        <span class="data-badge model">4 种当前方法</span>
                    </div>
                    <div class="card-body">
                        <div id="methodCompareChart" class="chart-container" style="min-height:300px"></div>
                        <div style="margin-top:12px;font-size:12px;color:var(--gray-500);line-height:1.6">
                            当前模型（LightGBM Tweedie 直接多步）在 MAE/WAPE/R² 上均优于三个起点安全基线；4 种方法均来自 quality_report 同一滚动回测窗口，口径一致。
                        </div>
                    </div>
                </div>
            </div>

            <!-- 分层指标矩阵 -->
            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div>
                        <div class="card-title">各层级精度一览</div>
                        <div class="card-subtitle">从门店×SKU×日到日总量，聚合层级越高精度通常越好</div>
                    </div>
                    <div class="level-tabs">
                        <button class="level-tab active" data-level="sku" onclick="ModelPerformancePage.switchLevel('sku')">SKU级</button>
                        <button class="level-tab" data-level="product_type" onclick="ModelPerformancePage.switchLevel('product_type')">产品类型级</button>
                        <button class="level-tab" data-level="category" onclick="ModelPerformancePage.switchLevel('category')">品类级</button>
                        <button class="level-tab" data-level="store" onclick="ModelPerformancePage.switchLevel('store')">门店级</button>
                        <button class="level-tab" data-level="window" onclick="ModelPerformancePage.switchLevel('window')">窗口级</button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="levelMetricsChart" class="chart-container" style="min-height:340px"></div>
                </div>
            </div>

            <!-- 基线对比明细表 -->
            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div>
                        <div class="card-title">基线方法对比（overall）</div>
                        <div class="card-subtitle">三个起点安全基线 vs 当前模型</div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="metric-table-wrap">
                        <table class="metric-table">
                            <thead>
                                <tr>
                                    <th>方法</th>
                                    <th>MAE（杯）</th>
                                    <th>RMSE（杯）</th>
                                    <th>WAPE</th>
                                    <th>R²</th>
                                    <th>方向命中</th>
                                    <th>±10% 命中</th>
                                    <th>±20% 命中</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${comp.sort((a, b) => a.mae - b.mae).map(c => `
                                    <tr class="${c.method === 'lightgbm' ? 'row-current' : ''}">
                                        <td>
                                            ${c.methodLabel}
                                            ${c.method === 'lightgbm' ? '<span class="data-badge model" style="margin-left:6px">当前</span>' : ''}
                                        </td>
                                        <td><code>${c.mae.toFixed(3)}</code></td>
                                        <td><code>${c.rmse.toFixed(3)}</code></td>
                                        <td><code>${c.wape.toFixed(2)}%</code></td>
                                        <td><code>${c.r2.toFixed(3)}</code></td>
                                        <td><code>${c.directionAccuracy.toFixed(1)}%</code></td>
                                        <td><code>${c.within10pct.toFixed(1)}%</code></td>
                                        <td><code>${c.within20pct.toFixed(1)}%</code></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 模型架构与效果说明 -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        <span class="status-dot success"></span>
                        模型架构与效果
                    </div>
                </div>
                <div class="card-body">
                    <div class="grid grid-2" style="gap:20px">
                        <div>
                            <h4 style="margin:0 0 12px;font-size:15px;color:var(--coffee-800)">核心设计</h4>
                            <ul style="margin:0;padding-left:20px;line-height:2;color:var(--gray-600);font-size:13px">
                                <li><b>直接多步</b>：一次性输出未来 7 天，消除递归误差累积</li>
                                <li><b>Tweedie 分布（variance power 1.3）</b>：更适配零值多、方差大的计数型需求</li>
                                <li><b>4 个稀疏标签</b>：zero_rate、adi、mean_qty、is_sparse，区分稀疏与稠密品</li>
                                <li><b>全局 LightGBM</b>：一个模型学全部门店商品，共享特征模式</li>
                                <li><b>TreeSHAP 精确解释</b>：每个预测可拆解到特征贡献</li>
                            </ul>
                        </div>
                        <div>
                             <h4 style="margin:0 0 12px;font-size:15px;color:var(--coffee-800)">回测结果（overall · 35 天五窗口）</h4>
                            <div class="improve-list">
                                <div class="improve-item">
                                    <div class="improve-label">MAE</div>
                                    <div class="improve-bar">
                                        <div class="improve-fill positive" style="width:65%"></div>
                                    </div>
                                    <div class="improve-value">2.411 杯</div>
                                </div>
                                <div class="improve-item">
                                    <div class="improve-label">WAPE</div>
                                    <div class="improve-bar">
                                        <div class="improve-fill positive" style="width:65%"></div>
                                    </div>
                                    <div class="improve-value">34.72%</div>
                                </div>
                                <div class="improve-item">
                                    <div class="improve-label">R²</div>
                                    <div class="improve-bar">
                                        <div class="improve-fill positive" style="width:66%"></div>
                                    </div>
                                    <div class="improve-value">0.661</div>
                                </div>
                                <div class="improve-item">
                                    <div class="improve-label">方向命中率</div>
                                    <div class="improve-bar">
                                        <div class="improve-fill positive" style="width:61%"></div>
                                    </div>
                                    <div class="improve-value">61.4%</div>
                                </div>
                                <div class="improve-item">
                                    <div class="improve-label">P10-P90 覆盖</div>
                                    <div class="improve-bar">
                                        <div class="improve-fill positive" style="width:80%"></div>
                                    </div>
                                    <div class="improve-value">80.6%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:16px;padding:12px;background:var(--coffee-50);border-radius:8px;font-size:12px;color:var(--coffee-700);line-height:1.7">
                        <b>注意：</b>上述指标为咖啡数据集 35 天滚动回测的 overall 结果，迁移到茶饮品牌需重新验证。方法对比区中的各基线与模型为同表同口径比较。P10-P90 区间为总体边际覆盖，不保证每个门店、SKU 或日都达到 80%。
                        SHAP 解释模型关联，不代表业务因果。What-if 情景为受控模型响应，不是因果或真实经营承诺。
                    </div>
                </div>
            </div>
        `;

        initCharts(comp, levelMetrics);
    }

    function buildLevelMetrics() {
        const ml = DataLoader.getData().summary.metricsByLevel || {};
        return {
            sku: ml.sku ? ml.sku.slice(0, 15) : [],
            product_type: ml.product_type || [],
            category: ml.category || [],
            store: ml.store || [],
            window: ml.window || []
        };
    }

    function initCharts(comp, levelMetrics) {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        // 1. 方法对比图（MAE 横向柱）
        const mcDom = document.getElementById('methodCompareChart');
        if (mcDom) {
            const sorted = [...comp].sort((a, b) => b.mae - a.mae);
            charts.methodCompare = ChartUtils.createBarChart(mcDom,
                sorted.map(c => c.methodLabel),
                sorted.map(c => +c.mae.toFixed(3)),
                {
                    horizontal: true,
                    xAxisName: 'MAE（平均绝对误差，杯，越低越好）',
                    yAxisName: '预测方法'
                }
            );
            if (charts.methodCompare) {
                charts.methodCompare.setOption({
                    tooltip: {
                        trigger: 'axis',
                        formatter: function(params) {
                            const p = params[0];
                            const item = sorted[p.dataIndex];
                            return `<div style="font-weight:600;margin-bottom:4px">${item.methodLabel}</div>
                                MAE：<b>${item.mae.toFixed(3)}</b> 杯<br>
                                WAPE：<b>${item.wape.toFixed(2)}%</b><br>
                                R²：<b>${item.r2.toFixed(3)}</b><br>
                                样本：${item.sampleCount}`;
                        }
                    }
                });
            }
        }

        // 2. 层级指标图
        renderLevelChart(levelMetrics, 'sku');
    }

    function renderLevelChart(levelMetrics, level) {
        const dom = document.getElementById('levelMetricsChart');
        if (!dom) return;

        if (charts.level) {
            charts.level.dispose();
            charts.level = null;
        }

        const data = levelMetrics[level] || [];
        const displayData = data.slice(0, 20);

        const categories = displayData.map(d => d.entity_name || d.entity_id);
        const maeVals = displayData.map(d => +d.mae.toFixed(3));
        const wapeVals = displayData.map(d => +(d.wape).toFixed(2));
        const r2Vals = displayData.map(d => +d.r2.toFixed(3));

        // X 轴维度名称随聚合层级切换，保证横坐标轴含义明确
        const levelAxisNames = {
            sku: '实体（门店 × SKU）',
            product_type: '实体（产品类型）',
            category: '实体（品类）',
            store: '实体（门店）',
            window: '实体（回测窗口起点）'
        };

        const myChart = echarts.init(dom);
        myChart.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    if (!params || !params[0]) return '';
                    const idx = params[0].dataIndex;
                    const item = displayData[idx];
                    return `<div style="font-weight:600;margin-bottom:4px">${item.entity_name || item.entity_id}</div>
                        MAE：<b>${item.mae.toFixed(3)}</b> 杯<br>
                        WAPE：<b>${item.wape.toFixed(2)}%</b><br>
                        R²：<b>${item.r2.toFixed(3)}</b><br>
                        样本：${item.sample_count}`;
                }
            },
            legend: {
                data: ['MAE（杯）', 'WAPE (%)', 'R² (×100)'],
                top: 0,
                textStyle: { fontSize: 12, color: 'var(--gray-600)' }
            },
            grid: { left: 60, right: 60, top: 40, bottom: 34 },
            xAxis: {
                type: 'category',
                name: levelAxisNames[level] || '实体',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                data: categories,
                axisLabel: {
                    fontSize: 11,
                    color: 'var(--gray-500)',
                    interval: 0,
                    rotate: categories.length > 10 ? 30 : 0
                },
                axisLine: { lineStyle: { color: 'var(--gray-200)' } }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'MAE（杯）与 WAPE（%）',
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    axisLabel: { color: 'var(--gray-500)', fontSize: 11 },
                    splitLine: { lineStyle: { color: 'var(--gray-100)' } }
                },
                {
                    type: 'value',
                    name: 'R²（决定系数，×100）',
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    axisLabel: { color: 'var(--gray-500)', fontSize: 11 },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: 'MAE（杯）',
                    type: 'bar',
                    data: maeVals,
                    barWidth: 12,
                    itemStyle: { color: 'var(--coffee-500)', borderRadius: [2, 2, 0, 0] }
                },
                {
                    name: 'WAPE (%)',
                    type: 'bar',
                    data: wapeVals,
                    barWidth: 12,
                    itemStyle: { color: 'var(--amber-500)', borderRadius: [2, 2, 0, 0] }
                },
                {
                    name: 'R² (×100)',
                    type: 'line',
                    yAxisIndex: 1,
                    data: r2Vals.map(v => v * 100),
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { color: 'var(--data-teal)', width: 2 },
                    itemStyle: { color: 'var(--data-teal)' }
                }
            ]
        });

        charts.level = myChart;
        ChartUtils.setupResize(dom, myChart);
    }

    function switchLevel(level) {
        currentLevel = level;
        document.querySelectorAll('.level-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === level);
        });
        const levelMetrics = buildLevelMetrics();
        renderLevelChart(levelMetrics, level);
    }

    function switchBaselineMetric() {} // 保留接口兼容，已改为表格展示

    return {
        render,
        switchLevel,
        switchBaselineMetric
    };
})();
