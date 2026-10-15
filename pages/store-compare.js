/**
 * 多门店对比页面
 */

const StoreComparePage = (function() {
    let charts = {};
    let accMetric = 'r2';

    function switchAccMetric(metric) {
        accMetric = metric;
        if (charts.accuracy && charts.accuracy._render) {
            charts.accuracy._render(metric);
        }
    }

    function render(container) {
        const data = DataLoader.getData();
        const stores = data.storeNames;

        container.innerHTML = `
             <div class="card" style="margin-bottom:20px">
                 <div class="card-header">
                     <div>
                         <div class="card-title">门店描述性特征对比</div>
                         <div class="card-subtitle">3 家纽约门店 · 基于 181 天历史数据的可复现描述性指标</div>
                     </div>
                     <div style="display:flex;gap:6px;align-items:center">
                         <span class="data-badge data">真实数据</span>
                         <span class="badge badge-default" style="font-size:11px">描述性关联，不代表因果</span>
                     </div>
                 </div>
                 <div class="card-body">
                     <div class="grid grid-2" style="gap:16px">
                         <div>
                             <div id="storeRadarChart" class="chart-container" style="min-height:340px"></div>
                             <div style="font-size:11px;color:var(--gray-500);text-align:center;margin-top:4px">雷达值为透明归一化（各维度线性映射到 0–100），原始值见右侧对照表</div>
                         </div>
                         <div class="table-container">
                             <table class="data-table" id="radarRawTable">
                                 <thead>
                                     <tr>
                                         <th>指标</th>
                                          <th class="num">阿斯托利亚店</th>
                                          <th class="num">地狱厨房店</th>
                                          <th class="num">曼哈顿下城店</th>
                                     </tr>
                                 </thead>
                                 <tbody id="radarRawBody"></tbody>
                             </table>
                         </div>
                     </div>
                 </div>
                 <div class="card-footer">
                     数据来源：181 天历史交易数据（2023-01-01 ~ 2023-06-30）。相关系数基于 Pearson，仅描述线性关联强弱，不代表因果关系。
                 </div>
             </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">销量规模对比</div>
                    </div>
                    <div class="card-body">
                        <div id="salesCompareChart" class="chart-container" style="min-height:280px"></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">热销品类结构</div>
                    </div>
                    <div class="card-body">
                        <div id="categoryStructureChart" class="chart-container" style="min-height:280px"></div>
                    </div>
                </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">小时分布 · 高峰时段对比</div>
                    </div>
                    <div class="card-body">
                        <div id="hourlyCompareChart" class="chart-container" style="min-height:280px"></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">星期效应 · 周末 vs 工作日</div>
                    </div>
                    <div class="card-body">
                        <div id="dowCompareChart" class="chart-container" style="min-height:280px"></div>
                    </div>
                </div>
            </div>

             <div class="card" style="margin-bottom:20px">
                 <div class="card-header">
                     <div>
                         <div class="card-title">预测精度对比</div>
                         <div class="card-subtitle">测试期 2023-06-24 ~ 06-30 · 门店×SKU×日粒度，n=560 / 店</div>
                     </div>
                     <div style="display:flex;gap:6px;align-items:center">
                         <span class="data-badge model">模型输出</span>
                         <select id="accMetricSelect" onchange="StoreComparePage.switchAccMetric(this.value)" style="padding:4px 8px;border:1px solid var(--gray-200);border-radius:6px;background:var(--surface-bg);font-size:12px;color:var(--gray-700);cursor:pointer">
                             <option value="r2">R²</option>
                             <option value="mae">MAE (杯)</option>
                             <option value="hit20">±20% 命中率</option>
                         </select>
                     </div>
                 </div>
                 <div class="card-body">
                     <div id="accuracyCompareChart" class="chart-container" style="min-height:260px"></div>
                     <div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--gray-200)">
                         <div style="font-size:12px;color:var(--gray-600);font-weight:600;margin-bottom:8px">门店日级参考（7 天样本，小样本限制）</div>
                         <div class="table-container">
                             <table class="data-table" id="dailyAccTable">
                                 <thead>
                                      <tr>
                                          <th>门店</th>
                                          <th class="num">门店日级 R²</th>
                                          <th class="num">门店日级 MAE</th>
                                          <th class="num">WAPE</th>
                                          <th class="num hide-mobile">样本天数</th>
                                      </tr>
                                 </thead>
                                 <tbody id="dailyAccBody"></tbody>
                             </table>
                         </div>
                         <div style="font-size:11px;color:var(--gray-500);margin-top:6px">
                             WAPE = Σ|实际 − 预测| / Σ实际。门店日级仅 7 个样本，R² 波动大，仅作参考，不代表模型整体能力。
                         </div>
                     </div>
                 </div>
             </div>

             <div class="grid grid-2">
                 <div class="card">
                    <div class="card-header">
                         <div class="card-title">商品结构差异</div>
                    </div>
                    <div class="card-body">
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                     <tr>
                                         <th>门店</th>
                                          <th class="num">商品数</th>
                                          <th class="num hide-mobile">头部商品集中度</th>
                                         <th>主力品类</th>
                                          <th class="hide-mobile">特色商品</th>
                                     </tr>
                                </thead>
                                <tbody>
                                    ${stores.map(store => {
                                        const storeSkus = data.skuPredSummary.filter(s => s.store_name === store);
                                        const totalQty = storeSkus.reduce((s, d) => s + d.actual_total, 0);
                                        const top5Qty = storeSkus.slice(0, 5).reduce((s, d) => s + d.actual_total, 0);
                                        const concentration = totalQty > 0 ? (top5Qty / totalQty * 100).toFixed(1) : 0;
                                        return `
                                             <tr>
                                                 <td style="font-weight:600" title="${DataLoader.getStoreDisplayName(store)}｜${store}">${DataLoader.getStoreDisplayName(store)}</td>
                                                 <td class="num">${storeSkus.length}</td>
                                                 <td class="num hide-mobile">${concentration}%</td>
                                                 <td><span class="tag amber">咖啡</span> <span class="tag">现制茶饮</span></td>
                                                 <td class="hide-mobile" style="font-size:12px;color:var(--gray-600)" title="${DataLoader.getProductTypeDisplayName(storeSkus[0]?.product_type || '—')}｜${storeSkus[0]?.product_type || '—'}">${DataLoader.getProductTypeDisplayName(storeSkus[0]?.product_type || '—')}</td>
                                             </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        initCharts();
    }

    function initCharts() {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        const data = DataLoader.getData();
        const stores = data.storeNames;

        // 1. 门店描述性特征雷达 + 原始值对照表
        // 真实可复现数据：基于 181 天历史交易
        const storeFeatureData = {
            'Astoria': { skuCount: 79, avgDailyQty: 392.215, weekendRatio: 0.9791, tempCorrAbs: 0.7537, rainCorrAbs: 0.0461 },
            "Hell's Kitchen": { skuCount: 80, avgDailyQty: 396.337, weekendRatio: 0.9883, tempCorrAbs: 0.7741, rainCorrAbs: 0.0942 },
            'Lower Manhattan': { skuCount: 80, avgDailyQty: 396.365, weekendRatio: 0.9888, tempCorrAbs: 0.7633, rainCorrAbs: 0.0030 }
        };

        // 透明归一化：每个维度线性映射到 [0, 100]
        function normalize(values) {
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;
            return values.map(v => +((v - min) / range * 100).toFixed(1));
        }

        const skuVals = stores.map(s => storeFeatureData[s].skuCount);
        const qtyVals = stores.map(s => storeFeatureData[s].avgDailyQty);
        const wkVals = stores.map(s => storeFeatureData[s].weekendRatio);
        const tempVals = stores.map(s => storeFeatureData[s].tempCorrAbs);
        const rainVals = stores.map(s => storeFeatureData[s].rainCorrAbs);

        const skuNorm = normalize(skuVals);
        const qtyNorm = normalize(qtyVals);
        const wkNrm = normalize(wkVals);
        const tempNrm = normalize(tempVals);
        const rainNrm = normalize(rainVals);

         const radarDom = document.getElementById('storeRadarChart');
         if (radarDom) {
              const indicators = [
                  { name: '商品数', max: 100 },
                  { name: '日均销量', max: 100 },
                  { name: '周末比', max: 100 },
                  { name: '温度|r|', max: 100 },
                  { name: '降雨|r|', max: 100 }
              ];

              // 门店短名（中文短名，用于图例显示；tooltip 展示完整中文名+英文原名）
              const storeShortNames = {
                  'Astoria Blvd': DataLoader.getStoreShortName('Astoria Blvd'),
                  "Hell's Kitchen": DataLoader.getStoreShortName("Hell's Kitchen"),
                  'Lower Manhattan': DataLoader.getStoreShortName('Lower Manhattan'),
                  'Brooklyn Heights': DataLoader.getStoreShortName('Brooklyn Heights')
              };

             const radarData = stores.map((name, i) => ({
                 name: DataLoader.getStoreDisplayName(name),
                 shortName: storeShortNames[name] || DataLoader.getStoreShortName(name),
                 value: [skuNorm[i], qtyNorm[i], wkNrm[i], tempNrm[i], rainNrm[i]],
                 color: ChartUtils.storeColors[name]
             }));

             charts.radar = ChartUtils.createRadarChart(radarDom, indicators, radarData);

              // 门店对比雷达图专项：窄屏用短名图例，避免裁剪；tooltip 始终显示完整名
              const applyRadarLegendResponsive = () => {
                  const w = radarDom.clientWidth;
                  if (!w || !charts.radar) return;
                  const useShort = w < 480;
                  const displayName = d => useShort ? d.shortName : d.name;
                  charts.radar.setOption({
                      legend: {
                          data: radarData.map(displayName),
                          bottom: w < 360 ? 4 : 0,
                          textStyle: { fontSize: w < 360 ? 10 : (w < 480 ? 11 : 12) }
                      },
                      series: [{
                          data: radarData.map(d => ({
                              value: d.value,
                              name: displayName(d),
                              areaStyle: { color: d.color, opacity: 0.2 },
                              lineStyle: { color: d.color, width: 2 },
                              itemStyle: { color: d.color }
                          }))
                      }],
                      tooltip: {
                          formatter: function(params) {
                              const matched = radarData.find(s =>
                                  s.shortName === params.name || s.name === params.name
                              );
                              const fullName = matched ? matched.name : params.name;
                              const vals = params.value || [];
                              return `<div style="font-weight:600;margin-bottom:6px">${fullName}</div>` +
                                  indicators.map((ind, i) =>
                                      `<div style="display:flex;justify-content:space-between;gap:16px">` +
                                      `<span>${ind.name}</span><b>${(vals[i] ?? 0).toFixed(1)}</b></div>`
                                  ).join('');
                          }
                      }
                  });
              };
             applyRadarLegendResponsive();
             const radarRO = new ResizeObserver(applyRadarLegendResponsive);
             radarRO.observe(radarDom);
         }

        // 原始值对照表
        const rawBody = document.getElementById('radarRawBody');
        if (rawBody) {
            const rows = [
                  { name: '商品覆盖数', unit: '个', key: 'skuCount', fmt: v => v },
                { label: '日均销量', unit: '杯', key: 'avgDailyQty', fmt: v => v.toFixed(1) },
                { label: '周末/工作日销量比', unit: '', key: 'weekendRatio', fmt: v => v.toFixed(4) },
                { label: '与均温相关系数 |r|', unit: '', key: 'tempCorrAbs', fmt: v => v.toFixed(4) },
                { label: '与降雨相关系数 |r|', unit: '', key: 'rainCorrAbs', fmt: v => v.toFixed(4) }
            ];
            rawBody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.label}</td>
                    ${stores.map(s => `<td class="num" style="font-family:'JetBrains Mono',monospace">${r.fmt(storeFeatureData[s][r.key])}${r.unit ? ' ' + r.unit : ''}</td>`).join('')}
                </tr>
            `).join('');
        }

        // 2. 销量规模对比
        const salesDom = document.getElementById('salesCompareChart');
        if (salesDom) {
            const storeData = stores.map(name => {
                const storeDaily = data.dailyStore.filter(d => d.store_location === name);
                return {
                    qty: storeDaily.reduce((s, d) => s + d.qty, 0),
                    revenue: storeDaily.reduce((s, d) => s + d.revenue, 0)
                };
            });

            const chart = echarts.init(salesDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' }
                },
                legend: {
                    data: ['总销量', '总营收'],
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 12, color: '#6B6B6B' }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '门店',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: stores,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#6B6B6B', fontSize: 12 },
                    axisTick: { show: false }
                },
                yAxis: [
                    {
                        type: 'value',
                        name: '销量（杯）',
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                        axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                    },
                    {
                        type: 'value',
                        name: '营收 ($K)',
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                    }
                ],
                series: [
                    {
                        name: '总销量',
                        type: 'bar',
                        data: storeData.map((d, i) => ({
                            value: d.qty,
                            itemStyle: { color: ChartUtils.storeColors[stores[i]], borderRadius: [4, 4, 0, 0] }
                        })),
                        barWidth: '30%',
                        yAxisIndex: 0
                    },
                    {
                        name: '总营收',
                        type: 'line',
                        data: storeData.map(d => (d.revenue / 1000).toFixed(1)),
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: { color: '#D4A574', width: 2 },
                        itemStyle: { color: '#D4A574' },
                        yAxisIndex: 1
                    }
                ]
            });
            ChartUtils.setupResize(chart, salesDom);
            charts.sales = chart;
        }

        // 3. 品类结构对比（堆叠柱状图）
        const catDom = document.getElementById('categoryStructureChart');
        if (catDom) {
            const categories = data.categories.slice(0, 5); // 取Top5品类
            const series = categories.map(cat => ({
                name: cat,
                type: 'bar',
                stack: 'total',
                emphasis: { focus: 'series' },
                itemStyle: { color: ChartUtils.categoryColors[cat] }
            }));

            const seriesData = stores.map(store => {
                const storeCats = data.categoryStore.filter(d => d.store_location === store);
                const total = storeCats.reduce((s, d) => s + d.qty, 0);
                return categories.map(cat => {
                    const catData = storeCats.find(d => d.product_category === cat);
                    return total > 0 ? ((catData?.qty || 0) / total * 100).toFixed(1) : 0;
                });
            });

            const chart = echarts.init(catDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;
                        let total = 0;
                        params.forEach(p => {
                            if (typeof p.value === 'number') {
                                total += p.value;
                                html += `<div>${p.marker}${p.seriesName}：<b>${p.value}%</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: {
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 11, color: '#6B6B6B' },
                    itemWidth: 10,
                    itemHeight: 10
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '18%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '门店',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: stores,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#6B6B6B', fontSize: 12 },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    max: 100,
                    name: '各品类销量占比（%）',
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, formatter: '{value}%' }
                },
                series: series.map((s, i) => ({
                    ...s,
                    data: seriesData.map(row => parseFloat(row[i]))
                }))
            });
            ChartUtils.setupResize(chart, catDom);
            charts.category = chart;
        }

        // 4. 小时分布对比
        const hourlyDom = document.getElementById('hourlyCompareChart');
        if (hourlyDom) {
            const hours = Array.from({ length: 14 }, (_, i) => i + 6); // 6-19点

            const hourlyData = stores.map(store => {
                const storeHourly = data.hourly.filter(d => d.store_location === store);
                return hours.map(h => {
                    const found = storeHourly.find(d => d.hour === h);
                    return found ? found.qty : 0;
                });
            });

            const chart = echarts.init(hourlyDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis'
                },
                legend: {
                    data: stores,
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 12, color: '#6B6B6B' }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '营业时段（点钟）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: hours.map(h => `${h}:00`),
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11 },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    name: '销量（杯）',
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                },
                series: stores.map((store, i) => ({
                    name: store,
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    data: hourlyData[i],
                    lineStyle: { color: ChartUtils.storeColors[store], width: 2 },
                    itemStyle: { color: ChartUtils.storeColors[store] }
                }))
            });
            ChartUtils.setupResize(chart, hourlyDom);
            charts.hourly = chart;
        }

        // 5. 星期效应对比
        const dowDom = document.getElementById('dowCompareChart');
        if (dowDom) {
            const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

            const dowData = stores.map(store => {
                const storeDow = data.dow.filter(d => d.store_location === store);
                return [0, 1, 2, 3, 4, 5, 6].map(dow => {
                    const found = storeDow.find(d => d.dow === dow);
                    return found ? found.avg_qty : 0;
                });
            });

            const chart = echarts.init(dowDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    formatter: function(params) {
                        let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;
                        params.forEach(p => {
                            html += `<div>${p.marker}${p.seriesName}：<b>${p.value.toFixed(0)}</b> 杯/天</div>`;
                        });
                        return html;
                    }
                },
                legend: {
                    data: stores,
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 12, color: '#6B6B6B' }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '星期',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: dayNames,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#6B6B6B', fontSize: 12 },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    name: '日均销量（杯）',
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                },
                series: stores.map((store, i) => ({
                    name: store,
                    type: 'bar',
                    data: dowData[i],
                    itemStyle: {
                        color: ChartUtils.storeColors[store],
                        borderRadius: [4, 4, 0, 0]
                    },
                    barWidth: '20%'
                })),
                markArea: {
                    silent: true,
                    data: [[
                        { xAxis: '周六', itemStyle: { color: 'rgba(212, 165, 116, 0.08)' } },
                        { xAxis: '周日' }
                    ]]
                }
            });
            ChartUtils.setupResize(chart, dowDom);
            charts.dow = chart;
        }

        // 6. 预测精度对比 —— 门店×SKU×日粒度真实回测值
        const storeAccData = {
            'Astoria': { r2: 0.9454, mae: 0.8269, hit20: 89.4643, dailyR2: -0.8402, dailyMae: 64.4903, wape: 12.8357 },
            "Hell's Kitchen": { r2: 0.9418, mae: 1.0915, hit20: 89.1071, dailyR2: 0.3516, dailyMae: 84.9564, wape: 13.9632 },
            'Lower Manhattan': { r2: 0.9881, mae: 0.4601, hit20: 100.0000, dailyR2: -0.0268, dailyMae: 30.4307, wape: 5.0465 }
        };

        // 门店日级次要指标表
        const dailyAccBody = document.getElementById('dailyAccBody');
        if (dailyAccBody) {
            dailyAccBody.innerHTML = stores.map(s => `
                 <tr>
                     <td style="font-weight:600">${s}</td>
                     <td class="num" style="font-family:'JetBrains Mono',monospace">${storeAccData[s].dailyR2.toFixed(4)}</td>
                     <td class="num" style="font-family:'JetBrains Mono',monospace">${storeAccData[s].dailyMae.toFixed(2)} 杯</td>
                     <td class="num" style="font-family:'JetBrains Mono',monospace">${storeAccData[s].wape.toFixed(2)}%</td>
                     <td class="num hide-mobile">7</td>
                 </tr>
             `).join('');
        }

        const accDom = document.getElementById('accuracyCompareChart');
        if (accDom) {
            if (charts.accuracy) charts.accuracy.dispose();
            const chart = echarts.init(accDom);

            function renderAccChart(metric) {
                const metricNames = { r2: 'R²', mae: 'MAE (杯)', hit20: '±20% 命中率 (%)' };
                const isHit = metric === 'hit20';
                const isR2 = metric === 'r2';
                let yMin = null, yMax = null;
                if (isR2) { yMin = 0.9; yMax = 1; }
                if (isHit) { yMin = 80; yMax = 100; }

                const valueFormat = (v) => {
                    if (metric === 'r2') return v.toFixed(4);
                    if (metric === 'mae') return v.toFixed(2);
                    return v.toFixed(2) + '%';
                };

                chart.setOption({
                    tooltip: {
                        backgroundColor: 'rgba(44, 24, 16, 0.95)',
                        textStyle: { color: '#FAF6F0', fontSize: 12 },
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' },
                        formatter: function(params) {
                            const s = params[0].name;
                            const d = storeAccData[s];
                            return `<b>${s}</b><br/>
                                R²: ${d.r2.toFixed(4)}<br/>
                                MAE: ${d.mae.toFixed(2)} 杯<br/>
                                ±20% 命中: ${d.hit20.toFixed(2)}%<br/>
                                <span style=\"color:#999\">粒度: 门店×SKU×日, n=560</span>`;
                        }
                    },
                    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        name: '门店',
                        nameLocation: 'end',
                        nameGap: 8,
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        data: stores,
                        axisLine: { lineStyle: { color: '#E5E5E5' } },
                        axisLabel: { color: '#6B6B6B', fontSize: 12 },
                        axisTick: { show: false }
                    },
                    yAxis: {
                        type: 'value',
                        name: metricNames[metric],
                        min: yMin,
                        max: yMax,
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                        axisLabel: {
                            color: '#8A8A8A', fontSize: 11,
                            fontFamily: "'JetBrains Mono', monospace",
                            formatter: isHit ? '{value}%' : null
                        }
                    },
                    series: [{
                        name: metricNames[metric],
                        type: 'bar',
                        data: stores.map((s, i) => ({
                            value: storeAccData[s][metric],
                            itemStyle: { color: ChartUtils.storeColors[s], borderRadius: [4, 4, 0, 0] }
                        })),
                        barWidth: '35%',
                        label: {
                            show: true,
                            position: 'top',
                            fontSize: 11,
                            color: '#6B6B6B',
                            fontFamily: "'JetBrains Mono', monospace",
                            formatter: function(p) { return valueFormat(p.value); }
                        }
                    }]
                });
            }

            renderAccChart(accMetric);
            ChartUtils.setupResize(chart, accDom);
            charts.accuracy = chart;
            charts.accuracy._render = renderAccChart;
        }
    }

    return { render, switchAccMetric };
})();
