/**
 * 扩展能力页面 - 智能订货与排班
 */

const ExtensionsPage = (function() {
    let charts = {};
    let currentTab = 'ordering'; // ordering / scheduling

    function render(container) {
        container.innerHTML = `
            <div class="card" style="margin-bottom:20px">
                <div class="card-body" style="padding:20px">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
                        <span class="data-badge sim" style="font-size:12px;padding:4px 10px">能力演示</span>
                        <span style="font-size:13px;color:var(--gray-600)">
                            以下功能基于咖啡店真实 SKU 需求输入与 <b>虚拟 BOM/库存/人员参数</b> 模拟计算，仅展示计算链路，不代表真实经营结果。
                        </span>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                        <span class="data-badge real">真实数据：SKU 需求</span>
                        <span class="data-badge sim">模拟计算：BOM / 库存 / 成本</span>
                        <span class="data-badge sim">能力演示：排班 / 人效</span>
                    </div>
                </div>
            </div>

            <div style="display:flex;justify-content:center;margin-bottom:20px">
                <div class="tabs" style="padding:6px">
                    <button class="tab ${currentTab === 'ordering' ? 'active' : ''}" onclick="ExtensionsPage.switchTab('ordering')">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 0 1-8 0"/>
                        </svg>
                        智能订货
                    </button>
                    <button class="tab ${currentTab === 'scheduling' ? 'active' : ''}" onclick="ExtensionsPage.switchTab('scheduling')">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        智能排班
                    </button>
                </div>
            </div>

            <div id="orderingPanel" style="${currentTab === 'ordering' ? '' : 'display:none'}">
                ${renderOrderingPanel()}
            </div>

            <div id="schedulingPanel" style="${currentTab === 'scheduling' ? '' : 'display:none'}">
                ${renderSchedulingPanel()}
            </div>
        `;

        initCharts();
    }

     function renderOrderingPanel() {
         const data = DataLoader.getData();

         return `
              <div id="demo-orderingCore">
              <div class="grid grid-4" style="margin-bottom:20px" id="demo-extOrderingKpi">
                <div class="kpi-card">
                     <span class="data-badge sim">能力演示</span>
                     <div class="kpi-label">演示需求总量</div>
                     <div class="kpi-value small">1,847<span class="kpi-unit">杯</span><span style="font-size:12px;color:var(--gray-500);font-weight:400">*</span></div>
                     <div class="kpi-change neutral">明日（演示常量）</div>
                 </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">建议订货量</div>
                    <div class="kpi-value small sim-value" style="color:var(--data-teal)">1,986<span class="kpi-unit">杯当量</span></div>
                    <div class="kpi-change positive">含 7.5% 安全库存</div>
                </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">预估订货成本</div>
                    <div class="kpi-value small sim-value">$3,240</div>
                    <div class="kpi-change neutral">原材料成本</div>
                </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">预计报损率</div>
                    <div class="kpi-value small sim-value" style="color:var(--success)">2.1%</div>
                    <div class="kpi-change neutral">行业平均 5-8%</div>
                </div>
            </div>

             <div style="font-size:12px;color:var(--gray-500);margin:-12px 0 16px 4px;line-height:1.6">
                  * 演示需求总量为静态历史日均基线（181 天总销量 / 181），不是未来模型预测；真实上线需从未来门店×SKU 预测明细聚合。
             </div>

             <div class="grid grid-main" style="margin-bottom:20px">
                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">原材料需求拆解</div>
                         <span class="data-badge sim">模拟计算</span>
                    </div>
                    <div class="card-body">
                        <div id="bomChart" class="chart-container large"></div>
                    </div>
                    <div class="card-footer">
                        基于虚拟 BOM 成本卡换算，实际成本卡需接入门店真实配方数据
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">库存安全建议</div>
                        <span class="data-badge sim">模拟计算</span>
                    </div>
                    <div class="card-body">
                        <div class="rank-list">
                            <div class="rank-item">
                                <div class="rank-num" style="background:var(--danger-light);color:var(--danger)">!</div>
                                <div class="rank-name">
                                    牛奶
                                    <div style="font-size:11px;color:var(--gray-400);font-weight:400">预计库存仅够 1.5 天</div>
                                </div>
                                <div style="text-align:right">
                                    <div class="badge badge-danger">紧急</div>
                                </div>
                            </div>
                            <div class="rank-item">
                                <div class="rank-num" style="background:var(--warning-light);color:var(--warning)">!</div>
                                <div class="rank-name">
                                    咖啡豆
                                    <div style="font-size:11px;color:var(--gray-400);font-weight:400">预计库存 3.2 天</div>
                                </div>
                                <div style="text-align:right">
                                    <div class="badge badge-warning">关注</div>
                                </div>
                            </div>
                            <div class="rank-item">
                                <div class="rank-num" style="background:var(--success-light);color:var(--success)">✓</div>
                                <div class="rank-name">
                                    茶叶
                                    <div style="font-size:11px;color:var(--gray-400);font-weight:400">预计库存 7.8 天</div>
                                </div>
                                <div style="text-align:right">
                                    <div class="badge badge-success">正常</div>
                                </div>
                            </div>
                            <div class="rank-item">
                                <div class="rank-num" style="background:var(--success-light);color:var(--success)">✓</div>
                                <div class="rank-name">
                                    糖浆
                                    <div style="font-size:11px;color:var(--gray-400);font-weight:400">预计库存 12.5 天</div>
                                </div>
                                <div style="text-align:right">
                                    <div class="badge badge-success">充足</div>
                                </div>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                            <div>• 安全库存天数：3 天</div>
                            <div>• 订货周期：每日订货</div>
                            <div>• 到货时效：次日达</div>
                        </div>
                    </div>
                 </div>
             </div>
             <!-- end demo-orderingCore -->

             <div class="card">
                 <div class="card-header">
                     <div class="card-title">商品级订货建议</div>
                    <span class="data-badge sim">模拟计算</span>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                             <tr>
                                 <th>商品</th>
                                 <th class="hide-mobile">品类</th>
                                   <th class="num">历史日均销量<br><span style="font-weight:400;font-size:10px;color:var(--gray-500)">真实数据计算</span></th>
                                  <th class="num">建议订货量<br><span style="font-weight:400;font-size:10px;color:var(--amber-600)">模拟*</span></th>
                                  <th class="num hide-mobile">安全库存<br><span style="font-weight:400;font-size:10px;color:var(--amber-600)">模拟*</span></th>
                                  <th class="num hide-mobile">当前库存<br><span style="font-weight:400;font-size:10px;color:var(--amber-600)">模拟*</span></th>
                                  <th class="num">需补货<br><span style="font-weight:400;font-size:10px;color:var(--amber-600)">模拟*</span></th>
                                 <th>优先级</th>
                             </tr>
                        </thead>
                        <tbody>
                            ${data.skuList.slice(0, 15).map((sku, i) => {
                                const dailyAvg = Math.round(sku.total_qty / 181);
                                const safetyStock = Math.round(dailyAvg * 0.3);
                                const suggested = dailyAvg + safetyStock;
                                const currentStock = Math.round(dailyAvg * (0.5 + Math.random() * 2));
                                const needOrder = Math.max(0, suggested - currentStock);
                                const priority = needOrder > dailyAvg * 0.5 ? '高' : needOrder > 0 ? '中' : '低';
                                return `
                                     <tr title="${DataLoader.getSkuTooltip(sku.product_detail, sku.product_id)}">
                                         <td style="font-weight:500">${DataLoader.getSkuDisplayName(sku.product_detail, sku.product_id)}</td>
                                         <td class="hide-mobile"><span class="tag">${DataLoader.getCategoryDisplayName(sku.product_category)}</span></td>
                                          <td class="num" style="font-family:'JetBrains Mono',monospace">${dailyAvg}</td>
                                          <td class="num sim-value" style="font-family:'JetBrains Mono',monospace;color:var(--amber-600)">${suggested}</td>
                                          <td class="num sim-value hide-mobile" style="font-family:'JetBrains Mono',monospace;color:var(--gray-500)">${safetyStock}</td>
                                          <td class="num sim-value hide-mobile" style="font-family:'JetBrains Mono',monospace">${currentStock}</td>
                                          <td class="num sim-value" style="font-family:'JetBrains Mono',monospace;font-weight:600;color:${needOrder > 0 ? 'var(--danger)' : 'var(--success)'}">
                                              ${needOrder > 0 ? '+' + needOrder : '0'}
                                          </td>
                                         <td>
                                             <span class="badge ${priority === '高' ? 'badge-danger' : priority === '中' ? 'badge-warning' : 'badge-success'}">${priority}</span>
                                         </td>
                                     </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                 <div class="card-footer">
                      <span class="data-badge sim">模拟计算</span> 历史日均销量 = 181 天总销量 / 181，来自真实交易数据，不是未来预测；订货量、库存、安全库存和 BOM 仍为模拟计算/能力演示
                 </div>
            </div>
        `;
    }

    function renderSchedulingPanel() {
        const data = DataLoader.getData();

        const shifts = ['早班 6:00-14:00', '中班 10:00-18:00', '晚班 14:00-22:00'];
        const roles = ['店长', '咖啡师', '收银员', '烘焙师'];

        return `
            <div class="grid grid-4" style="margin-bottom:20px">
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">预计总工时</div>
                    <div class="kpi-value small sim-value">42.5<span class="kpi-unit">小时</span></div>
                    <div class="kpi-change neutral">明日排班</div>
                </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">排班人数</div>
                    <div class="kpi-value small sim-value">6<span class="kpi-unit">人</span></div>
                    <div class="kpi-change neutral">3 个班次</div>
                </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">预估人工成本</div>
                    <div class="kpi-value small sim-value">$680</div>
                    <div class="kpi-change neutral">占营收 ~18%</div>
                </div>
                <div class="kpi-card">
                    <span class="data-badge sim">模拟计算</span>
                    <div class="kpi-label">人效</div>
                    <div class="kpi-value small sim-value" style="color:var(--success)">43.5<span class="kpi-unit">杯/人/时</span></div>
                    <div class="kpi-change positive">行业优秀水平</div>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div class="card-title">按小时人员需求 vs 排班</div>
                    <span class="data-badge sim">能力演示</span>
                </div>
                <div class="card-body">
                    <div id="scheduleChart" class="chart-container large"></div>
                </div>
                <div class="card-footer">
                    基于小时销量预测和人均产能计算所需人员，实际排班需结合劳动法、员工技能、休假等约束优化
                </div>
            </div>

            <div class="grid grid-2">
                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">班次人员安排</div>
                         <span class="data-badge sim">模拟计算</span>
                     </div>
                    <div class="card-body">
                        ${shifts.map((shift, si) => `
                            <div style="margin-bottom:${si < shifts.length - 1 ? '16px' : '0'}">
                                <div style="font-size:13px;font-weight:600;color:var(--coffee-800);margin-bottom:8px">${shift}</div>
                                <div class="tag-group">
                                    ${roles.slice(0, 3 - si).map(role => `
                                        <span class="tag amber">${role} × ${si === 1 ? 2 : 1}</span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                        <div class="divider"></div>
                        <div style="font-size:12px;color:var(--gray-600);line-height:1.8">
                            <div>• 早班：开店准备 + 早高峰</div>
                            <div>• 中班：午高峰覆盖（人员最多）</div>
                            <div>• 晚班：晚高峰 + 收店清洁</div>
                        </div>
                    </div>
                </div>

                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">门店对比 · 排班效率</div>
                         <span class="data-badge sim">能力演示</span>
                     </div>
                    <div class="card-body">
                        <div id="storeScheduleChart" class="chart-container" style="min-height:300px"></div>
                    </div>
                </div>
            </div>
        `;
    }

    function switchTab(tab) {
        currentTab = tab;
        const container = document.getElementById('pageContainer');
        render(container);
    }

    function initCharts() {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        // BOM拆解图
        const bomDom = document.getElementById('bomChart');
        if (bomDom && currentTab === 'ordering') {
            const materials = ['牛奶', '咖啡豆', '茶叶', '糖浆', '奶油', '巧克力酱', '面包', '纸杯'];
            const quantities = [480, 120, 85, 45, 60, 35, 180, 520];
            const units = ['L', 'kg', 'kg', 'L', 'L', 'kg', '个', '个'];

            const chart = echarts.init(bomDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        const idx = params[0].dataIndex;
                        return `<div style="font-weight:600">${materials[idx]}</div>
                                <div>需求量：<b>${quantities[idx]} ${units[idx]}</b></div>`;
                    }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '5%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '原料类别',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: materials,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#6B6B6B', fontSize: 12 },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    name: '订货需求量（L / kg / 个）',
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                },
                series: [{
                    type: 'bar',
                    data: quantities.map((v, i) => ({
                        value: v,
                        itemStyle: {
                            color: i < 3 ? '#5D4037' : i < 6 ? '#D4A574' : '#BCAAA4',
                            borderRadius: [4, 4, 0, 0]
                        }
                    })),
                    barWidth: '45%',
                    label: {
                        show: true,
                        position: 'top',
                        fontSize: 11,
                        color: '#6B6B6B',
                        formatter: function(p) {
                            return p.value + ' ' + units[p.dataIndex];
                        }
                    }
                }]
            });
            ChartUtils.setupResize(chart, bomDom);
            charts.bom = chart;
        }

        // 排班图
        const schedDom = document.getElementById('scheduleChart');
        if (schedDom && currentTab === 'scheduling') {
            const hours = Array.from({ length: 15 }, (_, i) => `${i + 6}:00`);
            const demand = [1.2, 1.8, 2.5, 3.2, 2.8, 2.5, 3.0, 3.5, 4.0, 3.8, 3.2, 2.8, 2.5, 2.0, 1.5];
            const actual = [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 3, 3, 2, 2, 2];

            const chart = echarts.init(schedDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis'
                },
                legend: {
                    data: ['需求人数', '实际排班', '缺口/富余'],
                    top: 0,
                    right: 0,
                    textStyle: { fontSize: 12, color: '#6B6B6B' }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
                xAxis: {
                    type: 'category',
                    name: '营业时段（点钟）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: hours,
                    axisLine: { lineStyle: { color: '#E5E5E5' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11 },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    name: '需求 / 在岗人数（人）',
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    min: 0,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                },
                series: [
                    {
                        name: '需求人数',
                        type: 'line',
                        data: demand,
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { color: '#D4A574', width: 2, type: 'dashed' },
                        areaStyle: {
                            color: 'rgba(212, 165, 116, 0.1)'
                        }
                    },
                    {
                        name: '实际排班',
                        type: 'bar',
                        data: actual.map((v, i) => ({
                            value: v,
                            itemStyle: {
                                color: demand[i] > v ? '#D96565' : '#5BA67A',
                                borderRadius: [4, 4, 0, 0]
                            }
                        })),
                        barWidth: '50%'
                    }
                ]
            });
            ChartUtils.setupResize(chart, schedDom);
            charts.schedule = chart;
        }

        // 门店排班效率
        const storeSchedDom = document.getElementById('storeScheduleChart');
        if (storeSchedDom && currentTab === 'scheduling') {
            const data = DataLoader.getData();
            const stores = data.storeNames;

            const chart = echarts.init(storeSchedDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' }
                },
                legend: {
                    data: ['人效(杯/人/时)', '人工成本占比'],
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
                        min: 0,
                        name: '人效（杯/人/时）',
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                        axisLabel: { color: '#8A8A8A', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }
                    },
                    {
                        type: 'value',
                        name: '占比 (%)',
                        max: 30,
                        nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { color: '#8A8A8A', fontSize: 11, formatter: '{value}%' }
                    }
                ],
                series: [
                    {
                        name: '人效(杯/人/时)',
                        type: 'bar',
                        data: stores.map((s, i) => ({
                            value: [38, 45, 42][i],
                            itemStyle: { color: ChartUtils.storeColors[s], borderRadius: [4, 4, 0, 0] }
                        })),
                        barWidth: '30%',
                        yAxisIndex: 0,
                        label: {
                            show: true,
                            position: 'top',
                            fontSize: 11,
                            color: '#6B6B6B'
                        }
                    },
                    {
                        name: '人工成本占比',
                        type: 'line',
                        data: [19.5, 17.2, 18.8],
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: { color: '#D96565', width: 2 },
                        itemStyle: { color: '#D96565' },
                        yAxisIndex: 1
                    }
                ]
            });
            ChartUtils.setupResize(chart, storeSchedDom);
            charts.storeSched = chart;
        }
    }

    return {
        render,
        switchTab,
        getCurrentTab: function() { return currentTab; }
    };
})();
