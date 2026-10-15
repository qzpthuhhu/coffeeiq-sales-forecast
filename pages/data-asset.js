/**
 * 数据资产中心页面
 */

const DataAssetPage = (function() {
    function render(container) {
        const data = DataLoader.getData();
        const summary = data.summary;

        container.innerHTML = `
             <div class="card" style="margin-bottom:20px" id="demo-dataAssetCard">
                <div class="card-header">
                    <div>
                        <div class="card-title">数据资产总览</div>
                        <div class="card-subtitle">Coffee Shop Sales Dataset · 纽约 · 2023 H1</div>
                    </div>
                     <span class="data-badge real">真实数据</span>
                </div>
                <div class="card-body">
                    <div class="data-stat-grid">
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.totalQty.toLocaleString()}</div>
                            <div class="data-stat-label">总销量（杯）</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">$${(summary.totalRevenue / 1000).toFixed(0)}K</div>
                            <div class="data-stat-label">总营收</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">149,116</div>
                            <div class="data-stat-label">交易记录数</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.dayCount}</div>
                            <div class="data-stat-label">覆盖天数</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.storeCount}</div>
                            <div class="data-stat-label">门店数</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.categoryCount}</div>
                            <div class="data-stat-label">品类数</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.productTypeCount}</div>
                            <div class="data-stat-label">产品类型</div>
                        </div>
                        <div class="data-stat-item">
                            <div class="data-stat-number">${summary.skuCount}</div>
                            <div class="data-stat-label">SKU 数</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2"/>
                                <path d="M16 2v4M8 2v4M3 10h18"/>
                            </svg>
                            时间范围
                        </div>
                    </div>
                    <div class="card-body">
                        <div style="margin-bottom:16px">
                            <div style="font-size:13px;color:var(--gray-500);margin-bottom:8px">训练 + 测试期</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:600;color:var(--coffee-800)">
                                ${summary.dateRange.start} → ${summary.dateRange.end}
                            </div>
                            <div style="font-size:12px;color:var(--gray-500);margin-top:4px">共 ${summary.dayCount} 天 · 6 个月</div>
                        </div>

                        <div style="margin-bottom:16px">
                            <div style="font-size:13px;color:var(--gray-500);margin-bottom:8px">训练集</div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <div style="flex:1;height:12px;background:var(--coffee-50);border-radius:6px;overflow:hidden;position:relative">
                                    <div style="position:absolute;left:0;top:0;bottom:0;width:96%;background:linear-gradient(90deg,var(--coffee-700),var(--coffee-500));border-radius:6px"></div>
                                </div>
                                <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gray-600)">174天</span>
                            </div>
                        </div>

                        <div>
                            <div style="font-size:13px;color:var(--gray-500);margin-bottom:8px">测试集</div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <div style="flex:1;height:12px;background:var(--coffee-50);border-radius:6px;overflow:hidden;position:relative">
                                    <div style="position:absolute;right:0;top:0;bottom:0;width:4%;background:linear-gradient(90deg,var(--amber-400),var(--amber-500));border-radius:6px"></div>
                                </div>
                                <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gray-600)">7天</span>
                            </div>
                        </div>

                        <div class="divider"></div>

                        <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                            <div>• 采用时间序列分割，前 174 天训练，最后 7 天测试</div>
                            <div>• 严格按时间切分，防止未来信息泄漏</div>
                            <div>• 交叉验证采用 TimeSeriesSplit (n_splits=3)</div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            </svg>
                            门店分布
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="rank-list">
                            ${data.storeNames.map((name, i) => {
                                const storeDaily = data.dailyStore.filter(d => d.store_location === name);
                                const qty = storeDaily.reduce((s, d) => s + d.qty, 0);
                                const revenue = storeDaily.reduce((s, d) => s + d.revenue, 0);
                                const avgPrice = revenue / storeDaily.reduce((s, d) => s + d.transactions, 0);
                                return `
                                     <div class="rank-item">
                                         <div class="rank-num" style="background:${ChartUtils.storeColors[name]}20;color:${ChartUtils.storeColors[name]}">${i + 1}</div>
                                         <div class="rank-name" title="${DataLoader.getStoreDisplayName(name)}｜${name}">
                                             ${DataLoader.getStoreDisplayName(name)}
                                             <div style="font-size:11px;color:var(--gray-400);font-weight:400">纽约 · Manhattan/Queens</div>
                                         </div>
                                        <div style="text-align:right">
                                            <div style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--coffee-800)">${qty.toLocaleString()}</div>
                                            <div style="font-size:11px;color:var(--gray-400)">杯 · 客单价 $${avgPrice.toFixed(2)}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="divider"></div>
                        <div id="storeBarChart" class="chart-container small"></div>
                    </div>
                </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <path d="M16 10a4 4 0 0 1-8 0"/>
                            </svg>
                            品类 · 产品类型 · SKU 层级
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="categoryTreeChart" class="chart-container" style="min-height:320px"></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            天气数据覆盖
                        </div>
                    </div>
                    <div class="card-body">
                        <div style="margin-bottom:16px">
                            <div style="font-size:13px;color:var(--gray-500);margin-bottom:8px">数据来源</div>
                            <div style="font-size:14px;color:var(--coffee-800);font-weight:500">Open-Meteo API · NYC 逐日天气</div>
                        </div>

                        <div class="grid grid-2" style="gap:12px">
                            <div style="padding:12px;background:var(--gray-50);border-radius:8px">
                                <div style="font-size:11px;color:var(--gray-500);margin-bottom:4px">温度范围</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:var(--coffee-800)">-2.4 ~ 34.4°C</div>
                            </div>
                            <div style="padding:12px;background:var(--gray-50);border-radius:8px">
                                <div style="font-size:11px;color:var(--gray-500);margin-bottom:4px">降雨天数</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:var(--data-blue)">78 天</div>
                            </div>
                            <div style="padding:12px;background:var(--gray-50);border-radius:8px">
                                <div style="font-size:11px;color:var(--gray-500);margin-bottom:4px">晴天/多云</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:var(--amber-600)">103 天</div>
                            </div>
                            <div style="padding:12px;background:var(--gray-50);border-radius:8px">
                                <div style="font-size:11px;color:var(--gray-500);margin-bottom:4px">特征维度</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:var(--data-teal)">13 维</div>
                            </div>
                        </div>

                        <div class="divider"></div>

                        <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                            <div>• 最高温/最低温/均温 · 降水量/降雪量</div>
                            <div>• 日照时长 · 风速 · 相对湿度</div>
                            <div>• 天气编码 · 晴/雨/雪标记 · 温度分级</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <path d="M14 2v6h6"/>
                        </svg>
                        数据口径说明
                    </div>
                </div>
                <div class="card-body">
                    <div class="grid grid-3" style="gap:16px">
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:10px">销售数据</div>
                            <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                                <div>• 销量：transaction_qty（杯）</div>
                                <div>• 营收：qty × unit_price</div>
                                <div>• 客单价：营收 / 交易数</div>
                                <div>• 时间粒度：按天聚合</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:10px">预测口径</div>
                            <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                                <div>• 预测值：LightGBM Tweedie 直接多步</div>
                                <div>• P10/P50/P90：分位数 + split conformal 校准</div>
                                <div>• R²：决定系数</div>
                                <div>• MAE：平均绝对误差（杯）</div>
                                <div>• WAPE：加权绝对百分比误差</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:10px">层级定义</div>
                            <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                                <div>• 品类：product_category（9个）</div>
                                <div>• 产品类型：product_type（29个）</div>
                                <div>• 商品中文名称（80个）</div>
                                <div>• 层级关系：1:N:M</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    数据来源：Kaggle Coffee Shop Sales Dataset · Open-Meteo Weather API · 数据截止 2023-06-30
                </div>
            </div>
        `;

        // 初始化图表
        initCharts();
    }

    function initCharts() {
        const data = DataLoader.getData();

        // 门店对比柱状图
        const storeBarDom = document.getElementById('storeBarChart');
        if (storeBarDom) {
            const storeData = data.storeNames.map(name => {
                const storeDaily = data.dailyStore.filter(d => d.store_location === name);
                return storeDaily.reduce((s, d) => s + d.qty, 0);
            });
             ChartUtils.createBarChart(storeBarDom, data.storeNames.map(n => DataLoader.getStoreDisplayName(n)), storeData, {
                horizontal: true,
                xAxisName: '累计销量（杯）',
                yAxisName: '门店',
                valueLabel: '销量',
                unit: ' 杯',
                showLabel: true,
                color: '#5D4037'
            });
        }

        // 品类树状图
        const treeDom = document.getElementById('categoryTreeChart');
        if (treeDom) {
             const catData = data.categories.map(cat => {
                 const skus = data.skuList.filter(s => s.product_category === cat);
                 return {
                     name: DataLoader.getCategoryDisplayName(cat),
                     value: skus.reduce((s, sku) => s + sku.total_qty, 0),
                     children: [...new Set(skus.map(s => s.product_type))].map(pt => ({
                         name: DataLoader.getProductTypeDisplayName(pt),
                         value: skus.filter(s => s.product_type === pt).reduce((s, sku) => s + sku.total_qty, 0),
                         children: skus.filter(s => s.product_type === pt).map(sku => ({
                             name: DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id),
                             value: sku.total_qty
                         }))
                     }))
                 };
             });

            const chart = echarts.init(treeDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    borderColor: 'rgba(212, 165, 116, 0.3)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    padding: [10, 14],
                    formatter: function(p) {
                        return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
                                <div>销量：<b>${p.value.toLocaleString()}</b> 杯</div>`;
                    }
                },
                series: [{
                    type: 'treemap',
                    data: catData.map((c, i) => ({
                        name: c.name,
                        value: c.value,
                        itemStyle: {
                            color: ChartUtils.categoryColors[c.name] || '#D4A574'
                        },
                        children: c.children.map(pt => ({
                            name: pt.name,
                            value: pt.value
                        }))
                    })),
                    label: {
                        show: true,
                        formatter: '{b}',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#fff',
                        textBorderColor: 'rgba(0,0,0,0.3)',
                        textBorderWidth: 1
                    },
                    upperLabel: {
                        show: true,
                        height: 28,
                        color: '#fff',
                        fontWeight: 600
                    },
                    itemStyle: {
                        borderColor: '#fff',
                        borderWidth: 2,
                        gapWidth: 2
                    },
                    levels: [
                        {
                            itemStyle: {
                                borderWidth: 0,
                                gapWidth: 3,
                                borderColor: '#fff'
                            },
                            upperLabel: { show: true }
                        },
                        {
                            itemStyle: {
                                gapWidth: 1,
                                borderColor: 'rgba(255,255,255,0.5)'
                            }
                        }
                    ],
                    breadcrumb: {
                        show: true,
                        bottom: 0,
                        itemStyle: {
                            color: '#fff',
                            textStyle: { color: '#5D4037' },
                            borderColor: '#E5E5E5',
                            color: '#FAF8F5'
                        }
                    }
                }]
            });
            ChartUtils.setupResize(chart, treeDom);
        }
    }

    return { render };
})();
