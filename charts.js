/**
 * CoffeeIQ 图表工具模块
 * 基于 ECharts 的统一图表创建和配置
 */

const ChartUtils = (function() {
    // 配色方案
    const colors = {
        primary: '#D4A574',
        coffee: '#5D4037',
        coffeeLight: '#8D6E63',
        amber: '#D4A574',
        amberLight: '#E6C88A',
        blue: '#4A7CC2',
        blueLight: '#7BA3DE',
        teal: '#3A9E8C',
        green: '#5BA67A',
        orange: '#E08A5C',
        red: '#D96565',
        purple: '#8B7CC4',
        gray: '#ABABAB',
        grayLight: '#D0D0D0'
    };

    // 品类颜色映射（保持一致）
    const categoryColors = {
        'Coffee': '#5D4037',
        'Tea': '#3A9E8C',
        'Bakery': '#E08A5C',
        'Drinking Chocolate': '#8B5E3C',
        'Flavours': '#E8A838',
        'Coffee beans': '#3E2723',
        'Loose Tea': '#5BA67A',
        'Branded': '#8B7CC4',
        'Packaged Chocolate': '#D96565'
    };

    // 门店颜色映射
    const storeColors = {
        'Lower Manhattan': '#5D4037',
        "Hell's Kitchen": '#4A7CC2',
        'Astoria': '#3A9E8C'
    };

    // 基础配置
    function getBaseOption() {
        return {
            textStyle: {
                fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
                fontSize: 12,
                color: '#4A4A4A'
            },
            tooltip: {
                backgroundColor: 'rgba(44, 24, 16, 0.95)',
                borderColor: 'rgba(212, 165, 116, 0.3)',
                textStyle: {
                    color: '#FAF6F0',
                    fontSize: 12
                },
                padding: [10, 14],
                confine: true
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            }
        };
    }

    // 创建线图（实际vs预测 + P10-P90置信区间 + P50）
    // series 顺序恒定：[实际销量, 点预测, P10-P90上界, P10-P90下界, P50预测]
    // 增量 setOption 必须按名字对齐，禁止按索引更新。
    function createForecastLineChart(dom, dates, actualData, predData, p10Data, p50Data, p90Data, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const series = [];
        const legendData = [];
        const selected = {};

        // 颜色方案（从咖啡色系派生，保持产品视觉语言）
        const COLOR_ACTUAL = '#5D4037';   // 实际：深咖实线
        const COLOR_POINT = '#D4A574';    // 点预测：金棕虚线
        const COLOR_BAND = '#E8CFA8';     // 区间带：浅金半透明
        const COLOR_P50 = '#8D6E63';      // P50：棕褐点线

        // 1. 实际销量（实线，最高层级）
        if (actualData) {
            series.push({
                name: '实际销量',
                type: 'line',
                data: actualData,
                smooth: false,
                symbol: 'circle',
                symbolSize: 5,
                lineStyle: {
                    color: COLOR_ACTUAL,
                    width: 2,
                    type: 'solid'
                },
                itemStyle: { color: COLOR_ACTUAL },
                z: 5
            });
            legendData.push('实际销量');
            selected['实际销量'] = true;
        }

        // 2. 点预测（虚线）
        if (predData) {
            series.push({
                name: '点预测',
                type: 'line',
                data: predData,
                smooth: false,
                symbol: 'diamond',
                symbolSize: 6,
                lineStyle: {
                    color: COLOR_POINT,
                    width: 2,
                    type: 'dashed'
                },
                itemStyle: { color: COLOR_POINT },
                z: 4
            });
            legendData.push('点预测');
            selected['点预测'] = true;
        }

        // 3. P10–P90 置信区间（差值堆叠：基线 P10 + 填充 P90-P10，半透明填充带）
        if (p10Data && p90Data) {
            // 数值化并保留空值（null 表示断开，不用 0 兜底）
            const p10Num = p10Data.map(v => (v == null || isNaN(v) || v === '' ? null : +v));
            const p90Num = p90Data.map(v => (v == null || isNaN(v) || v === '' ? null : +v));
            const bandDelta = p90Num.map((p90, i) => {
                const p10 = p10Num[i];
                if (p10 == null || p90 == null) return null;
                return Math.max(0, p90 - p10);
            });
            // 基线：P10 原值，完全透明，不响应 tooltip，不进 legend（作为堆叠底部）
            series.push({
                name: 'P10–P90区间_基线',
                type: 'line',
                data: p10Num,
                stack: 'confidence-band',
                lineStyle: { opacity: 0 },
                itemStyle: { opacity: 0 },
                symbol: 'none',
                areaStyle: { opacity: 0 },
                z: 1,
                silent: true,
                tooltip: { show: false },
                legendHoverLink: false
            });
            // 填充层：P90-P10 差值，半透明面积，视觉上呈现 P10~P90 区间带
            series.push({
                name: 'P10–P90区间',
                type: 'line',
                data: bandDelta,
                stack: 'confidence-band',
                lineStyle: { opacity: 0 },
                itemStyle: { opacity: 0 },
                symbol: 'none',
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(212, 165, 116, 0.28)' },
                        { offset: 1, color: 'rgba(212, 165, 116, 0.28)' }
                    ]),
                    origin: 'start'
                },
                z: 1
            });
            legendData.push('P10–P90区间');
            selected['P10–P90区间'] = true;
        }

        // 4. P50 预测（点线，默认隐藏，可由图例切换）
        if (p50Data) {
            series.push({
                name: 'P50预测',
                type: 'line',
                data: p50Data,
                smooth: false,
                symbol: 'triangle',
                symbolSize: 5,
                lineStyle: {
                    color: COLOR_P50,
                    width: 1.5,
                    type: 'dotted'
                },
                itemStyle: { color: COLOR_P50 },
                z: 3
            });
            legendData.push('P50预测');
            selected['P50预测'] = false; // 默认隐藏
        }

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'line' },
                formatter: function(params) {
                    if (!params || params.length === 0) return '';
                    let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;

                      // 取 dataIndex，从闭包中的原始数组读 P10/P90 真实值
                      const dataIndex = params[0] && params[0].dataIndex != null ? params[0].dataIndex : -1;
                      const hasBand = p10Data && p90Data && dataIndex >= 0 && dataIndex < p10Num.length;
                      const p10Val = hasBand ? p10Num[dataIndex] : null;
                      const p90Val = hasBand ? p90Num[dataIndex] : null;
                      const bandVisible = params.some(p => p.seriesName === 'P10–P90区间');

                     // 按固定顺序展示：实际销量 → 点预测 → P90 → P50 → P10
                     // 用虚拟条目构建（P10/P90 从原数组取，不受堆叠差值影响）
                     const entries = [];
                     const actualP = params.find(p => p.seriesName === '实际销量');
                     if (actualP) entries.push({ name: '实际销量', value: actualP.value, color: actualP.color });
                     const pointP = params.find(p => p.seriesName === '点预测');
                     if (pointP) entries.push({ name: '点预测', value: pointP.value, color: pointP.color });
                     if (hasBand && bandVisible && p90Val != null && !isNaN(p90Val)) {
                         entries.push({ name: 'P90（上界）', value: p90Val, color: COLOR_BAND });
                     }
                     const p50P = params.find(p => p.seriesName === 'P50预测');
                     if (p50P) entries.push({ name: 'P50预测', value: p50P.value, color: p50P.color });
                     if (hasBand && bandVisible && p10Val != null && !isNaN(p10Val)) {
                         entries.push({ name: 'P10（下界）', value: p10Val, color: COLOR_BAND });
                     }

                     entries.forEach(p => {
                         if (p.value == null || isNaN(p.value)) return;
                         const val = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
                         const label = p.name;
                         const dotColor = p.color;
                        html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
                            <span style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></span>
                            <span>${label}：</span>
                            <span style="font-weight:600;font-family:'JetBrains Mono',monospace">${val} 杯</span>
                        </div>`;
                    });

                     // 偏差计算（实际 vs 点预测）
                     const aP = entries.find(e => e.name === '实际销量');
                     const prP = entries.find(e => e.name === '点预测');
                     if (aP && prP && aP.value != null && prP.value != null
                         && !isNaN(aP.value) && !isNaN(prP.value)) {
                         const actual = aP.value;
                         const predicted = prP.value;
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
            },
            legend: {
                data: legendData,
                selected: selected,
                type: 'scroll',
                top: 0,
                right: 0,
                icon: 'roundRect',
                itemWidth: 14,
                itemHeight: 6,
                textStyle: {
                    fontSize: 11.5,
                    color: '#6B6B6B'
                },
                pageIconSize: 10,
                pageTextStyle: { fontSize: 10 }
            },
             grid: { ...base.grid, top: 36, bottom: 42, left: '3%', right: '4%' },
            xAxis: {
                type: 'category',
                name: options.xAxisName || '日期',
                nameLocation: 'end',
                nameGap: 6,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: dates,
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { show: false },
                axisLabel: {
                    color: '#8A8A8A',
                    fontSize: 11
                }
            },
            yAxis: {
                type: 'value',
                min: 0,
                name: options.yAxisName || '销量（杯）',
                nameTextStyle: {
                    color: '#8A8A8A',
                    fontSize: 11,
                    padding: [0, 0, 0, -20]
                },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: {
                    lineStyle: {
                        color: '#F0F0F0',
                        type: 'dashed'
                    }
                },
                axisLabel: {
                    color: '#8A8A8A',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace"
                }
            },
            series
        };

        chart.setOption(option);

        // Legend 联动：点击「P10–P90区间」时，同步显隐基线系列（保持堆叠完整）
        if (p10Data && p90Data) {
            chart.on('legendselectchanged', function(evt) {
                if (!evt || evt.name !== 'P10–P90区间') return;
                const selectedState = evt.selected && evt.selected['P10–P90区间'];
                chart.dispatchAction({
                    type: selectedState ? 'show' : 'hide',
                    seriesName: 'P10–P90区间_基线'
                });
            });
        }

        setupResize(chart, dom);
        return chart;
    }

    // 创建柱状图
    function createBarChart(dom, categories, values, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const barColor = options.color || '#D4A574';
        const isHorizontal = options.horizontal || false;

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const p = params[0];
                    const val = typeof p.value === 'number' ? p.value.toLocaleString() : p.value;
                    return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
                            <div>${options.valueLabel || '数值'}：<b>${val}</b>${options.unit || ''}</div>`;
                }
            },
            grid: {
                ...base.grid,
                left: '3%',
                top: isHorizontal ? '9%' : '5%',
                bottom: isHorizontal ? '11%' : '16%'
            },
            xAxis: isHorizontal ? {
                type: 'value',
                min: 0,
                name: options.xAxisName || '',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11, align: 'left' },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            } : {
                type: 'category',
                name: options.xAxisName || '',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: categories,
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { show: false },
                axisLabel: {
                    color: '#8A8A8A',
                    fontSize: 11,
                    rotate: categories.length > 6 ? 30 : 0
                }
            },
            yAxis: isHorizontal ? {
                type: 'category',
                name: options.yAxisName || '',
                nameLocation: 'end',
                nameGap: 6,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: categories,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#6B6B6B', fontSize: 12 }
            } : {
                type: 'value',
                min: 0,
                name: options.yAxisName || '',
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            },
            series: [{
                type: 'bar',
                data: values.map(v => ({
                    value: v,
                    itemStyle: {
                        color: barColor,
                        borderRadius: isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
                    }
                })),
                barWidth: options.barWidth || '50%',
                label: {
                    show: options.showLabel || false,
                    position: isHorizontal ? 'right' : 'top',
                    fontSize: 11,
                    color: '#6B6B6B',
                    fontFamily: "'JetBrains Mono', monospace",
                    formatter: function(p) {
                        return p.value.toLocaleString();
                    }
                }
            }]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建多系列柱状图
    function createMultiBarChart(dom, categories, seriesData, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const series = seriesData.map((s, i) => ({
            name: s.name,
            type: 'bar',
            data: s.data,
            barWidth: options.barWidth || '30%',
            itemStyle: {
                color: s.color || Object.values(categoryColors)[i % 9],
                borderRadius: [4, 4, 0, 0]
            }
        }));

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            legend: {
                data: seriesData.map(s => s.name),
                top: 0,
                right: 0,
                icon: 'roundRect',
                itemWidth: 12,
                itemHeight: 8,
                textStyle: { fontSize: 12, color: '#6B6B6B' }
            },
            grid: { ...base.grid, top: '18%' },
            xAxis: {
                type: 'category',
                name: options.xAxisName || '',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: categories,
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { show: false },
                axisLabel: { color: '#8A8A8A', fontSize: 11 }
            },
            yAxis: {
                type: 'value',
                min: 0,
                name: options.yAxisName || '',
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            },
            series
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建堆叠面积图
    function createStackedAreaChart(dom, dates, seriesData, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const series = seriesData.map((s, i) => ({
            name: s.name,
            type: 'line',
            stack: 'total',
            data: s.data,
            smooth: true,
            symbol: 'none',
            areaStyle: {
                opacity: 0.7
            },
            lineStyle: {
                width: 1,
                color: s.color
            },
            itemStyle: {
                color: s.color
            },
            emphasis: {
                focus: 'series'
            }
        }));

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'axis'
            },
            legend: {
                data: seriesData.map(s => s.name),
                top: 0,
                right: 0,
                icon: 'roundRect',
                itemWidth: 12,
                itemHeight: 8,
                textStyle: { fontSize: 12, color: '#6B6B6B' }
            },
            grid: { ...base.grid, top: '18%' },
            xAxis: {
                type: 'category',
                name: options.xAxisName || '日期',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: dates,
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { show: false },
                axisLabel: { color: '#8A8A8A', fontSize: 11 }
            },
            yAxis: {
                type: 'value',
                min: 0,
                name: options.yAxisName || '',
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            },
            series
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建散点图（实际vs预测散点）
    function createScatterChart(dom, actualData, predData, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const scatterData = actualData.map((v, i) => [v, predData[i]]);

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'item',
                formatter: function(p) {
                    return `<div>实际：<b>${p.value[0].toFixed(1)}</b></div>
                            <div>预测：<b>${p.value[1].toFixed(1)}</b></div>
                            <div>误差：<b>${(p.value[1] - p.value[0]).toFixed(1)}</b></div>`;
                }
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '10%',
                top: '5%'
            },
            xAxis: {
                type: 'value',
                name: '实际值（杯）',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            },
            yAxis: {
                type: 'value',
                name: '预测值（杯）',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
            },
            series: [
                {
                    type: 'line',
                    data: [[0, 0], [Math.max(...actualData) * 1.1, Math.max(...actualData) * 1.1]],
                    lineStyle: { color: '#D0D0D0', type: 'dashed', width: 1 },
                    symbol: 'none',
                    silent: true,
                    z: 1
                },
                {
                    type: 'scatter',
                    data: scatterData,
                    symbolSize: 8,
                    itemStyle: {
                        color: 'rgba(212, 165, 116, 0.6)',
                        borderColor: '#D4A574',
                        borderWidth: 1
                    },
                    z: 2
                }
            ]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建热力图
    function createHeatmapChart(dom, xData, yData, data, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                position: 'top',
                formatter: function(p) {
                    return `<div>${p.data[1]} · ${p.data[0]}</div>
                            <div>${options.valueLabel || '数值'}：<b>${p.data[2]}</b></div>`;
                }
            },
            grid: {
                left: '15%',
                right: '5%',
                bottom: '20%',
                top: '5%'
            },
            xAxis: {
                type: 'category',
                data: xData,
                splitArea: { show: true },
                axisLabel: { color: '#8A8A8A', fontSize: 11, rotate: xData.length > 7 ? 30 : 0 }
            },
            yAxis: {
                type: 'category',
                data: yData,
                splitArea: { show: true },
                axisLabel: { color: '#6B6B6B', fontSize: 12 }
            },
            visualMap: {
                min: options.min || 0,
                max: options.max || Math.max(...data.map(d => d[2])),
                calculable: false,
                orient: 'horizontal',
                left: 'center',
                bottom: '0%',
                inRange: {
                    color: ['#FAF6F0', '#E6C88A', '#D4A574', '#B8860B']
                },
                textStyle: { color: '#8A8A8A', fontSize: 10 }
            },
            series: [{
                type: 'heatmap',
                data: data,
                label: {
                    show: options.showLabel || false,
                    fontSize: 10,
                    color: '#5D4037'
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 8,
                        shadowColor: 'rgba(0, 0, 0, 0.2)'
                    }
                }
            }]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建雷达图
    function createRadarChart(dom, indicators, data, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const option = {
            ...base,
            tooltip: { ...base.tooltip },
            legend: {
                data: data.map(d => d.name),
                bottom: 0,
                textStyle: { fontSize: 12, color: '#6B6B6B' }
            },
             radar: {
                 indicator: indicators,
                 shape: 'polygon',
                 splitNumber: 4,
                 center: ['50%', '45%'],
                 radius: '65%',
                 axisName: {
                     color: '#6B6B6B',
                     fontSize: 11
                 },
                splitLine: {
                    lineStyle: { color: '#E5E5E5' }
                },
                splitArea: {
                    show: true,
                    areaStyle: {
                        color: ['#FAF8F5', '#FFFFFF']
                    }
                },
                axisLine: {
                    lineStyle: { color: '#E5E5E5' }
                }
            },
            series: [{
                type: 'radar',
                data: data.map((d, i) => ({
                    value: d.value,
                    name: d.name,
                    areaStyle: {
                        color: d.color || Object.values(storeColors)[i % 3],
                        opacity: 0.2
                    },
                    lineStyle: {
                        color: d.color || Object.values(storeColors)[i % 3],
                        width: 2
                    },
                    itemStyle: {
                        color: d.color || Object.values(storeColors)[i % 3]
                    }
                }))
            }]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建饼图/环形图
    function createDonutChart(dom, data, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'item',
                formatter: function(p) {
                    return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
                            <div>数值：<b>${p.value.toLocaleString()}</b></div>
                            <div>占比：<b>${p.percent}%</b></div>`;
                }
            },
            legend: {
                orient: 'vertical',
                right: '5%',
                top: 'center',
                itemWidth: 10,
                itemHeight: 10,
                textStyle: { fontSize: 12, color: '#6B6B6B' }
            },
            series: [{
                type: 'pie',
                radius: options.radius || ['45%', '70%'],
                center: ['35%', '50%'],
                data: data.map((d, i) => ({
                    value: d.value,
                    name: d.name,
                    itemStyle: {
                        color: d.color || Object.values(categoryColors)[i % 9]
                    }
                })),
                label: {
                    show: false
                },
                emphasis: {
                    scale: true,
                    scaleSize: 5
                }
            }]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 创建特征重要性条形图
    function createFeatureImportanceChart(dom, features, importances, categories, options = {}) {
        const chart = echarts.init(dom);
        const base = getBaseOption();

        // 分类颜色
        const catColors = {
            '时序销量': '#5D4037',
            '日历基础': '#4A7CC2',
            '天气': '#3A9E8C',
            '节假日': '#E08A5C',
            '品类/价格': '#8B7CC4'
        };

        const option = {
            ...base,
            tooltip: {
                ...base.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const p = params[0];
                    return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
                            <div>重要性：<b>${(p.value * 100).toFixed(2)}%</b></div>`;
                }
            },
            grid: {
                left: '3%',
                right: '8%',
                bottom: '3%',
                top: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                min: 0,
                name: options.xAxisName || '特征重要性占比（%）',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11, align: 'left' },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                axisLabel: {
                    color: '#8A8A8A',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    formatter: v => (v * 100).toFixed(0) + '%'
                }
            },
            yAxis: {
                type: 'category',
                name: options.yAxisName || '',
                nameLocation: 'end',
                nameGap: 6,
                nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                data: features,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#6B6B6B', fontSize: 12 }
            },
            series: [{
                type: 'bar',
                data: importances.map((v, i) => ({
                    value: v,
                    itemStyle: {
                        color: catColors[categories[i]] || '#D4A574',
                        borderRadius: [0, 4, 4, 0]
                    }
                })),
                barWidth: '60%'
            }]
        };

        chart.setOption(option);
        setupResize(chart, dom);
        return chart;
    }

    // 根据容器宽度返回是否移动端
    function isNarrow(dom) {
        return dom && dom.clientWidth < 480;
    }

     // 根据容器宽度计算 x 轴标签旋转角度和间隔
     function getXAxisLabelOption(dom, categoryCount) {
         const w = dom ? dom.clientWidth : 1000;
         if (w < 360) {
             return { rotate: 45, interval: Math.floor(categoryCount / 6), fontSize: 10 };
         }
         if (w < 480) {
             return { rotate: categoryCount > 5 ? 30 : 0, interval: categoryCount > 8 ? Math.floor(categoryCount / 5) : 0, fontSize: 10 };
         }
         if (w < 768) {
             return { rotate: categoryCount > 6 ? 20 : 0, interval: 0, fontSize: 11 };
         }
         return { rotate: categoryCount > 6 ? 30 : 0, interval: 0, fontSize: 11 };
     }

    // 自适应调整：resize 时根据容器宽度微调图表配置
    function setupResize(chart, dom) {
        let lastWidth = dom ? dom.clientWidth : 0;

         function applyResponsive() {
             if (!dom || !chart || !chart.getOption) return;
             const w = dom.clientWidth;
             const h = dom.clientHeight;
             if (!w || w === lastWidth) return;
             lastWidth = w;

             try {
                 const opt = chart.getOption();
                 if (!opt) return;

                 const patches = {};

                 // === 雷达图专项适配 ===
                 if (opt.radar && opt.radar[0]) {
                     const radar = opt.radar[0];
                     let radius = '65%';
                     let centerX = '50%';
                     let centerY = '45%';
                     let axisFontSize = 11;
                     let nameGap = 8;
                     let legendFontSize = 12;
                     let legendBottom = 0;

                     if (w < 360) {
                         radius = '55%';
                         centerY = '40%';
                         axisFontSize = 10;
                         nameGap = 6;
                         legendFontSize = 10;
                         legendBottom = 2;
                     } else if (w < 480) {
                         radius = '60%';
                         centerY = '42%';
                         axisFontSize = 10;
                         nameGap = 7;
                         legendFontSize = 11;
                         legendBottom = 2;
                     } else if (w < 768) {
                         radius = '62%';
                         axisFontSize = 11;
                     }

                     patches.radar = [{
                         radius,
                         center: [centerX, centerY],
                         axisName: {
                             ...(radar.axisName || {}),
                             fontSize: axisFontSize
                         },
                         axisNameGap: nameGap
                     }];
                     patches.legend = {
                         bottom: legendBottom,
                         textStyle: {
                             fontSize: legendFontSize
                         }
                     };
                 }
                 // === 普通 xy 轴图表适配 ===
                 else if (opt.xAxis) {
                     // x 轴标签：窄屏旋转 + 间隔
                     const xAxis = opt.xAxis[0];
                     if (xAxis && xAxis.type === 'category' && xAxis.data) {
                         const catCount = xAxis.data.length;
                         let rotate = 0;
                         let interval = 0;
                         let fontSize = 11;

                         if (w < 360) {
                             rotate = catCount > 4 ? 45 : 0;
                             interval = catCount > 6 ? Math.floor(catCount / 5) : 0;
                             fontSize = 10;
                         } else if (w < 480) {
                             rotate = catCount > 5 ? 30 : 0;
                             interval = catCount > 7 ? Math.floor(catCount / 6) : 0;
                             fontSize = 10;
                         } else if (w < 768) {
                             rotate = catCount > 6 ? 20 : 0;
                             fontSize = 10;
                         }

                         patches.xAxis = [{
                             axisLabel: {
                                 ...(xAxis.axisLabel || {}),
                                 rotate,
                                 interval,
                                 fontSize
                             }
                         }];
                     }

                     // 图例：窄屏移到底部居中
                     if (opt.legend && opt.legend[0]) {
                         const legend = opt.legend[0];
                         if (w < 480 && legend.top !== 'auto' && (legend.top === 0 || legend.top === '0')) {
                             patches.legend = {
                                 top: 'auto',
                                 bottom: 2,
                                 left: 'center',
                                 orient: 'horizontal',
                                 textStyle: {
                                     ...(legend.textStyle || {}),
                                     fontSize: 10
                                 }
                             };
                             // 调整 grid top，给底部图例腾空间
                             if (opt.grid && opt.grid[0]) {
                                 patches.grid = { top: '8%', bottom: '12%' };
                             }
                         }
                     }
                 }

                 if (Object.keys(patches).length > 0) {
                     chart.setOption(patches, false);
                 }
             } catch (e) {
                 // 静默失败，不影响渲染
             }
         }

        const observer = new ResizeObserver(() => {
            applyResponsive();
            chart.resize();
        });
        observer.observe(dom);

        // 初始也应用一次（确保首次渲染就是响应式的）
        setTimeout(applyResponsive, 50);
    }

    return {
        colors,
        categoryColors,
        storeColors,
        createForecastLineChart,
        createBarChart,
        createMultiBarChart,
        createStackedAreaChart,
        createScatterChart,
        createHeatmapChart,
        createRadarChart,
        createDonutChart,
        createFeatureImportanceChart,
        setupResize
    };
})();
