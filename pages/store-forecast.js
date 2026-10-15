/**
 * 门店销量预测页面 v2.1
 * 35天五窗口滚动回测 · P10/P90校准区间 · 稀疏标签
 */

const StoreForecastPage = (function() {
    let charts = {};
    let currentAnomalyDate = null;
    let selectedStore = 'all';

    function render(container) {
        const data = DataLoader.getData();
        selectedStore = App.getCurrentStore();

        container.innerHTML = `
            <!-- 门店切换 -->
            <div class="store-pills">
                <button class="store-pill ${selectedStore === 'all' ? 'active' : ''}" onclick="StoreForecastPage.switchStore('all')">全部门店</button>
                 ${data.storeNames.map(s => `
                     <button class="store-pill ${selectedStore === s ? 'active' : ''}" onclick="StoreForecastPage.switchStore('${s}')" title="${DataLoader.getStoreDisplayName(s)}｜${s}">${DataLoader.getStoreDisplayName(s)}</button>
                 `).join('')}
            </div>

             <!-- 回测核心指标 -->
             <div class="grid grid-4" style="margin-bottom:20px">
                 <div class="kpi-card">
                     <span class="data-badge real">真实数据</span>
                     <div class="kpi-label">回测期总销量</div>
                     <div class="kpi-value small" id="testTotalQty">—</div>
                     <div class="kpi-change neutral" id="testPredQty">预测 —</div>
                 </div>
                 <div class="kpi-card">
                     <span class="data-badge model">模型输出</span>
                     <div class="kpi-label">R² 决定系数</div>
                     <div class="kpi-value small" id="testR2" style="color:var(--success)">—</div>
                     <div class="kpi-change positive">35 天五窗口</div>
                 </div>
                 <div class="kpi-card">
                     <span class="data-badge model">模型输出</span>
                     <div class="kpi-label">MAE 平均绝对误差</div>
                     <div class="kpi-value small" id="testMAE" style="color:var(--coffee-700)">—</div>
                     <div class="kpi-change neutral">杯/天</div>
                 </div>
                 <div class="kpi-card">
                     <span class="data-badge model">模型输出</span>
                     <div class="kpi-label">WAPE 加权误差</div>
                     <div class="kpi-value small" id="testWAPE" style="color:var(--amber-600)">—</div>
                     <div class="kpi-change neutral">34.72% 全局</div>
                 </div>
             </div>

            <!-- 主预测图 -->
            <div class="card" style="margin-bottom:20px">
                 <div class="card-header">
                     <div>
                          <div class="card-title">实际销量 vs 点预测</div>
                         <div class="card-subtitle">五窗口滚动回测 · 2023-05-27 ~ 06-30 · 35 天 · 历史回测，不是未来预测</div>
                     </div>
                     <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
                         <span class="data-badge real">真实数据</span>
                         <span class="data-badge model">LightGBM Tweedie</span>
                     </div>
                 </div>
                 <div class="card-body">
                     <div id="forecastChart" class="chart-container large"></div>
                 </div>
                  <div class="card-footer">
                      <b>点击数据点</b>查看当日诊断详情。
                  </div>
             </div>

            <!-- 稀疏概览 + 误差分布 -->
            <div class="grid grid-2" style="margin-bottom:20px">
                 <div class="card">
                     <div class="card-header">
                          <div class="card-title">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                              </svg>
                              稀疏需求商品
                           </div>
                           <span class="data-badge model">模型标签</span>
                     </div>
                     <div class="card-body">
                         <div id="sparseInfo" class="sparse-info-box">
                             <div class="sparse-stat">
                                 <div class="sparse-stat-value" id="sparseCount">—</div>
                                 <div class="sparse-stat-label">稀疏门店商品组合</div>
                             </div>
                             <div class="sparse-stat">
                                 <div class="sparse-stat-value" id="sparseRatio">—</div>
                                 <div class="sparse-stat-label">占比（240 个组合中）</div>
                             </div>
                             <div class="sparse-stat">
                                 <div class="sparse-stat-value">4 个</div>
                                 <div class="sparse-stat-label">稀疏标签特征</div>
                             </div>
                         </div>
                         <div style="margin-top:12px;font-size:12px;color:var(--gray-600);line-height:1.8">
                             <div>• <b>zero_rate</b>：零销量天数占比，越高越稀疏</div>
                             <div>• <b>ADI</b>（Average Demand Interval）：非零需求间隔均值，越大越间断</div>
                             <div>• <b>mean_qty</b>：日均销量，稀疏品通常 < 1 杯/天</div>
                             <div>• <b>is_sparse</b>：zero_rate > 0.5 或 ADI > 2.0 标记为稀疏</div>
                         </div>
                         <div class="divider"></div>
                         <div style="font-size:12px;color:var(--coffee-700)">
                             稀疏标签仅使用首个预测起点（2023-05-27）前的数据计算，起点安全，无泄漏。
                         </div>
                     </div>
                 </div>

                  <div class="card">
                      <div class="card-header">
                          <div class="card-title">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M3 3v18h18"/>
                                  <path d="M7 16l4-4 4 4 6-6"/>
                              </svg>
                              误差分布
                          </div>
                          <span class="data-badge model">模型输出</span>
                      </div>
                     <div class="card-body">
                         <div id="errorChart" class="chart-container" style="min-height:280px"></div>
                     </div>
                 </div>
             </div>

            <!-- 异常日期 -->
            <div class="card" id="anomalyTableCard">
                <div class="card-header">
                    <div class="card-title">
                        <span class="status-dot warning"></span>
                        偏差较大日期
                    </div>
                    <span class="badge badge-warning">偏差 > 5%</span>
                </div>
                <div class="card-body">
                    <div class="table-container">
                        <table class="data-table anomaly-table" id="anomalyTable">
                            <thead>
                                <tr>
                                    <th>日期</th>
                                    <th class="hide-mobile">窗口</th>
                                    <th class="num">实际销量</th>
                                    <th class="num">点预测</th>
                                    <th class="num">偏差率</th>
                                    <th class="hide-mobile">步长</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 诊断浮层 -->
            <div class="modal-overlay" id="anomalyModal" onclick="if(event.target===this) StoreForecastPage.closeModal()">
                <div class="modal anomaly-modal">
                    <div class="modal-header">
                        <div>
                            <div class="modal-title" id="modalTitle">异常诊断</div>
                            <div style="font-size:12px;color:var(--gray-500);margin-top:2px" id="modalSubtitle"></div>
                        </div>
                        <button class="modal-close" onclick="StoreForecastPage.closeModal()" aria-label="关闭">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body" id="modalBody"></div>
                </div>
            </div>
        `;

        updateData();
    }

    function switchStore(store) {
        App.onStoreChange(store);
    }

    function updateData() {
        const data = DataLoader.getData();
        const series = DataLoader.getForecastSeries(selectedStore, 'all', 'all');

        const dates = series.dates;
        const actual = series.actuals;
        const predicted = series.predictions;
        const errors = dates.map((d, i) => actual[i] - predicted[i]);

        // 计算指标
        const totalActual = actual.reduce((a, b) => a + b, 0);
        const totalPred = predicted.reduce((a, b) => a + b, 0);
        const metrics = DataLoader.calcForecastMetrics(dates, actual, predicted);

        // 更新KPI
        const el = id => document.getElementById(id);
        if (el('testTotalQty')) el('testTotalQty').textContent = totalActual.toLocaleString() + ' 杯';
        if (el('testPredQty')) el('testPredQty').textContent = `预测 ${totalPred.toFixed(0)} 杯 · 偏差 ${((totalPred - totalActual) / totalActual * 100).toFixed(1)}%`;
        if (el('testR2')) el('testR2').textContent = metrics.r2.toFixed(3);
        if (el('testMAE')) el('testMAE').textContent = metrics.mae.toFixed(1) + ' 杯';
        if (el('testWAPE')) el('testWAPE').textContent = metrics.wape.toFixed(1) + '%';

        // 稀疏统计
        const skuFiltered = selectedStore === 'all'
            ? data.skuForecast
            : data.skuForecast.filter(d => d.store_name === selectedStore);
        const sparseSkus = new Set(
            skuFiltered.filter(d => d.is_sparse === 1 || d.is_sparse === '1').map(d => d.store_id + '_' + d.product_id)
        );
        const totalCombos = new Set(skuFiltered.map(d => d.store_id + '_' + d.product_id)).size;
        if (el('sparseCount')) el('sparseCount').textContent = sparseSkus.size;
        if (el('sparseRatio')) el('sparseRatio').textContent = (sparseSkus.size / totalCombos * 100).toFixed(1) + '%';

        // 主预测图
        const forecastDom = document.getElementById('forecastChart');
        if (forecastDom) {
            Object.values(charts).forEach(c => c && c.dispose && c.dispose());
            charts = {};

            const dateLabels = dates.map((d, i) => {
                // 35天每5天显示一次标签
                if (i === 0 || i === dates.length - 1 || i % 5 === 0) return d.slice(5);
                return '';
            });

            charts.forecast = ChartUtils.createForecastLineChart(
                forecastDom, dateLabels, actual, predicted,
                series.p10, series.p50, series.p90,
                { yAxisName: '销量（杯）' }
            );

            // 异常点标记
            const anomalyIdx = [];
            dates.forEach((d, i) => {
                if (actual[i] > 0 && Math.abs(errors[i]) / actual[i] > 0.05) anomalyIdx.push(i);
            });
            if (anomalyIdx.length > 0 && charts.forecast) {
                charts.forecast.setOption({
                    series: [
                        {
                            name: '实际销量',
                            markPoint: {
                                symbol: 'pin',
                                symbolSize: 36,
                                label: {
                                    color: '#fff',
                                    fontSize: 9,
                                    fontWeight: 600,
                                    formatter: p => {
                                        const v = errors[p.dataIndex];
                                        const pct = Math.abs(v) / actual[p.dataIndex] * 100;
                                        return pct.toFixed(0) + '%';
                                    }
                                },
                                itemStyle: { color: '#D96565' },
                                data: anomalyIdx.map(i => ({
                                    xAxis: i, yAxis: actual[i], value: dates[i]
                                }))
                            }
                        },
                        { name: '预测销量' }
                    ]
                });
            }

            // 点击事件
            charts.forecast.on('click', function(params) {
                if (params.componentType === 'series') {
                    const name = params.seriesName || '';
                    if (name.indexOf('区间') >= 0 || name.indexOf('上界') >= 0 || name.indexOf('下界') >= 0 || name.indexOf('P50') >= 0) return;
                    const idx = params.dataIndex;
                    if (idx >= 0 && idx < dates.length) {
                        showAnomalyDetail(dates[idx]);
                    }
                } else if (params.componentType === 'markPoint' && params.value) {
                    showAnomalyDetail(params.value);
                }
            });
        }

        // 误差分布
        const errorDom = document.getElementById('errorChart');
        if (errorDom) {
            const errorPcts = errors.map((e, i) => actual[i] > 0 ? (e / actual[i]) * 100 : 0);
            const buckets = [-30, -20, -10, -5, 0, 5, 10, 20, 30];
            const bucketLabels = ['-30%~-20%', '-20%~-10%', '-10%~-5%', '-5%~0%', '0%~5%', '5%~10%', '10%~20%', '20%~30%'];
            const counts = new Array(bucketLabels.length).fill(0);
            errorPcts.forEach(e => {
                for (let i = 0; i < buckets.length - 1; i++) {
                    if (e >= buckets[i] && e < buckets[i + 1]) { counts[i]++; break; }
                }
            });

            charts.error = echarts.init(errorDom);
            charts.error.setOption({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: 50, right: 20, bottom: 34, top: 20 },
                xAxis: {
                    type: 'category',
                    name: '点预测相对误差区间 (预测−实际)/实际（%）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    data: bucketLabels,
                    axisLabel: { color: 'var(--gray-500)', fontSize: 10, rotate: 30 },
                    axisLine: { lineStyle: { color: 'var(--gray-200)' } }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    name: '落入区间的样本天数（天）',
                    nameTextStyle: { color: 'var(--gray-400)', fontSize: 11 },
                    axisLabel: { color: 'var(--gray-500)', fontSize: 11 },
                    splitLine: { lineStyle: { color: 'var(--gray-100)' } }
                },
                series: [{
                    type: 'bar',
                    data: counts.map((v, i) => ({
                        value: v,
                        itemStyle: {
                            color: i < 4 ? '#D96565' : (i === 4 || i === 5 ? '#5BA67A' : '#E08A5C'),
                            borderRadius: [4, 4, 0, 0]
                        }
                    })),
                    barWidth: '60%'
                }]
            });
            ChartUtils.setupResize(errorDom, charts.error);
        }

        // 异常日期表
        renderAnomalyTable(dates, actual, predicted, errors);
    }

    function renderAnomalyTable(dates, actual, predicted, errors) {
        const tbody = document.querySelector('#anomalyTable tbody');
        if (!tbody) return;

        const anomalies = [];
        dates.forEach((d, i) => {
            if (actual[i] > 0 && Math.abs(errors[i]) / actual[i] > 0.05) {
                // 找窗口起点
                const row = DataLoader.getData().skuForecast.find(r => r.date === d);
                anomalies.push({
                    date: d,
                    actual: actual[i],
                    pred: predicted[i],
                    error: errors[i],
                    pct: errors[i] / actual[i] * 100,
                    origin: row ? row.forecast_origin : '—',
                    horizon: row ? row.horizon_day : '—'
                });
            }
        });
        anomalies.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

        tbody.innerHTML = anomalies.slice(0, 15).map(a => {
            const isOver = a.error < 0; // 预测低于实际 = 低估 → 正误差
            const errColor = Math.abs(a.pct) > 15 ? 'var(--danger)' : 'var(--warning)';
            return `
                <tr>
                    <td><b>${a.date}</b></td>
                    <td class="hide-mobile">${a.origin}</td>
                    <td class="num">${a.actual.toFixed(0)}</td>
                    <td class="num">${a.pred.toFixed(0)}</td>
                    <td class="num" style="color:${errColor};font-weight:600;font-family:'JetBrains Mono',monospace">
                        ${a.pct >= 0 ? '+' : '−'}${Math.abs(a.pct).toFixed(1)}%
                    </td>
                    <td class="hide-mobile">T+${a.horizon}</td>
                    <td>
                        <button class="link-btn" onclick="StoreForecastPage.showAnomalyDetail('${a.date}')">查看诊断</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (anomalies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray-400)">无偏差超过 5% 的日期</td></tr>';
        }
    }

    function showAnomalyDetail(date) {
        currentAnomalyDate = date;
        const data = DataLoader.getData();
        const modal = document.getElementById('anomalyModal');
        const title = document.getElementById('modalTitle');
        const subtitle = document.getElementById('modalSubtitle');
        const body = document.getElementById('modalBody');

        if (!modal || !body) return;

        // 当日 SKU 预测
        const dayData = data.skuForecast.filter(d => d.date === date &&
            (selectedStore === 'all' || d.store_name === selectedStore));
        if (dayData.length === 0) return;

        const actualTotal = dayData.reduce((s, d) => s + d.qty, 0);
        const predTotal = dayData.reduce((s, d) => s + d.pred_lightgbm, 0);
        const error = actualTotal - predTotal;
        const pct = actualTotal > 0 ? error / actualTotal * 100 : 0;
        const isUnder = error > 0; // 实际 > 预测 → 低估

        // 门店贡献
        const byStore = {};
        dayData.forEach(d => {
            if (!byStore[d.store_name]) byStore[d.store_name] = { actual: 0, pred: 0 };
            byStore[d.store_name].actual += d.qty;
            byStore[d.store_name].pred += d.pred_lightgbm;
        });
        const storeRank = Object.entries(byStore).map(([k, v]) => ({
            name: k, actual: v.actual, pred: v.pred, error: v.actual - v.pred
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error));

        // 品类贡献
        const byCat = {};
        dayData.forEach(d => {
            if (!byCat[d.category]) byCat[d.category] = { actual: 0, pred: 0 };
            byCat[d.category].actual += d.qty;
            byCat[d.category].pred += d.pred_lightgbm;
        });
        const catRank = Object.entries(byCat).map(([k, v]) => ({
            name: DataLoader.getCategoryDisplayName(k),
            actual: v.actual, pred: v.pred, error: v.actual - v.pred
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error));

        // Top SKU
        const skuRank = dayData.map(d => ({
            id: d.product_id,
            name: DataLoader.getSkuDisplayName(findSkuDetail(d.product_id), d.product_id),
            actual: d.qty,
            pred: d.pred_lightgbm,
            error: d.qty - d.pred_lightgbm,
            sparse: d.is_sparse
        })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 6);

        // 天气
        const weather = data.weatherSlim.find(w => w.date === date);

        // 窗口/步长信息
        const origins = [...new Set(dayData.map(d => d.forecast_origin))];
        const horizons = [...new Set(dayData.map(d => d.horizon_day))];

        title.textContent = `${date} 异常诊断`;
        subtitle.textContent = `${isUnder ? '实际高于预测（低估）' : '预测高于实际（高估）'} · ${origins.length} 个窗口 · 样本 ${dayData.length} 条`;

        body.innerHTML = `
            <div class="anomaly-kpis">
                <div class="anomaly-kpi">
                    <div class="anomaly-kpi-label">实际总销量</div>
                    <div class="anomaly-kpi-value">${actualTotal.toFixed(0)} 杯</div>
                </div>
                <div class="anomaly-kpi">
                    <div class="anomaly-kpi-label">预测总销量</div>
                    <div class="anomaly-kpi-value">${predTotal.toFixed(0)} 杯</div>
                </div>
                <div class="anomaly-kpi">
                    <div class="anomaly-kpi-label">绝对偏差</div>
                    <div class="anomaly-kpi-value" style="color:${pct >= 0 ? 'var(--danger)' : 'var(--data-teal)'}">
                        ${error >= 0 ? '+' : '−'}${Math.abs(error).toFixed(0)} 杯
                    </div>
                </div>
                <div class="anomaly-kpi">
                    <div class="anomaly-kpi-label">偏差率</div>
                    <div class="anomaly-kpi-value" style="color:${pct >= 0 ? 'var(--danger)' : 'var(--data-teal)'}">
                        ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%
                    </div>
                </div>
            </div>

            <div class="divider"></div>

            <div class="anomaly-sections">
                <div class="anomaly-section">
                    <h4>门店贡献</h4>
                    ${storeRank.map(s => `
                        <div class="breakdown-item">
                            <span>${s.name}</span>
                            <span style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'};font-weight:600;font-family:'JetBrains Mono',monospace">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(1)}
                            </span>
                        </div>
                    `).join('')}
                </div>
                <div class="anomaly-section">
                    <h4>品类贡献 Top5</h4>
                    ${catRank.slice(0, 5).map(s => `
                        <div class="breakdown-item">
                            <span>${s.name}</span>
                            <span style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'};font-weight:600;font-family:'JetBrains Mono',monospace">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(1)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="divider"></div>

            <div class="anomaly-section">
                <h4>Top6 商品偏差</h4>
                <div class="sku-error-list">
                    ${skuRank.map(s => `
                        <div class="sku-error-item">
                            <div>
                                <div class="sku-error-name">${s.name}</div>
                                <div class="sku-error-meta">
                                    实际 ${s.actual.toFixed(0)} · 预测 ${s.pred.toFixed(1)}
                                    ${s.sparse ? '<span class="sparse-tag">稀疏</span>' : ''}
                                </div>
                            </div>
                            <div style="color:${s.error >= 0 ? 'var(--danger)' : 'var(--data-teal)'};font-weight:600;font-family:'JetBrains Mono',monospace">
                                ${s.error >= 0 ? '+' : '−'}${Math.abs(s.error).toFixed(2)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="divider"></div>

            <div class="anomaly-evidence">
                <h4>证据与说明</h4>
                <div class="evidence-list">
                    ${weather ? `
                    <div class="evidence-item">
                        <span class="evidence-dot real"></span>
                        <div>
                            <div class="evidence-title">同期天气（事实）</div>
                            <div class="evidence-desc">
                                最高 ${weather.temperature_max || weather.temperature_2m_max || '—'}°C /
                                最低 ${weather.temperature_min || weather.temperature_2m_min || '—'}°C /
                                降水 ${weather.precipitation || weather.precipitation_sum || 0}mm
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="evidence-item">
                        <span class="evidence-dot model"></span>
                        <div>
                            <div class="evidence-title">回测窗口与步长</div>
                            <div class="evidence-desc">
                                当日数据来自 ${origins.length} 个起点窗口（${origins.join('、')}），
                                步长 T+${horizons.sort((a,b)=>a-b).join('/')}
                            </div>
                        </div>
                    </div>
                    <div class="evidence-item">
                        <span class="evidence-dot sim"></span>
                        <div>
                            <div class="evidence-title">结论边界</div>
                            <div class="evidence-desc">
                                偏差分解为模型输出层面的统计归因，不等同于业务因果。
                                具体原因需结合缺货、活动、客流、营业时间等业务数据验证。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    function findSkuDetail(skuId) {
        const data = DataLoader.getData();
        const sku = data.skuList.find(s => s.product_id == skuId);
        return sku ? DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id) : '';
    }

    function closeModal() {
        const modal = document.getElementById('anomalyModal');
        if (modal) modal.classList.remove('active');
    }

    function getCurrentAnomalyDate() {
        return currentAnomalyDate;
    }

    return {
        render,
        switchStore,
        showAnomalyDetail,
        closeModal,
        getCurrentAnomalyDate
    };
})();
