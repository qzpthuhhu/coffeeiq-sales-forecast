/**
 * 茶饮迁移说明页面
 */

const TeaMigrationPage = (function() {
    function render(container) {
        container.innerHTML = `
             <div id="demo-migrationMain">
             <div class="card" style="margin-bottom:16px" id="demo-migrationHeader">
                  <div class="card-body" style="padding:32px;text-align:center">
                      <div style="font-size:48px;margin-bottom:16px">☕ → 🧋</div>
                      <div class="card-title" style="font-size:22px;justify-content:center;margin-bottom:10px">
                          咖啡数据模型 → 茶饮品牌 迁移方案
                      </div>
                      <div class="card-subtitle" style="text-align:center;max-width:680px;margin:0 auto;font-size:13px;line-height:1.7">
                          核心预测模型与分析框架，通过替换 SKU 体系、接入业务数据源，可迁移至茶饮品牌。
                          不展示虚构柠季结果，仅说明迁移路径与接入点。
                      </div>
                      <div style="margin-top:18px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                          <span class="data-badge sim" style="font-size:11px;padding:4px 10px">能力规划</span>
                          <span class="badge badge-default" style="font-size:11px;padding:4px 10px">
                              无虚构柠季数据
                          </span>
                      </div>
                  </div>
              </div>

             <div class="card" style="margin-bottom:0">
                <div class="card-header">
                    <div class="card-title">迁移路径概览</div>
                </div>
                <div class="card-body">
                    <div class="migration-steps">
                        <div class="migration-step">
                            <div class="migration-step-num">1</div>
                            <div class="migration-step-content">
                                <div class="migration-step-title">SKU 体系替换</div>
                                <div class="migration-step-desc">
                                    将 80 个咖啡 SKU 替换为柠季产品线（柠檬茶/果茶/奶茶等品类，小/中/大杯规格）
                                </div>
                            </div>
                        </div>
                        <div class="migration-step-arrow">→</div>
                        <div class="migration-step">
                            <div class="migration-step-num">2</div>
                            <div class="migration-step-content">
                                <div class="migration-step-title">数据接入</div>
                                <div class="migration-step-desc">
                                    接入 POS 订单、库存、成本卡、活动、门店画像 5 类核心数据
                                </div>
                            </div>
                        </div>
                        <div class="migration-step-arrow">→</div>
                        <div class="migration-step">
                            <div class="migration-step-num">3</div>
                            <div class="migration-step-content">
                                <div class="migration-step-title">模型重训练</div>
                                <div class="migration-step-desc">
                                    复用模型架构与特征工程，用柠季数据重训练，1-2 周完成首版
                                </div>
                            </div>
                        </div>
                        <div class="migration-step-arrow">→</div>
                        <div class="migration-step">
                            <div class="migration-step-num">4</div>
                            <div class="migration-step-content">
                                <div class="migration-step-title">业务落地</div>
                                <div class="migration-step-desc">
                                    订货、排班、运营看板等业务模块对接柠季现有系统流程
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
             </div><!-- end demo-migrationMain -->

             <div class="grid grid-main" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/>
                                <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/>
                            </svg>
                            数据接入清单
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="data-integration-list">
                            <div class="data-integration-item">
                                <div class="data-integration-icon" style="background:var(--coffee-100);color:var(--coffee-700)">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                </div>
                                <div class="data-integration-content">
                                    <div class="data-integration-title">POS 订单数据</div>
                                    <div class="data-integration-desc">
                                        交易明细（时间、门店、SKU、数量、金额、渠道）· 模型核心输入
                                    </div>
                                    <div class="tag-group">
                                        <span class="tag amber">必填</span>
                                        <span class="tag">建议 ≥ 6 个月</span>
                                        <span class="tag">日/小时级聚合</span>
                                    </div>
                                </div>
                            </div>

                            <div class="data-integration-item">
                                <div class="data-integration-icon" style="background:var(--warning-light);color:var(--warning)">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                                        <line x1="3" y1="6" x2="21" y2="6"/>
                                    </svg>
                                </div>
                                <div class="data-integration-content">
                                    <div class="data-integration-title">库存数据</div>
                                    <div class="data-integration-desc">
                                        实时库存、在途、效期、报损 · 支持智能订货与库存优化
                                    </div>
                                    <div class="tag-group">
                                        <span class="tag amber">推荐</span>
                                        <span class="tag">订货模块必需</span>
                                    </div>
                                </div>
                            </div>

                            <div class="data-integration-item">
                                <div class="data-integration-icon" style="background:var(--success-light);color:var(--success)">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <path d="M3 9h18M9 21V9"/>
                                    </svg>
                                </div>
                                <div class="data-integration-content">
                                    <div class="data-integration-title">BOM 成本卡</div>
                                    <div class="data-integration-desc">
                                        标准配方、原料成本、出杯量 · 用于原材料需求拆解和成本核算
                                    </div>
                                    <div class="tag-group">
                                        <span class="tag amber">推荐</span>
                                        <span class="tag">订货/成本分析</span>
                                    </div>
                                </div>
                            </div>

                            <div class="data-integration-item">
                                <div class="data-integration-icon" style="background:var(--danger-light);color:var(--danger)">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
                                        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
                                        <path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>
                                    </svg>
                                </div>
                                <div class="data-integration-content">
                                    <div class="data-integration-title">活动数据</div>
                                    <div class="data-integration-desc">
                                        促销、折扣、上新、会员活动 · 提升模型精度与寻因能力
                                    </div>
                                    <div class="tag-group">
                                        <span class="tag">可选</span>
                                        <span class="tag">提升精度</span>
                                        <span class="tag">偏差分析用</span>
                                    </div>
                                </div>
                            </div>

                            <div class="data-integration-item">
                                <div class="data-integration-icon" style="background:var(--data-blue);color:#fff">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                        <polyline points="9 22 9 12 15 12 15 22"/>
                                    </svg>
                                </div>
                                <div class="data-integration-content">
                                    <div class="data-integration-title">门店画像</div>
                                    <div class="data-integration-desc">
                                        门店类型、面积、商圈、店龄、设备、人员配置 · 支持多门店对比与新门店预测
                                    </div>
                                    <div class="tag-group">
                                        <span class="tag">可选</span>
                                        <span class="tag">新店冷启动</span>
                                        <span class="tag">聚类分析</span>
                                    </div>
                                </div>
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
                            适配方案要点
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="adaption-list">
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">模型架构零改动</div>
                                    <div class="adaption-desc">
                                        Global LightGBM 直接多步架构与稀疏标签方法可迁移；需用茶饮真实数据重新训练和验收
                                    </div>
                                </div>
                            </div>
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">特征工程可复用</div>
                                    <div class="adaption-desc">
                                        时序 lag + 滚动统计 + 日历特征 + 天气 + 节假日 五大类特征体系通用
                                    </div>
                                </div>
                            </div>
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">季节性需重学习</div>
                                    <div class="adaption-desc">
                                        茶饮受夏季旺季影响更显著，需覆盖 6-9 月数据以学习夏季模式
                                    </div>
                                </div>
                            </div>
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">区域差异适配</div>
                                    <div class="adaption-desc">
                                        柠季覆盖多城市，需加入城市级天气、消费习惯、商圈类型等区域特征
                                    </div>
                                </div>
                            </div>
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">活动特征增强</div>
                                    <div class="adaption-desc">
                                        茶饮促销活动更频繁，活动特征对预测精度提升贡献更大
                                    </div>
                                </div>
                            </div>
                            <div class="adaption-item">
                                <div class="adaption-bullet"></div>
                                <div>
                                    <div class="adaption-title">门店规模挑战</div>
                                    <div class="adaption-desc">
                                        柠季门店数更多（数千家），需优化模型推理性能，支持批量并行预测
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 模块迁移对照表 -->
            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <div class="card-title">功能模块迁移对照表</div>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>模块</th>
                                <th>咖啡版（当前）</th>
                                <th>茶饮版（迁移后）</th>
                                 <th>预估难度</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight:600">经营驾驶舱</td>
                                <td>3 门店 · 9 品类 · 80 SKU</td>
                                <td>按柠季实际门店/SKU 规模</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">数据资产中心</td>
                                 <td>交易 + 天气 + 节假日</td>
                                 <td>+ 库存 + BOM + 活动 + 门店画像</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">门店销量预测</td>
                                 <td>日粒度 · 7 天预测</td>
                                 <td>架构复用 · 直接迁移</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">SKU 预测中心</td>
                                 <td>80 SKU · 三级下钻</td>
                                 <td>茶饮 SKU 体系替换</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">模型效果中心</td>
                                 <td>三级精度展示</td>
                                 <td>指标完全复用</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">天气影响分析</td>
                                 <td>纽约天气 · 3 门店</td>
                                 <td>多城市天气 · 城市级分析</td>
                                 <td><span class="badge badge-warning">中</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">AI 寻因中心</td>
                                  <td>偏差拆解 + GB 全局重要性</td>
                                  <td>+ SHAP 局部解释 + 活动贡献分解</td>
                                  <td><span class="badge badge-danger">高</span><br><span style="font-size:10px;color:var(--gray-400)">SHAP待实现</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">多门店对比</td>
                                 <td>3 门店多维对比</td>
                                 <td>+ 门店聚类 + 区域对比</td>
                                 <td><span class="badge badge-warning">中</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">情景模拟</td>
                                 <td>温度/降雨/星期/节假日</td>
                                 <td>+ 活动力度 + 新品模拟</td>
                                 <td><span class="badge badge-warning">中</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">智能订货</td>
                                 <td>演示版 · 虚拟 BOM</td>
                                 <td>真实 BOM · 库存联动</td>
                                 <td><span class="badge badge-danger">高</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">智能排班</td>
                                 <td>演示版 · 虚拟人员</td>
                                 <td>真实员工 · 劳动法约束</td>
                                 <td><span class="badge badge-danger">高</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                             </tr>
                             <tr>
                                 <td style="font-weight:600">模型可信度</td>
                                 <td>咖啡数据模型说明</td>
                                 <td>茶饮模型指标更新</td>
                                 <td><span class="badge badge-success">低</span><br><span style="font-size:10px;color:var(--gray-400)">预估</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div class="card-title">实施节奏建议</div>
                </div>
                <div class="card-body">
                    <div class="timeline">
                        <div class="timeline-item">
                            <div class="timeline-title">第 1 周 · 数据接入</div>
                            <div class="timeline-desc">
                                POS 订单数据对接 + 天气数据匹配 + 数据清洗与校验
                            </div>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-title">第 2 周 · 模型重训练</div>
                            <div class="timeline-desc">
                                用柠季数据训练基础模型 · 三级精度验证 · 基线对比
                            </div>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-title">第 3-4 周 · 核心看板上线</div>
                            <div class="timeline-desc">
                                驾驶舱、预测、模型效果、多门店对比等核心模块上线
                            </div>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-title">第 5-6 周 · 深度分析模块</div>
                            <div class="timeline-desc">
                                天气影响、AI寻因、情景模拟等深度分析模块上线
                            </div>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-title">第 7-8 周 · 业务模块对接</div>
                            <div class="timeline-desc">
                                智能订货对接 WMS · 智能排班对接 HR 系统 · 全量上线
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return { render };
})();
