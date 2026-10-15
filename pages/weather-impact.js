/**
 * 天气影响分析页面
 * 所有统计量基于真实交易+天气数据按日期键连接计算
 */

const WeatherImpactPage = (function() {
    let charts = {};

    // 天气变量中文名映射
    const WEATHER_VAR_LABELS = {
        temperature_2m_mean: '平均温度',
        precipitation_sum: '降水量',
        relative_humidity_2m_mean: '相对湿度',
        sunshine_duration: '日照时长',
        wind_speed_10m_max: '最大风速'
    };

    // 窄屏短标签（tooltip 仍用完整名）
    const WEATHER_VAR_SHORT = {
        temperature_2m_mean: '均温',
        precipitation_sum: '降水',
        relative_humidity_2m_mean: '湿度',
        sunshine_duration: '日照',
        wind_speed_10m_max: '风速'
    };

    function render(container) {
        const data = DataLoader.getData();
        const store = App.getCurrentStore();

        container.innerHTML = `
            <div class="card" style="margin-bottom:20px" id="demoWeatherMainCard">
                 <div class="card-header">
                     <div>
                         <div class="card-title">天气 × 销量 关联分析</div>
                         <div class="card-subtitle">纽约 2023 H1 · 181 天完整数据 · 按日期键连接</div>
                     </div>
                     <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                         <span class="data-badge real">真实数据计算</span>
                         <span class="badge badge-warning">相关性 ≠ 因果</span>
                     </div>
                 </div>
                <div class="card-body">
                    <div style="padding:12px 16px;background:var(--warning-light);border-radius:8px;margin-bottom:16px;font-size:13px;color:#8B6914;line-height:1.6">
                        <b>统计口径说明：</b>
                        <ul style="margin:6px 0 0 18px;padding:0">
                            <li>销量与天气按 <code>YYYY-MM-DD</code> 日期键连接，不按数组索引对齐</li>
                            <li>样本区间：2023-01-01 至 2023-06-30，共 181 天</li>
                            <li>无交易日销量补 0，避免选择偏差</li>
                            <li>相关系数为 Pearson r，仅表示线性关联程度</li>
                            <li>温度与时间趋势、季节、星期效应可能混杂，不构成因果解释</li>
                        </ul>
                    </div>
                    <div id="weatherSalesChart" class="chart-container large"></div>
                </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">温度分桶日均销量</div>
                         <span class="data-badge real">真实数据计算</span>
                     </div>
                    <div class="card-body">
                        <div id="tempBucketChart" class="chart-container" style="min-height:320px"></div>
                    </div>
                    <div class="card-footer">
                        左闭右开区间 · 未控制季节趋势与星期效应 · 不作因果解释
                    </div>
                </div>

                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">晴 vs 雨 销量对比</div>
                         <span class="data-badge real">真实数据计算</span>
                     </div>
                    <div class="card-body">
                        <div id="rainImpactChart" class="chart-container" style="min-height:320px"></div>
                    </div>
                    <div class="card-footer">
                        雨天定义：日降水量 &gt; 1mm · 样本量分别标注
                    </div>
                </div>
            </div>

            <!-- 门店天气敏感度热力图 -->
            <div class="card" style="margin-bottom:20px">
                     <div class="card-header">
                         <div class="card-title">门店销量与天气变量相关系数</div>
                         <span class="data-badge real">真实数据计算</span>
                     </div>
                <div class="card-body">
                    <div style="font-size:13px;color:#8A8A8A;margin-bottom:12px">
                        Pearson r · 每店 n = 181 · 展示三店对比，不受门店筛选影响
                    </div>
                    <div id="storeWeatherHeatmap" class="chart-container" style="min-height:320px"></div>
                </div>
                <div class="card-footer">
                    正值表示正相关、负值表示负相关；绝对值越大线性关联越强。相关不代表因果。
                </div>
            </div>

            <!-- 品类天气相关 -->
            <div class="card">
                     <div class="card-header">
                         <div class="card-title">品类天气敏感度排行</div>
                         <span class="data-badge real">真实数据计算</span>
                     </div>
                <div class="card-body">
                    <div style="font-size:13px;color:#8A8A8A;margin-bottom:12px" id="catCorrNote"></div>
                    <div class="grid grid-2">
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:12px">温度相关 Top 5（按 |r| 排序）</div>
                            <div id="tempCorrChart" class="chart-container" style="min-height:260px"></div>
                        </div>
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:12px">降雨相关 Top 5（按 |r| 排序）</div>
                            <div id="rainCorrChart" class="chart-container" style="min-height:260px"></div>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    柱长与正负方向均为原始 Pearson r · n = 181 · 无交易日补 0
                </div>
            </div>
        `;

        initCharts();
    }

    // ========== 工具函数 ==========

    // 构建 日期 -> 天气 映射
    function buildWeatherMap(weatherArr) {
        const map = {};
        weatherArr.forEach(w => { map[w.date] = w; });
        return map;
    }

    // 按日期键连接销量与天气（返回逐日数组，仅保留双方都有的日期）
    function joinByDate(salesArr, weatherMap) {
        return salesArr
            .filter(s => weatherMap[s.date])
            .map(s => ({ date: s.date, qty: s.qty, w: weatherMap[s.date] }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    // ========== 图表初始化 ==========

    function initCharts() {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        const data = DataLoader.getData();
        const store = App.getCurrentStore();
        const storeLabel = store === 'all' ? '全部门店' : store;
        const dailyData = DataLoader.getStoreDailyData(store);
        const weather = data.weatherFull || data.weatherSlim;
        const weatherMap = buildWeatherMap(weather);

        // ---- 主图：天气与销量双轴（近60天，按日期join） ----
        const mainDom = document.getElementById('weatherSalesChart');
        if (mainDom) {
            const joined = joinByDate(dailyData, weatherMap);
            const recent = joined.slice(-60);

            const dates = recent.map(d => d.date.slice(5));
            const sales = recent.map(d => d.qty);
            const temps = recent.map(d => d.w.temperature_2m_mean);
            const rains = recent.map(d => d.w.precipitation_sum);

            const chart = echarts.init(mainDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    formatter: function(params) {
                        let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;
                        params.forEach(p => {
                            let unit = '';
                            if (p.seriesName === '销量') unit = ' 杯';
                            else if (p.seriesName === '平均温度') unit = '°C';
                            else if (p.seriesName === '降水量') unit = 'mm';
                            html += `<div style="margin:3px 0">${p.marker}${p.seriesName}：<b>${typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</b>${unit}</div>`;
                        });
                        return html;
                    }
                },
                legend: {
                    data: ['销量', '平均温度', '降水量'],
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 12, color: '#6B6B6B' }
                },
                title: {
                    text: `近 ${recent.length} 个共同日期 · ${storeLabel}`,
                    textStyle: { fontSize: 11, color: '#8A8A8A', fontWeight: 400 },
                    left: 0,
                    top: 0
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '14%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '日期（月-日）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: dates,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 10, rotate: 45 },
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
                        name: '温度（°C）/ 降水（mm）',
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                    }
                ],
                series: [
                    {
                        name: '销量',
                        type: 'bar',
                        data: sales,
                        itemStyle: { color: 'rgba(93, 64, 55, 0.7)', borderRadius: [2, 2, 0, 0] },
                        barWidth: '50%',
                        yAxisIndex: 0
                    },
                    {
                        name: '平均温度',
                        type: 'line',
                        data: temps,
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { color: '#E08A5C', width: 2 },
                        yAxisIndex: 1
                    },
                    {
                        name: '降水量',
                        type: 'line',
                        data: rains,
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { color: '#4A7CC2', width: 2, type: 'dashed' },
                        areaStyle: { color: 'rgba(74, 124, 194, 0.1)' },
                        yAxisIndex: 1
                    }
                ]
            });
            ChartUtils.setupResize(chart, mainDom);
            charts.main = chart;
        }

        // ---- 温度分桶柱状图 ----
        const tempDom = document.getElementById('tempBucketChart');
        if (tempDom) {
            const joined = joinByDate(dailyData, weatherMap);
            const bucketLabels = ['<0°C', '0–5°C', '5–10°C', '10–15°C', '15–20°C', '20–25°C', '25–30°C', '>30°C'];
            const bucketRanges = [
                [-Infinity, 0], [0, 5], [5, 10], [10, 15],
                [15, 20], [20, 25], [25, 30], [30, Infinity]
            ];
            const bucketSales = new Array(bucketLabels.length).fill(0);
            const bucketCount = new Array(bucketLabels.length).fill(0);

            joined.forEach(d => {
                const temp = d.w.temperature_2m_mean;
                for (let j = 0; j < bucketRanges.length; j++) {
                    if (temp >= bucketRanges[j][0] && temp < bucketRanges[j][1]) {
                        bucketSales[j] += d.qty;
                        bucketCount[j]++;
                        break;
                    }
                }
            });

            const avgSales = bucketSales.map((s, i) =>
                bucketCount[i] > 0 ? Math.round(s / bucketCount[i]) : null);

            const chart = echarts.init(tempDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    formatter: function(params) {
                        const idx = params[0].dataIndex;
                        if (bucketCount[idx] === 0) {
                            return `<div style="font-weight:600">温度 ${bucketLabels[idx]}</div>
                                    <div style="color:#999">无样本（n = 0）</div>`;
                        }
                        return `<div style="font-weight:600">温度 ${bucketLabels[idx]}</div>
                                <div>日均销量：<b>${params[0].value.toLocaleString()}</b> 杯</div>
                                <div style="color:#8A8A8A">样本量：n = ${bucketCount[idx]} 天</div>`;
                    }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '日均气温区间（°C，左闭右开）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: bucketLabels,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 10 },
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
                series: [{
                    type: 'bar',
                    data: avgSales.map((v, i) => {
                        if (v === null) {
                            return {
                                value: 0,
                                itemStyle: { color: '#E8E8E8', borderRadius: [4, 4, 0, 0] },
                                label: { show: true, position: 'top', formatter: '无样本', fontSize: 10, color: '#ABABAB' }
                            };
                        }
                        return {
                            value: v,
                            itemStyle: {
                                color: i < 3 ? '#4A7CC2' : i < 5 ? '#D4A574' : '#E08A5C',
                                borderRadius: [4, 4, 0, 0]
                            }
                        };
                    }),
                    barWidth: '55%',
                    label: {
                        show: true,
                        position: 'top',
                        fontSize: 10,
                        color: '#6B6B6B',
                        fontFamily: "'JetBrains Mono', monospace",
                        formatter: function(p) {
                            if (bucketCount[p.dataIndex] === 0) return '';
                            return `${p.value} (n=${bucketCount[p.dataIndex]})`;
                        }
                    }
                }]
            });
            ChartUtils.setupResize(chart, tempDom);
            charts.temp = chart;
        }

        // ---- 晴雨对比 ----
        const rainDom = document.getElementById('rainImpactChart');
        if (rainDom) {
            const joined = joinByDate(dailyData, weatherMap);
            let sunnySales = 0, sunnyCount = 0;
            let rainSales = 0, rainCount = 0;
            const RAIN_THRESHOLD = 1; // mm

            joined.forEach(d => {
                if (d.w.precipitation_sum > RAIN_THRESHOLD) {
                    rainSales += d.qty;
                    rainCount++;
                } else {
                    sunnySales += d.qty;
                    sunnyCount++;
                }
            });

            const sunnyAvg = sunnyCount > 0 ? sunnySales / sunnyCount : 0;
            const rainAvg = rainCount > 0 ? rainSales / rainCount : 0;
            const diff = sunnyAvg > 0 ? ((rainAvg - sunnyAvg) / sunnyAvg * 100) : 0;

            const chart = echarts.init(rainDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        const p = params[0];
                        const n = p.seriesName === '非雨天' ? sunnyCount : rainCount;
                        return `<div style="font-weight:600">${p.seriesName}</div>
                                <div>日均销量：<b>${p.value.toLocaleString()}</b> 杯</div>
                                <div style="color:#8A8A8A">样本量：n = ${n} 天</div>
                                <div style="color:#8A8A8A">阈值：降水 > ${RAIN_THRESHOLD}mm</div>`;
                    }
                },
                grid: { left: '3%', right: '4%', bottom: '12%', top: '10%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '天气类型（按日降水量 1mm 阈值划分）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: ['非雨天', '降雨天'],
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#6B6B6B', fontSize: 13, fontWeight: 500 },
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
                series: [{
                    type: 'bar',
                    data: [
                        {
                            value: Math.round(sunnyAvg),
                            itemStyle: { color: '#E8A838', borderRadius: [8, 8, 0, 0] },
                            name: '非雨天'
                        },
                        {
                            value: Math.round(rainAvg),
                            itemStyle: { color: '#4A7CC2', borderRadius: [8, 8, 0, 0] },
                            name: '降雨天'
                        }
                    ],
                    barWidth: '35%',
                    label: {
                        show: true,
                        position: 'top',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#5D4037',
                        fontFamily: "'JetBrains Mono', monospace",
                        formatter: function(p) {
                            const n = p.dataIndex === 0 ? sunnyCount : rainCount;
                            return `${p.value}\nn=${n}`;
                        }
                    }
                }],
                graphic: [
                    {
                        type: 'text',
                        left: 'center',
                        bottom: 2,
                        style: {
                            text: `雨天相对差异 ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%  ·  阈值 > ${RAIN_THRESHOLD}mm`,
                            fill: diff > 0 ? '#5BA67A' : '#D96565',
                            fontSize: 12,
                            fontWeight: 600
                        }
                    }
                ]
            });
            ChartUtils.setupResize(chart, rainDom);
            charts.rain = chart;
        }

        // ---- 门店天气敏感度热力图（三店 × 五变量） ----
        const heatmapDom = document.getElementById('storeWeatherHeatmap');
        if (heatmapDom) {
            const storeNames = data.storeNames;
            const storeDisplayNames = data.storeNames.map(n => DataLoader.getStoreDisplayName(n));
            const weatherVars = [
                'temperature_2m_mean',
                'precipitation_sum',
                'relative_humidity_2m_mean',
                'sunshine_duration',
                'wind_speed_10m_max'
            ];

            // 对每个门店单独按日期 join，计算 Pearson r
            const heatmapData = [];
            let rMin = 1, rMax = -1;

            storeNames.forEach((store, yi) => {
                const storeDaily = DataLoader.getStoreDailyData(store);
                const joined = joinByDate(storeDaily, weatherMap);
                const qtys = joined.map(d => d.qty);
                const n = joined.length;

                weatherVars.forEach((v, xi) => {
                    const vals = joined.map(d => d.w[v]);
                    const r = DataLoader.pearson(qtys, vals);
                    const rVal = r === null ? null : r;
                    if (rVal !== null) {
                        if (rVal < rMin) rMin = rVal;
                        if (rVal > rMax) rMax = rVal;
                    }
                    heatmapData.push([xi, yi, rVal === null ? '样本不足' : rVal.toFixed(4)]);
                });
            });

            const chart = echarts.init(heatmapDom);
             chart.setOption({
                 tooltip: {
                     backgroundColor: 'rgba(44, 24, 16, 0.95)',
                     textStyle: { color: '#FAF6F0', fontSize: 12 },
                     position: 'top',
                     confine: true,
                      formatter: function(p) {
                          const store = storeDisplayNames[p.data[1]];
                          const varName = WEATHER_VAR_LABELS[weatherVars[p.data[0]]] || weatherVars[p.data[0]];
                          const r = p.data[2];
                          return `<div style="font-weight:600">${store}</div>
                                  <div>变量：${varName}</div>
                                  <div>Pearson r：<b>${r}</b></div>
                                  <div style="color:#8A8A8A">样本量：n = 181</div>`;
                     }
                 },
                 grid: { left: '18%', right: '12%', bottom: '22%', top: '5%', containLabel: true },
                  xAxis: {
                      type: 'category',
                      name: '气象变量',
                      nameLocation: 'end',
                      nameGap: 8,
                      nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                      data: weatherVars.map(v => WEATHER_VAR_LABELS[v] || v),
                      splitArea: { show: true },
                      axisLine: { lineStyle: { color: '#E5E5E5' } },
                      axisLabel: { color: '#6B6B6B', fontSize: 11 }
                  },
                  yAxis: {
                      type: 'category',
                      name: '门店',
                      nameLocation: 'end',
                      nameGap: 6,
                      nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                      data: storeDisplayNames,
                      splitArea: { show: true },
                     axisLine: { lineStyle: { color: '#E5E5E5' } },
                     axisLabel: { color: '#6B6B6B', fontSize: 12 }
                 },
                 visualMap: {
                     min: -1,
                     max: 1,
                     calculable: false,
                     orient: 'horizontal',
                     left: 'center',
                     bottom: '1%',
                     text: ['正相关', '负相关'],
                     inRange: {
                         color: ['#4A7CC2', '#B8D1E8', '#FAF6F0', '#E8C4A0', '#E08A5C']
                     },
                     textStyle: { color: '#8A8A8A', fontSize: 10 },
                     itemWidth: 10,
                     itemHeight: 80
                 },
                 series: [{
                     type: 'heatmap',
                     data: heatmapData.map(d => [d[0], d[1], typeof d[2] === 'string' ? null : parseFloat(d[2])]),
                     label: {
                         show: true,
                         fontSize: 11,
                         color: '#5D4037',
                         fontFamily: "'JetBrains Mono', monospace",
                         formatter: function(p) {
                             if (p.value === null || p.value === undefined) return '样本不足';
                             return (p.value > 0 ? '+' : '') + p.value.toFixed(3);
                         }
                     },
                     itemStyle: {
                         borderColor: '#fff',
                         borderWidth: 2
                     },
                     emphasis: {
                         itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' }
                     }
                 }]
             });
             const applyHeatmapResponsive = () => {
                 const w = heatmapDom.clientWidth;
                 const h = heatmapDom.clientHeight;
                 if (!w) return;
                 // 所有断点字号不得低于 10px；空间不足时用短标签 + 旋转 + 调整 grid
                 let xFont = 11, yFont = 12, labelFont = 11, vmFont = 10;
                 let gridLeft = '18%', gridRight = '10%', gridBottom = '22%', gridTop = '5%';
                 let xRotate = 0;
                 let xData = weatherVars.map(v => WEATHER_VAR_LABELS[v] || v);
                 let vmText = ['正相关', '负相关'];
                 let itemBorder = 2;
                 if (w < 420) {
                     // 超窄屏：短标签 + 轻微旋转 + 加大左侧给 y 轴门店名，底部给 visualMap 留位
                     xFont = 11;
                     yFont = 11;
                     labelFont = 10;
                     vmFont = 10;
                     xRotate = 30;
                     xData = weatherVars.map(v => WEATHER_VAR_SHORT[v] || v);
                     gridLeft = '26%';
                     gridRight = '6%';
                     gridBottom = '30%';
                     gridTop = '4%';
                     vmText = ['正', '负'];
                     itemBorder = 1;
                 } else if (w < 600) {
                     xFont = 11;
                     yFont = 11;
                     labelFont = 11;
                     vmFont = 10;
                     xRotate = 20;
                     gridLeft = '22%';
                     gridBottom = '26%';
                     itemBorder = 1;
                 }
                 chart.setOption({
                     grid: { left: gridLeft, right: gridRight, bottom: gridBottom, top: gridTop, containLabel: true },
                     xAxis: {
                         data: xData,
                         axisLabel: { fontSize: xFont, rotate: xRotate }
                     },
                     yAxis: { axisLabel: { fontSize: yFont } },
                     series: [{ label: { fontSize: labelFont }, itemStyle: { borderWidth: itemBorder } }],
                     visualMap: { textStyle: { fontSize: vmFont }, text: vmText }
                 });
             };
             applyHeatmapResponsive();
             const heatmapRO = new ResizeObserver(applyHeatmapResponsive);
             heatmapRO.observe(heatmapDom);
             ChartUtils.setupResize(chart, heatmapDom);
             charts.heatmap = chart;
        }

        // ---- 品类相关（温度 / 降雨 Top5） ----
        const catData = DataLoader.getCategoryDailyByStore(store);
        const noteEl = document.getElementById('catCorrNote');
        if (noteEl) {
            noteEl.textContent = `当前门店：${storeLabel} · n = ${catData.n} 天 · 按 |r| 降序展示 Top 5`;
        }

        const fullDates = catData.dates;
        const tempVals = fullDates.map(d => weatherMap[d] ? weatherMap[d].temperature_2m_mean : null)
            .filter((v, i) => weatherMap[fullDates[i]] !== undefined);
        const rainVals = fullDates.map(d => weatherMap[d] ? weatherMap[d].precipitation_sum : null)
            .filter((v, i) => weatherMap[fullDates[i]] !== undefined);
        const validDates = fullDates.filter(d => weatherMap[d] !== undefined);

        // 温度相关
        const tempCorrDom = document.getElementById('tempCorrChart');
        if (tempCorrDom) {
            const catTemp = catData.categories.map(cat => {
                const series = validDates.map(d => {
                    const idx = fullDates.indexOf(d);
                    return catData.series[cat][idx];
                });
                const temps = validDates.map(d => weatherMap[d].temperature_2m_mean);
                const r = DataLoader.pearson(series, temps);
                return { cat, r: r === null ? null : r };
            }).filter(c => c.r !== null)
              .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
              .slice(0, 5);

            renderCorrBar(tempCorrDom, catTemp, '温度相关系数', validDates.length, storeLabel);
            charts.tempCorr = 'tempCorr'; // placeholder, actual chart ref stored in render
        }

        // 降雨相关
        const rainCorrDom = document.getElementById('rainCorrChart');
        if (rainCorrDom) {
            const catRain = catData.categories.map(cat => {
                const series = validDates.map(d => {
                    const idx = fullDates.indexOf(d);
                    return catData.series[cat][idx];
                });
                const rains = validDates.map(d => weatherMap[d].precipitation_sum);
                const r = DataLoader.pearson(series, rains);
                return { cat, r: r === null ? null : r };
            }).filter(c => c.r !== null)
              .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
              .slice(0, 5);

            renderCorrBar(rainCorrDom, catRain, '降雨相关系数', validDates.length, storeLabel);
            charts.rainCorr = 'rainCorr';
        }
    }

    // 渲染相关系数条形图（水平，正负方向）
    function renderCorrBar(dom, items, varName, n, storeLabel) {
        const cats = items.map(i => i.cat);
        const chart = echarts.init(dom);
        chart.setOption({
            tooltip: {
                backgroundColor: 'rgba(44, 24, 16, 0.95)',
                textStyle: { color: '#FAF6F0', fontSize: 12 },
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const p = params[0];
                    const r = p.value;
                    return `<div style="font-weight:600">${p.name}</div>
                            <div>${varName}：<b>${r > 0 ? '+' : ''}${r.toFixed(4)}</b></div>
                            <div style="color:#8A8A8A">样本量：n = ${n}</div>
                            <div style="color:#8A8A8A">门店：${storeLabel}</div>`;
                }
            },
            grid: { left: '3%', right: '10%', bottom: '3%', top: '5%', containLabel: true },
            xAxis: {
                type: 'value',
                min: -1,
                max: 1,
                name: 'Pearson 相关系数 r（无量纲，范围 −1～1）',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11, align: 'left' },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }
            },
            yAxis: {
                type: 'category',
                name: '品类',
                nameLocation: 'end',
                nameGap: 6,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: cats,
                inverse: false,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#6B6B6B', fontSize: 11 }
            },
            series: [{
                type: 'bar',
                data: items.map(i => ({
                    value: i.r,
                    itemStyle: {
                        color: i.r > 0 ? '#E08A5C' : '#4A7CC2',
                        borderRadius: i.r > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4]
                    }
                })),
                barWidth: '45%',
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    color: '#6B6B6B',
                    fontFamily: "'JetBrains Mono', monospace",
                    formatter: function(p) {
                        return (p.value > 0 ? '+' : '') + p.value.toFixed(3);
                    }
                },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: '#ABABAB', type: 'solid', width: 1 },
                    data: [{ xAxis: 0 }]
                }
            }]
        });
        ChartUtils.setupResize(chart, dom);
        // 存入 charts 对象以便 dispose
        const key = varName === '温度相关系数' ? 'tempCorrBar' : 'rainCorrBar';
        charts[key] = chart;
    }

    return { render };
})();
