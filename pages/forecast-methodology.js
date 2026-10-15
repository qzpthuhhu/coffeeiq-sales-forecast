/**
 * 销量预测方法页
 * 面向非技术决策层的通俗表达
 */

const ForecastMethodologyPage = (function() {
    let charts = {};

    function render(container) {
        const data = DataLoader.getData();
        const rc = data.runContract;
        const summary = data.summary;
        const backtest = summary ? summary.backtest : null;

        // 运行合同字段兼容映射：字段名统一从合同真实字段读取
        const backtestWindows = rc && rc.backtest_window_count != null ? rc.backtest_window_count : null;
        const backtestRows = rc && rc.prediction_count != null ? rc.prediction_count : null;
        const featureCount = rc && rc.feature_count != null ? rc.feature_count : null;
        const coverageRaw = rc && rc.coverage_p10_p90 != null ? rc.coverage_p10_p90 : null;

        // 训练天数：从合同 data_range 真实计算（含首尾自然日）
        let trainDays = null;
        if (rc && rc.data_range && rc.data_range.start && rc.data_range.end) {
            const s = new Date(rc.data_range.start);
            const e = new Date(rc.data_range.end);
            trainDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
        }

        // 回测天数：优先从真实预测明细唯一日期数取，备选 origins × horizon
        let backtestDays = null;
        if (backtest && backtest.validationDays) {
            backtestDays = backtest.validationDays;
        } else if (rc && rc.origins && rc.forecast_horizon_days) {
            backtestDays = rc.origins.length * rc.forecast_horizon_days;
        }

        // 交易数：从已加载的日汇总 transactions 求和（真实数据）
        let txnCount = null;
        if (data.dailyTotal && data.dailyTotal.length) {
            const totalTxn = data.dailyTotal.reduce((sum, d) => sum + (d.transactions || 0), 0);
            txnCount = totalTxn.toLocaleString();
        }

        // 门店数 / 商品数：从真实预测明细 store_id / product_id 唯一值计算
        let storeCountRaw = null;
        let skuCountRaw = null;
        if (data.skuForecast && data.skuForecast.length) {
            storeCountRaw = new Set(data.skuForecast.map(d => d.store_id)).size;
            skuCountRaw = new Set(data.skuForecast.map(d => d.product_id)).size;
        } else if (data.skuList && data.skuList.length) {
            skuCountRaw = data.skuList.length;
        }

        // 渲染用显示值（带单位 / 兜底文案）
        const txnCountDisplay = txnCount || '数据暂不可用';
        const storeCountDisplay = storeCountRaw != null ? storeCountRaw + ' 家' : '数据暂不可用';
        const skuCountDisplay = skuCountRaw != null ? skuCountRaw + ' 个' : '数据暂不可用';
        const trainDaysDisplay = trainDays != null ? trainDays + ' 天' : '数据暂不可用';
        const featureCountDisplay = featureCount != null ? featureCount + ' 个' : '数据暂不可用';
        const backtestWindowsDisplay = backtestWindows != null ? backtestWindows : '数据暂不可用';
        const backtestDaysDisplay = backtestDays != null ? backtestDays : '数据暂不可用';
        const backtestRowsDisplay = backtestRows != null ? backtestRows.toLocaleString() : '数据暂不可用';
        const featureCountTech = featureCount != null ? featureCount + ' 项' : '数据暂不可用';

        // 关键指标：全部读真实字段，不做静默数值回退
        const coverage = coverageRaw != null ? (coverageRaw * 100).toFixed(1) : '数据暂不可用';
        const mae = backtest && backtest.mae != null ? backtest.mae.toFixed(3) : '数据暂不可用';
        const wape = backtest && backtest.wape != null ? backtest.wape.toFixed(2) : '数据暂不可用';
        const r2 = backtest && backtest.r2 != null ? backtest.r2.toFixed(3) : '数据暂不可用';
        const dirHit = backtest && backtest.directionAccuracy != null
            ? backtest.directionAccuracy.toFixed(1)
            : '数据暂不可用';

        container.innerHTML = `
            <!-- 顶部 Hero：核心结论 + 关键数字 -->
            <div class="mp-hero">
                <div class="mp-hero-kicker">销量预测方法</div>
                <h1 class="mp-hero-title">
                    我们不只预测卖多少，<br class="mp-hero-br">还告诉你预测有多确定。
                </h1>
                <p class="mp-hero-subtitle">
                    给你一个最可能的销量数字，同时给你销量可能出现的范围——备货太少会缺货，备货太多会浪费，
                    范围让你看得见风险，也看得见弹性。
                </p>
                <div class="mp-hero-stats">
                    <div>
                        <div class="mp-hero-stat-num">${txnCountDisplay}</div>
                        <div class="mp-hero-stat-label">条历史交易</div>
                    </div>
                    <div>
                        <div class="mp-hero-stat-num">${storeCountDisplay}</div>
                        <div class="mp-hero-stat-label">门店</div>
                    </div>
                    <div>
                        <div class="mp-hero-stat-num">${skuCountDisplay}</div>
                        <div class="mp-hero-stat-label">商品</div>
                    </div>
                    <div>
                        <div class="mp-hero-stat-num">${trainDaysDisplay}</div>
                        <div class="mp-hero-stat-label">训练数据</div>
                    </div>
                </div>
            </div>

            <!-- 预测流程：横向四步 -->
            <div class="card mp-card" id="demoMethodFlowCard">
                <div class="mp-section-head">
                    <div class="mp-section-tag">预测流程</div>
                    <h2 class="mp-section-title">四步，从历史数据到预测结果</h2>
                    <p class="mp-section-desc">
                        模型就像一位学了很久的学徒——它看过大量历史销量，记住了星期几、天气、节假日对销量的影响，
                        然后综合这些信号，给出未来 7 天的预测。
                    </p>
                </div>
                <div class="mp-flow-grid">
                    <div class="mp-flow-step">
                        <div class="mp-flow-icon" style="background:var(--coffee-100);color:var(--coffee-700)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="8" y1="13" x2="16" y2="13"/>
                                <line x1="8" y1="17" x2="16" y2="17"/>
                            </svg>
                        </div>
                        <div class="mp-flow-step-num">第 1 步</div>
                        <div class="mp-flow-step-title">历史数据</div>
                        <div class="mp-flow-step-desc">
                            ${txnCountDisplay} 条门店交易记录，是模型学习的全部素材
                        </div>
                    </div>
                    <div class="mp-flow-step">
                        <div class="mp-flow-icon" style="background:var(--amber-100);color:var(--amber-700)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2v20M2 12h20"/>
                                <circle cx="12" cy="12" r="10"/>
                            </svg>
                        </div>
                        <div class="mp-flow-step-num">第 2 步</div>
                        <div class="mp-flow-step-title">${featureCountDisplay} 经营信号</div>
                        <div class="mp-flow-step-desc">
                            星期、天气、节假日、历史销量规律……都被提取成可供模型学习的特征
                        </div>
                    </div>
                    <div class="mp-flow-step">
                        <div class="mp-flow-icon" style="background:#E0F2F1;color:#00695C">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="16" rx="2"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                                <line x1="9" y1="4" x2="9" y2="20"/>
                            </svg>
                        </div>
                        <div class="mp-flow-step-num">第 3 步</div>
                        <div class="mp-flow-step-title">4 个预测任务</div>
                        <div class="mp-flow-step-desc">
                            点预测 + P10 + P50 + P90，各学各的，互不干扰
                        </div>
                    </div>
                    <div class="mp-flow-step">
                        <div class="mp-flow-icon" style="background:#FFCDD2;color:#C62828">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                            </svg>
                        </div>
                        <div class="mp-flow-step-num">第 4 步</div>
                        <div class="mp-flow-step-title">点预测 + 区间输出</div>
                        <div class="mp-flow-step-desc">
                            最可能卖多少，以及销量大概率落在什么范围
                        </div>
                    </div>
                </div>
            </div>

            <!-- 四个关键技术：页面主内容 -->
            <div class="mp-section-head">
                <div class="mp-section-tag">核心技术</div>
                <h2 class="mp-section-title">四个关键设计，让预测更靠谱</h2>
                <p class="mp-section-desc">
                    每一项都解决一个真实的经营难题。你不必懂技术，但你需要知道它为什么重要。
                </p>
            </div>

            <div class="grid grid-2 mp-tech-grid">
                <!-- 技术 1：直接多步预测 -->
                <div class="mp-tech-card">
                    <div class="mp-tech-head">
                        <div class="mp-tech-num">01</div>
                        <div>
                            <h3 class="mp-tech-title">直接多步预测</h3>
                            <p class="mp-tech-subtitle">不是多米诺骨牌，一次直出未来 7 天</p>
                        </div>
                    </div>
                    <div class="mp-tech-body">
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">是什么</div>
                            <div class="mp-tech-value">
                                一个全局模型一次同时预测未来 7 天（T+1 到 T+7），模型会知道当前预测的是第几天。
                                每一天都从真实历史信号直接出发，不用等到前一天算完再往下推。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">为什么重要</div>
                            <div class="mp-tech-value">
                                前一天预测错了，不会作为后一天的输入，误差不会像多米诺骨牌一样逐日传染。
                                餐饮预测要直接看整周备货，第 7 天的准确度对周度决策同样关键。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">经营价值</div>
                            <div class="mp-tech-value">
                                一次输出未来 7 天，T+1 到 T+7 质量稳定，
                                周度备货与排班可以放心参考一整周的结果，而不是只信前两三天。
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 技术 2：Tweedie -->
                <div class="mp-tech-card">
                    <div class="mp-tech-head">
                        <div class="mp-tech-num">02</div>
                        <div>
                            <h3 class="mp-tech-title">Tweedie 分布</h3>
                            <p class="mp-tech-subtitle">专为"经常零、偶尔爆"的销量而生</p>
                        </div>
                    </div>
                    <div class="mp-tech-body">
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">是什么</div>
                            <div class="mp-tech-value">
                                Tweedie（特威迪分布）是一种用<b>同一套核算法同时兼容零销量和高销量</b>的统计模型：
                                大量卖 0 杯的日子它认 0，偶尔爆单的高峰它也认，不会只猜中间值。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">为什么重要</div>
                            <div class="mp-tech-value">
                                饮品行业里，不少商品大部分日子卖 0 杯，偶尔某天卖爆。普通模型总会猜一个"中间值"，
                                既不是 0 也不是真实峰值，两头都不准。Tweedie 一套算法同时处理好零销量和爆发销量。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">经营价值</div>
                            <div class="mp-tech-value">
                                冷门商品不会被"平均化"地高估，爆款也不会被低估，
                                减少冷门品备多了浪费、爆款备少了缺货的两头损失。
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 技术 3：稀疏标签 -->
                <div class="mp-tech-card">
                    <div class="mp-tech-head">
                        <div class="mp-tech-num">03</div>
                        <div>
                            <h3 class="mp-tech-title">稀疏标签</h3>
                            <p class="mp-tech-subtitle">4 个标签看清商品冷热，冷门品也测得准</p>
                        </div>
                    </div>
                    <div class="mp-tech-body">
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">是什么</div>
                            <div class="mp-tech-value">
                                给每个商品贴上 4 个"冷门度"标签：
                                <b>zero_rate</b>（零销量天数占比）、
                                <b>ADI</b>（两次卖出之间平均隔几天）、
                                <b>mean_qty</b>（有销量时平均卖多少）、
                                <b>is_sparse</b>（是不是稀疏品）。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">为什么重要</div>
                            <div class="mp-tech-value">
                                一个全局模型学 ${skuCountDisplay} 商品，如果不告诉它谁是冷门品，
                                它容易被畅销品的大数字带偏，对冷门品预测不准。
                                有了稀疏标签，模型知道要区别对待不同销量级别的商品。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">经营价值</div>
                            <div class="mp-tech-value">
                                畅销品和冷门品共用一个模型，靠这 4 个标签区别冷热，冷门品不会被畅销品的大数字
                                带偏——无论畅销还是冷门，每个商品的预测都更准，也不会"一平均就没了"。
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 技术 4：分位数区间 -->
                <div class="mp-tech-card">
                    <div class="mp-tech-head">
                        <div class="mp-tech-num">04</div>
                        <div>
                            <h3 class="mp-tech-title">分位数区间预测</h3>
                            <p class="mp-tech-subtitle">点预测配上下界区间，对销量更有把握</p>
                        </div>
                    </div>
                    <div class="mp-tech-body">
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">是什么</div>
                            <div class="mp-tech-value">
                                点预测给出<b>最可能的销量</b>，同时预测三档分位数给出范围：
                                <b>P10</b>（偏低的下界）、<b>P50</b>（中位值）、<b>P90</b>（偏高的上界）。
                                实际销量大概率落在 P10 到 P90 之间，约 80% 的日子都是这样。
                            </div>
                        </div>
                        <div class="mp-tech-row">
                            <div class="mp-tech-label">为什么重要</div>
                            <div class="mp-tech-value">
                                销量永远有不确定性。下雨天、节假日、附近活动都会让销量波动。
                                区间越宽，说明那天不确定性越高，备货决策就需要更谨慎；
                                区间越窄，说明预测越笃定，可以备得更精准。
                            </div>
                        </div>
                        <div class="mp-tech-row mp-tech-important">
                            <div class="mp-tech-label">重要提醒</div>
                            <div class="mp-tech-value">
                                点预测 ≠ P50。点预测是主预测量，P50 只是区间的中位参考，
                                两者的计算方式不同，不能混为一谈。
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 输出怎么用 -->
            <div class="card mp-card">
                <div class="mp-section-head">
                    <div class="mp-section-tag">使用指南</div>
                    <h2 class="mp-section-title">最终输出，分别怎么用</h2>
                    <p class="mp-section-desc">
                        五个输出各有各的用途，不是越多越好，而是看你要做什么决策。
                    </p>
                </div>
                <div class="mp-usage-grid">
                    <div class="mp-usage-item">
                        <div class="mp-usage-badge" style="background:var(--coffee-700);color:#fff">点预测</div>
                        <div class="mp-usage-title">建议需求量参考</div>
                        <div class="mp-usage-desc">
                            作为日常备货的基准数字。代表模型认为最可能出现的销量。
                        </div>
                    </div>
                    <div class="mp-usage-item">
                        <div class="mp-usage-badge" style="background:#E0F2F1;color:#00695C">P10</div>
                        <div class="mp-usage-title">偏保守需求下界</div>
                        <div class="mp-usage-desc">
                            淡日、低需求场景的参考。如果怕浪费、损耗敏感，可以以 P10 为底线思考。
                        </div>
                    </div>
                    <div class="mp-usage-item">
                        <div class="mp-usage-badge" style="background:#FFCDD2;color:#C62828">P50</div>
                        <div class="mp-usage-title">中位需求，辅助观察</div>
                        <div class="mp-usage-desc">
                            区间的中位值，仅作辅助参考。<b>不等于点预测</b>，不要当作主预测量使用。
                        </div>
                    </div>
                    <div class="mp-usage-item">
                        <div class="mp-usage-badge" style="background:#FFF3E0;color:#E65100">P90</div>
                        <div class="mp-usage-title">偏高需求上界</div>
                        <div class="mp-usage-desc">
                            旺季、高需求场景的参考。如果怕缺货、更在意销售机会，可以以 P90 为上界思考。
                        </div>
                    </div>
                    <div class="mp-usage-item mp-usage-wide">
                        <div class="mp-usage-badge" style="background:var(--coffee-200);color:var(--coffee-800)">P10 – P90 区间</div>
                        <div class="mp-usage-title">备货弹性与风险判断</div>
                        <div class="mp-usage-desc">
                            区间宽度反映不确定性：越宽，那天销量波动越大，备货越要留余地；
                            越窄，预测越笃定。用区间来判断"备少了缺货损失大，还是备多了浪费损失大"，
                            按你的风险偏好做决策。
                        </div>
                    </div>
                </div>
            </div>

            <!-- 验证方式 -->
            <div class="card mp-card">
                <div class="mp-section-head">
                    <div class="mp-section-tag">验证方式</div>
                    <h2 class="mp-section-title">怎么证明预测是靠谱的</h2>
                    <p class="mp-section-desc">
                        我们用"滚动回测"来检验：只用预测起点之前的数据训练模型，预测未来 7 天，
                        然后和真实销量对比。滚动 5 次，形成一整段连续的验证期。
                    </p>
                </div>
                <div class="backtest-diagram mp-backtest">
                    ${buildBacktestDiagram((rc && rc.origins) || ['2023-05-27', '2023-06-03', '2023-06-10', '2023-06-17', '2023-06-24'])}
                </div>
                <div class="grid grid-5 mp-verify-stats">
                    <div class="mp-verify-stat">
                        <div class="mp-verify-stat-num">${backtestWindowsDisplay}</div>
                        <div class="mp-verify-stat-label">个滚动窗口</div>
                    </div>
                    <div class="mp-verify-stat">
                        <div class="mp-verify-stat-num">${backtestDaysDisplay}</div>
                        <div class="mp-verify-stat-label">天验证期</div>
                    </div>
                    <div class="mp-verify-stat">
                        <div class="mp-verify-stat-num">${backtestRowsDisplay}</div>
                        <div class="mp-verify-stat-label">条门店×商品×日预测</div>
                    </div>
                    <div class="mp-verify-stat">
                        <div class="mp-verify-stat-num">${coverage}%</div>
                        <div class="mp-verify-stat-label">P10–P90 覆盖率</div>
                    </div>
                    <div class="mp-verify-stat">
                        <div class="mp-verify-stat-num">MAE ${mae}</div>
                        <div class="mp-verify-stat-label">平均误差（杯）</div>
                    </div>
                </div>
                <div class="mp-verify-note">
                    每一次预测都只用"当时能拿到的数据"，不偷看未来。验证结果和实际上线后的效果一致。
                </div>
            </div>

            <!-- 关键指标速览 + 边界声明 -->
            <div class="grid grid-2">
                <div class="card mp-card">
                    <div class="mp-section-head">
                        <div class="mp-section-tag">核心指标</div>
                        <h2 class="mp-section-title" style="font-size:18px">预测质量一览</h2>
                    </div>
                    <div class="mp-metrics-list">
                        <div class="mp-metric-row">
                            <span class="mp-metric-label">平均绝对误差 MAE</span>
                            <span class="mp-metric-value">${mae} 杯</span>
                        </div>
                        <div class="mp-metric-row">
                            <span class="mp-metric-label">加权绝对误差率 WAPE</span>
                            <span class="mp-metric-value">${wape}%</span>
                        </div>
                        <div class="mp-metric-row">
                            <span class="mp-metric-label">决定系数 R²</span>
                            <span class="mp-metric-value">${r2}</span>
                        </div>
                        <div class="mp-metric-row">
                            <span class="mp-metric-label">方向命中率</span>
                            <span class="mp-metric-value">${dirHit}%</span>
                        </div>
                        <div class="mp-metric-row">
                            <span class="mp-metric-label">P10–P90 覆盖率</span>
                            <span class="mp-metric-value success">${coverage}%</span>
                        </div>
                    </div>
                </div>

                <div class="card mp-card">
                    <div class="mp-section-head">
                        <div class="mp-section-tag">边界与说明</div>
                        <h2 class="mp-section-title" style="font-size:18px">知道它的边界，才敢放心用</h2>
                    </div>
                    <div class="mp-boundary-list">
                        <div class="mp-boundary-item">
                            <b>有限数据。</b>基于 ${trainDaysDisplay} 历史数据，统计估计有不确定性，更多数据会更稳。
                        </div>
                        <div class="mp-boundary-item">
                            <b>区间是整体覆盖。</b>P10–P90 保证整体约 ${coverage}% 的日子落进区间，
                            不保证每个商品或每个门店分别达到这个比例。
                        </div>
                        <div class="mp-boundary-item">
                            <b>SHAP 不是因果。</b>特征重要性和情景模拟展示的是模型学到的关联关系，
                            不等同于"改了这个因素就一定变这么多"。
                        </div>
                        <div class="mp-boundary-item">
                            <b>当前为咖啡零售场景。</b>迁移到其他品牌或品类需要重新训练，效果可能不同。
                        </div>
                    </div>
                </div>
            </div>

            <!-- 技术口径折叠区 -->
            <details class="mp-tech-details">
                <summary>技术口径（供技术团队参考）</summary>
                <div class="mp-tech-details-body">
                    <div class="grid grid-3">
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">模型框架</div>
                            <div class="mp-tech-detail-value">Global LightGBM</div>
                        </div>
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">目标函数</div>
                            <div class="mp-tech-detail-value">Tweedie（variance power 1.3）</div>
                        </div>
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">特征维度</div>
                            <div class="mp-tech-detail-value">${featureCountTech}</div>
                        </div>
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">预测方式</div>
                            <div class="mp-tech-detail-value">直接多步 T+1 至 T+7</div>
                        </div>
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">区间输出</div>
                            <div class="mp-tech-detail-value">P10 / P50 / P90 分位数</div>
                        </div>
                        <div class="mp-tech-detail-item">
                            <div class="mp-tech-detail-label">解释方法</div>
                            <div class="mp-tech-detail-value">TreeSHAP（精确）</div>
                        </div>
                    </div>
                </div>
            </details>
        `;

        initCharts();
    }

    function buildBacktestDiagram(origins) {
        const sorted = [...origins].sort();
        return `
            <div class="backtest-timeline">
                ${sorted.map((o, i) => `
                    <div class="backtest-window">
                        <div class="backtest-window-label">窗口 ${i + 1}</div>
                        <div class="backtest-window-bar">
                            <div class="backtest-train">只用过去数据训练</div>
                            <div class="backtest-val">预测 7 天</div>
                        </div>
                        <div class="backtest-window-dates">起点 ${o.slice(5)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function initCharts() {
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};
    }

    // 供 self-check 调用的数据口径核验
    function getDisclosureFacts() {
        const data = DataLoader.getData();
        const rc = data.runContract;
        const summary = data.summary;
        const backtest = summary ? summary.backtest : null;

        // 运行合同字段
        const featureCount = rc && rc.feature_count != null ? rc.feature_count : null;
        const backtestWindows = rc && rc.backtest_window_count != null ? rc.backtest_window_count : null;
        const backtestRows = rc && rc.prediction_count != null ? rc.prediction_count : null;

        // 回测天数：优先 validationDays，备选 origins × horizon
        let backtestDays = null;
        if (backtest && backtest.validationDays) {
            backtestDays = backtest.validationDays;
        } else if (rc && rc.origins && rc.forecast_horizon_days) {
            backtestDays = rc.origins.length * rc.forecast_horizon_days;
        }

        return {
            model: 'Global LightGBM + Tweedie',
            featureCount,
            backtestWindows,
            backtestDays,
            backtestRows,
            mae: backtest && backtest.mae != null ? backtest.mae : null,
            wape: backtest && backtest.wape != null ? backtest.wape : null,
            r2: backtest && backtest.r2 != null ? backtest.r2 : null,
            coverageP10P90: rc && rc.coverage_p10_p90 != null ? rc.coverage_p10_p90 : null,
            hasQuantiles: true,
            pointPredictionField: 'pred_lightgbm',
            quantileFields: ['pred_p10', 'pred_p50', 'pred_p90'],
            isDirectMultiStep: true
        };
    }

    return {
        render,
        getDisclosureFacts
    };
})();
