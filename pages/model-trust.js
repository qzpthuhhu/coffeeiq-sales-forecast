/**
 * 模型可信度页面
 */

const ModelTrustPage = (function() {
    function render(container) {
        const m = DataLoader.getData().summary.metrics;
        container.innerHTML = `
            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div>
                        <div class="card-title">模型可信度总览</div>
                        <div class="card-subtitle">数据来源 · 特征工程 · 训练策略 · 评估指标 · 已知限制</div>
                    </div>
                    <span class="badge badge-success">生产中</span>
                </div>
                <div class="card-body">
                    <div class="grid grid-4">
                        <div class="data-stat-item" style="border-left:3px solid var(--success)">
                            <div class="data-stat-number" style="font-size:24px">${m.typeDay.r2.toFixed(3)}</div>
                            <div class="data-stat-label">产品类型×日 R²（203 样本）</div>
                        </div>
                        <div class="data-stat-item" style="border-left:3px solid var(--amber-500)">
                            <div class="data-stat-number" style="font-size:24px">${m.typeDay.hit10.toFixed(1)}%</div>
                            <div class="data-stat-label">±10% 命中率</div>
                        </div>
                        <div class="data-stat-item" style="border-left:3px solid var(--data-blue)">
                            <div class="data-stat-number" style="font-size:24px">${m.skuStoreDay.n.toLocaleString()}</div>
                            <div class="data-stat-label">最细粒度样本（SKU级）</div>
                        </div>
                        <div class="data-stat-item" style="border-left:3px solid var(--data-teal)">
                            <div class="data-stat-number" style="font-size:24px">0 泄漏</div>
                            <div class="data-stat-label">数据泄漏</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/>
                                <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/>
                            </svg>
                            数据来源
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="trust-section">
                            <div class="trust-grid">
                                <div class="trust-item">
                                    <div class="trust-item-label">销售数据</div>
                                    <div class="trust-item-value">Kaggle Coffee Shop Sales</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">数据量</div>
                                    <div class="trust-item-value">149,116 条交易记录</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">时间跨度</div>
                                    <div class="trust-item-value">2023.01.01 - 06.30</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">门店范围</div>
                                    <div class="trust-item-value">纽约市 · 3 家门店</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">天气数据</div>
                                    <div class="trust-item-value">Open-Meteo API</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">节假日</div>
                                    <div class="trust-item-value">美国联邦假期 13 个</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                 <div class="card">
                     <div class="card-header">
                         <div class="card-title">
                             <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                 <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
                             </svg>
                             特征工程 · 全局重要性
                         </div>
                         <span class="badge badge-default" style="font-size:11px">GB 模型 · 分裂增益</span>
                     </div>
                     <div class="card-body">
                         <div id="trustFeatureImportanceChart" class="chart-container" style="min-height:280px;margin-bottom:12px"></div>
                         <div style="font-size:11px;color:var(--gray-500);line-height:1.8">
                              以上为 LightGBM Tweedie 模型的全局特征重要性（Gain），基于分裂增益相对贡献，<b>不含正负方向</b>，
                              不代表因果。逐预测正反向解释请使用 AI 寻因中心的 TreeSHAP（445,200 条精确贡献）。
                         </div>
                     </div>
                 </div>
            </div>

            <div class="grid grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            训练策略与防泄漏
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="trust-section">
                            <div class="trust-section-title">时间切分</div>
                            <div class="trust-grid">
                                <div class="trust-item">
                                    <div class="trust-item-label">训练集</div>
                                    <div class="trust-item-value">前 174 天（01/01 - 06/23）</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">测试集</div>
                                    <div class="trust-item-value">后 7 天（06/24 - 06/30）</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">交叉验证</div>
                                    <div class="trust-item-value">TimeSeriesSplit, n_splits=3</div>
                                </div>
                                <div class="trust-item">
                                    <div class="trust-item-label">切分原则</div>
                                    <div class="trust-item-value">严格按时间，禁用 shuffle</div>
                                </div>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <div class="trust-section">
                            <div class="trust-section-title">防数据泄漏设计</div>
                            <div style="font-size:13px;color:var(--gray-700);line-height:2">
                                <div>✓ 所有 lag 特征均基于 t-1 及更早数据计算</div>
                                <div>✓ 滚动统计（rolling_*）仅用历史窗口，不含当日</div>
                                <div>✓ 周内同日均值（dow_avg）排除当周</div>
                                <div>✓ 天气特征使用当日实际值（可由预报替代）</div>
                                <div>✓ 节假日特征为确定性日历信息</div>
                                <div>✓ 不使用任何未来信息作为特征输入</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
                            </svg>
                             模型架构
                        </div>
                    </div>
                    <div class="card-body">
                         <div class="trust-section">
                             <div class="trust-section-title">LightGBM Tweedie 直接多步</div>
                             <div class="grid grid-2" style="gap:12px">
                                 <div style="padding:16px;background:var(--coffee-50);border-radius:10px;border-left:3px solid var(--coffee-600)">
                                     <div style="font-weight:600;color:var(--coffee-800);margin-bottom:4px">点预测：Tweedie 1.3</div>
                                     <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">Global LightGBM · 直接多步</div>
                                     <div style="font-size:11px;color:var(--gray-500);line-height:1.7">
                                         • 天然适配计数型需求<br>
                                         • 5 窗口滚动回测 · 35 天验证<br>
                                         • 53 维特征含 4 个稀疏标签
                                     </div>
                                 </div>
                                 <div style="padding:16px;background:var(--teal-light, #E0F2F1);border-radius:10px;border-left:3px solid var(--data-teal)">
                                     <div style="font-weight:600;color:var(--coffee-800);margin-bottom:4px">区间：分位数 + conformal</div>
                                     <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">P10 / P50 / P90 · 校准</div>
                                     <div style="font-size:11px;color:var(--gray-500);line-height:1.7">
                                         • LightGBM 分位数模型<br>
                                         • Split Conformal 区间校准<br>
                                         • 总体覆盖 ~80.6%
                                     </div>
                                 </div>
                             </div>
                         </div>
                        <div class="divider"></div>
                        <div class="trust-section">
                            <div class="trust-section-title">建模方式</div>
                            <div style="font-size:13px;color:var(--gray-700);line-height:2">
                                 <div><b>Direct Multi-step</b> — 按 horizon 独立构建 T+1 ~ T+7 特征帧</div>
                                 <div style="font-size:12px;color:var(--gray-500);margin-top:4px">
                                     消除递归累积误差，每步直接预测；Global 模型共享参数，冷启动友好
                                 </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div class="card-title">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        指标口径
                    </div>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>指标</th>
                                <th>全称</th>
                                <th>计算公式</th>
                                <th>含义</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight:600">R²</td>
                                <td>决定系数 (R-squared)</td>
                                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">1 - SS_res / SS_tot</td>
                                <td style="color:var(--gray-600)">模型解释方差的比例，越接近1越好</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600">MAE</td>
                                <td>平均绝对误差</td>
                                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">mean(|y - ŷ|)</td>
                                <td style="color:var(--gray-600)">预测值与实际值的平均绝对偏差（杯）</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600">RMSE</td>
                                <td>均方根误差</td>
                                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">sqrt(mean((y-ŷ)²))</td>
                                <td style="color:var(--gray-600)">对大误差更敏感的误差指标（杯）</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600">MAPE</td>
                                <td>平均绝对百分比误差</td>
                                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">mean(|(y-ŷ)/y|)</td>
                                <td style="color:var(--gray-600)">相对误差百分比，低值为优</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600">±X% 命中率</td>
                                <td>误差在 ±X% 内的比例</td>
                                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">count(|y − ŷ| / (y + 1) &lt; X%) / N</td>
                                <td style="color:var(--gray-600)">预测落在真实值 ±X% 范围内的样本占比；分母 +1 避免零销量除零</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="card-footer" style="font-size:12px;color:var(--gray-500);line-height:1.7">
                    评估基于 2023-06-24 ~ 06-30 共 7 天测试集；指标值随聚合粒度变化，粗粒度指标不能直接反映 SKU 级预测能力。
                </div>
            </div>

            <!-- 各层级指标一览表 -->
            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div class="card-title">各聚合层级指标一览</div>
                    <span class="badge badge-info">7 个层级</span>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                             <tr>
                                 <th>层级名称</th>
                                 <th class="hide-mobile">聚合键</th>
                                 <th class="num hide-mobile">样本数</th>
                                 <th class="num">R²</th>
                                 <th class="num">MAE（杯）</th>
                                 <th class="num hide-mobile">±10% 命中</th>
                                 <th class="num">±20% 命中</th>
                             </tr>
                        </thead>
                        <tbody>
                             <tr>
                                 <td style="font-weight:600">门店×SKU×日</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × store_id × product_id</td>
                                 <td class="num hide-mobile">${m.skuStoreDay.n.toLocaleString()}</td>
                                 <td class="num" style="color:var(--success)">${m.skuStoreDay.r2.toFixed(3)}</td>
                                 <td class="num">${m.skuStoreDay.mae.toFixed(2)}</td>
                                 <td class="num hide-mobile">${m.skuStoreDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.skuStoreDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr>
                                 <td>SKU×日（跨门店合并）</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × product_id</td>
                                 <td class="num hide-mobile">${m.skuDay.n}</td>
                                 <td class="num" style="color:var(--success)">${m.skuDay.r2.toFixed(3)}</td>
                                 <td class="num">${m.skuDay.mae.toFixed(2)}</td>
                                 <td class="num hide-mobile">${m.skuDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.skuDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr>
                                 <td>门店×产品类型×日</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × store_id × product_type</td>
                                 <td class="num hide-mobile">${m.storeTypeDay.n}</td>
                                 <td class="num" style="color:var(--success)">${m.storeTypeDay.r2.toFixed(3)}</td>
                                 <td class="num">${m.storeTypeDay.mae.toFixed(2)}</td>
                                 <td class="num hide-mobile">${m.storeTypeDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.storeTypeDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr style="background:var(--amber-50)">
                                 <td style="font-weight:600">产品类型×日（29类）</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × product_type</td>
                                 <td class="num hide-mobile">${m.typeDay.n}</td>
                                 <td class="num" style="color:var(--success)">${m.typeDay.r2.toFixed(3)}</td>
                                 <td class="num">${m.typeDay.mae.toFixed(2)}</td>
                                 <td class="num hide-mobile">${m.typeDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.typeDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr>
                                 <td>品类×日（9大类）</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × category</td>
                                 <td class="num hide-mobile">${m.categoryDay.n}</td>
                                 <td class="num" style="color:var(--success)">${m.categoryDay.r2.toFixed(3)}</td>
                                 <td class="num">${m.categoryDay.mae.toFixed(2)}</td>
                                 <td class="num hide-mobile">${m.categoryDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.categoryDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr>
                                 <td>门店×日</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date × store_id</td>
                                 <td class="num hide-mobile">${m.storeDay.n}</td>
                                <td class="num" style="color:var(--warning)">${m.storeDay.r2.toFixed(3)}</td>
                                <td class="num">${m.storeDay.mae.toFixed(1)}</td>
                                 <td class="num hide-mobile">${m.storeDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.storeDay.hit20.toFixed(1)}%</td>
                             </tr>
                             <tr>
                                 <td>全门店日总量</td>
                                 <td class="hide-mobile" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gray-500)">date</td>
                                 <td class="num hide-mobile">${m.totalDay.n} <span class="badge badge-warning" style="margin-left:4px">仅7天</span></td>
                                <td class="num" style="color:var(--warning)">${m.totalDay.r2.toFixed(3)}</td>
                                <td class="num">${m.totalDay.mae.toFixed(1)}</td>
                                 <td class="num hide-mobile">${m.totalDay.hit10.toFixed(1)}%</td>
                                 <td class="num">${m.totalDay.hit20.toFixed(1)}%</td>
                             </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 8v4l3 3"/>
                            <path d="M4.93 4.93l14.14 14.14" style="opacity:0.3"/>
                        </svg>
                        已知限制
                    </div>
                    <span class="badge badge-warning">请知悉</span>
                </div>
                <div class="card-body">
                    <div class="grid grid-2" style="gap:16px">
                        <div style="padding:16px;background:var(--warning-light);border-radius:10px">
                            <div style="font-weight:600;color:#8B6914;margin-bottom:8px">数据覆盖限制</div>
                            <div style="font-size:13px;color:#7A5E10;line-height:1.8">
                                • 仅覆盖 2023 年上半年（1-6月），缺少下半年季节模式<br>
                                • 仅 3 家门店，门店间差异学习有限<br>
                                • 纽约市单一城市，跨城市迁移需验证
                            </div>
                        </div>
                        <div style="padding:16px;background:var(--warning-light);border-radius:10px">
                            <div style="font-weight:600;color:#8B6914;margin-bottom:8px">特征覆盖限制</div>
                            <div style="font-size:13px;color:#7A5E10;line-height:1.8">
                                • 缺少促销、折扣、活动等经营特征<br>
                                • 无周边人流、POI、竞品等外部特征<br>
                                • 无库存、断货等供给侧约束信息
                            </div>
                        </div>
                        <div style="padding:16px;background:var(--warning-light);border-radius:10px">
                            <div style="font-weight:600;color:#8B6914;margin-bottom:8px">模型适用边界</div>
                            <div style="font-size:13px;color:#7A5E10;line-height:1.8">
                                • 极端天气（暴雪/飓风）样本少，预测可靠性低<br>
                                • 新品冷启动无历史数据，需零样本方案<br>
                                • 结构性变化（装修/周边改造）后需要重训练
                            </div>
                        </div>
                        <div style="padding:16px;background:var(--warning-light);border-radius:10px">
                             <div style="font-weight:600;color:#8B6914;margin-bottom:8px">预测范围与方法区分</div>
                             <div style="font-size:13px;color:#7A5E10;line-height:1.8">
                                 • <b>五窗口滚动回测（35 天）</b>：当前直接多步 LightGBM Tweedie 模型在门店×SKU×日级的滚动回测输出，用于评价模型准确率<br>
                                 • <b>未来规则外推（2023-07-01 至 07-07）</b>：基于测试期日均销量与星期系数的前端规则外推，未接入未来天气、节假日、促销或 SKU 滚动模型，<b>不用于评价模型</b>，仅展示决策链路<br>
                                 • 误差参考带由历史 MAE 与经验扩展系数形成，不代表概率覆盖承诺
                             </div>
                         </div>
                         <div style="padding:16px;background:var(--warning-light);border-radius:10px">
                             <div style="font-weight:600;color:#8B6914;margin-bottom:8px">使用建议</div>
                            <div style="font-size:13px;color:#7A5E10;line-height:1.8">
                                • 推荐在子类型级（29个）使用，精度-粒度平衡最佳<br>
                                • 误差参考带仅作参考，极端情况需人工复核<br>
                                • 定期（每月/季度）用新数据滚动重训练
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    Global LightGBM Tweedie · 滚动回测验证 · 定期评估更新
                </div>
            </div>
         `;
        initCharts();
    }

    function initCharts() {
        const data = DataLoader.getData();
        const fi = data.featureImportance || [];
        const catDom = document.getElementById('trustFeatureImportanceChart');
        if (catDom && fi.length > 0) {
            const catColors = {
                '时序销量': '#5D4037',
                '日历基础': '#4A7CC2',
                '天气': '#3A9E8C',
                '节假日': '#E08A5C',
                '品类/价格': '#8B7CC4',
                '季节周期': '#C9A66B'
            };
            const catMap = {};
            fi.forEach(f => {
                const cat = f['特征类别'] || f.category || '其他';
                const imp = Number(f['GB重要性'] || f.importance) || 0;
                catMap[cat] = (catMap[cat] || 0) + imp;
            });
            const total = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
            const entries = Object.entries(catMap)
                .map(([name, value]) => ({ name, pct: value / total * 100, raw: value }))
                .sort((a, b) => b.pct - a.pct);
            const catNames = entries.map(e => e.name).reverse();
            const catPcts = entries.map(e => e.pct).reverse();

            const chart = echarts.init(catDom);
            chart.setOption({
                tooltip: {
                    backgroundColor: 'rgba(44, 24, 16, 0.95)',
                    textStyle: { color: '#FAF6F0', fontSize: 12 },
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        const p = params[0];
                        const item = entries.find(e => e.name === p.name);
                        return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
                                <div>重要性占比：<b>${p.value.toFixed(2)}%</b></div>`;
                    }
                },
                grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
                xAxis: {
                    type: 'value',
                    min: 0,
                    max: 100,
                    name: '重要性占比（%）',
                    nameLocation: 'end',
                    nameGap: 8,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11, align: 'left' },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
                    axisLabel: { color: '#8A8A8A', fontSize: 11, formatter: '{value}%', fontFamily: "'JetBrains Mono', monospace" }
                },
                yAxis: {
                    type: 'category',
                    name: '特征类别',
                    nameLocation: 'end',
                    nameGap: 6,
                    nameTextStyle: { color: '#8A8A8A', fontSize: 11 },
                    data: catNames,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { color: '#6B6B6B', fontSize: 12 }
                },
                series: [{
                    type: 'bar',
                    data: catPcts.map((v, i) => ({
                        value: +v.toFixed(2),
                        itemStyle: { color: catColors[catNames[i]] || '#D4A574', borderRadius: [0, 4, 4, 0] }
                    })),
                    barWidth: '50%',
                    label: {
                        show: true,
                        position: 'right',
                        fontSize: 11,
                        color: '#6B6B6B',
                        fontFamily: "'JetBrains Mono', monospace",
                        formatter: '{c}%'
                    }
                }]
            });
            if (typeof ChartUtils !== 'undefined' && ChartUtils.setupResize) {
                ChartUtils.setupResize(chart, catDom);
            }
        }
    }

    return { render };
})();
