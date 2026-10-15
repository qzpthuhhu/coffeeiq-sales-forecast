/*
 * 10 分钟老板演示模式
 * 仅新增导览与聚焦显示，不修改任何数据、指标、业务功能
 * 价值前置 · 边界后置 · 投屏稳定 · 手机可用
 */

const DemoMode = (function() {
    let currentStep = 0;
    let isActive = false;
    let scrollTimer = null;
    let scrollThrottleTimer = null;
    let refocusTimer1 = null;
    let refocusTimer2 = null;
    let refocusTimer3 = null;
    let firstHintShown = false;

    // ============ 保存的用户状态 ============
    const saved = {
        page: 'cockpit',
        store: 'all',
        scrollTop: 0,
        cockpitCategory: 'all',
        cockpitSku: 'all',
        extTab: 'ordering',
        anomalyOpen: false,
        anomalyDate: null
    };

    // ============ 下钻子状态配置（第 2 步用） ============
    // 运行时从真实数据动态推导，避免硬编码失效品类/商品
    let drilldownStates = null;
    let currentDrilldown = 'all';

    function ensureDrilldownStates() {
        if (drilldownStates) return drilldownStates;
        const data = (typeof DataLoader !== 'undefined') ? DataLoader.getData() : null;

        // 默认兑底
        let bestStore = (data && data.storeNames && data.storeNames[0]) || 'Lower Manhattan';
        let bestCat = 'Coffee';
        let bestSkuPid = 'all';
        let bestSkuCat = 'all';

        const canCalc = data && data.skuForecast && data.skuForecast.length
            && typeof DataLoader.getForecastSeries === 'function'
            && typeof DataLoader.calcForecastMetrics === 'function';

        if (canCalc) {
            // 与驾驶舱图表完全同口径：按日聚合后算 R² 等指标
            const scoreOf = function(store, category, skuId) {
                const s = DataLoader.getForecastSeries(store, category, skuId);
                if (!s || s.dates.length < 35) return null;
                const m = DataLoader.calcForecastMetrics(s.dates, s.actuals, s.predictions);
                const meanActual = s.actuals.reduce(function(a, b) { return a + b; }, 0) / s.actuals.length;
                return { m: m, meanActual: meanActual };
            };

            // 单店示例：选 R² 最高的门店
            if (data.storeNames && data.storeNames.length) {
                let best = null;
                data.storeNames.forEach(function(st) {
                    const r = scoreOf(st, 'all', 'all');
                    if (r && (!best || r.m.r2 > best.r.m.r2)) best = { st: st, r: r };
                });
                if (best) bestStore = best.st;
            }

            // 品类示例：选 R² 最高的品类
            if (data.categories && data.categories.length) {
                let best = null;
                data.categories.forEach(function(cat) {
                    const r = scoreOf('all', cat, 'all');
                    if (r && (!best || r.m.r2 > best.r.m.r2)) best = { cat: cat, r: r };
                });
                if (best) bestCat = best.cat;
            }

            // 单品示例：三家门店全量口径下 R² 最高、完整 35 天、日均销量 ≥ 5 杯的商品
            // （销量门槛避免选到日均不足 1 杯的商品，图上线条看不清）
            if (data.skuList && data.skuList.length) {
                let best = null;
                data.skuList.forEach(function(s) {
                    const r = scoreOf('all', 'all', s.product_id);
                    if (!r || r.meanActual < 5) return;
                    if (!best || r.m.r2 > best.r.m.r2) {
                        best = { pid: s.product_id, cat: s.product_category || s.category, r: r };
                    }
                });
                if (best) { bestSkuPid = best.pid; bestSkuCat = best.cat || 'all'; }
            }
        }

        const catDisplay = (typeof DataLoader.getCategoryDisplayName === 'function')
            ? DataLoader.getCategoryDisplayName(bestCat) : bestCat;
        const skuCatDisplay = (typeof DataLoader.getCategoryDisplayName === 'function')
            ? DataLoader.getCategoryDisplayName(bestSkuCat) : bestSkuCat;

        drilldownStates = {
            all:      { store: 'all',     category: 'all',      category_display: '全部品类', sku: 'all' },
            store:    { store: bestStore, category: 'all',      category_display: '全部品类', sku: 'all' },
            category: { store: 'all',     category: bestCat,    category_display: catDisplay, sku: 'all' },
            sku:      { store: 'all',     category: bestSkuCat, category_display: skuCatDisplay, sku: bestSkuPid }
        };
        return drilldownStates;
    }

    // ============ 演示步骤配置 ============
    // 价值前置，事实边界后置；每步 2 句，手机端易读
    const steps = [
        {
            id: 'data-asset',
            title: '真实数据基础',
            time: '建议 1 分钟',
            desc: '149,116 条交易 · 3 店 · 9 品类 · 80 SKU',
            tip: '用真实交易数据跑通整套方案，不是空壳演示。149,116 条交易、181 天、3 家门店、80 个真实商品，全部来自公开数据集。',
            page: 'data-asset',
            focus: '#demo-dataAssetCard',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('data-asset');
                waitForTarget('data-asset', '#demo-dataAssetCard', done);
            }
        },
         {
              id: 'cockpit-forecast',
              title: '实际 vs 预测 · 三级下钻',
              time: '建议 2.5 分钟',
              desc: '35 天五窗口回测 · 门店/品类/SKU 三级下钻',
              tip: '按门店、品类、商品逐级下钻，看到实际销量与预测销量的动态对比。这是 35 天五窗口滚动回测结果，不是未来预测。',
            page: 'cockpit',
            focus: '#demo-forecastMainCard',
            showDrilldown: true,
            scroll: true,
            beforeEnter: function(done) {
                currentDrilldown = 'all';
                ensureDrilldownStates();
                setStore('all');
                App.navigateTo('cockpit');
                waitForTarget('cockpit', '#demo-forecastMainCard', function(ok) {
                    if (ok && typeof CockpitPage !== 'undefined') {
                        CockpitPage.onCategoryChange('all');
                        setTimeout(function() {
                            CockpitPage.onSkuChange('all');
                            updateDrilldownUI();
                            setTimeout(function() { done(true); }, 150);
                        }, 80);
                    } else {
                        done(ok);
                    }
                });
            }
        },
        {
            id: 'forecast-methodology',
            title: '预测方法：点值 + 风险区间',
            time: '建议 1.5 分钟',
            desc: '四步建模流程 · 点预测 + P10–P90 区间',
            tip: '模型学过历史销量后，一次性给出未来 7 天预测：中间是最可能的点预测，浅色带是 P10–P90 风险区间。备货看区间宽度判断风险，而不是只赌一个数字。',
            page: 'forecast-methodology',
            focus: '#demoMethodFlowCard',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('forecast-methodology');
                waitForTarget('forecast-methodology', '#demoMethodFlowCard', done);
            }
        },
        {
            id: 'weather-impact',
            title: '天气影响分析',
            time: '建议 1.5 分钟',
            desc: '真实气温/降水按日期连接 · Pearson 相关性',
            tip: '纽约半年真实气温、降水按日期与销量连接，看温度分桶、晴雨对比和门店天气敏感度。注意这是相关性分析，温度还混着季节与星期效应，不等于因果。',
            page: 'weather-impact',
            focus: '#demoWeatherMainCard',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                setStore('all');
                App.navigateTo('weather-impact');
                waitForTarget('weather-impact', '#demoWeatherMainCard', done);
            }
        },
        {
            id: 'ai-insight-shap',
            title: 'SHAP 寻因中心',
            time: '建议 1.5 分钟',
            desc: '全局特征重要性 · 逐预测 TreeSHAP 分解',
            tip: '全局看哪些特征最影响销量（按分裂增益）；选日期、门店、商品，能把单条预测拆到 53 个特征的正负贡献，直接回答「为什么预测这么多」。SHAP 是模型关联解释，不是业务因果。',
            page: 'ai-insight',
            focus: '#demoShapDrillCard',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('ai-insight');
                waitForTarget('ai-insight', '#demoShapDrillCard', done);
            }
        },
         {
              id: 'model-performance',
              title: '模型效果与基线',
              time: '建议 1.5 分钟',
              desc: 'MAE 2.411 杯 · R² 0.661 · 方向命中 61.4%',
              tip: '回测结果：MAE 2.411 杯、WAPE 34.7%、R² 0.661、方向命中率 61.4%。模型与移动平均、朴素预测、线性回归等基线方法同口径比较，见方法对比区。不同聚合层级需分别看指标。',
             page: 'model-performance',
             focus: '#demo-methodCompareCard',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('model-performance');
                waitForTarget('model-performance', '#demo-methodCompareCard', done);
            }
        },
         {
             id: 'anomaly-detail',
             title: '异常日期 TreeSHAP 复盘',
             time: '建议 1.5 分钟',
             desc: '事实 / 关联 / 待验证原因三层证据',
             tip: '挑一个异常日期，弹窗用 TreeSHAP 拆解特征贡献，帮助业务排查异常。天气是同期事实，具体原因还要结合缺货、活动、客流等业务数据验证。',
            page: 'store-forecast',
            focus: '#anomalyModal .modal',
            showDrilldown: false,
            scroll: false,
            beforeEnter: function(done) {
                App.navigateTo('store-forecast');
                waitForTarget('store-forecast', '#anomalyModal', function(ok) {
                    if (!ok) { done(false); return; }
                    if (typeof StoreForecastPage !== 'undefined' &&
                        typeof StoreForecastPage.showAnomalyDetail === 'function') {
                         StoreForecastPage.showAnomalyDetail('2023-06-25');
                    }
                    const modal = document.querySelector('#anomalyModal .modal');
                    if (!modal) { done(false); return; }
                    let finished = false;
                    function onEnd() {
                        if (finished) return;
                        finished = true;
                        modal.removeEventListener('transitionend', onEnd);
                        done(true);
                    }
                    modal.addEventListener('transitionend', onEnd);
                    setTimeout(function() {
                        if (!finished) { finished = true; onEnd(); }
                    }, 500);
                });
            }
        },
        {
            id: 'extensions',
            title: '经营扩展能力',
            time: '建议 1.5 分钟',
            desc: '预测直连订货 / 排班 · 模拟链路演示',
            tip: '预测结果直接连接订货与排班，把销量估算变成可执行的业务动作。当前无库存、BOM、工时数据，这是能力演示与模拟计算。',
            page: 'extensions',
            focus: '#demo-orderingCore',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('extensions');
                waitForTarget('extensions', '#demo-orderingCore', function(ok) {
                    if (!ok) { done(false); return; }
                    if (typeof ExtensionsPage !== 'undefined' &&
                        typeof ExtensionsPage.switchTab === 'function') {
                        ExtensionsPage.switchTab('ordering');
                    }
                    waitForVisible('#demo-orderingCore', function(visible) {
                        done(visible);
                    }, 20, 100);
                });
            }
        },
        {
            id: 'ai-chat',
            title: '右下角「问 AI」助手',
            time: '建议 1 分钟',
            desc: '飞书智能体 · 已带入当前页面/门店/品类上下文',
            tip: '右下角「问 AI」是接入飞书智能体的归因助手，已自动带入当前页面、门店与筛选条件，可直接用大白话追问异常原因。面板已为你打开，可现场提问；它需要联网调用智能体，回答属辅助参考。',
            page: 'cockpit',
            focus: null,
            showDrilldown: false,
            scroll: false,
            aiChat: true,
            beforeEnter: function(done) {
                App.navigateTo('cockpit');
                waitForTarget('cockpit', '#forecastMainChart', function(ok) {
                    setAiChatStep(true);
                    done(ok);
                });
            }
        },
        {
            id: 'migration',
            title: '茶饮迁移与 POC',
            time: '建议 2 分钟',
            desc: '迁移路径 · 接入真实数据形成可验收 POC',
            tip: '技术链路可直接迁移到茶饮品牌。接入真实订单、库存、成本和活动数据后，就能形成可验收的 POC 结果；现在不展示虚构效果。',
            page: 'migration',
            focus: '#demo-migrationMain',
            showDrilldown: false,
            scroll: true,
            beforeEnter: function(done) {
                App.navigateTo('migration');
                waitForTarget('migration', '#demo-migrationMain', done);
            }
        }
    ];

    // ============ 「问 AI」步骤：浮层避让 + 自动打开面板 ============
    let aiChatStepActive = false;
    function setAiChatStep(on) {
        aiChatStepActive = !!on;
        document.body.classList.toggle('demo-aichat-step', aiChatStepActive);
        if (typeof AiChat === 'undefined') return;
        if (aiChatStepActive) {
            // 解除进入演示时对入口按钮的隐藏，并打开问答面板
            const fab = document.querySelector('.aichat-fab');
            if (fab) fab.classList.remove('aichat-fab--demo-hidden');
            if (AiChat.open && !AiChat.isOpen()) {
                Promise.resolve(AiChat.open()).catch(function() { /* 连接失败不阻断演示 */ });
            }
        } else {
            // 离开该步：关闭面板，并恢复演示期对入口的隐藏
            if (AiChat.close && AiChat.isOpen()) AiChat.close();
            const fab = document.querySelector('.aichat-fab');
            if (fab && isActive) fab.classList.add('aichat-fab--demo-hidden');
        }
    }

    // ============ 工具：等待目标页面+目标元素可见 ============
    function waitForTarget(pageId, selector, callback, maxTries, interval) {
        maxTries = maxTries || 30;
        interval = interval || 100;
        let tries = 0;
        const check = function() {
            const currentPage = App.getCurrentPage();
            if (currentPage !== pageId) {
                if (tries < maxTries) { tries++; setTimeout(check, interval); } else { callback(false, null); }
                return;
            }
            const el = document.querySelector(selector);
            if (!el) {
                if (tries < maxTries) { tries++; setTimeout(check, interval); } else { callback(false, null); }
                return;
            }
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const visible = style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           rect.width > 0 &&
                           rect.height > 0;
            if (visible) {
                callback(true, el);
            } else if (tries < maxTries) {
                tries++;
                setTimeout(check, interval);
            } else {
                callback(false, el);
            }
        };
        check();
    }

    // ============ 工具：等待元素可见 ============
    function waitForVisible(selector, callback, maxTries, interval) {
        maxTries = maxTries || 20;
        interval = interval || 100;
        let tries = 0;
        const check = function() {
            const el = document.querySelector(selector);
            if (!el) {
                if (tries < maxTries) { tries++; setTimeout(check, interval); } else { callback(false); }
                return;
            }
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const visible = style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           rect.width > 0 &&
                           rect.height > 0;
            if (visible) {
                callback(true);
            } else if (tries < maxTries) {
                tries++;
                setTimeout(check, interval);
            } else {
                callback(false);
            }
        };
        check();
    }

    // ============ 工具：有限次数等待 DOM 就绪 ============
    function waitDom(selector, callback, maxTries, interval) {
        maxTries = maxTries || 20;
        interval = interval || 100;
        let tries = 0;
        const check = function() {
            const el = document.querySelector(selector);
            if (el) {
                callback();
            } else if (tries < maxTries) {
                tries++;
                setTimeout(check, interval);
            } else {
                callback();
            }
        };
        check();
    }

    // ============ 工具：设置全局门店 ============
    function setStore(value) {
        const select = document.getElementById('storeSelect');
        if (select && select.value !== value) {
            select.value = value;
            App.onStoreChange(value);
        }
    }

    // ============ 入口 / 欢迎 ============
    function start() {
        renderWelcomeSteps();
        document.getElementById('demoWelcomeModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    // 根据 steps 数据渲染欢迎浮层清单，避免手写清单与真实步骤不同步
    function renderWelcomeSteps() {
        const wrap = document.getElementById('demoWelcomeSteps');
        const summary = document.getElementById('demoWelcomeSummary');
        if (!wrap) return;
        const totalEl = document.getElementById('demoStepTotal');
        const totalMinutes = steps.reduce(function(sum, s) {
            const m = (s.time || '').match(/([\d.]+)/);
            return sum + (m ? parseFloat(m[1]) : 0);
        }, 0);
        if (summary) summary.textContent = steps.length + ' 步演示故事线 · 约 ' + totalMinutes + ' 分钟';
        if (totalEl) totalEl.textContent = steps.length;
        wrap.innerHTML = steps.map(function(s, i) {
            const title = (s.title || '');
            const time = s.time ? s.time.replace(/^建议\s*/, '') : '';
            const desc = s.desc || '';
            return '<div class="demo-welcome-step">' +
                '<div class="demo-welcome-step-num">' + (i + 1) + '</div>' +
                '<div>' +
                    '<div class="demo-welcome-step-title">' + title + (time ? ' · ' + time : '') + '</div>' +
                    (desc ? '<div class="demo-welcome-step-desc">' + desc + '</div>' : '') +
                '</div>' +
            '</div>';
        }).join('');
    }

    // 快照：保存用户进入演示前的全部状态
    function takeSnapshot() {
        saved.page = App.getCurrentPage();
        saved.store = App.getCurrentStore();
        const pc = document.getElementById('pageContainer');
        saved.scrollTop = pc ? pc.scrollTop : 0;

        saved.anomalyOpen = !!(document.getElementById('anomalyModal') &&
                               document.getElementById('anomalyModal').classList.contains('show'));
        saved.anomalyDate = null;
        if (saved.anomalyOpen && saved.page === 'store-forecast' &&
            typeof StoreForecastPage !== 'undefined' &&
            typeof StoreForecastPage.getCurrentAnomalyDate === 'function') {
            saved.anomalyDate = StoreForecastPage.getCurrentAnomalyDate();
        }

        if (saved.page === 'cockpit' && typeof CockpitPage !== 'undefined' && CockpitPage.getState) {
            const st = CockpitPage.getState();
            saved.cockpitCategory = st.category;
            saved.cockpitSku = st.sku;
        } else {
            saved.cockpitCategory = 'all';
            saved.cockpitSku = 'all';
        }

        if (saved.page === 'extensions' && typeof ExtensionsPage !== 'undefined' && ExtensionsPage.getCurrentTab) {
            saved.extTab = ExtensionsPage.getCurrentTab();
        } else {
            saved.extTab = 'ordering';
        }
    }

    function closeWelcome() {
        document.getElementById('demoWelcomeModal').classList.remove('show');
        document.body.style.overflow = '';
    }

    function begin() {
        closeWelcome();
        takeSnapshot();
        isActive = true;
        currentStep = 0;
        currentDrilldown = 'all';
        firstHintShown = false;
        document.body.classList.add('demo-mode-active');
        document.getElementById('demoControlBar').classList.add('active');
        document.getElementById('demoOverlay').classList.add('active');

        // 通知 AI 问答面板：进入演示模式（自动收起、隐藏入口，避免遮挡控制条）
        if (typeof AiChat !== 'undefined' && AiChat.onDemoModeChange) {
            AiChat.onDemoModeChange('enter');
        }

        // 暗色遮罩点击退出（仅遮罩区域，焦点挖空区和控制栏不触发）
        bindOverlayExit();

        // 监听内容容器滚动，节流重算
        bindScrollListener();

        goToStep(0);
    }

    // ============ 暗色遮罩点击退出 ============
    function bindOverlayExit() {
        const overlay = document.getElementById('demoOverlay');
        if (!overlay) return;
        // 给四片遮罩加上点击退出（挖空的中心区域不拦截）
        const parts = overlay.querySelectorAll(
            '.demo-overlay-top, .demo-overlay-bottom, .demo-overlay-left, .demo-overlay-right'
        );
        parts.forEach(function(p) {
            p.addEventListener('click', handleOverlayClick);
        });
    }

    function unbindOverlayExit() {
        const overlay = document.getElementById('demoOverlay');
        if (!overlay) return;
        const parts = overlay.querySelectorAll(
            '.demo-overlay-top, .demo-overlay-bottom, .demo-overlay-left, .demo-overlay-right'
        );
        parts.forEach(function(p) {
            p.removeEventListener('click', handleOverlayClick);
        });
    }

    function handleOverlayClick(e) {
        // 保护：只在直接点到遮罩片本身时退出，避免冒泡误触
        if (!isActive) return;
        // 点击区域必须是暗色遮罩，不在焦点挖空内
        exit();
    }

    // ============ 内容容器滚动监听（节流重算） ============
    function bindScrollListener() {
        const pc = document.getElementById('pageContainer');
        if (!pc) return;
        pc.addEventListener('scroll', handleContainerScroll);
    }

    function unbindScrollListener() {
        const pc = document.getElementById('pageContainer');
        if (!pc) return;
        pc.removeEventListener('scroll', handleContainerScroll);
        if (scrollThrottleTimer) {
            clearTimeout(scrollThrottleTimer);
            scrollThrottleTimer = null;
        }
    }

    function handleContainerScroll() {
        if (!isActive) return;
        if (scrollThrottleTimer) return; // 节流中
        scrollThrottleTimer = setTimeout(function() {
            scrollThrottleTimer = null;
            const step = steps[currentStep];
            if (step && step.scroll !== false && step.focus) {
                applyFocus(step.focus);
            }
        }, 120);
    }

    // ============ 退出 + 完整恢复 ============
    function exit() {
        if (!isActive) return;
        isActive = false;

        // 清理所有定时器
        clearAllTimers();

        // 离开「问 AI」步骤（若正停在该步）
        setAiChatStep(false);

        // 解除事件监听
        unbindOverlayExit();
        unbindScrollListener();

        // 清除聚焦
        clearFocus();

        // 隐藏控制条和遮罩
        document.getElementById('demoControlBar').classList.remove('active');
        document.getElementById('demoOverlay').classList.remove('active');
        document.body.classList.remove('demo-mode-active');

        // 通知 AI 问答面板：退出演示模式（恢复入口与面板状态）
        if (typeof AiChat !== 'undefined' && AiChat.onDemoModeChange) {
            AiChat.onDemoModeChange('exit');
        }

        // 关闭演示产生的异常浮层
        if (typeof StoreForecastPage !== 'undefined' &&
            typeof StoreForecastPage.closeModal === 'function') {
            StoreForecastPage.closeModal();
        }

        // 恢复顺序
        const currentStore = App.getCurrentStore();
        if (currentStore !== saved.store) {
            setStore(saved.store);
        }

        App.navigateTo(saved.page);

        waitPageReady(saved.page, function() {
            if (saved.page === 'cockpit' && typeof CockpitPage !== 'undefined') {
                if (CockpitPage.onCategoryChange) {
                    CockpitPage.onCategoryChange(saved.cockpitCategory);
                }
                if (CockpitPage.onSkuChange) {
                    waitSkuReady(saved.cockpitSku, function() {
                        CockpitPage.onSkuChange(saved.cockpitSku);
                        afterPageStateRestored();
                    });
                } else {
                    afterPageStateRestored();
                }
            } else if (saved.page === 'extensions' && typeof ExtensionsPage !== 'undefined' &&
                       ExtensionsPage.switchTab) {
                ExtensionsPage.switchTab(saved.extTab);
                setTimeout(afterPageStateRestored, 100);
            } else if (saved.anomalyOpen && saved.page === 'store-forecast' &&
                       typeof StoreForecastPage !== 'undefined' &&
                       typeof StoreForecastPage.showAnomalyDetail === 'function' &&
                       saved.anomalyDate) {
                StoreForecastPage.showAnomalyDetail(saved.anomalyDate);
                afterPageStateRestored();
            } else {
                afterPageStateRestored();
            }
        });
    }

    // 页内状态恢复完成 → 触发 resize → 逐帧恢复滚动
    function afterPageStateRestored() {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new Event('resize'));
        }
        const pc = document.getElementById('pageContainer');
        if (!pc) return;
        // 三档恢复：rAF → 250ms → 500ms（500ms 兜底无闪烁，因为前面已经设在近似位置）
        requestAnimationFrame(function() {
            pc.scrollTop = saved.scrollTop;
        });
        setTimeout(function() {
            if (pc.scrollTop !== saved.scrollTop) {
                pc.scrollTop = saved.scrollTop;
            }
        }, 250);
        setTimeout(function() {
            if (pc.scrollTop !== saved.scrollTop) {
                pc.scrollTop = saved.scrollTop;
            }
        }, 500);
    }

    // 等待 cockpit SKU 下拉包含目标选项
    function waitSkuReady(targetValue, callback) {
        const maxTries = 20;
        let tries = 0;
        const check = function() {
            const sel = document.getElementById('skuSelect');
            if (sel && sel.querySelector('option[value="' + targetValue + '"]')) {
                callback();
            } else if (tries < maxTries) {
                tries++;
                setTimeout(check, 30);
            } else {
                callback();
            }
        };
        check();
    }

    // 等待某页渲染就绪
    function waitPageReady(pageId, callback) {
        const selectors = {
            'cockpit': '#forecastMainChart',
            'extensions': '#orderingPanel',
            'store-forecast': '#storeForecastChart',
            'model-performance': '#sevenLevelChart',
            'data-asset': '#demo-dataAssetCard, .data-assets-grid',
            'migration': '#demo-migrationMain, .migration-content'
        };
        const sel = selectors[pageId] || '.page-container .card';
        waitDom(sel, callback);
    }

    // ============ 步骤导航 ============
    function next() {
        if (!isActive) return;
        if (currentStep < steps.length - 1) {
            goToStep(currentStep + 1);
        } else {
            exit();
        }
    }

    function prev() {
        if (!isActive) return;
        if (currentStep > 0) {
            goToStep(currentStep - 1);
        }
    }

    function goToStep(idx) {
        if (idx < 0 || idx >= steps.length) return;
        // 清理上一步遗留的延迟重算定时器
        clearRefocusTimers();

        currentStep = idx;
        const step = steps[idx];

        // 更新控制条
        document.getElementById('demoStepCurrent').textContent = idx + 1;
        document.getElementById('demoStepTitle').textContent = step.title;
        document.getElementById('demoTip').textContent = step.tip;
        document.getElementById('demoTime').textContent = step.time;

        // 更新按钮状态
        document.getElementById('demoPrevBtn').disabled = (idx === 0);
        const nextBtn = document.getElementById('demoNextBtn');
        if (idx === steps.length - 1) {
            nextBtn.querySelector('span').textContent = '完成';
        } else {
            nextBtn.querySelector('span').textContent = '下一步';
        }

        // 下钻子状态栏显示/隐藏
        const drillBar = document.getElementById('demoDrilldownBar');
        if (drillBar) {
            drillBar.style.display = step.showDrilldown ? '' : 'none';
        }

        // 首次进入提示（仅第一步显示一次）
        const hintEl = document.getElementById('demoFirstHint');
        if (hintEl) {
            if (!firstHintShown && idx === 0) {
                hintEl.style.display = '';
                firstHintShown = true;
                // 6 秒后自动消失
                setTimeout(function() {
                    if (hintEl) hintEl.style.display = 'none';
                }, 6000);
            } else {
                hintEl.style.display = 'none';
            }
        }

        // 清除旧聚焦
        clearFocus();

        // 「问 AI」步骤：切换浮层避让与面板开关
        setAiChatStep(!!step.aiChat);

        // 执行进入动作 → 聚焦 → 两次延迟重算兜底图表异步渲染
        const done = function(ok) {
            setTimeout(function() {
                applyFocus(step.focus);

                // 第 2 步下钻条展开后，额外等待布局稳定再重算
                if (step.showDrilldown) {
                    refocusTimer1 = setTimeout(function() {
                        applyFocus(step.focus);
                    }, 300);
                }

                // 图表异步渲染兜底（ECharts 可能在 200-600ms 后完成）
                refocusTimer2 = setTimeout(function() {
                    applyFocus(step.focus);
                }, 400);

                refocusTimer3 = setTimeout(function() {
                    applyFocus(step.focus);
                }, 700);
            }, 120);
        };

        if (step.beforeEnter) {
            step.beforeEnter(done);
        } else {
            done(true);
        }
    }

    // 重新计算当前步聚焦
    function refocus() {
        if (!isActive) return;
        const step = steps[currentStep];
        if (step && step.focus) applyFocus(step.focus);
    }

    // ============ 下钻子状态切换 ============
    function setDrilldown(level) {
        const states = ensureDrilldownStates();
        if (!states[level]) return;
        const st = states[level];
        currentDrilldown = level;
        updateDrilldownUI();

        setStore(st.store);

        waitDom('#forecastMainChart', function() {
            if (typeof CockpitPage !== 'undefined') {
                CockpitPage.onCategoryChange(st.category);
                setTimeout(function() {
                    CockpitPage.onSkuChange(st.sku);
                    // 下钻后图表尺寸变化，重算聚焦（双保险）
                    setTimeout(function() {
                        applyFocus(steps[currentStep].focus);
                    }, 200);
                    setTimeout(function() {
                        applyFocus(steps[currentStep].focus);
                    }, 450);
                }, 80);
            }
        });
    }

    function updateDrilldownUI() {
        const pills = document.querySelectorAll('#demoDrilldownBar .demo-drilldown-pill');
        pills.forEach(function(p) {
            p.classList.toggle('active', p.dataset.level === currentDrilldown);
        });
    }

    // ============ 聚焦遮罩 ============
    function clearFocus() {
        const overlay = document.getElementById('demoOverlay');
        if (!overlay) return;
        overlay.style.clipPath = 'none';
        const topEl = overlay.querySelector('.demo-overlay-top');
        const rightEl = overlay.querySelector('.demo-overlay-right');
        const bottomEl = overlay.querySelector('.demo-overlay-bottom');
        const leftEl = overlay.querySelector('.demo-overlay-left');
        if (topEl) topEl.style.height = '0';
        if (rightEl) rightEl.style.width = '0';
        if (bottomEl) bottomEl.style.height = '0';
        if (leftEl) leftEl.style.width = '0';
    }

    function applyFocus(selector) {
        const overlay = document.getElementById('demoOverlay');
        const controlBar = document.getElementById('demoControlBar');
        const tipEl = document.getElementById('demoTip');
        if (!overlay) return;

        controlBar && controlBar.classList.remove('demo-focus-error');
        document.querySelectorAll('.demo-modal-highlight').forEach(function(el) {
            el.classList.remove('demo-modal-highlight');
        });

        // 无聚焦目标（如「问 AI」步骤）：撤掉挖空遮罩，全屏正常可交互，仅保留控制条提示
        if (!selector) {
            clearFocus();
            const st = steps[currentStep];
            if (tipEl && st) tipEl.textContent = st.tip;
            return;
        }

        const el = getFocusElement(selector);
        if (!el) {
            clearFocus();
            if (controlBar) controlBar.classList.add('demo-focus-error');
            if (tipEl) tipEl.textContent = '当前步骤定位失败，请重试';
            return;
        }

        const step = steps[currentStep];
        if (tipEl && step) tipEl.textContent = step.tip;

        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;

        const controlBarHeight = getControlBarHeight();
        const bottomSafeY = vh - controlBarHeight - 8;

        let top = Math.max(0, rect.top - pad);
        let bottom = Math.min(bottomSafeY, rect.bottom + pad);

        if (top >= bottomSafeY) {
            top = bottomSafeY - 60;
        }

        let tipSuffix = '';
        if (rect.bottom + pad > bottomSafeY && rect.height > 200) {
            tipSuffix = '（可滚动查看完整内容）';
        }
        if (tipEl && step && tipSuffix) {
            tipEl.textContent = step.tip + tipSuffix;
        }

        const left = Math.max(0, rect.left - pad);
        const right = Math.min(vw, rect.right + pad);

        const topEl = overlay.querySelector('.demo-overlay-top');
        const rightEl = overlay.querySelector('.demo-overlay-right');
        const bottomEl = overlay.querySelector('.demo-overlay-bottom');
        const leftEl = overlay.querySelector('.demo-overlay-left');

        topEl.style.height = top + 'px';
        topEl.style.left = '0';
        topEl.style.right = '0';

        bottomEl.style.height = (vh - bottom) + 'px';
        bottomEl.style.left = '0';
        bottomEl.style.right = '0';

        leftEl.style.top = top + 'px';
        leftEl.style.bottom = (vh - bottom) + 'px';
        leftEl.style.width = left + 'px';

        rightEl.style.top = top + 'px';
        rightEl.style.bottom = (vh - bottom) + 'px';
        rightEl.style.width = (vw - right) + 'px';

        // 弹窗步骤：用边框光晕高亮（弹窗 z-index 高于 overlay）
        if (selector && selector.indexOf('#anomalyModal') >= 0) {
            const modal = document.querySelector('#anomalyModal .modal');
            if (modal) modal.classList.add('demo-modal-highlight');
        }

        // 滚动定位（除弹窗类）
        const stepInfo = steps[currentStep];
        if (stepInfo && stepInfo.scroll !== false) {
            scrollToElement(el);
        }
    }

    // 直接根据选择器获取目标元素
    function getFocusElement(selector) {
        if (!selector) return null;
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        return el;
    }

    function scrollToElement(el) {
        if (!el) return false;
        if (scrollTimer) clearTimeout(scrollTimer);

        const container = document.getElementById('pageContainer');
        if (!container) return false;

        const controlBar = document.getElementById('demoControlBar');
        const drillBar = document.getElementById('demoDrilldownBar');
        let controlBarHeight = 0;
        if (controlBar && controlBar.offsetHeight > 0) {
            controlBarHeight = controlBar.offsetHeight;
        }
        if (drillBar && drillBar.style.display !== 'none' && drillBar.offsetHeight > 0) {
            if (controlBar && !controlBar.contains(drillBar)) {
                controlBarHeight += drillBar.offsetHeight;
            }
        }

        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const viewportHeight = containerRect.height;
        const availableHeight = viewportHeight - controlBarHeight - 48;

        const elTopRelative = elRect.top - containerRect.top + container.scrollTop;
        const elHeight = elRect.height;

        let targetTop;
        if (elHeight <= availableHeight) {
            targetTop = elTopRelative - (availableHeight - elHeight) / 2 - 24;
        } else {
            targetTop = elTopRelative - 24;
        }

        targetTop = Math.max(0, targetTop);
        const maxScroll = container.scrollHeight - container.clientHeight;
        targetTop = Math.min(targetTop, maxScroll);

        scrollTimer = setTimeout(function() {
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
        }, 50);

        return true;
    }

    // 计算控制条高度
    function getControlBarHeight() {
        const controlBar = document.getElementById('demoControlBar');
        return controlBar ? controlBar.offsetHeight : 0;
    }

    // ============ 定时器清理 ============
    function clearRefocusTimers() {
        if (refocusTimer1) { clearTimeout(refocusTimer1); refocusTimer1 = null; }
        if (refocusTimer2) { clearTimeout(refocusTimer2); refocusTimer2 = null; }
        if (refocusTimer3) { clearTimeout(refocusTimer3); refocusTimer3 = null; }
    }

    function clearAllTimers() {
        clearRefocusTimers();
        if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
        if (scrollThrottleTimer) { clearTimeout(scrollThrottleTimer); scrollThrottleTimer = null; }
    }

    // ============ 键盘 + resize ============
    function handleKeydown(e) {
        if (!isActive) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            next();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            prev();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            exit();
        }
    }

    function handleResize() {
        if (!isActive) return;
        const step = steps[currentStep];
        if (step && step.focus) {
            applyFocus(step.focus);
        }
    }

    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);

    // ============ 只读元信息 ============
    function getStepsInfo() {
        let totalMinutes = 0;
        const stepInfos = steps.map(function(s) {
            const m = (s.time || '').match(/([\d.]+)/);
            const mins = m ? parseFloat(m[1]) : 0;
            totalMinutes += mins;
            return {
                id: s.id,
                title: s.title,
                time: s.time,
                minutes: mins,
                focus: s.focus || null,
                page: s.page || null,
                showDrilldown: !!s.showDrilldown,
                scroll: s.scroll !== false
            };
        });
        return {
            count: steps.length,
            totalMinutes: totalMinutes,
            steps: stepInfos
        };
    }

    return {
        start,
        closeWelcome,
        begin,
        next,
        prev,
        exit,
        goToStep,
        setDrilldown,
        refocus,
        _stepsInfo: getStepsInfo
    };
})();
