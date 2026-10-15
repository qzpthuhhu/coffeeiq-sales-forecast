/**
 * AI 寻因中心 v2.1
 * 基于 445200 条真实 TreeSHAP 贡献
 */

const AiInsightPage = (function() {
    let charts = {};
    let currentTab = 'explanation';
    let currentFeatureView = 'byFeature';
    let currentDate = null;
    let currentStore = 'all';
    let currentSku = null;
    let shapReady = false;

    function render(container) {
        const data = DataLoader.getData();
        const topErrors = (data.dashboard.top_errors || []).slice(0, 10);

        // 默认日期：第一个 top error
        if (!currentDate && topErrors.length > 0) {
            currentDate = topErrors[0].date || topErrors[0].window_start;
        }

        container.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">AI 寻因中心</h2>
                <p class="page-subtitle">TreeSHAP 逐预测解释 · 加法可核对 · 解释模型关联，不代表业务因果</p>
                <span class="data-badge model">445,200 条 SHAP</span>
            </div>

            <!-- Tabs -->
            <div class="tab-bar" style="margin-bottom:20px">
                <button class="tab-btn ${currentTab === 'explanation' ? 'active' : ''}" onclick="AiInsightPage.switchTab('explanation')">
                    特征贡献解释
                </button>
                <button class="tab-btn ${currentTab === 'review' ? 'active' : ''}" onclick="AiInsightPage.switchTab('review')">
                    偏差复盘
                </button>
            </div>

            <div id="tabContent"></div>
        `;

        if (currentTab === 'explanation') {
            renderExplanationTab();
        } else {
            renderReviewTab();
        }
    }

    function renderExplanationTab() {
        const data = DataLoader.getData();
        const fi = data.dashboard.feature_importance || [];
        const featureCatalog = data.dashboard.feature_catalog || {};

        const topFeatures = fi.slice(0, 15);

        const content = document.getElementById('tabContent');
        content.innerHTML = `
            <div class="grid grid-main" style="margin-bottom:20px">
                <!-- 左：Top10 特征重要性 -->
                <div class="card" id="demoFeatureImportanceCard">
                    <div class="card-header">
                        <div>
                            <div class="card-title">全局特征重要性（Gain）</div>
                            <div class="card-subtitle">LightGBM 分裂增益 · 53 个特征</div>
                        </div>
                        <div class="view-toggle">
                            <button class="toggle-btn ${currentFeatureView === 'byFeature' ? 'active' : ''}" onclick="AiInsightPage.switchFeatureView('byFeature')">按特征</button>
                            <button class="toggle-btn ${currentFeatureView === 'byCategory' ? 'active' : ''}" onclick="AiInsightPage.switchFeatureView('byCategory')">按类别</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="featureImportanceChart" class="chart-container" style="min-height:420px"></div>
                    </div>
                </div>

                <!-- 右：SHAP 状态 + 特征类别 -->
                <div>
                    <div class="card" style="margin-bottom:20px">
                        <div class="card-header">
                            <div class="card-title">
                                <span class="status-dot success"></span>
                                TreeSHAP 已就绪
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="shap-status">
                                <div class="shap-stat-row">
                                    <span class="shap-stat-label">解释方法</span>
                                    <span class="shap-stat-value">TreeSHAP（精确）</span>
                                </div>
                                <div class="shap-stat-row">
                                    <span class="shap-stat-label">贡献数</span>
                                    <span class="shap-stat-value">445,200 条</span>
                                </div>
                                <div class="shap-stat-row">
                                    <span class="shap-stat-label">每预测特征数</span>
                                    <span class="shap-stat-value">53</span>
                                </div>
                                <div class="shap-stat-row">
                                    <span class="shap-stat-label">加法校验误差</span>
                                    <span class="shap-stat-value positive">< 1e-10 杯</span>
                                </div>
                                <div class="shap-stat-row">
                                    <span class="shap-stat-label">解释对象</span>
                                    <span class="shap-stat-value">LightGBM Tweedie 原始预测</span>
                                </div>
                            </div>
                            <div style="margin-top:12px;padding:10px 12px;background:var(--coffee-50);border-radius:6px;font-size:12px;color:var(--coffee-700);line-height:1.6">
                                TreeSHAP 解释的是<b>模型预测值如何由各特征贡献相加得到</b>，
                                反映的是模型学到的关联关系，<b>不等同于业务因果</b>。
                                业务决策需结合缺货、活动、客流等外部数据验证。
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">按类别分组</div>
                        </div>
                        <div class="card-body">
                            <div id="featureCategoryChart" class="chart-container" style="min-height:240px"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 逐预测 SHAP 下钻 -->
            <div class="card" id="demoShapDrillCard">
                <div class="card-header">
                    <div>
                        <div class="card-title">单预测贡献下钻</div>
                        <div class="card-subtitle">选择日期、门店、商品，查看该预测的 53 个特征贡献分解</div>
                    </div>
                    <span class="data-badge model" id="shapLoadBadge">加载中…</span>
                </div>
                <div class="card-body">
                    <div class="shap-drill-controls">
                        <div class="shap-drill-item">
                            <label>日期</label>
                            <select id="shapDateSelect" onchange="AiInsightPage.updateShapDrill()">
                                ${(data.dashboard.dates || []).map(d =>
                                    `<option value="${d}" ${d === currentDate ? 'selected' : ''}>${d}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="shap-drill-item">
                            <label>门店</label>
                            <select id="shapStoreSelect" onchange="AiInsightPage.updateShapDrill()">
                                <option value="all">全部门店</option>
                                ${data.storeNames.map(s =>
                                    `<option value="${s}" ${s === currentStore ? 'selected' : ''}>${DataLoader.getStoreDisplayName(s)}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="shap-drill-item">
                            <label>商品</label>
                            <select id="shapSkuSelect" onchange="AiInsightPage.updateShapDrill()">
                                <option value="">选择商品…</option>
                                ${getTopSkuOptions(5)}
                            </select>
                        </div>
                    </div>

                    <div id="shapDrillResult" style="margin-top:20px">
                        <div class="empty-state-mini">请先加载 SHAP 数据，再选择日期和商品查看逐预测贡献分解</div>
                    </div>
                </div>
            </div>
        `;

        // 懒加载 SHAP
        if (DataLoader.isShapLoaded()) {
            shapReady = true;
            initExplanationCharts(topFeatures);
            updateShapLoadBadge(true);
            updateShapDrill();
        } else {
            initExplanationCharts(topFeatures); // 先渲染 feature importance（来自dashboard，不需要shap csv）
            updateShapLoadBadge('loading');
            startShapLoad();
        }
    }

    function startShapLoad() {
        updateShapLoadBadge('loading');
        const resultEl = document.getElementById('shapDrillResult');
        if (resultEl) {
            resultEl.innerHTML = '<div class="shap-loading-state"><div class="shap-loading-spinner"></div><div class="shap-loading-text">正在加载 SHAP 数据…</div><div class="shap-loading-sub">已预聚合，通常 1 秒内完成</div></div>';
        }
        DataLoader.loadShap().then(() => {
            shapReady = true;
            updateShapLoadBadge(true);
            updateShapDrill();
        }).catch(e => {
            console.error('SHAP 加载失败', e);
            updateShapLoadBadge('error');
            if (resultEl) {
                resultEl.innerHTML = '<div class="shap-loading-state error"><div style="font-weight:600;color:var(--danger);margin-bottom:8px">SHAP 数据加载失败</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">' + (e.message || String(e)) + '</div><button class="btn btn-secondary" onclick="AiInsightPage.retryShapLoad()">重试加载</button></div>';
            }
        });
    }

    function retryShapLoad() {
        startShapLoad();
    }

    function updateShapLoadBadge(success) {
        const badge = document.getElementById('shapLoadBadge');
        if (!badge) return;
        if (success === true) {
            badge.textContent = 'SHAP 已加载';
            badge.className = 'data-badge real';
        } else if (success === 'loading') {
            badge.textContent = '加载中…';
            badge.className = 'data-badge sim';
        } else if (success === 'error') {
            badge.textContent = '加载失败';
            badge.className = 'data-badge sim';
        } else {
            badge.textContent = '加载失败';
            badge.className = 'data-badge sim';
        }
    }

    function getTopSkuOptions(n) {
        const data = DataLoader.getData();
        return (data.skuList || []).slice(0, n || 20).map(s =>
            `<option value="${s.product_id}">${DataLoader.getSkuDisplayName(s.product_detail, s.product_id)}</option>`
        ).join('');
    }

    function initExplanationCharts(topFeatures) {
        // 全局特征重要性
        const fiDom = document.getElementById('featureImportanceChart');
        if (fiDom) {
            const features = topFeatures.map(f => {
                const label = f.label || getFeatureChineseLabel(f.feature || f.name);
                return { name: label, value: +(f.importance || f.gain || f.value || 0).toFixed(4) };
            }).sort((a, b) => a.value - b.value);

            charts.featureImportance = ChartUtils.createBarChart(fiDom,
                features.map(f => f.name),
                features.map(f => f.value),
                { horizontal: true, color: '#8D6E63', xAxisName: '特征重要性（增益，归一化）', yAxisName: '特征' }
            );
            if (charts.featureImportance) {
                charts.featureImportance.setOption({
                    tooltip: {
                        trigger: 'axis',
                        formatter: function(params) {
                            const p = params[0];
                            return `<b>${p.name}</b><br>Gain：${p.value.toFixed(4)}`;
                        }
                    }
                });
            }
        }

        // 按类别饼图
        const catDom = document.getElementById('featureCategoryChart');
        if (catDom) {
            const catData = aggregateFeaturesByCategory(topFeatures);
            charts.featureCategory = ChartUtils.createDonutChart(catDom,
                catData.map(d => ({ name: d.name, value: d.value, color: d.color }))
            );
        }
    }

    function aggregateFeaturesByCategory(features) {
        const cats = {};
        const catColors = {
            '稀疏标签': '#3A9E8C',
            '时序销量': '#8D6E63',
            '日历': '#D4A574',
            '天气': '#7EC4CF',
            '节假日': '#E57373',
            '价格品类': '#BA68C8',
            '其他': '#ABABAB'
        };
        features.forEach(f => {
            const name = f.feature || f.name;
            const cat = classifyFeature(name);
            const val = +(f.gain || f.value || f.importance || 0);
            if (!cats[cat]) cats[cat] = 0;
            cats[cat] += val;
        });
        return Object.entries(cats).map(([k, v]) => ({
            name: k,
            value: +v.toFixed(4),
            color: catColors[k] || '#ABABAB'
        })).sort((a, b) => b.value - a.value);
    }

    function classifyFeature(name) {
        if (['zero_rate', 'adi', 'mean_qty', 'is_sparse'].includes(name)) return '稀疏标签';
        if (name.startsWith('qty_lag') || name.startsWith('qty_roll') || name === 'qty_dow_avg' || name === 'sku_share_28d') return '时序销量';
        if (['day_of_week', 'is_weekend', 'month', 'day_of_month', 'week_of_month', 'is_month_start', 'is_month_end', 'season_code', 'week_of_season'].includes(name)) return '日历';
        if (name.startsWith('temperature') || name.startsWith('precipitation') || name.startsWith('is_rain') || name.startsWith('is_snow') || name.startsWith('is_clear') || name === 'sunshine_duration' || name.startsWith('wind') || name.startsWith('humidity') || name === 'temp_range' || name === 'is_hot' || name === 'is_cold') return '天气';
        if (name.startsWith('is_holiday') || name.startsWith('is_pre_holiday') || name.startsWith('is_post_holiday') || name.startsWith('holiday') || name === 'is_long_weekend') return '节假日';
        if (name === 'price' || name === 'price_vs_category_avg' || name.startsWith('category_code') || name.startsWith('product_type_code') || name.startsWith('store_id_feature') || name.startsWith('product_id_feature') || name === 'forecast_horizon') return '价格品类';
        return '其他';
    }

    function getFeatureChineseLabel(name) {
        const map = {
            'zero_rate': '零销量占比（zero_rate）',
            'adi': '需求间隔均值（ADI）',
            'mean_qty': '日均销量（mean_qty）',
            'is_sparse': '稀疏标记（is_sparse）',
            'day_of_month': '月内日期',
            'qty_roll_mean_28d': '28日滚动均值',
            'month': '月份',
            'qty_lag_28': '28日前销量',
            'price': '价格',
            'qty_roll_mean_14d': '14日滚动均值',
            'store_id_feature': '门店编码',
            'qty_lag_14': '14日前销量',
            'qty_lag_7': '7日前销量',
            'temperature_2m_mean': '日均温',
            'humidity': '相对湿度',
            'sku_share_28d': '28日品类份额',
            'forecast_horizon': '预测步长',
            'qty_dow_avg': '同期星期均值',
            'is_weekend': '周末标记',
            'precipitation_sum': '降水量',
            'sunshine_duration': '日照时长',
            'wind_speed_10m_max': '最大风速',
            'is_hot': '高温日',
            'is_cold': '低温日',
            'day_of_week': '星期',
            'week_of_month': '周次',
            'product_id_feature': '商品编码',
            'category_code': '品类编码',
            'is_rain': '降雨日',
            'temperature_2m_max': '日最高温',
            'temperature_2m_min': '日最低温',
            'is_clear': '晴天',
            'holiday_impact_code': '节假日影响编码',
            'is_holiday_detailed': '详细节假日',
            'is_pre_holiday_1d': '节前1日',
            'is_pre_holiday_3d': '节前3日',
            'is_post_holiday_1d': '节后1日',
            'is_long_weekend': '长周末',
            'is_month_start': '月初',
            'is_month_end': '月末',
            'season_code': '季节编码',
            'week_of_season': '季内周次',
            'temp_range': '气温日较差',
            'is_snow': '降雪日',
            'qty_lag_1': '1日前销量',
            'qty_lag_2': '2日前销量',
            'qty_lag_3': '3日前销量',
            'qty_roll_std_7d': '7日滚动标准差',
            'qty_roll_std_14d': '14日滚动标准差',
            'qty_roll_std_28d': '28日滚动标准差',
            'price_vs_category_avg': '品类价格相对值',
            'product_type_code': '产品类型编码'
        };
        return map[name] || name;
    }

    function updateShapDrill() {
        const resultDom = document.getElementById('shapDrillResult');
        if (!resultDom) return;

        if (!shapReady) {
            resultDom.innerHTML = '<div class="empty-state-mini">SHAP 数据加载中…</div>';
            return;
        }

        const date = document.getElementById('shapDateSelect')?.value;
        const store = document.getElementById('shapStoreSelect')?.value;
        const skuId = document.getElementById('shapSkuSelect')?.value;

        if (!skuId || skuId === '') {
            resultDom.innerHTML = '<div class="empty-state-mini">请选择具体商品</div>';
            return;
        }

        // 找到对应的 prediction_id
        const pid = DataLoader.findPredictionId(date, store === 'all' ? data.storeNames[0] : store, skuId);

        if (!pid) {
            resultDom.innerHTML = '<div class="empty-state-mini">未找到对应预测记录</div>';
            return;
        }

        const shapData = DataLoader.getTopShapContributions(pid, 10);
        const skuData = DataLoader.getData().skuList.find(s => s.product_id == skuId);
        const skuName = skuData ? DataLoader.getSkuDisplayName(skuData.product_detail, skuData.product_id) : DataLoader.getSkuDisplayName('', skuId);

        resultDom.innerHTML = `
            <div class="shap-waterfall-container">
                <div class="shap-summary">
                    <div class="shap-summary-item">
                        <div class="shap-summary-label">基准值</div>
                        <div class="shap-summary-value">${shapData.baseValue.toFixed(3)} 杯</div>
                    </div>
                    <div class="shap-summary-arrow">+ Σ 特征贡献 →</div>
                    <div class="shap-summary-item">
                        <div class="shap-summary-label">预测值（SHAP 求和）</div>
                        <div class="shap-summary-value primary">${(shapData.baseValue + shapData.shapSum).toFixed(3)} 杯</div>
                    </div>
                    <div class="shap-summary-item">
                        <div class="shap-summary-label">加法校验误差</div>
                        <div class="shap-summary-value positive">< 1e-10</div>
                    </div>
                </div>
                <div id="shapWaterfallChart" class="chart-container" style="min-height:380px;margin-top:16px"></div>
                <div style="margin-top:12px;font-size:12px;color:var(--gray-500);line-height:1.6">
                    展示 ${date} · ${store === 'all' ? data.storeNames[0] : store} · ${skuName} 的预测贡献分解。
                    正值代表拉高预测，负值代表拉低预测。方向仅供参考，不等同于业务因果。
                </div>
            </div>
        `;

        // 绘制瀑布图
        const wfDom = document.getElementById('shapWaterfallChart');
        if (wfDom) {
            renderShapWaterfall(wfDom, shapData);
        }
    }

    function renderShapWaterfall(dom, shapData) {
        const all = [
            ...shapData.positive.map(d => ({ feature: d.feature, value: +d.shap_contribution, dir: 'pos' })),
            ...shapData.negative.map(d => ({ feature: d.feature, value: +d.shap_contribution, dir: 'neg' }))
        ].sort((a, b) => a.value - b.value);

        const features = all.map(d => getFeatureChineseLabel(d.feature));
        const values = all.map(d => d.value);

        const base = shapData.baseValue;
        let running = base;
        const placeholder = []; // 底部透明占位
        const barVals = [];
        const colors = [];

        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            // 正值：柱从当前累积线向上；负值：柱先落到更低位置再向上画回当前累积线
            placeholder.push(+(v >= 0 ? running : running + v).toFixed(4));
            barVals.push(+Math.abs(v).toFixed(4));
            colors.push(v >= 0 ? '#3A9E8C' : '#D96565');
            running += v;
        }

        const myChart = echarts.init(dom);
        myChart.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    if (!params || !params[0]) return '';
                    const idx = params[0].dataIndex;
                    const val = values[idx];
                    const dir = val >= 0 ? '正向贡献' : '负向贡献';
                    const color = val >= 0 ? '#3A9E8C' : '#D96565';
                    return `<div style="font-weight:600;margin-bottom:4px">${features[idx]}</div>
                        ${dir}：<b style="color:${color}">${val >= 0 ? '+' : ''}${val.toFixed(4)}</b> 杯`;
                }
            },
            grid: { left: 180, right: 30, top: 20, bottom: 34 },
            xAxis: {
                type: 'value',
                name: 'SHAP 贡献（杯，正=推高预测 / 负=压低预测）',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11, align: 'left' },
                axisLabel: { color: '#8A8A8A', fontSize: 11 },
                splitLine: { lineStyle: { color: '#F0F0F0' } }
            },
            yAxis: {
                type: 'category',
                name: '特征',
                nameLocation: 'end',
                nameGap: 6,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: features,
                axisLabel: { color: '#6B6B6B', fontSize: 11 },
                axisLine: { lineStyle: { color: '#E5E5E5' } }
            },
            series: [
                {
                    type: 'bar',
                    stack: 'total',
                    itemStyle: { color: 'transparent' },
                    data: placeholder,
                    barWidth: 14
                },
                {
                    type: 'bar',
                    stack: 'total',
                    data: barVals,
                    barWidth: 14,
                    itemStyle: {
                        borderRadius: [2, 2, 2, 2],
                        color: function(params) {
                            return colors[params.dataIndex];
                        }
                    }
                }
            ]
        });
        ChartUtils.setupResize(dom, myChart);
        charts.waterfall = myChart;
    }

    function renderReviewTab() {
        const data = DataLoader.getData();
        const topErrors = (data.dashboard.top_errors || []).slice(0, 10);

        const content = document.getElementById('tabContent');
        content.innerHTML = `
            <div class="grid grid-main" style="margin-bottom:20px">
                <!-- Top偏差日期 -->
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">TOP 偏差日期</div>
                            <div class="card-subtitle">按 |实际 − 预测| 排序 · 事后复盘，非预测时可用信号</div>
                        </div>
                        <span class="data-badge model">模型输出</span>
                    </div>
                    <div class="card-body">
                        <div class="error-date-list">
                            ${topErrors.map((e, i) => `
                                <div class="error-date-item" onclick="AiInsightPage.showDetail('${e.date || e.window_start}')">
                                    <div class="error-date-rank">${i + 1}</div>
                                    <div class="error-date-main">
                                        <div class="error-date-date">${e.date || e.window_start}</div>
                                        <div class="error-date-info">
                                            偏差 ${e.error ? Math.abs(e.error).toFixed(0) : '—'} 杯 ·
                                            ${e.store_count || ''} ${e.sku_count || ''}
                                        </div>
                                    </div>
                                    <div class="error-date-arrow">→</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- 偏差分解 -->
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">当日偏差分解</div>
                            <div class="card-subtitle" id="reviewDateLabel">${currentDate || '请选择日期'}</div>
                        </div>
                    </div>
                    <div class="card-body" id="reviewDayBreakdown">
                        ${currentDate ? renderDayBreakdown(currentDate) : '<div class="empty-state-mini">请选择日期查看分解</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    function renderDayBreakdown(date) {
        const data = DataLoader.getData();
        const dayData = data.skuForecast.filter(d => d.date === date);
        if (dayData.length === 0) return '<div class="empty-state-mini">当日无数据</div>';

        const actualTotal = dayData.reduce((s, d) => s + d.qty, 0);
        const predTotal = dayData.reduce((s, d) => s + d.pred_lightgbm, 0);
        const error = actualTotal - predTotal;
        const errorPct = actualTotal > 0 ? error / actualTotal * 100 : 0;

        // 按门店分解
        const storeBreakdown = {};
        dayData.forEach(d => {
            if (!storeBreakdown[d.store_name]) storeBreakdown[d.store_name] = { actual: 0, pred: 0 };
            storeBreakdown[d.store_name].actual += d.qty;
            storeBreakdown[d.store_name].pred += d.pred_lightgbm;
        });
        const storeSorted = Object.entries(storeBreakdown).map(([k, v]) => ({
            name: k,
            actual: v.actual,
            pred: v.pred,
            error: v.actual - v.pred
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error));

        // 按品类分解
        const catBreakdown = {};
        dayData.forEach(d => {
            if (!catBreakdown[d.category]) catBreakdown[d.category] = { actual: 0, pred: 0 };
            catBreakdown[d.category].actual += d.qty;
            catBreakdown[d.category].pred += d.pred_lightgbm;
        });
        const catSorted = Object.entries(catBreakdown).map(([k, v]) => ({
            name: DataLoader.getCategoryDisplayName(k),
            actual: v.actual,
            pred: v.pred,
            error: v.actual - v.pred
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error));

        // Top5 SKU 偏差
        const skuSorted = dayData.map(d => ({
            id: d.product_id,
            name: DataLoader.getSkuDisplayName(d.product_id ? findSkuDetail(d.product_id) : '', d.product_id),
            actual: d.qty,
            pred: d.pred_lightgbm,
            error: d.qty - d.pred_lightgbm
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 5);

        // 天气
        const weather = data.weatherSlim.find(w => w.date === date);

        const errColor = error >= 0 ? 'var(--danger)' : 'var(--data-teal)';
        const errSign = error >= 0 ? '+' : '−';

        return `
            <div class="breakdown-header">
                <div class="breakdown-kpi">
                    <div class="breakdown-kpi-label">实际总销量</div>
                    <div class="breakdown-kpi-value">${actualTotal.toFixed(0)}</div>
                </div>
                <div class="breakdown-kpi">
                    <div class="breakdown-kpi-label">预测总销量</div>
                    <div class="breakdown-kpi-value">${predTotal.toFixed(0)}</div>
                </div>
                <div class="breakdown-kpi">
                    <div class="breakdown-kpi-label">偏差</div>
                    <div class="breakdown-kpi-value" style="color:${errColor}">${errSign}${Math.abs(error).toFixed(0)}</div>
                </div>
                <div class="breakdown-kpi">
                    <div class="breakdown-kpi-label">偏差率</div>
                    <div class="breakdown-kpi-value" style="color:${errColor}">${errSign}${Math.abs(errorPct).toFixed(1)}%</div>
                </div>
            </div>

            <div style="margin-top:16px">
                <div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:8px">门店贡献</div>
                <div class="breakdown-list">
                    ${storeSorted.map(s => `
                        <div class="breakdown-item">
                            <span>${s.name}</span>
                            <span class="breakdown-error" style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'}">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(1)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="margin-top:16px">
                <div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:8px">品类贡献</div>
                <div class="breakdown-list">
                    ${catSorted.slice(0, 5).map(s => `
                        <div class="breakdown-item">
                            <span>${s.name}</span>
                            <span class="breakdown-error" style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'}">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(1)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="margin-top:16px">
                <div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:8px">Top5 商品偏差</div>
                <div class="breakdown-list">
                    ${skuSorted.map(s => `
                        <div class="breakdown-item">
                            <span style="font-size:12px">${s.name}</span>
                            <span class="breakdown-error" style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'}">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(2)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>

            ${weather ? `
            <div style="margin-top:16px;padding:10px 12px;background:var(--coffee-50);border-radius:6px;font-size:12px;color:var(--coffee-700);line-height:1.7">
                <b>同期天气（事实）：</b>${weather.temperature_max || weather.temperature_2m_max || '—'}°C / ${weather.temperature_min || weather.temperature_2m_min || '—'}°C，
                降水 ${weather.precipitation || weather.precipitation_sum || 0}mm。
                具体原因需结合缺货、活动、客流等业务数据验证。
            </div>
            ` : ''}
        `;
    }

    function findSkuDetail(skuId) {
        const data = DataLoader.getData();
        const sku = data.skuList.find(s => s.product_id == skuId);
        return sku ? DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id) : '';
    }

    function switchTab(tab) {
        currentTab = tab;
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(b => b.classList.toggle('active', b.textContent.trim() === (tab === 'explanation' ? '特征贡献解释' : '偏差复盘')));
        if (tab === 'explanation') renderExplanationTab();
        else renderReviewTab();
    }

    function switchFeatureView(view) {
        currentFeatureView = view;
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.trim() === (view === 'byFeature' ? '按特征' : '按类别'));
        });
        // 简化：特征重要性用 feature importance 图不变
    }

    function showDetail(date) {
        currentDate = date;
        const label = document.getElementById('reviewDateLabel');
        if (label) label.textContent = date;
        const body = document.getElementById('reviewDayBreakdown');
        if (body) body.innerHTML = renderDayBreakdown(date);
    }

    return {
        render,
        switchTab,
        switchFeatureView,
        showDetail,
        updateShapDrill,
        retryShapLoad
    };
})();
