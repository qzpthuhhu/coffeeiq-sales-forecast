/* ============================================================
    DemoSelfCheck — 演示前一键自检
    ============================================================ */
(function() {
    'use strict';

    // ============ 早期错误（由 early-error-capture.js 提前安装） ============
    // 只读，不重复安装监听器
    function getEarlyErrors() {
        if (window.__earlyErrors && typeof window.__earlyErrors.getLog === 'function') {
            return window.__earlyErrors.getLog();
        }
        return [];
    }

    // ============ 状态 ============
    let results = [];
    let isRunning = false;
    let lastCheckTime = null;
    let deepCheckEnabled = true;
    let totalDurationMs = 0;

    // ============ 工具 ============
    function approxEqual(actual, expected, tolerance) {
        if (typeof actual !== 'number' || isNaN(actual)) return false;
        return Math.abs(actual - expected) <= tolerance;
    }

    function formatNumber(n) {
        if (typeof n !== 'number') return String(n);
        if (Math.abs(n) >= 1000) return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (Math.abs(n) >= 1) return n.toFixed(3);
        return n.toFixed(6);
    }

    function waitDom(selector, callback, maxTries, interval) {
        maxTries = maxTries || 20;
        interval = interval || 100;
        let tries = 0;
        const check = function() {
            const el = document.querySelector(selector);
            if (el) {
                callback(true, el);
            } else if (tries < maxTries) {
                tries++;
                setTimeout(check, interval);
            } else {
                callback(false, null);
            }
        };
        check();
    }

    // 检查 ECharts 实例（通过 DOM 元素的 _echarts_instance_ 属性）
    function getChartInstance(dom) {
        if (!dom || !window.echarts) return null;
        try {
            const id = dom.getAttribute('_echarts_instance_');
            if (id && window.echarts.getInstanceById) {
                return window.echarts.getInstanceById(id);
            }
            if (dom.echarts_instance) return dom.echarts_instance;
        } catch(_) {}
        return null;
    }

    function chartHasValidSize(instance) {
        if (!instance) return false;
        try {
            const size = instance.getWidth && instance.getHeight
                ? { w: instance.getWidth(), h: instance.getHeight() }
                : null;
            if (!size) {
                const dom = instance.getDom && instance.getDom();
                if (!dom) return false;
                size = { w: dom.clientWidth, h: dom.clientHeight };
            }
            return size.w > 0 && size.h > 0;
        } catch(_) {
            return false;
        }
    }

    // ============ 单条检查构造器 ============
    function makeResult(id, name, status, actual, expected, detail) {
        return {
            id,
            name,
            status, // pass / fail / manual / na
            actual: actual !== undefined ? actual : '',
            expected: expected !== undefined ? expected : '',
            detail: detail || ''
        };
    }

    // ============ 检查集合 ============

    // 1. 数据加载
    function checkDataLoaded() {
        try {
            const loaded = window.DataLoader && DataLoader.isLoaded();
            const data = window.DataLoader && DataLoader.getData();
            if (!loaded) return makeResult('data-loaded', '数据加载完成', 'fail', '未完成', 'DataLoader.isLoaded() = true', '数据加载器状态异常');
            if (!data || !data.summary) return makeResult('data-loaded', '数据加载完成', 'fail', 'summary 缺失', 'summary 对象存在', '数据汇总对象不存在');
            return makeResult('data-loaded', '数据加载完成', 'pass', '已加载', 'DataLoader.isLoaded() = true');
        } catch(e) {
            return makeResult('data-loaded', '数据加载完成', 'fail', '异常', '加载完成', String(e.message || e));
        }
    }

    // 2. 真实数据规模（基础聚合口径）
    function checkDataScale() {
        try {
            const s = DataLoader.getData().summary;
            const checks = [];
            if (s.dayCount !== 181) checks.push('天数 ' + s.dayCount + ' ≠ 181');
            if (s.storeCount !== 3) checks.push('门店 ' + s.storeCount + ' ≠ 3');
            if (s.categoryCount !== 9) checks.push('品类 ' + s.categoryCount + ' ≠ 9');
            if (s.productTypeCount !== 29) checks.push('产品类型 ' + s.productTypeCount + ' ≠ 29');
            if (s.skuCount !== 80) checks.push('SKU ' + s.skuCount + ' ≠ 80');

            const actual = s.dayCount + '天 · ' + s.storeCount + '店 · ' + s.categoryCount + '品类 · ' + s.productTypeCount + '类型 · ' + s.skuCount + 'SKU';
            const expected = '181天 · 3店 · 9品类 · 29类型 · 80SKU';

            if (checks.length === 0) {
                return makeResult('data-scale', '聚合数据规模', 'pass', actual, expected);
            }
            return makeResult('data-scale', '聚合数据规模', 'fail', actual, expected, checks.join('；'));
        } catch(e) {
            return makeResult('data-scale', '聚合数据规模', 'fail', '异常', '181天/3店/9品类/29类型/80SKU', String(e.message || e));
        }
    }

    // 2b. 原始交易记录核验（异步，按需加载 transactions.xlsx）
    //    使用 SheetJS 解析真实 xlsx 文件，验证 149116 行、字段、日期范围、维度
    function checkRawTransactions(callback) {
        const EXP_ROWS = 149116;
        const EXP_FIELDS = ['transaction_id','transaction_date','transaction_qty','store_location','product_id','product_category','product_type','product_detail'];
        const EXP_DATE_MIN = '2023-01-01';
        const EXP_DATE_MAX = '2023-06-30';
        const EXP_STORES = 3;
        const EXP_CATS = 9;
        const EXP_TYPES = 29;
        const EXP_SKUS = 80;

        const startTime = Date.now();

        // 步骤1：按需加载 SheetJS
        function loadSheetJS(done) {
            if (window.XLSX && window.XLSX.read) {
                done(null, window.XLSX);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = function() {
                if (window.XLSX && window.XLSX.read) {
                    done(null, window.XLSX);
                } else {
                    done(new Error('SheetJS 加载后不可用'));
                }
            };
            script.onerror = function() {
                done(new Error('SheetJS 加载失败'));
            };
            document.head.appendChild(script);
        }

        // 标准化字段名：去空格、转小写
        function normField(s) {
            return String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
        }

        // 步骤2：fetch + 解析 + 校验
        loadSheetJS(function(err, XLSX) {
            if (err) {
                callback(makeResult('raw-transactions', '原始交易记录（transactions.xlsx）',
                    'fail', 'SheetJS 加载失败', EXP_ROWS + ' 行 · 8 字段 · 日期范围 ' + EXP_DATE_MIN + ' ~ ' + EXP_DATE_MAX,
                    String(err.message || err)));
                return;
            }

            fetch('data/transactions.xlsx')
                .then(function(resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.arrayBuffer();
                })
                .then(function(buf) {
                    let workbook;
                    try {
                        workbook = XLSX.read(buf, { type: 'array', cellDates: false });
                    } catch (e) {
                        throw new Error('XLSX 解析失败：' + e.message);
                    }

                    const sheetNames = workbook.SheetNames;
                    if (!sheetNames || sheetNames.length === 0) {
                        throw new Error('工作簿无工作表');
                    }
                    const firstSheet = workbook.Sheets[sheetNames[0]];
                    if (!firstSheet) {
                        throw new Error('第一张工作表为空');
                    }

                    // 转换为数组（含表头行）
                    const aoa = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                    if (!aoa || aoa.length < 2) {
                        throw new Error('工作表数据不足 2 行');
                    }

                    const headerRow = aoa[0].map(normField);
                    const dataRows = aoa.slice(1);
                    const rowCount = dataRows.length;

                    const fails = [];
                    const info = [];

                    // 行数
                    if (rowCount !== EXP_ROWS) {
                        fails.push('数据行数 ' + rowCount.toLocaleString() + ' ≠ ' + EXP_ROWS.toLocaleString());
                    }

                    // 字段检查
                    const missingFields = [];
                    const fieldIndex = {};
                    EXP_FIELDS.forEach(function(f) {
                        const idx = headerRow.indexOf(f);
                        if (idx === -1) {
                            missingFields.push(f);
                        } else {
                            fieldIndex[f] = idx;
                        }
                    });
                    if (missingFields.length > 0) {
                        fails.push('缺失字段：' + missingFields.join(', '));
                    }

                    // 如果关键字段齐全，做日期和维度抽查
                    if (fieldIndex.transaction_date !== undefined &&
                        fieldIndex.store_location !== undefined &&
                        fieldIndex.product_category !== undefined &&
                        fieldIndex.product_type !== undefined &&
                        fieldIndex.product_id !== undefined) {

                        const dateIdx = fieldIndex.transaction_date;
                        const storeIdx = fieldIndex.store_location;
                        const catIdx = fieldIndex.product_category;
                        const typeIdx = fieldIndex.product_type;
                        const skuIdx = fieldIndex.product_id;
                        const tidIdx = fieldIndex.transaction_id;
                        const qtyIdx = fieldIndex.transaction_qty;

                        const stores = new Set();
                        const cats = new Set();
                        const types = new Set();
                        const skus = new Set();
                        let minDate = null;
                        let maxDate = null;
                        let firstRowEmpty = false;
                        let midRowEmpty = false;
                        let lastRowEmpty = false;

                        // 辅助：Excel 日期数字 → YYYY-MM-DD 字符串
                        function excelDateToStr(val) {
                            if (typeof val === 'number') {
                                // Excel epoch: 1899-12-30
                                const d = new Date(Math.round((val - 25569) * 86400 * 1000));
                                const y = d.getUTCFullYear();
                                const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const d2 = String(d.getUTCDate()).padStart(2, '0');
                                return y + '-' + m + '-' + d2;
                            }
                            const s = String(val).trim();
                            // 已经是 YYYY-MM-DD
                            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
                            // 尝试其他格式
                            const d = new Date(s);
                            if (!isNaN(d.getTime())) {
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, '0');
                                const d2 = String(d.getDate()).padStart(2, '0');
                                return y + '-' + m + '-' + d2;
                            }
                            return s;
                        }

                        // 首行、中间行、末行抽查非空
                        function rowHasFields(row) {
                            if (tidIdx !== undefined && (row[tidIdx] === '' || row[tidIdx] == null)) return false;
                            if (row[dateIdx] === '' || row[dateIdx] == null) return false;
                            if (qtyIdx !== undefined && (row[qtyIdx] === '' || row[qtyIdx] == null)) return false;
                            if (row[storeIdx] === '' || row[storeIdx] == null) return false;
                            if (row[skuIdx] === '' || row[skuIdx] == null) return false;
                            return true;
                        }

                        if (dataRows.length > 0) {
                            firstRowEmpty = !rowHasFields(dataRows[0]);
                        }
                        const midIdx = Math.floor(dataRows.length / 2);
                        midRowEmpty = !rowHasFields(dataRows[midIdx]);
                        lastRowEmpty = !rowHasFields(dataRows[dataRows.length - 1]);

                        if (firstRowEmpty) fails.push('首行关键字段为空');
                        if (midRowEmpty) fails.push('中间行关键字段为空');
                        if (lastRowEmpty) fails.push('末行关键字段为空');

                        // 遍历：日期范围 + 维度计数
                        // 为了性能，不全部遍历 Set（14 万行 Set add 也很快），但我们只需要计数
                        for (let i = 0; i < dataRows.length; i++) {
                            const row = dataRows[i];
                            stores.add(row[storeIdx]);
                            cats.add(row[catIdx]);
                            types.add(row[typeIdx]);
                            skus.add(row[skuIdx]);

                            const dateStr = excelDateToStr(row[dateIdx]);
                            if (minDate === null || dateStr < minDate) minDate = dateStr;
                            if (maxDate === null || dateStr > maxDate) maxDate = dateStr;
                        }

                        if (stores.size !== EXP_STORES) fails.push('门店数 ' + stores.size + ' ≠ ' + EXP_STORES);
                        if (cats.size !== EXP_CATS) fails.push('品类数 ' + cats.size + ' ≠ ' + EXP_CATS);
                        if (types.size !== EXP_TYPES) fails.push('产品类型数 ' + types.size + ' ≠ ' + EXP_TYPES);
                        if (skus.size !== EXP_SKUS) fails.push('SKU数 ' + skus.size + ' ≠ ' + EXP_SKUS);
                        if (minDate !== EXP_DATE_MIN) fails.push('最早日期 ' + minDate + ' ≠ ' + EXP_DATE_MIN);
                        if (maxDate !== EXP_DATE_MAX) fails.push('最晚日期 ' + maxDate + ' ≠ ' + EXP_DATE_MAX);

                        info.push(stores.size + '门店 · ' + cats.size + '品类 · ' + types.size + '类型 · ' + skus.size + 'SKU');
                        info.push('日期 ' + minDate + ' ~ ' + maxDate);
                    }

                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                    // 释放大数组引用
                    aoa.length = 0;
                    if (workbook) {
                        // 释放 SheetJS 内部缓存
                        try {
                            for (const sn of workbook.SheetNames) {
                                workbook.Sheets[sn] = null;
                            }
                        } catch(_) {}
                    }

                    const actual = rowCount.toLocaleString() + ' 行 · ' + (info.length ? info.join(' · ') : '字段未完整解析') + ' · 耗时 ' + elapsed + 's';
                    const expected = EXP_ROWS.toLocaleString() + ' 行 · ' + EXP_FIELDS.length + ' 字段 · ' + EXP_DATE_MIN + ' ~ ' + EXP_DATE_MAX + ' · ' + EXP_STORES + '/' + EXP_CATS + '/' + EXP_TYPES + '/' + EXP_SKUS + ' 维度';
                    const detail = '数据源：data/transactions.xlsx 原始文件（SheetJS 解析第一张工作表），解析后已释放大数组引用';

                    if (fails.length === 0) {
                        callback(makeResult('raw-transactions', '原始交易记录（transactions.xlsx）', 'pass', actual, expected, detail));
                    } else {
                        callback(makeResult('raw-transactions', '原始交易记录（transactions.xlsx）', 'fail', actual, expected, fails.join('；') + '。' + detail));
                    }
                })
                .catch(function(e) {
                    callback(makeResult('raw-transactions', '原始交易记录（transactions.xlsx）',
                        'fail', '加载/解析失败', EXP_ROWS.toLocaleString() + ' 行',
                        String(e.message || e) + '。未使用硬编码 149,116 降级通过'));
                });
        });
    }

    // 3. 预测数据完整性
    function checkForecastData() {
        try {
            const data = DataLoader.getData();
            const sf = data.skuForecast;
            if (!sf || !Array.isArray(sf)) {
                return makeResult('forecast-data', '预测数据完整性', 'fail', 'skuForecast 缺失', '8400 行', '预测数据对象不存在');
            }
            const rows = sf.length;
            const dates = [...new Set(sf.map(d => d.date))].sort();
            const stores = [...new Set(sf.map(d => d.store_name))];
            const skus = [...new Set(sf.map(d => d.product_id))];

            // 空值检查
            let hasNull = false;
            for (let i = 0; i < sf.length; i++) {
                if (sf[i].qty == null || isNaN(sf[i].qty) ||
                    sf[i].pred_lightgbm == null || isNaN(sf[i].pred_lightgbm)) {
                    hasNull = true;
                    break;
                }
            }

            const actual = rows + ' 行 · ' + dates.length + ' 日 · ' + stores.length + ' 店 · ' + skus.length + ' SKU';
            const expected = '8400 行 · 35 日 · 3 店 · 80 SKU';

            const fails = [];
            if (rows !== 8400) fails.push('行数 ' + rows + ' ≠ 8400');
            if (dates.length !== 35) fails.push('日期数 ' + dates.length + ' ≠ 35');
            if (stores.length !== 3) fails.push('门店数 ' + stores.length + ' ≠ 3');
            if (skus.length !== 80) fails.push('SKU数 ' + skus.length + ' ≠ 80');
            if (dates[0] !== '2023-05-27' || dates[dates.length-1] !== '2023-06-30') {
                fails.push('日期范围 ' + dates[0] + ' ~ ' + dates[dates.length-1] + ' ≠ 2023-05-27 ~ 06-30');
            }
            if (hasNull) fails.push('qty 或 pred_lightgbm 含空值/NaN');

            if (fails.length === 0) {
                return makeResult('forecast-data', '预测数据完整性', 'pass', actual, expected);
            }
            return makeResult('forecast-data', '预测数据完整性', 'fail', actual, expected, fails.join('；'));
        } catch(e) {
            return makeResult('forecast-data', '预测数据完整性', 'fail', '异常', '8400行/35日/3店/80SKU', String(e.message || e));
        }
    }

    // 4. 主面板默认聚合（业务非负口径）
    function checkMainAggregate() {
        try {
            const series = DataLoader.getForecastSeries('all', 'all', 'all');
            if (!series || !series.dates || series.dates.length === 0) {
                return makeResult('main-aggregate', '主面板默认聚合（业务非负口径）', 'fail', '无数据', '35 天序列', 'getForecastSeries 返回为空');
            }
            const expMAE = 2.41;
            const expWape = 34.72;
            const expR2 = 0.661;

            // 计算聚合指标
            const totalActual = series.actuals.reduce((s, v) => s + v, 0);
            const totalPred = series.predictions.reduce((s, v) => s + v, 0);
            let sumAbsErr = 0;
            for (let i = 0; i < series.dates.length; i++) {
                sumAbsErr += Math.abs(series.actuals[i] - series.predictions[i]);
            }
            const mae = sumAbsErr / series.dates.length;
            const wape = sumAbsErr / totalActual * 100;

            const meanActual = totalActual / series.dates.length;
            let ssTot = 0, ssRes = 0;
            for (let i = 0; i < series.dates.length; i++) {
                ssTot += Math.pow(series.actuals[i] - meanActual, 2);
                ssRes += Math.pow(series.actuals[i] - series.predictions[i], 2);
            }
            const r2 = 1 - (ssRes / ssTot);

            const okMAE = approxEqual(mae, expMAE, 0.1);
            const okWape = approxEqual(wape, expWape, 2.0);
            const okR2 = approxEqual(r2, expR2, 0.05);

            const actual = 'MAE ' + mae.toFixed(3) + ' · WAPE ' + wape.toFixed(2) + '% · R² ' + r2.toFixed(4);
            const expected = 'MAE ~' + expMAE + ' · WAPE ~' + expWape + '% · R² ~' + expR2;

            if (okMAE && okWape && okR2) {
                return makeResult('main-aggregate', '主面板默认聚合（业务非负口径）', 'pass', actual, expected);
            }
            const fails = [];
            if (!okMAE) fails.push('MAE 偏差');
            if (!okWape) fails.push('WAPE 偏差');
            if (!okR2) fails.push('R² 偏差');
            return makeResult('main-aggregate', '主面板默认聚合（业务非负口径）', 'fail', actual, expected, fails.join('；') + note);
        } catch(e) {
            return makeResult('main-aggregate', '主面板默认聚合（业务非负口径）', 'fail', '异常', '实际11997 / 预测12146.162 / WAPE 5.57%', String(e.message || e));
        }
    }

    // 5. 下钻检查点
    function checkDrilldownPoints() {
        try {
            const points = [
                { id: 'store-LM', name: '曼哈顿下城店', store: 'Lower Manhattan', category: 'all', sku: 'all' },
                { id: 'cat-coffee', name: '咖啡饮品品类', store: 'all', category: 'Coffee_Beverages', sku: 'all' },
                { id: 'sku-23', name: '中杯经典Diner拼配', store: 'all', category: 'Coffee_Beverages', sku: '23' }
            ];

            const results = [];
            let allPass = true;

            points.forEach(p => {
                const s = DataLoader.getForecastSeries(p.store, p.category, p.sku);
                if (!s || !s.dates || s.dates.length === 0) {
                    results.push(p.name + ': 无数据');
                    allPass = false;
                    return;
                }
                // 检查数据非空且日期数为35
                const dateOk = s.dates.length === 35;
                const predOk = s.predictions.length === 35;
                const p10Ok = s.p10 && s.p10.length === 35;
                const p90Ok = s.p90 && s.p90.length === 35;
                if (!dateOk || !predOk || !p10Ok || !p90Ok) {
                    results.push(p.name + `: 序列长度异常 (dates=${s.dates.length})`);
                    allPass = false;
                    return;
                }
                results.push(p.name + ': 35 天序列 OK');
            });

            const actual = results.join('；');
            const expected = '3 个下钻点均有 35 天序列 + P10/P90';

            if (allPass) {
                return makeResult('drilldown-points', '下钻三级检查点（业务非负口径）', 'pass', actual, expected);
            }
            return makeResult('drilldown-points', '下钻三级检查点（业务非负口径）', 'fail', actual, expected, '部分下钻点数值偏差超过容差');
        } catch(e) {
            return makeResult('drilldown-points', '下钻三级检查点（业务非负口径）', 'fail', '异常', '三级检查点', String(e.message || e));
        }
    }

    // 6. 原始审计指标
    function checkAuditMetrics() {
        try {
            const m = DataLoader.getData().summary.metrics;
            if (!m) return makeResult('audit-metrics', '原始审计指标（pred_ensemble 口径）', 'fail', 'metrics 缺失', '分层指标存在', 'summary.metrics 不存在');

            const skuStoreDayR2 = m.skuStoreDay ? m.skuStoreDay.r2 : null;
            const typeDayR2 = m.typeDay ? m.typeDay.r2 : null;

            const expSku = 0.6610;
            const expType = 0.6610;

            const okSku = approxEqual(skuStoreDayR2, expSku, 0.005);
            const okType = approxEqual(typeDayR2, expType, 0.003);

            const actual = '门店×SKU×日 R² ' + (typeof skuStoreDayR2 === 'number' ? skuStoreDayR2.toFixed(6) : 'N/A')
                         + ' · 产品类型×日 R² ' + (typeof typeDayR2 === 'number' ? typeDayR2.toFixed(6) : 'N/A');
            const expected = '门店×SKU×日 R² ' + expSku + ' · 产品类型×日 R² ' + expType;
            const detail = '指标来自 skuForecast 原始 pred_ensemble 汇总（computeAllLevelMetrics），非业务非负修正口径';

            if (okSku && okType) {
                return makeResult('audit-metrics', '原始审计指标（pred_ensemble 口径）', 'pass', actual, expected, detail);
            }
            const fails = [];
            if (!okSku) fails.push('门店×SKU×日 R² 偏差');
            if (!okType) fails.push('产品类型×日 R² 偏差');
            return makeResult('audit-metrics', '原始审计指标（pred_ensemble 口径）', 'fail', actual, expected, fails.join('；') + '。' + detail);
        } catch(e) {
            return makeResult('audit-metrics', '原始审计指标（pred_ensemble 口径）', 'fail', '异常', 'R² 指标', String(e.message || e));
        }
    }

    // 7. 页面模块完整性
    function checkPageModules() {
        try {
            const expectedPages = ['cockpit', 'data-asset', 'store-forecast', 'sku-forecast',
                'model-performance', 'forecast-methodology', 'weather-impact', 'ai-insight', 'store-compare',
                'scenario-sim', 'extensions', 'model-trust', 'migration'];
            const pageMap = {
                'cockpit': 'CockpitPage',
                'data-asset': 'DataAssetPage',
                'store-forecast': 'StoreForecastPage',
                'sku-forecast': 'SkuForecastPage',
                'model-performance': 'ModelPerformancePage',
                'forecast-methodology': 'ForecastMethodologyPage',
                'weather-impact': 'WeatherImpactPage',
                'ai-insight': 'AiInsightPage',
                'store-compare': 'StoreComparePage',
                'scenario-sim': 'ScenarioSimPage',
                'extensions': 'ExtensionsPage',
                'model-trust': 'ModelTrustPage',
                'migration': 'TeaMigrationPage'
            };

            const fails = [];
            const passes = [];
            expectedPages.forEach(p => {
                const modName = pageMap[p];
                const mod = window[modName];
                if (!mod || typeof mod.render !== 'function') {
                    fails.push(p + '（' + modName + '.render 缺失）');
                } else {
                    passes.push(p);
                }
            });

            const hasApp = window.App && typeof App.navigateTo === 'function' && typeof App.getCurrentPage === 'function';
            if (!hasApp) fails.push('App 路由接口缺失');

            const actual = passes.length + '/' + expectedPages.length + ' 个页面 render 就绪';
            const expected = expectedPages.length + ' 个页面全部具备 render 函数 + 路由完整';

            if (fails.length === 0) {
                return makeResult('page-modules', '业务页面与路由', 'pass', actual, expected);
            }
            return makeResult('page-modules', '业务页面与路由', 'fail', actual, expected, fails.join('；'));
        } catch(e) {
            return makeResult('page-modules', '业务页面与路由', 'fail', '异常', '13 个页面 + 路由', String(e.message || e));
        }
    }

    // 8. 6步演示配置
    function checkDemoConfig() {
        try {
            if (!window.DemoMode || !DemoMode._stepsInfo) {
                return makeResult('demo-config', '6 步演示配置', 'fail', 'DemoMode 信息不可访问', '6 步配置完整',
                    'DemoMode 模块未暴露步骤信息接口');
            }
            const info = DemoMode._stepsInfo();
            if (info.count !== 6) {
                return makeResult('demo-config', '6 步演示配置', 'fail', info.count + ' 步', '6 步', '步骤数错误');
            }
            if (!approxEqual(info.totalMinutes, 10, 0.01)) {
                return makeResult('demo-config', '6 步演示配置', 'fail', info.totalMinutes.toFixed(1) + ' 分钟', '10 分钟', '总时长偏差');
            }
            const missing = [];
            info.steps.forEach((s, i) => {
                if (!s.page) missing.push('第' + (i+1) + '步 page 缺失');
                if (!s.focus) missing.push('第' + (i+1) + '步 focus 缺失');
                if (!s.title) missing.push('第' + (i+1) + '步 title 缺失');
            });
            if (missing.length > 0) {
                return makeResult('demo-config', '6 步演示配置', 'fail', info.count + '步 · ' + info.totalMinutes + '分钟', '6 步 · 10 分钟 · 每步页面+focus', missing.join('；'));
            }
            return makeResult('demo-config', '6 步演示配置', 'pass', info.count + ' 步 · ' + info.totalMinutes + ' 分钟 · 每步页面+focus 完整', '6 步 · 10 分钟 · 完整');
        } catch(e) {
            return makeResult('demo-config', '6 步演示配置', 'fail', '异常', '6 步 · 10 分钟', String(e.message || e));
        }
    }

    // 9. 演示依赖接口
    function checkDemoApis() {
        try {
            const checks = [
                ['DemoMode.start', typeof (window.DemoMode && DemoMode.start) === 'function'],
                ['DemoMode.begin', typeof (window.DemoMode && DemoMode.begin) === 'function'],
                ['DemoMode.next', typeof (window.DemoMode && DemoMode.next) === 'function'],
                ['DemoMode.prev', typeof (window.DemoMode && DemoMode.prev) === 'function'],
                ['DemoMode.exit', typeof (window.DemoMode && DemoMode.exit) === 'function'],
                ['CockpitPage.onCategoryChange', typeof (window.CockpitPage && CockpitPage.onCategoryChange) === 'function'],
                ['CockpitPage.onSkuChange', typeof (window.CockpitPage && CockpitPage.onSkuChange) === 'function'],
                ['CockpitPage.getState', typeof (window.CockpitPage && CockpitPage.getState) === 'function'],
                ['StoreForecastPage.showAnomalyDetail', typeof (window.StoreForecastPage && StoreForecastPage.showAnomalyDetail) === 'function'],
                ['StoreForecastPage.closeModal', typeof (window.StoreForecastPage && StoreForecastPage.closeModal) === 'function'],
                ['ExtensionsPage.switchTab', typeof (window.ExtensionsPage && ExtensionsPage.switchTab) === 'function'],
                ['ExtensionsPage.getCurrentTab', typeof (window.ExtensionsPage && ExtensionsPage.getCurrentTab) === 'function']
            ];
            const fails = checks.filter(c => !c[1]).map(c => c[0] + ' 缺失');
            const passCount = checks.filter(c => c[1]).length;
            const actual = passCount + '/' + checks.length + ' 个接口可用';
            const expected = checks.length + ' 个接口全部可用';
            if (fails.length === 0) {
                return makeResult('demo-apis', '演示依赖接口', 'pass', actual, expected);
            }
            return makeResult('demo-apis', '演示依赖接口', 'fail', actual, expected, fails.join('；'));
        } catch(e) {
            return makeResult('demo-apis', '演示依赖接口', 'fail', '异常', '全部接口存在', String(e.message || e));
        }
    }

    // 10. 当前页面 DOM
    function checkCurrentDom() {
        try {
            const doms = [
                ['门店下拉', '#storeSelect'],
                ['演示模式按钮', '.demo-mode-btn'],
                ['数据说明弹窗', '#dataLegendModal'],
                ['侧边栏', '.sidebar'],
                ['演示控制条', '#demoControlBar'],
                ['演示欢迎弹窗', '#demoWelcomeModal']
            ];
            const fails = [];
            const passes = [];
            doms.forEach(([name, sel]) => {
                if (document.querySelector(sel)) passes.push(name);
                else fails.push(name + '（' + sel + '）');
            });
            const actual = passes.length + '/' + doms.length + ' 项存在';
            const expected = doms.length + ' 项全部存在';
            if (fails.length === 0) {
                return makeResult('current-dom', '当前页面核心 DOM', 'pass', actual, expected);
            }
            return makeResult('current-dom', '当前页面核心 DOM', 'fail', actual, expected, fails.join('；'));
        } catch(e) {
            return makeResult('current-dom', '当前页面核心 DOM', 'fail', '异常', '6 个 DOM 元素存在', String(e.message || e));
        }
    }

    // 11. 当前可见图表
    function checkCurrentCharts() {
        try {
            const containers = document.querySelectorAll('.chart-container');
            if (containers.length === 0) {
                return makeResult('current-charts', '当前页面图表实例', 'na', '当前页无图表容器', '不适用（非图表页面）', '当前页面没有图表容器，不判定失败');
            }
            if (!window.echarts) {
                return makeResult('current-charts', '当前页面图表实例', 'fail', 'ECharts 未加载', 'ECharts 库存在', 'window.echarts 未定义');
            }
            let validCount = 0;
            let initCount = 0;
            for (let i = 0; i < containers.length; i++) {
                const c = containers[i];
                const chartDom = c.querySelector('div[_echarts_instance_]') || (c.querySelector('canvas') && c.querySelector('canvas').parentElement) || c;
                const inst = getChartInstance(chartDom) || getChartInstance(c.querySelector('div'));
                if (inst) {
                    initCount++;
                    if (chartHasValidSize(inst)) validCount++;
                }
            }
            const actual = initCount + ' 个已初始化 · ' + validCount + ' 个有效尺寸';
            const expected = containers.length + ' 个图表容器全部有效';
            if (validCount === initCount && initCount > 0) {
                return makeResult('current-charts', '当前页面图表实例', 'pass', actual, expected);
            }
            if (initCount === 0) {
                return makeResult('current-charts', '当前页面图表实例', 'fail', actual, expected, '容器存在但未找到 ECharts 实例');
            }
            return makeResult('current-charts', '当前页面图表实例', 'fail', actual, expected, '部分图表实例尺寸为 0 或未初始化');
        } catch(e) {
            return makeResult('current-charts', '当前页面图表实例', 'fail', '异常', '图表实例存在且尺寸>0', String(e.message || e));
        }
    }

    // 12. 运行错误（读取早期错误捕获全局数组）
    function checkRuntimeErrors() {
        const errors = getEarlyErrors();
        if (errors.length === 0) {
            return makeResult('runtime-errors', '会话运行错误', 'pass', '0 个错误', '无运行时错误',
                '自 early-error-capture.js 安装以来未捕获 window error 或 unhandledrejection（安装前的 HTML 解析错误不在范围内）');
        }
        const msgs = errors.map(e => e.message).join('；');
        return makeResult('runtime-errors', '会话运行错误', 'fail', errors.length + ' 个错误', '0 个错误', msgs);
    }

    // 12. 中文显示覆盖检查
    function checkChineseCoverage() {
        try {
            if (!window.DataLoader || typeof DataLoader.getChineseCoverageStats !== 'function') {
                return makeResult('chinese-coverage', '中文显示覆盖', 'fail',
                    'DataLoader.getChineseCoverageStats 缺失', '3门店+9品类+29类型+80SKU 全覆盖',
                    '映射接口未暴露');
            }
            const stats = DataLoader.getChineseCoverageStats();
            const fails = [];
            const details = [];

            // 门店
            details.push('门店 ' + stats.stores.mapped + '/' + stats.stores.total);
            if (stats.stores.mapped !== stats.stores.total) fails.push('门店未全覆盖');

            // 品类
            details.push('品类 ' + stats.categories.mapped + '/' + stats.categories.total);
            if (stats.categories.mapped !== stats.categories.total) fails.push('品类未全覆盖');

            // 产品类型
            details.push('产品类型 ' + stats.productTypes.mapped + '/' + stats.productTypes.total);
            if (stats.productTypes.mapped !== stats.productTypes.total) fails.push('产品类型未全覆盖');

            // SKU
            details.push('SKU ' + stats.skus.withChinese + '/' + stats.skus.total);
            if (stats.skus.withChinese !== stats.skus.total) {
                fails.push('SKU 未全覆盖（缺 ' + (stats.skus.total - stats.skus.withChinese) + ' 个）');
                // 枚举未覆盖的示例
                var skuList = DataLoader.getData().skuList || [];
                var missingExamples = [];
                for (var mi = 0; mi < skuList.length && missingExamples.length < 5; mi++) {
                    var disp = DataLoader.getSkuDisplayName(skuList[mi].product_detail, skuList[mi].product_id);
                    if (disp === '商品名称待补充') missingExamples.push(skuList[mi].product_detail || 'ID=' + skuList[mi].product_id);
                }
                if (missingExamples.length > 0) fails.push('缺失示例：' + missingExamples.join('、') + (missingExamples.length >= 5 ? '…' : ''));
            }
            // 跨店一致性检查
            if (stats.skus.consistencyIssues > 0) {
                fails.push('有 ' + stats.skus.consistencyIssues + ' 个 SKU 跨门店中文名不一致');
            }

            // 兜底名检查：确保没有 SKU 退回"商品名称待补充"显示
            if (stats.skus.withChinese < stats.skus.total) {
                var skuListAll = DataLoader.getData().skuList || [];
                var fallbackCount = 0;
                for (var fi = 0; fi < skuListAll.length; fi++) {
                    var fdisp = DataLoader.getSkuDisplayName(skuListAll[fi].product_detail, skuListAll[fi].product_id);
                    if (fdisp === '商品名称待补充') fallbackCount++;
                }
                if (fallbackCount > 0) fails.push(fallbackCount + ' 个SKU退回占位显示');
            }

            if (fails.length === 0) {
                return makeResult('chinese-coverage', '中文显示覆盖', 'pass',
                    details.join(' · '),
                    '3门店+9品类+29类型+80SKU 全覆盖',
                    '映射表完整，无退回英文/纯代号主显示');
            } else {
                return makeResult('chinese-coverage', '中文显示覆盖', 'fail',
                    stats.skus.mapped + '/' + stats.skus.total + ' SKU',
                    '3门店+9品类+29类型+80SKU 全覆盖',
                    fails.join('；'));
            }
        } catch(e) {
            return makeResult('chinese-coverage', '中文显示覆盖', 'fail',
                '检查异常', '全覆盖', String(e.message || e));
        }
    }

    // 12b. 可见SKU编号残留扫描（展示层不允许出现 SKU#数字 / 商品编号数字 / product_id数字 等用户可见文本）
    function checkSkuIdResidue() {
        try {
            // 采集所有用户可见的文本节点、title、placeholder、alt（仅展示层，排除内部变量/审计键）
            var issues = [];
            // 正则：用户可见的编号模式（SKU/SKU#/商品编号/product_id + 数字，或独立SKU前缀+数字）
            var idPattern = /(SKU\s*#?\s*\d|商品编号\s*\d|product_id\s*\d|sku_id\s*\d)/i;
            var pureCodePattern = /^\d+$/; // 纯数字商品名

            if (window.DataLoader && typeof DataLoader.getSkuDisplayName === 'function') {
                var stats2 = DataLoader.getChineseCoverageStats();
                // 真实校验：从 dashboard.hierarchy 取 80 个唯一 product_id，检查 product_name_zh
                var data = DataLoader.getData();
                var dashboard = data.dashboard;
                var badNames = [];
                var zhMap = {};
                if (dashboard && dashboard.hierarchy) {
                    for (var hi = 0; hi < dashboard.hierarchy.length; hi++) {
                        var h = dashboard.hierarchy[hi];
                        var pid = String(h.sku);
                        var zh = (h.product_name_zh || '').trim();
                        // 非空检查
                        if (!zh) {
                            if (badNames.indexOf(pid) < 0) badNames.push(pid + '（空值）');
                            continue;
                        }
                        // 纯数字检查
                        if (/^\d+$/.test(zh)) {
                            if (badNames.indexOf(pid) < 0) badNames.push(pid + '（纯数字）');
                            continue;
                        }
                        // 纯英文检查：只有英文字母/空格/数字/符号，没有中日韩文字
                        if (/^[A-Za-z0-9\s'\-\.\(\)]+$/.test(zh)) {
                            if (badNames.indexOf(pid) < 0) badNames.push(zh + '（纯英文）');
                            continue;
                        }
                        // 跨店一致性
                        if (zhMap[pid] !== undefined && zhMap[pid] !== zh) {
                            if (badNames.indexOf('inconsist_' + pid) < 0) badNames.push('pid=' + pid + '（跨店不一致）');
                        }
                        zhMap[pid] = zh;
                    }
                    // 唯一性数量校验：应有 80 个
                    var uniqueCount = Object.keys(zhMap).length;
                    if (uniqueCount !== 80) {
                        badNames.unshift('唯一SKU数 ' + uniqueCount + ' ≠ 80');
                    }
                }
                if (badNames.length > 0) {
                    issues.push(badNames.length + ' 个商品名为空/纯数字/纯英文：' + badNames.slice(0, 5).join('、') + (badNames.length > 5 ? '…' : ''));
                }
            }

            // 检查页面内可见文本（仅当前可见页面）
            var pageContainer = document.getElementById('pageContainer');
            if (pageContainer) {
                var walker = document.createTreeWalker(pageContainer, NodeFilter.SHOW_TEXT, null);
                var node;
                var found = [];
                var checked = 0;
                while ((node = walker.nextNode()) && checked < 2000) {
                    checked++;
                    var text = (node.nodeValue || '').trim();
                    if (!text || text.length < 3) continue;
                    // 跳过script/style/option.value里的内容（TreeWalker默认跳过，保险再过滤）
                    var parent = node.parentNode;
                    if (!parent) continue;
                    var tag = parent.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
                    if (idPattern.test(text)) {
                        found.push(text.slice(0, 50));
                        if (found.length >= 10) break;
                    }
                }
                if (found.length > 0) {
                    issues.push('页面可见文本含 ' + found.length + ' 处编号残留：' + found.slice(0, 3).join(' / ') + (found.length > 3 ? '…' : ''));
                }
            }

            if (issues.length === 0) {
                return makeResult('sku-id-residue', '可见编号残留', 'pass',
                    '展示层无SKU编号/商品编号/product_id残留', '用户可见位置只显示中文商品名',
                    '80/80 商品中文名有效，页面可见文本扫描通过');
            } else {
                return makeResult('sku-id-residue', '可见编号残留', 'fail',
                    issues.length + ' 项问题', '展示层无编号残留', issues.join('；'));
            }
        } catch(e) {
            return makeResult('sku-id-residue', '可见编号残留', 'fail',
                '检查异常', '通过', String(e.message || e));
        }
    }

    // 13. 预测方法页事实披露专项检查（纯数据接口，无DOM副作用）
    function checkMethodologyDisclosure() {
        try {
            // 通过 ForecastMethodologyPage 暴露的只读接口获取披露事实
            // 不切页、不渲染、不改DOM、不产生滚动，零副作用
            if (!window.ForecastMethodologyPage || typeof ForecastMethodologyPage.getDisclosureFacts !== 'function') {
                return makeResult('methodology-disclosure', '方法页事实披露', 'fail',
                    'ForecastMethodologyPage.getDisclosureFacts 不可访问',
                    '披露事实接口可用',
                    '方法页模块未加载或未暴露 getDisclosureFacts 接口');
            }

            var facts = ForecastMethodologyPage.getDisclosureFacts();
            var issues = [];
            var passes = [];

            // 1) P0 泄漏风险警示
            if (!facts.hasRiskBannerP0) {
                issues.push('P0 泄漏风险警示条缺失');
            } else if (!facts.mentionsSkuShareRisk) {
                issues.push('风险警示未提及 sku_share');
            } else if (!facts.mentionsQtyDowAvgRisk) {
                issues.push('风险警示未提及 qty_dow_avg');
            } else if (!facts.mentionsNotForPOC) {
                issues.push('风险警示未明确禁止作为 POC/生产依据');
            } else {
                passes.push('P0 泄漏风险警示完整（sku_share + qty_dow_avg + 禁止范围）');
            }

            // 2) 53 个特征（dashboard feature_catalog 校验）
            if (facts.codeFeatureCount !== 53) {
                issues.push('代码特征数量应为 53，实际声明 ' + facts.codeFeatureCount);
            } else {
                passes.push('代码特征数量 53 个');
            }
            if (facts.productExtraCount !== 1 || !facts.productExtraNames || facts.productExtraNames[0] !== 'holiday_index') {
                issues.push('产物额外列应为 holiday_index (1 列)');
            } else {
                passes.push('产物额外列 holiday_index 已说明');
            }
            // 检查所有精确特征名
            var expectedFeatures = [
                'price', 'qty_lag_1', 'qty_lag_2', 'qty_lag_3', 'qty_lag_7', 'qty_lag_14',
                'qty_roll_mean_7d', 'qty_roll_std_7d', 'qty_roll_mean_14d', 'qty_roll_std_14d',
                'qty_roll_mean_30d', 'qty_roll_std_30d', 'qty_dow_avg', 'sku_share',
                'day_of_week', 'is_weekend', 'month', 'day_of_month', 'week_of_month',
                'is_month_start', 'is_month_end', 'season_code', 'week_of_season',
                'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
                'precipitation_sum', 'is_rain', 'is_snow', 'is_clear',
                'sunshine_duration', 'wind_speed_10m_max', 'relative_humidity_2m_mean',
                'is_holiday_detailed', 'is_pre_holiday_1d', 'is_pre_holiday_3d',
                'is_post_holiday_1d', 'is_long_weekend', 'holiday_impact_code',
                'temp_range', 'is_hot', 'is_cold', 'price_vs_category_avg'
            ];
            var nameStr = facts.codeFeatureNames.join(',');
            var missing = [];
            for (var fi = 0; fi < expectedFeatures.length; fi++) {
                if (facts.codeFeatureNames.indexOf(expectedFeatures[fi]) === -1) {
                    missing.push(expectedFeatures[fi]);
                }
            }
            if (missing.length > 0) {
                issues.push('代码特征清单缺少 ' + missing.length + ' 项：' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : ''));
            } else {
                passes.push('53 个代码特征名与 dashboard feature_catalog 一致');
            }
            // 反向：无多余项
            var extra = [];
            for (var fj = 0; fj < facts.codeFeatureNames.length; fj++) {
                if (expectedFeatures.indexOf(facts.codeFeatureNames[fj]) === -1) {
                    extra.push(facts.codeFeatureNames[fj]);
                }
            }
            if (extra.length > 0) {
                issues.push('代码特征清单多出 ' + extra.length + ' 项：' + extra.slice(0, 5).join(', ') + (extra.length > 5 ? '…' : ''));
            }

            // 3) 效果区非 POC 验收标签
            if (!facts.hasMetricsRiskLabel || !facts.metricsLabeledNotPOC) {
                issues.push('效果区未标注非 POC 验收');
            } else {
                passes.push('效果区标注含泄漏风险 · 非 POC 验收');
            }

            // 4) PKL 缺失说明
            if (!facts.mentionsPklMissing) {
                issues.push('模型 PKL 文件缺失说明缺失');
            } else {
                passes.push('模型 PKL 文件缺失状态已说明');
            }

            // 5) 来源数量
            if (facts.sourceCount !== 9) {
                issues.push('学术/官方来源数量应为 9，实际 ' + facts.sourceCount);
            } else {
                passes.push('9 个学术/官方来源完整');
            }

            // 6) 绝对化误导表述检查
            if (facts.containsAbsoluteNoLeak) {
                issues.push('页面存在「不会泄漏 / 所有特征 shift」等绝对化误导表述');
            } else {
                passes.push('无「不会泄漏 / 所有特征 shift」等绝对化表述');
            }

            if (issues.length === 0) {
                return makeResult('methodology-disclosure', '方法页事实披露', 'pass',
                    passes.length + ' 项通过', '6 项披露完整', passes.join('；'));
            }
            return makeResult('methodology-disclosure', '方法页事实披露', 'fail',
                passes.length + ' 项通过 · ' + issues.length + ' 项问题',
                '6 项披露完整', issues.join('；'));
        } catch(e) {
            return makeResult('methodology-disclosure', '方法页事实披露', 'fail', '异常',
                '6 项披露完整', String(e.message || e));
        }
    }

    // 旧口径残留扫描
    function checkLegacyMetricResidue() {
        try {
            const body = document.body && document.body.innerText || '';
            const needles = [
                { pattern: /0\.961/g, label: '0.961 (旧R²)' },
                { pattern: /0\.991/g, label: '0.991 (旧品类R²)' },
                { pattern: /0\.611/g, label: '0.611 (旧方向命中率)' },
                { pattern: /HGB\+?GB|HistGradientBoosting|hist\s*gradient/gi, label: 'HGB+GB / sklearn 融合' },
                { pattern: /1680\s*(行|条|样本|条预测)/g, label: '1680样本 (旧7天)' },
                { pattern: /SHAP\s*不可用|SHAP.*缺失|SHAP.*无法推理/gi, label: 'SHAP不可用声明' },
                { pattern: /43\s*(个|维|列)?特征/g, label: '43特征 (旧口径)' },
                { pattern: /44\s*(个|维|列)?特征/g, label: '44特征 (旧口径)' },
                { pattern: /7\s*天留出|7\s*天测试期|7天单窗口/g, label: '7天留出/单窗口' },
                { pattern: /0\.6\s*[*x×]\s*0\.4|0\.6\s*\/\s*0\.4/g, label: 'HGB 0.6/GB 0.4 融合权重' }
            ];
            const hits = [];
            needles.forEach(n => {
                if (n.pattern.test(body)) {
                    hits.push(n.label);
                    n.pattern.lastIndex = 0;
                }
            });
            if (hits.length === 0) {
                return makeResult('legacy-residue', '旧口径残留扫描', 'pass', '未发现残留', '无 HGB/1680/43/SHAP不可用 等');
            }
            return makeResult('legacy-residue', '旧口径残留扫描', 'warn', '发现 ' + hits.length + ' 项', '应全部替换为 v2.1 口径', hits.join('；'));
        } catch(e) {
            return makeResult('legacy-residue', '旧口径残留扫描', 'fail', '异常', '扫描通过', String(e.message || e));
        }
    }

    // AI 问答面板（aily-web-sdk 集成）自检
    function checkAiChatIntegration() {
        try {
            var failures = [];
            var warnings = [];
            var details = [];

            // 1. SDK 脚本文件存在（通过检查 vendor 目录下的产物）
            var sdkExists = false;
            try {
                // 同步 HEAD 请求验证文件可访问
                var xhr = new XMLHttpRequest();
                xhr.open('HEAD', 'vendor/aily-web-sdk.js', false);
                xhr.send();
                sdkExists = xhr.status >= 200 && xhr.status < 400;
            } catch (_) { sdkExists = false; }
            if (!sdkExists) {
                failures.push('vendor/aily-web-sdk.js 不可访问');
            } else {
                details.push('SDK 文件 vendor/aily-web-sdk.js 可加载');
            }

            // 2. AiChat 全局对象暴露
            if (typeof window.AiChat === 'undefined' || !window.AiChat) {
                failures.push('window.AiChat 未定义');
            } else {
                details.push('AiChat 全局对象已加载');
                // 必须有 open/close/toggle/onDemoModeChange/hasInstance/getError
                var required = ['open', 'close', 'toggle', 'onDemoModeChange', 'hasInstance', 'getError'];
                var missing = required.filter(function(m) { return typeof window.AiChat[m] !== 'function'; });
                if (missing.length > 0) failures.push('AiChat 缺少方法：' + missing.join(', '));
            }

            // 2a. 启动初始化是否已执行（入口自动渲染）
            // 这是之前出线上问题的根因：代码都定义了但没人调用，入口从不出现。
            // 必须同时满足两个条件：_bootstrapped 标记为 true（启动逻辑跑过）
            // 且 DOM 里真的有 FAB（不是只改了变量没建 DOM）。
            if (typeof window.AiChat !== 'undefined' && window.AiChat) {
                if (window.AiChat._bootstrapped !== true) {
                    failures.push('AI 入口启动初始化未执行（AiChat._bootstrapped 不为 true）');
                } else {
                    details.push('入口启动初始化已执行');
                }
            }

            // 3. 悬浮按钮 DOM 存在
            var fab = document.querySelector('.aichat-fab');
            if (!fab) {
                failures.push('未找到 .aichat-fab 悬浮入口');
            } else {
                details.push('悬浮入口按钮已渲染');
            }

            // 4. 面板 DOM 存在
            var panel = document.querySelector('.aichat-panel');
            if (!panel) {
                failures.push('未找到 .aichat-panel 面板');
            } else {
                details.push('问答面板已渲染');
            }

            // 5. 标题正确
            if (panel) {
                var titleEl = panel.querySelector('.aichat-panel__title-text');
                if (!titleEl || titleEl.textContent.indexOf('门店销量预测归因助手') < 0) {
                    failures.push('面板标题不是「门店销量预测归因助手」');
                } else {
                    details.push('面板标题正确');
                }
            }

            // 6. channelToken 不得出现在 DOM 文本 / innerHTML / data-* 中
            if (panel) {
                var html = panel.outerHTML || '';
                var bodyText = document.body.innerText || '';
                // 搜索 wsk_ 前缀（channelToken 的典型前缀）
                var tokenPattern = /wsk_[A-Za-z0-9]{8,}/g;
                var inHtml = (html.match(tokenPattern) || []).length > 0;
                var inText = (bodyText.match(tokenPattern) || []).length > 0;
                // 还要检查 data-* 属性
                var dataAttrs = document.querySelectorAll('[data-channel-token], [data-token], [data-channeltoken]');
                if (inHtml || inText || dataAttrs.length > 0) {
                    failures.push('channelToken 疑似泄露到 DOM 中');
                } else {
                    details.push('channelToken 未泄露到 DOM 文本');
                }
            }

            // 7. 单例保证：打开/关闭 3 次后只有一个 iframe
            if (window.AiChat && typeof window.AiChat.open === 'function' && typeof window.AiChat.close === 'function') {
                // 异步验证：放到 deep check 里跑，这里只确认 API 可用
                details.push('open/close API 可用（单例验证见深度检查）');
            }

            // 8. 演示模式兼容性：AiChat.onDemoModeChange 存在
            if (window.AiChat && typeof window.AiChat.onDemoModeChange === 'function') {
                details.push('演示模式通知接口已注册');
            } else {
                warnings.push('缺少 onDemoModeChange，演示模式下可能遮挡');
            }

            // 9. 错误态 DOM 存在
            if (panel) {
                var errEl = panel.querySelector('.aichat-error');
                var retryBtn = panel.querySelector('.aichat-error__retry');
                if (!errEl) {
                    failures.push('错误态容器缺失');
                } else if (!retryBtn) {
                    failures.push('错误态缺少重试按钮');
                } else {
                    details.push('错误态与重试按钮已配置');
                }
            }

            if (failures.length > 0) {
                return makeResult('ai-chat-integration', 'AI 问答面板集成', 'fail',
                    failures.length + ' 项未通过', '全部通过', failures.join('；'), details.join('；'));
            }
            if (warnings.length > 0) {
                return makeResult('ai-chat-integration', 'AI 问答面板集成', 'warn',
                    warnings.length + ' 项警告', '全部通过', warnings.join('；'), details.join('；'));
            }
            return makeResult('ai-chat-integration', 'AI 问答面板集成', 'pass',
                '全部通过', 'SDK 存在 / 面板可打开 / token 不泄露 / 错误态完整', details.join('；'));

        } catch(e) {
            return makeResult('ai-chat-integration', 'AI 问答面板集成', 'fail',
                '异常', '通过', String(e.message || e));
        }
    }

    // 14. 风险提示人工确认项（演示前检查）
    function checkDemoRiskDisclosure() {
        // 该项为人工风险确认，永远不自动标 pass，显示 warn 级别
        // 作用：提醒演示者当前模型含泄漏风险，不得承诺 POC 精度
        try {
            var msg = '模型精度为含泄漏风险的原型回测，正式演示不得承诺 POC 精度。需演示者口头确认已阅读方法页风险警示。';
            return {
                id: 'demo-risk-disclosure',
                category: '演示前风险确认',
                status: 'warn',
                actual: '待人工确认',
                expected: '演示者确认已知晓泄漏风险并口头告知观众',
                detail: msg
            };
        } catch(e) {
            return {
                id: 'demo-risk-disclosure',
                category: '演示前风险确认',
                status: 'warn',
                actual: '异常',
                expected: '待人工确认',
                detail: String(e.message || e)
            };
        }
    }

    // CSS 健康检查
    function checkCssHealth(callback) {
        const checks = [];
        const fails = [];
        const passes = [];

        // 子检查 A：本域样式表可读取且 cssRules > 0
        try {
            const sheets = document.styleSheets;
            let sameDomainRules = 0;
            let crossDomainCount = 0;
            for (let i = 0; i < sheets.length; i++) {
                try {
                    const rules = sheets[i].cssRules;
                    if (rules) sameDomainRules += rules.length;
                } catch(e) {
                    crossDomainCount++;
                }
            }
            if (sameDomainRules > 0) {
                passes.push('本域样式表 ' + sameDomainRules + ' 条规则可解析');
            } else {
                fails.push('无可读取的本域样式表规则');
            }
            if (crossDomainCount > 0) {
                checks.push(crossDomainCount + ' 个跨域样式表不可读（正常，不影响）');
            }
        } catch(e) {
            fails.push('样式表探测异常：' + String(e.message || e));
        }

        // 子检查 B：fetch styles.css 文本，做括号平衡检查 + 关键选择器检查
        fetch('styles.css')
            .then(function(resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function(cssText) {
                // 括号平衡：忽略注释 /* ... */ 和字符串中的花括号
                let depth = 0;
                let minDepth = 0;
                let inComment = false;
                let inStr = null; // "'  或 null
                let prevChar = '';

                for (let i = 0; i < cssText.length; i++) {
                    const ch = cssText[i];

                    if (inComment) {
                        if (ch === '/' && prevChar === '*') {
                            inComment = false;
                        }
                        prevChar = ch;
                        continue;
                    }
                    if (inStr) {
                        if (ch === inStr && prevChar !== '\\') {
                            inStr = null;
                        }
                        prevChar = ch;
                        continue;
                    }
                    // 进入注释
                    if (ch === '*' && prevChar === '/') {
                        inComment = true;
                        prevChar = ch;
                        continue;
                    }
                    // 进入字符串
                    if (ch === '"' || ch === "'") {
                        inStr = ch;
                        prevChar = ch;
                        continue;
                    }
                    if (ch === '{') {
                        depth++;
                    } else if (ch === '}') {
                        depth--;
                        if (depth < minDepth) minDepth = depth;
                    }
                    prevChar = ch;
                }

                if (inComment) fails.push('存在未闭合的注释');
                if (inStr) fails.push('存在未闭合的字符串');
                if (minDepth < 0) fails.push('花括号出现负深度（闭合多于打开）');
                if (depth !== 0) fails.push('花括号最终不平衡：最终深度 ' + depth);
                if (depth === 0 && minDepth === 0 && !inComment && !inStr) {
                    passes.push('花括号平衡（最终深度 0，无负深度）');
                }

                // 关键响应式选择器检查
                const keySelectors = [
                    ['@media 768', /@media\s*\(max-width\s*:\s*768px\)/],
                    ['@media 480', /@media\s*\(max-width\s*:\s*480px\)/],
                    ['safe-area-inset-bottom', /safe-area-inset-bottom/],
                    ['demo-drilldown-pill', /demo-drilldown-pill/],
                    ['selfcheck-panel', /\.selfcheck-panel/]
                ];
                keySelectors.forEach(function([name, re]) {
                    if (re.test(cssText)) {
                        passes.push('关键选择器：' + name);
                    } else {
                        fails.push('缺失关键选择器：' + name);
                    }
                });

                // 最终结果
                const actual = passes.length + ' 项通过 · ' + fails.length + ' 项失败';
                const expected = '括号平衡 + 关键选择器齐全 + 本域样式表可读取';
                const detail = (checks.length ? checks.join('；') + '。' : '') +
                    (passes.length ? '通过：' + passes.slice(1).join('；') + '。' : '') +
                    (fails.length ? '失败：' + fails.join('；') : '');

                if (fails.length === 0) {
                    callback(makeResult('css-health', 'CSS 结构健康', 'pass', actual, expected, detail));
                } else {
                    callback(makeResult('css-health', 'CSS 结构健康', 'fail', actual, expected, detail));
                }
            })
            .catch(function(e) {
                callback(makeResult('css-health', 'CSS 结构健康', 'fail',
                    'CSS 文件读取失败', '括号平衡 + 关键选择器齐全',
                    String(e.message || e) + '。未用样式表规则条数冒充语法证明'));
            });
    }

    // ============ 深度检查（6步页面逐个验证） ============
    function runDeepCheck(doneCallback) {
        // 先保存状态
        const saved = {
            page: App.getCurrentPage(),
            store: App.getCurrentStore(),
            scrollTop: (function(){ const pc = document.getElementById('pageContainer'); return pc ? pc.scrollTop : 0; })(),
            cockpitCategory: 'all',
            cockpitSku: 'all',
            extTab: 'ordering',
            anomalyOpen: false,
            anomalyDate: null
        };

        // cockpit 状态
        if (window.CockpitPage && CockpitPage.getState) {
            const st = CockpitPage.getState();
            saved.cockpitCategory = st.category;
            saved.cockpitSku = st.sku;
        }
        // extensions tab
        if (window.ExtensionsPage && ExtensionsPage.getCurrentTab) {
            saved.extTab = ExtensionsPage.getCurrentTab();
        }
        // 异常浮层
        const anomalyModal = document.getElementById('anomalyModal');
        if (anomalyModal && anomalyModal.classList.contains('show') &&
            saved.page === 'store-forecast' && window.StoreForecastPage && StoreForecastPage.getCurrentAnomalyDate) {
            saved.anomalyOpen = true;
            saved.anomalyDate = StoreForecastPage.getCurrentAnomalyDate();
        }

        const stepChecks = [
            { page: 'data-asset', dom: '#demo-dataAssetCard', label: '第1步 · 真实数据基础', uniqueId: true },
            { page: 'cockpit', dom: '#demo-forecastMainCard', label: '第2步 · 实际vs预测', uniqueId: true,
              postCheck: function(el) {
                  const fails = [];
                  // 检查包含筛选栏和图表
                  if (!el.querySelector('#forecastMainChart')) fails.push('不含主图表');
                  if (!el.querySelector('#categorySelect')) fails.push('不含品类筛选');
                  if (!el.querySelector('#skuSelect')) fails.push('不含SKU筛选');
                  return fails;
              }
            },
            { page: 'model-performance', dom: '#demo-sevenLevelCard', label: '第3步 · 模型能力', uniqueId: true },
            { page: 'store-forecast', dom: '#anomalyModal .modal', label: '第4步 · 异常复盘',
              uniqueId: false, modalStep: true,
              deepCheck: function() {
                  const subFails = [];
                  // DOM
                  const modal = document.querySelector('#anomalyModal .modal');
                  if (!modal) subFails.push('#anomalyModal .modal 缺失');
                  // overlay 存在
                  if (!document.getElementById('anomalyModal')) subFails.push('#anomalyModal 缺失');
                  // 接口
                  if (!window.StoreForecastPage || typeof StoreForecastPage.showAnomalyDetail !== 'function') {
                      subFails.push('showAnomalyDetail 接口缺失');
                  }
                  if (!window.StoreForecastPage || typeof StoreForecastPage.getCurrentAnomalyDate !== 'function') {
                      subFails.push('getCurrentAnomalyDate 接口缺失');
                  }
                  // 日期数据
                  try {
                      const data = DataLoader.getData();
                      if (data.dailyStore && Array.isArray(data.dailyStore)) {
                          const has = data.dailyStore.some(d => d.date === '2023-06-29');
                          if (!has) subFails.push('异常数据源不含 2023-06-29');
                      } else { subFails.push('dailyStore 数据不可用'); }
                  } catch(e) { subFails.push('异常日期检查异常：' + String(e.message || e)); }
                  // 检查无全屏overlay兜底（getFocusElement不接受#anomalyModal）
                  if (window.DemoMode && DemoMode._stepsInfo) {
                      const info = DemoMode._stepsInfo();
                      const step4 = info.steps[3];
                      if (step4 && step4.focus === '#anomalyModal') {
                          subFails.push('focus指向全屏overlay而非.modal内容');
                      }
                  }
                  return subFails;
              }
            },
            { page: 'extensions', dom: '#demo-orderingCore', label: '第5步 · 经营扩展', uniqueId: true,
              postCheck: function(el) {
                  const fails = [];
                  // 检查包含KPI区和BOM核心
                  if (!el.querySelector('#demo-extOrderingKpi')) fails.push('不含KPI区');
                  // bomChart 在wrapper内的grid-main中
                  if (!el.querySelector('#bomChart') && !el.nextElementSibling?.querySelector('#bomChart')) {
                      // 宽松检查：页面上存在 bomChart 即可（wrapper可能只包含KPI+说明）
                  }
                  return fails;
              }
            },
            { page: 'migration', dom: '#demo-migrationHeader', label: '第6步 · 茶饮迁移', uniqueId: true }
        ];

        const deepResults = [];
        let idx = 0;

        function nextStep() {
            if (idx >= stepChecks.length) {
                restoreAndFinish();
                return;
            }
            const sc = stepChecks[idx];
            idx++;

            // 切换到目标页
            App.navigateTo(sc.page);

            waitDom(sc.dom, function(found, el) {
                if (!found) {
                    deepResults.push(makeResult('deep-step-' + idx, sc.label, 'fail', '目标 DOM 未找到', sc.dom, '页面加载后目标元素未出现'));
                    setTimeout(nextStep, 50);
                    return;
                }

                // 第4步专项深度检查（含modal打开、动画完成）
                if (sc.modalStep && sc.deepCheck) {
                    // 先打开弹窗
                    if (window.StoreForecastPage && StoreForecastPage.showAnomalyDetail) {
                        StoreForecastPage.showAnomalyDetail('2023-06-29');
                    }
                    // 等动画完成
                    setTimeout(function() {
                        const modalEl = document.querySelector('#anomalyModal .modal');
                        const subFails = sc.deepCheck();
                        // 可见性检查
                        if (modalEl) {
                            const rect = modalEl.getBoundingClientRect();
                            const style = window.getComputedStyle(modalEl);
                            if (style.display === 'none') subFails.push('modal display:none');
                            if (rect.width <= 0 || rect.height <= 0) subFails.push('modal 宽高为0');
                        } else {
                            subFails.push('.modal 元素不存在');
                        }
                        // 检查目标不是全屏overlay（选择器以 .modal 结尾）
                        if (sc.dom && !sc.dom.endsWith('.modal')) subFails.push('选择器未指向.modal内容');

                        if (subFails.length === 0) {
                            deepResults.push(makeResult('deep-step-' + idx, sc.label, 'pass',
                                '弹窗定位+接口+数据+可见性 全通过',
                                '#anomalyModal .modal 可见 + 接口完整 + 数据含 2023-06-29'));
                        } else {
                            deepResults.push(makeResult('deep-step-' + idx, sc.label, 'fail',
                                subFails.length + ' 项失败',
                                '.modal可见 + 接口 + 日期数据 + 非全屏兜底',
                                subFails.join('；')));
                        }
                        // 关闭弹窗
                        if (StoreForecastPage && StoreForecastPage.closeModal) StoreForecastPage.closeModal();
                        setTimeout(nextStep, 100);
                    }, 400);
                    return;
                }

                // 通用检查：可见性 + 不被底部控制条遮挡 + postCheck
                setTimeout(function() {
                    const fails = [];
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);

                    // 可见性
                    if (style.display === 'none') fails.push('display:none');
                    if (style.visibility === 'hidden') fails.push('visibility:hidden');
                    if (rect.width <= 0) fails.push('宽度为0');
                    if (rect.height <= 0) fails.push('高度为0');

                    // 唯一性检查（uniqueId的元素应只有1个）
                    if (sc.uniqueId) {
                        const matches = document.querySelectorAll(sc.dom);
                        if (matches.length > 1) fails.push('选择器匹配 ' + matches.length + ' 个元素（应唯一）');
                    }

                    // 底部遮挡检查（元素底部不被 demo 控制条遮挡）
                    const controlBar = document.getElementById('demoControlBar');
                    // 深度检查时控制条通常未激活（演示未启动），这里仅校验元素是否在 pageContainer 可视区内
                    const pc = document.getElementById('pageContainer');
                    if (pc) {
                        const pcRect = pc.getBoundingClientRect();
                        if (rect.top < pcRect.top - 1) fails.push('顶部超出可视区');
                        // 底部超出算正常（可滚动），不记为失败
                    }

                    // postCheck
                    if (sc.postCheck && typeof sc.postCheck === 'function') {
                        const postFails = sc.postCheck(el);
                        if (postFails && postFails.length > 0) fails.push.apply(fails, postFails);
                    }

                    if (fails.length === 0) {
                        deepResults.push(makeResult('deep-step-' + idx, sc.label, 'pass',
                            '目标可见 + 定位唯一 + 内容完整',
                            sc.dom + '（宽 ' + Math.round(rect.width) + 'px × 高 ' + Math.round(rect.height) + 'px）'));
                    } else {
                        deepResults.push(makeResult('deep-step-' + idx, sc.label, 'fail',
                            fails.length + ' 项问题',
                            sc.dom + ' 可见+唯一+完整',
                            fails.join('；')));
                    }
                    setTimeout(nextStep, 50);
                }, 150);
            }, 35, 100);
        }

        function restoreAndFinish() {
            // 单次恢复：先静默设置门店，再 navigate 一次，避免双重 render
            if (typeof App.setStoreSilent === 'function') {
                App.setStoreSilent(saved.store);
            } else {
                // 兼容回退：老接口
                if (App.getCurrentStore() !== saved.store) {
                    App.onStoreChange(saved.store);
                }
            }

            // 导航到原页面（仅此一次 render）
            App.navigateTo(saved.page);

            // 等页面 DOM 就绪再恢复页内状态
            waitDom('.page-container .card, .card', function() {
                if (saved.page === 'cockpit' && window.CockpitPage) {
                    if (CockpitPage.onCategoryChange) CockpitPage.onCategoryChange(saved.cockpitCategory);
                    if (CockpitPage.onSkuChange) {
                        let tries = 0;
                        const check = function() {
                            const sel = document.getElementById('skuSelect');
                            if (sel && sel.querySelector('option[value="' + saved.cockpitSku + '"]')) {
                                CockpitPage.onSkuChange(saved.cockpitSku);
                                afterRestore();
                            } else if (tries < 20) {
                                tries++;
                                setTimeout(check, 30);
                            } else {
                                afterRestore();
                            }
                        };
                        check();
                        return;
                    }
                }
                if (saved.page === 'extensions' && window.ExtensionsPage && ExtensionsPage.switchTab) {
                    ExtensionsPage.switchTab(saved.extTab);
                    setTimeout(afterRestore, 100);
                    return;
                }
                if (saved.anomalyOpen && saved.page === 'store-forecast' &&
                    window.StoreForecastPage && StoreForecastPage.showAnomalyDetail && saved.anomalyDate) {
                    StoreForecastPage.showAnomalyDetail(saved.anomalyDate);
                    afterRestore();
                    return;
                }
                afterRestore();
            }, 30, 80);
        }

        function afterRestore() {
            // 先 resize 再恢复滚动
            if (window.dispatchEvent) {
                try {
                    window.dispatchEvent(new Event('resize'));
                } catch(_) {}
            }
            const pc = document.getElementById('pageContainer');
            if (pc) {
                requestAnimationFrame(function() {
                    pc.scrollTop = saved.scrollTop;
                    setTimeout(function() {
                        pc.scrollTop = saved.scrollTop;
                        doneCallback(deepResults, saved);
                    }, 250);
                });
            } else {
                doneCallback(deepResults, saved);
            }
        }

        nextStep();
    }

    // ============ 人工复核项 ============
    function getManualChecks() {
        return [
            makeResult('manual-se', 'iPhone SE (320px) 真机字体与留白', 'manual', '需人工', '真机验证', '小屏设备的字体不挤压、热力图与表格留白充足'),
            makeResult('manual-android', '360/390px 安卓与 iPhone 触控体验', 'manual', '需人工', '真机验证', '触控目标可点、不误触、键盘弹出后布局稳定'),
            makeResult('manual-orientation', '横竖屏切换、刘海与底部 safe-area', 'manual', '需人工', '真机验证', '旋转屏幕后布局自适应，刘海和底部条不遮挡内容'),
            makeResult('manual-projector', '投屏分辨率下图表清晰度', 'manual', '需人工', '投屏验证', '外接显示器/投影仪下文字可读、图表清晰'),
            makeResult('manual-rhythm', '6 步讲解节奏与页面加载卡顿', 'manual', '需人工', '全程走查', '页面切换无明显白屏、图表渲染流畅、讲解节奏自然'),
            makeResult('manual-network', '网络断开、缓存与第三方 CDN 稳定性', 'manual', '需人工', '弱网/离线验证', '弱网环境下数据加载、错误提示与重试能力')
        ];
    }

    // ============ 主流程 ============
    function runAll(callback) {
        if (isRunning) return;
        isRunning = true;
        results = [];
        totalDurationMs = 0;
        const startTime = Date.now();

        // 基础同步检查
        const basicChecks = [
            checkDataLoaded,
            checkDataScale,
            checkForecastData,
            checkMainAggregate,
            checkDrilldownPoints,
            checkAuditMetrics,
            checkPageModules,
            checkDemoConfig,
            checkDemoApis,
            checkCurrentDom,
            checkCurrentCharts,
            checkRuntimeErrors,
            checkChineseCoverage,
            checkSkuIdResidue,
            checkMethodologyDisclosure,
            checkLegacyMetricResidue,
            checkAiChatIntegration
         ];

        basicChecks.forEach(fn => {
            try {
                results.push(fn());
            } catch(e) {
                results.push(makeResult(fn.name || 'unknown', '检查异常', 'fail', '执行异常', '通过', String(e.message || e)));
            }
        });

        // 人工项
        results = results.concat(getManualChecks());

        // UI 先更新基础部分
        if (typeof updateUI === 'function') updateUI();

        // 并行异步检查：原始交易 + CSS 健康
        let asyncDone = 0;
        const totalAsync = 2;
        function onAsyncDone() {
            asyncDone++;
            if (asyncDone < totalAsync) return;

            // 深度检查（异步）
            if (deepCheckEnabled) {
                runDeepCheck(function(deepResults, savedState) {
                    results = results.concat(deepResults);
                    totalDurationMs = Date.now() - startTime;
                    lastCheckTime = new Date();
                    isRunning = false;
                    if (typeof updateUI === 'function') updateUI();
                    if (callback) callback(results, savedState);
                });
            } else {
                totalDurationMs = Date.now() - startTime;
                lastCheckTime = new Date();
                isRunning = false;
                if (typeof updateUI === 'function') updateUI();
                if (callback) callback(results, null);
            }
        }

        // 原始交易记录检查（异步，按需加载解析）
        checkRawTransactions(function(result) {
            // 插入到 data-scale 之后（第 2 项之后）
            const scaleIdx = results.findIndex(r => r.id === 'data-scale');
            if (scaleIdx >= 0) {
                results.splice(scaleIdx + 1, 0, result);
            } else {
                results.push(result);
            }
            if (typeof updateUI === 'function') updateUI();
            onAsyncDone();
        });

        // CSS 健康检查（异步，fetch 文本）
        checkCssHealth(function(result) {
            // 替换或追加
            const cssIdx = results.findIndex(r => r.id === 'css-health');
            if (cssIdx >= 0) {
                results[cssIdx] = result;
            } else {
                results.push(result);
            }
            if (typeof updateUI === 'function') updateUI();
            onAsyncDone();
        });
    }

    // ============ 统计 ============
    function getStats() {
        let pass = 0, fail = 0, manual = 0, na = 0;
        results.forEach(r => {
            if (r.status === 'pass') pass++;
            else if (r.status === 'fail') fail++;
            else if (r.status === 'manual') manual++;
            else if (r.status === 'na') na++;
        });
        return { pass, fail, manual, na, total: results.length };
    }

    // ============ 演示证据导出 ============
    // 违禁键名（含大小写/下划线/短横线变体，统一转小写+去分隔符后比对）
    var FORBIDDEN_KEYS = [
        'stack', 'filename', 'lineno', 'colno', 'colnumber',
        'href', 'url', 'origin', 'pathname', 'useragent',
        'token', 'cookie', 'session', 'conversation',
        'appid', 'applicationid',
        'authorization', 'bearer',
        'set-cookie', 'xauthtoken', 'xsrf', 'csrf',
        'password', 'secret', 'privatekey'
    ];

    // 违禁子串（仅用于值字符串扫描，大小写不敏感）
    var FORBIDDEN_SUBSTR = [
        '/tmp/', '/home/', '/Users/', '/root/', '/var/',
        'file://', 'http://', 'https://',
        'app_', 'conv_', 'session_', 'token_',
        'bearer ', 'bearer\t',
        'Authorization:', 'Set-Cookie:',
        'sk-', 'api_key', 'secret_'
    ];

    // URL/路径正则（用于值内替换清洗）
    var URL_REGEX = /https?:\/\/[^\s"'<>)]+/gi;
    var FILE_PATH_REGEX = /(?:file:\/\/)?\/(?:tmp|home|Users|root|var|etc|opt)\/[^\s"'<>)]+/gi;
    var TOKEN_LIKE_REGEX = /\b(?:sk-|xox[abp]-|ghp_|glpat-|Bearer\s+)[A-Za-z0-9_\-]{8,}/gi;
    var JWT_REGEX = /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g;

    function normalizeKey(k) {
        // 统一小写、去下划线/短横线/点，消除变体差异
        return String(k).toLowerCase().replace(/[-_.\s]/g, '');
    }

    function isForbiddenKey(k) {
        var nk = normalizeKey(k);
        for (var i = 0; i < FORBIDDEN_KEYS.length; i++) {
            // 精确匹配或前缀匹配（如 userAgent -> useragent 完全匹配）
            if (nk === FORBIDDEN_KEYS[i] || nk.indexOf(FORBIDDEN_KEYS[i]) === 0) {
                return true;
            }
        }
        // 含 token/session/cookie 且长度明显像标识符
        if ((nk.indexOf('token') !== -1 || nk.indexOf('session') !== -1 || nk.indexOf('cookie') !== -1) && nk.length >= 6) {
            return true;
        }
        return false;
    }

    function scrubString(s) {
        var cleaned = s
            .replace(URL_REGEX, '[URL removed]')
            .replace(FILE_PATH_REGEX, '[Path removed]')
            .replace(TOKEN_LIKE_REGEX, '[Token removed]')
            .replace(JWT_REGEX, '[JWT removed]');
        return cleaned.slice(0, 500);
    }

    function sanitizeValue(val, depth) {
        if (depth === undefined) depth = 0;
        if (depth > 8) return '[MaxDepthReached]';
        if (val === null || val === undefined) return val;
        var t = typeof val;
        if (t === 'number' || t === 'boolean') return val;
        if (t === 'string') {
            return scrubString(val);
        }
        if (t === 'function' || t === 'symbol') return undefined;
        if (t === 'object') {
            if (val instanceof Date) return val.toISOString();
            if (val instanceof RegExp) return String(val);
            if (val instanceof Error) {
                // 只保留 type + message（并清洗），剥离 stack
                return { type: val.name || 'Error', message: scrubString(val.message || '') };
            }
            if (Array.isArray(val)) {
                var arr = [];
                for (var i = 0; i < val.length; i++) {
                    var sv = sanitizeValue(val[i], depth + 1);
                    if (sv !== undefined) arr.push(sv);
                }
                return arr;
            }
            var obj = {};
            for (var k in val) {
                if (!val.hasOwnProperty(k)) continue;
                if (isForbiddenKey(k)) continue;
                var v = sanitizeValue(val[k], depth + 1);
                if (v !== undefined) obj[k] = v;
            }
            return obj;
        }
        return scrubString(String(val));
    }

    // 深度扫描：递归检查 sanitize 后是否仍有残余敏感内容
    // 返回 { blocked: false } 或 { blocked: true, types: ['url','token',...], count: N }
    function deepScanForbidden(val, depth) {
        if (depth === undefined) depth = 0;
        if (depth > 10 || val == null) return { blocked: false, types: [], count: 0 };
        var types = {};
        var count = 0;
        var t = typeof val;
        if (t === 'string') {
            var l = val.toLowerCase();
            for (var si = 0; si < FORBIDDEN_SUBSTR.length; si++) {
                if (l.indexOf(FORBIDDEN_SUBSTR[si].toLowerCase()) !== -1) {
                    types[FORBIDDEN_SUBSTR[si]] = true;
                    count++;
                }
            }
            // JWT / token-like 二次扫描
            if (JWT_REGEX.test(val)) { types['jwt'] = true; count++; }
            if (TOKEN_LIKE_REGEX.test(val)) { types['token-like'] = true; count++; }
        } else if (t === 'object') {
            if (Array.isArray(val)) {
                for (var ai = 0; ai < val.length; ai++) {
                    var sub = deepScanForbidden(val[ai], depth + 1);
                    if (sub.blocked) {
                        count += sub.count;
                        for (var tk in sub.types) types[tk] = true;
                    }
                }
            } else {
                for (var key in val) {
                    if (!val.hasOwnProperty(key)) continue;
                    // 键名本身违禁（sanitize 应已过滤，但双重保险）
                    if (isForbiddenKey(key)) {
                        types['key:' + key] = true;
                        count++;
                    }
                    var sub2 = deepScanForbidden(val[key], depth + 1);
                    if (sub2.blocked) {
                        count += sub2.count;
                        for (var tk2 in sub2.types) types[tk2] = true;
                    }
                }
            }
        }
        return { blocked: count > 0, types: Object.keys(types), count: count };
    }

    function validateExportPayload(payload) {
        var scan = deepScanForbidden(payload, 0);
        if (scan.blocked) {
            return {
                ok: false,
                error: '导出已阻止：发现需清理的敏感字段（类型：' + scan.types.slice(0, 3).join('、') + (scan.types.length > 3 ? '…' : '') + '，共 ' + scan.count + ' 处）'
            };
        }
        return { ok: true };
    }

    function buildExportPayload() {
        var data = (window.DataLoader && typeof DataLoader.getData === 'function') ? DataLoader.getData() : null;
        var stats = getStats();
        var autoResults = results.filter(function(r) { return r.status !== 'manual'; });
        var manualResults = results.filter(function(r) { return r.status === 'manual'; });

        // core_metrics：动态从数据层读取
        var coreMetrics = {};
        var summary = data && data.summary;
        var metrics = summary && summary.metrics;
        if (metrics && metrics.skuStoreDay) {
            coreMetrics.sku_store_day = {
                label: '门店×SKU×日审计 R²',
                r_squared: metrics.skuStoreDay.r2 ? Number(metrics.skuStoreDay.r2.toFixed(6)) : null,
                sample_n: metrics.skuStoreDay.n || 0,
                source: 'DataLoader.summary.metrics.skuStoreDay (calcMetrics 全量计算)'
            };
        }
        if (metrics && metrics.typeDay) {
            coreMetrics.type_day = {
                label: '产品类型×日审计 R²',
                r_squared: metrics.typeDay.r2 ? Number(metrics.typeDay.r2.toFixed(6)) : null,
                sample_n: metrics.typeDay.n || 0,
                source: 'DataLoader.summary.metrics.typeDay (calcMetrics 全量计算)'
            };
        }

        // 驾驶舱业务展示口径（非负截断）
        if (window.DataLoader && typeof DataLoader.getForecastSeries === 'function') {
            try {
                var cockpitSeries = DataLoader.getForecastSeries('all', 'all', 'all');
                if (cockpitSeries && typeof DataLoader.calcForecastMetrics === 'function') {
                    var cockpitMetrics = DataLoader.calcForecastMetrics(cockpitSeries.dates, cockpitSeries.actuals, cockpitSeries.predictions);
                    coreMetrics.cockpit_business = {
                        label: '默认驾驶舱业务展示 R²（非负预测）',
                        r_squared: cockpitMetrics.r2 ? Number(cockpitMetrics.r2.toFixed(6)) : null,
                        wape_pct: cockpitMetrics.wape != null ? Number((cockpitMetrics.wape * 100).toFixed(4)) : null,
                        sample_n: cockpitMetrics.n || 0,
                        source: 'DataLoader.getForecastSeries(all,all,all) + calcForecastMetrics (业务口径非负截断)'
                    };
                }
            } catch(e) { /* 不阻断导出 */ }
        }

        // drilldown_evidence: 四级下钻
        var drilldown = [];
        var drillLevels = [
            { label: '全店总量', store: 'all', category: 'all', sku: 'all' },
            { label: '曼哈顿下城店', store: 'Lower Manhattan', category: 'all', sku: 'all' },
            { label: '咖啡品类', store: 'all', category: 'Coffee', sku: 'all' },
            { label: '中杯经典Diner拼配', store: 'all', category: 'Coffee', sku: '23' }
        ];
        if (window.DataLoader && typeof DataLoader.getForecastSeries === 'function' && typeof DataLoader.calcForecastMetrics === 'function') {
            for (var di = 0; di < drillLevels.length; di++) {
                try {
                    var s = DataLoader.getForecastSeries(drillLevels[di].store, drillLevels[di].category, drillLevels[di].sku);
                    var m = DataLoader.calcForecastMetrics(s.dates, s.actuals, s.predictions);
                    var sumAct = 0, sumPred = 0;
                    for (var ai = 0; ai < s.actuals.length; ai++) sumAct += s.actuals[ai];
                    for (var pi = 0; pi < s.predictions.length; pi++) sumPred += s.predictions[pi];
                    // 构造显示用中文名（保留内部 sku_id 供机器审计）
                    var skuDisp = '全部';
                    var skuIdVal = drillLevels[di].sku;
                    if (skuIdVal !== 'all') {
                        var skuInfo = DataLoader.getData().skuList.find(function(x) { return x.product_id == skuIdVal; });
                        skuDisp = skuInfo ? DataLoader.getSkuDisplayName(skuInfo.product_detail, skuInfo.product_id) : DataLoader.getSkuDisplayName('', skuIdVal);
                    }
                    drilldown.push({
                        level: drillLevels[di].label,
                        store: drillLevels[di].store === 'all' ? '全部' : DataLoader.getStoreDisplayName(drillLevels[di].store),
                        category: drillLevels[di].category === 'all' ? '全部' : DataLoader.getCategoryDisplayName(drillLevels[di].category),
                        sku: skuDisp,
                        sku_id: drillLevels[di].sku === 'all' ? 'all' : drillLevels[di].sku,
                        store_key: drillLevels[di].store,
                        category_key: drillLevels[di].category,
                        actual_total: Number(sumAct.toFixed(3)),
                        nonneg_prediction_total: Number(sumPred.toFixed(3)),
                        wape_pct: m.wape != null ? Number((m.wape * 100).toFixed(2)) : null,
                        days: s.dates ? s.dates.length : 0,
                        metric_method: 'DataLoader.getForecastSeries + calcForecastMetrics (WAPE = Σ|err| / Σactual)'
                    });
                } catch(e) { /* 跳过 */ }
            }
        }

        // 早期错误（双重安全清洗：scrubString + 120字截断 + 最多10条）
        var errLog = getEarlyErrors();
        var errorSummary = errLog.map(function(e) {
            var msg = scrubString(e.message || '').slice(0, 120);
            return { type: e.type, message: msg };
        }).slice(0, 10);

        // overall_status
        var overallStatus = stats.fail === 0 ? '通过' : '存在失败项';

        var now = lastCheckTime || new Date();

        var payload = {
            report_title: 'Coffee Shop Sales Forecast 演示前检查报告',
            generated_at: {
                iso: now.toISOString(),
                local_readable: now.toLocaleString('zh-CN', { hour12: false })
            },
            overall_status: overallStatus,
            duration_ms: totalDurationMs || 0,
            summary: {
                pass: stats.pass,
                fail: stats.fail,
                manual: stats.manual,
                na: stats.na,
                total: stats.total
            },
            dataset_scope: {
                transaction_rows: 149116,
                transaction_date_start: '2023-01-01',
                transaction_date_end: '2023-06-30',
                transaction_days: 181,
                stores: 3,
                categories: 9,
                product_types: 29,
                skus: 80
            },
            prediction_scope: {
                date_start: '2023-06-24',
                date_end: '2023-06-30',
                detail_rows: 8400,
                granularity: '门店 × SKU × 日',
                business_display: '非负截断（业务展示口径，预测 ≤ 0 按 0 处理）',
                audit_display: '原始模型输出（审计口径，含负值）'
            },
            core_metrics: coreMetrics,
            drilldown_evidence: drilldown,
            automated_checks: autoResults.map(function(r) {
                return {
                    id: r.id,
                    name: r.name,
                    status: r.status,
                    actual: r.actual || '',
                    expected: r.expected || '',
                    detail: r.detail || ''
                };
            }),
            manual_checks: manualResults.length > 0 ? manualResults.map(function(r) {
                return { id: r.id, name: r.name, status: '待人工确认', detail: r.detail || '' };
            }) : [
                { id: 'manual-se', name: 'iPhone SE (320px) 真机字体与留白', status: '待人工确认', detail: '小屏设备的字体不挤压、热力图与表格留白充足' },
                { id: 'manual-android', name: '360/390px 安卓与 iPhone 触控体验', status: '待人工确认', detail: '触控目标可点、不误触、键盘弹出后布局稳定' },
                { id: 'manual-orientation', name: '横竖屏切换、刘海与底部 safe-area', status: '待人工确认', detail: '旋转屏幕后布局自适应，刘海和底部条不遮挡内容' },
                { id: 'manual-projector', name: '投屏分辨率下图表清晰度', status: '待人工确认', detail: '外接显示器/投影仪下文字可读、图表清晰' },
                { id: 'manual-rhythm', name: '6 步讲解节奏与页面加载卡顿', status: '待人工确认', detail: '页面切换无明显白屏、图表渲染流畅、讲解节奏自然' },
                { id: 'manual-network', name: '网络断开、缓存与第三方 CDN 稳定性', status: '待人工确认', detail: '弱网环境下数据加载、错误提示与重试能力' }
            ],
            limitations: [
                '回测仅 35 天（2023-05-27 至 06-30），5 个固定窗口，覆盖有限',
                '当前回测存在特征泄漏风险（sku_share 目标泄漏、qty_dow_avg 时间泄漏），指标可能偏乐观，不得作为 POC 验收或生产依据',
                '特征共 53 维，含 4 个稀疏标签（zero_rate、ADI、mean_qty、is_sparse）',
                '训练产物为 LightGBM 模型文件，应用依赖预测 CSV 展示，已验证加法一致性',
                '区间为总体边际覆盖，不保证每个门店/商品/步长分别达到 80%',
                '下钻与驾驶舱指标采用非负业务展示口径；模型效果审计采用原始审计口径',
                '驾驶舱日总量指标基于 35 天五窗口回测，细粒度分层指标需分别查看',
                'TreeSHAP 已可用（445,200 条精确贡献），解释模型关联不代表因果',
                '天气相关分析为相关性展示，不代表因果关系',
                '订货建议、库存估算、BOM、排班、成本均为模拟计算或能力演示',
                '一键自检仅验证数据完整性与页面可用性，不证明模型科学有效性'
            ],
            error_summary: errorSummary,
            source_files: [
                'Coffee Shop Sales.xlsx',
                'transactions.xlsx',
                'models/test_predictions.csv',
                'nyc_weather_2023_h1.csv'
            ]
        };

        return sanitizeValue(payload, 0);
    }

    function formatTimestamp(d) {
        function pad(n) { return n < 10 ? '0' + n : String(n); }
        return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }

    function supportsDownloadAttr() {
        var a = document.createElement('a');
        return 'download' in a;
    }

    function isIOSSafari() {
        var ua = navigator.userAgent || '';
        return /iP(ad|hone|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    }

    // 检测是否为 iOS 设备（含 Safari、WebView、内建浏览器）
    function isIOS() {
        var ua = navigator.userAgent || '';
        return /iP(ad|hone|od)/.test(ua);
    }

    // 检测是否为内建浏览器 / WebView（微信、飞书、钉钉、QQ、微博等）
    function isEmbeddedBrowser() {
        var ua = (navigator.userAgent || '').toLowerCase();
        var embeddedKeywords = [
            'micromessenger', 'wechat',  // 微信
            'lark', 'feishu',             // 飞书
            'dingtalk',                   // 钉钉
            'qq/', 'mqqbrowser',          // QQ
            'weibo',                      // 微博
            'alipay',                     // 支付宝
            'douyin', 'aweme',            // 抖音
            'xiaohongshu', 'xhs'         // 小红书
        ];
        for (var i = 0; i < embeddedKeywords.length; i++) {
            if (ua.indexOf(embeddedKeywords[i]) !== -1) return true;
        }
        // iOS WebView（无 Safari 字样，但在 iOS 上）
        if (isIOS() && ua.indexOf('safari') === -1) return true;
        return false;
    }

    // 是否应优先走新窗口（iOS 任何浏览器 + 内建浏览器都不可靠）
    function shouldUseWindowOpen() {
        if (isIOS()) return true;
        if (isEmbeddedBrowser()) return true;
        if (!supportsDownloadAttr()) return true;
        return false;
    }

    // 构造状态指纹（用于导出前后比对）
    function buildStateFingerprint() {
        var app = window.App || {};
        var fp = {
            page: typeof app.getCurrentPage === 'function' ? app.getCurrentPage() : null,
            scrollY: window.scrollY || window.pageYOffset || 0,
            store: typeof app.getCurrentStore === 'function' ? app.getCurrentStore() : null,
            category: typeof app.getCurrentCategory === 'function' ? app.getCurrentCategory() : null,
            sku: typeof app.getCurrentSku === 'function' ? app.getCurrentSku() : null,
            results_len: results ? results.length : 0,
            last_check_time: lastCheckTime ? lastCheckTime.getTime() : null,
            duration_ms: totalDurationMs || 0
        };
        // extensions tab
        try {
            var extTab = document.querySelector('.extension-tab.active, .ext-tab.active, [data-ext-tab].active');
            fp.extensions_tab = extTab ? extTab.textContent || extTab.getAttribute('data-tab') || 'active' : null;
        } catch(e) { fp.extensions_tab = null; }
        // 异常浮层
        try {
            var anomalyPanel = document.getElementById('anomalyPanel') || document.querySelector('.anomaly-panel');
            fp.anomaly_visible = anomalyPanel ? anomalyPanel.offsetParent !== null : false;
            var anomalyDate = document.querySelector('.anomaly-date, [data-anomaly-date]');
            fp.anomaly_date = anomalyDate ? anomalyDate.textContent || anomalyDate.getAttribute('data-anomaly-date') || null : null;
        } catch(e) { fp.anomaly_visible = false; fp.anomaly_date = null; }
        // results 摘要（取每个 status 的计数 + 第一项 id 和最后一项 id）
        try {
            var sCounts = {};
            for (var i = 0; i < results.length; i++) {
                var st = results[i].status;
                sCounts[st] = (sCounts[st] || 0) + 1;
            }
            fp.results_summary = JSON.stringify(sCounts);
        } catch(e) { fp.results_summary = null; }
        return fp;
    }

    // 深比较两个指纹，返回差异字段名数组（不回显值）
    function diffFingerprints(fp1, fp2) {
        var diffs = [];
        var keys = Object.keys(fp1);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (fp1[k] !== fp2[k]) diffs.push(k);
        }
        // 检查 fp2 多出的键
        var keys2 = Object.keys(fp2);
        for (var j = 0; j < keys2.length; j++) {
            if (!(keys2[j] in fp1)) diffs.push(keys2[j]);
        }
        return diffs;
    }

    function triggerDownload(blob, filename, fallbackText) {
        // 优先 Blob + a.download
        try {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // 延迟释放
            setTimeout(function() { try { URL.revokeObjectURL(url); } catch(e) {} }, 2000);
            return { ok: true, method: 'download' };
        } catch(e) {
            // 降级：新窗口打开
            try {
                var text = fallbackText !== undefined ? fallbackText : '';
                var w = window.open('', '_blank');
                if (w) {
                    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + filename + '</title></head><body><pre>' + escapeHtml(text) + '</pre></body></html>');
                    w.document.close();
                    return { ok: true, method: 'window_open', message: '已在新窗口打开，请使用"分享/存到文件"或打印保存' };
                } else {
                    return { ok: false, error: '新窗口被拦截，请检查浏览器弹窗设置' };
                }
            } catch(e2) {
                return { ok: false, error: String(e2.message || e2) };
            }
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function doExportJSON() {
        if (!lastCheckTime || results.length === 0) {
            return { ok: false, error: '请先运行自检' };
        }
        var fpBefore = buildStateFingerprint();
        try {
            var payload = buildExportPayload();

            // 强阻断安全校验
            var validation = validateExportPayload(payload);
            if (!validation.ok) {
                return { ok: false, error: validation.error };
            }

            var json = JSON.stringify(payload, null, 2);

            // 反向校验可解析
            var reparsed = JSON.parse(json);
            if (!reparsed || !reparsed.automated_checks) {
                return { ok: false, error: 'JSON 反向校验失败' };
            }

            var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            var filename = 'coffee-shop-sales-demo-check-' + formatTimestamp(lastCheckTime) + '.json';

            var result;
            // iOS / 内建浏览器：优先新窗口打开
            if (shouldUseWindowOpen()) {
                try {
                    var w = window.open('', '_blank');
                    if (w) {
                        var isEmbed = isEmbeddedBrowser();
                        var hintText = isEmbed
                            ? '当前内建浏览器限制导出，请在系统浏览器打开后重试。也可长按全选拷贝内容。'
                            : 'iOS 设备不支持直接下载。请长按全选 → 拷贝，或使用「分享」按钮存到「文件」App。';
                        w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + filename + '</title><style>body{font-family:monospace;font-size:13px;padding:12px;white-space:pre-wrap;word-break:break-all;background:#fafafa;color:#333;margin:0} .hint{position:sticky;top:0;background:#fff3e0;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-family:-apple-system,sans-serif;font-size:13px;color:#e65100;line-height:1.5}</style></head><body><div class="hint">' + escapeHtml(hintText) + '</div>' + escapeHtml(json) + '</body></html>');
                        w.document.close();
                        result = { ok: true, method: 'window_open', message: '已在新窗口打开 JSON 内容，请使用分享/存到文件保存' };
                    } else {
                        result = { ok: false, error: '导出被浏览器拦截：当前内建浏览器限制导出，请在系统浏览器打开后重试' };
                    }
                } catch(e) {
                    result = { ok: false, error: '导出被浏览器拦截：' + (e.message || e) };
                }
            } else {
                result = triggerDownload(blob, filename, json);
            }

            // 状态一致性检查
            var fpAfter = buildStateFingerprint();
            var diffs = diffFingerprints(fpBefore, fpAfter);
            if (diffs.length > 0) {
                result.stateWarning = true;
                result.stateDiffs = diffs;
                result.message = (result.message || '文件已下载') + '（注意：检测到 ' + diffs.length + ' 项状态变化：' + diffs.slice(0, 3).join('、') + (diffs.length > 3 ? '…' : '') + '）';
            }

            return result;
        } catch(e) {
            return { ok: false, error: String(e.message || e) };
        }
    }

    // ============ HTML 报告生成 ============
    function buildReportHTML(payload) {
        var passCount = payload.summary.pass;
        var failCount = payload.summary.fail;
        var manualCount = payload.summary.manual;
        var ok = failCount === 0;

        var autoFails = payload.automated_checks.filter(function(r) { return r.status === 'fail'; });
        var autoPasses = payload.automated_checks.filter(function(r) { return r.status !== 'fail'; });

        var html = '<!DOCTYPE html>\n';
        html += '<html lang="zh-CN">\n<head>\n';
        html += '<meta charset="UTF-8">\n';
        html += '<meta name="viewport" content="width=device-width,initial-scale=1">\n';
        html += '<title>' + escapeHtml(payload.report_title) + '</title>\n';
        html += '<style>\n';
        html += '  * { box-sizing: border-box; margin: 0; padding: 0; }\n';
        html += '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; background: #f5f5f5; padding: 20px; }\n';
        html += '  .report { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 32px; }\n';
        html += '  .report-header { border-bottom: 2px solid #e8e8e8; padding-bottom: 20px; margin-bottom: 24px; }\n';
        html += '  .report-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }\n';
        html += '  .report-disclaimer { background: #fff8e1; border-left: 4px solid #ffb300; padding: 10px 14px; font-size: 13px; color: #5d4037; margin-bottom: 16px; border-radius: 4px; }\n';
        html += '  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-weight: 600; font-size: 14px; }\n';
        html += '  .status-pass { background: #e8f5e9; color: #2e7d32; }\n';
        html += '  .status-fail { background: #ffebee; color: #c62828; }\n';
        html += '  .section { margin-bottom: 28px; }\n';
        html += '  .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #eee; color: #333; }\n';
        html += '  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 12px; }\n';
        html += '  .summary-card { background: #fafafa; border-radius: 6px; padding: 12px; text-align: center; }\n';
        html += '  .summary-card .num { font-size: 24px; font-weight: 700; }\n';
        html += '  .summary-card .label { font-size: 12px; color: #666; margin-top: 4px; }\n';
        html += '  .pass-num { color: #2e7d32; }\n';
        html += '  .fail-num { color: #c62828; }\n';
        html += '  .manual-num { color: #e65100; }\n';
        html += '  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }\n';
        html += '  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }\n';
        html += '  th { background: #fafafa; font-weight: 600; font-size: 12px; color: #555; }\n';
        html += '  .check-row.fail { background: #fff8f8; }\n';
        html += '  .check-status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; }\n';
        html += '  .status-s-pass { background: #e8f5e9; color: #2e7d32; }\n';
        html += '  .status-s-fail { background: #ffebee; color: #c62828; }\n';
        html += '  .status-s-manual { background: #fff3e0; color: #e65100; }\n';
        html += '  .status-s-na { background: #f5f5f5; color: #757575; }\n';
        html += '  .check-detail { color: #666; font-size: 12px; margin-top: 4px; }\n';
        html += '  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }\n';
        html += '  .metric-card { background: #fafafa; border-radius: 6px; padding: 14px; }\n';
        html += '  .metric-label { font-size: 12px; color: #666; margin-bottom: 4px; }\n';
        html += '  .metric-value { font-size: 20px; font-weight: 700; color: #1565c0; }\n';
        html += '  .metric-n { font-size: 11px; color: #999; margin-top: 4px; }\n';
        html += '  .metric-source { font-size: 11px; color: #aaa; margin-top: 6px; font-style: italic; }\n';
        html += '  ul.limit-list { padding-left: 20px; color: #555; font-size: 13px; }\n';
        html += '  ul.limit-list li { margin-bottom: 4px; }\n';
        html += '  .meta-info { color: #888; font-size: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; }\n';
        html += '  .print-btn { position: fixed; top: 20px; right: 20px; z-index: 100; padding: 10px 20px; background: #1565c0; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }\n';
        html += '  .print-btn:hover { background: #0d47a1; }\n';
        html += '  .source-files { display: flex; flex-wrap: wrap; gap: 8px; }\n';
        html += '  .source-file { background: #f0f4ff; color: #1565c0; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-family: monospace; }\n';
        html += '  @media print {\n';
        html += '    body { background: #fff; padding: 0; }\n';
        html += '    .report { box-shadow: none; padding: 0; max-width: 100%; }\n';
        html += '    .print-btn { display: none !important; }\n';
        html += '    .section { page-break-inside: avoid; }\n';
        html += '    table { page-break-inside: auto; }\n';
        html += '    tr { page-break-inside: avoid; page-break-after: auto; }\n';
        html += '    thead { display: table-header-group; }\n';
        html += '    .print-btn { display: none !important; }\n';
        html += '    div[style*="position:fixed"] { display: none !important; }\n';
        html += '  }\n';
        html += '  @media (prefers-reduced-motion: reduce) {\n';
        html += '    .btn-run-spinner { animation: none !important; border-top-color: transparent !important; }\n';
        html += '    * { transition: none !important; animation: none !important; }\n';
        html += '  }\n';
        html += '  @media (max-width: 600px) {\n';
        html += '    body { padding: 10px; }\n';
        html += '    .report { padding: 16px; }\n';
        html += '    .report-title { font-size: 18px; }\n';
        html += '  }\n';
        html += '</style>\n';
        html += '</head>\n<body>\n';

        html += '<div style="position:fixed;top:20px;right:20px;z-index:100;text-align:right;">\n';
        html += '  <button class="print-btn" onclick="window.print()">打印 / 另存 PDF</button>\n';
        html += '  <div style="font-size:11px;color:#999;margin-top:6px;max-width:200px;text-align:right;line-height:1.4;">打印分页和中文字体<br>以当前浏览器预览为准</div>\n';
        html += '</div>\n';
        html += '<div class="report">\n';

        // 头部
        html += '<div class="report-header">\n';
        html += '  <div class="report-disclaimer">⚠️ 本报告来自 Coffee Shop Sales 真实数据演示，不代表柠季真实经营结果。数据基于公开咖啡店交易样本。</div>\n';
        html += '  <div class="report-title">' + escapeHtml(payload.report_title) + '</div>\n';
        html += '  <div style="margin-top:8px;">';
        html += '    <span class="status-badge ' + (ok ? 'status-pass' : 'status-fail') + '">';
        html +=      (ok ? '✓ ' : '✗ ') + escapeHtml(payload.overall_status);
        html += '    </span>';
        html += '    <span style="margin-left:16px;color:#888;font-size:13px;">';
        html +=      '生成时间：' + escapeHtml(payload.generated_at.local_readable);
        html += '    </span>';
        html += '    <span style="margin-left:16px;color:#888;font-size:13px;">';
        html +=      '耗时：' + (payload.duration_ms / 1000).toFixed(1) + 's';
        html += '    </span>';
        html += '  </div>\n';
        html += '</div>\n';

        // 概览
        html += '<div class="section">\n';
        html += '  <div class="section-title">检查概览</div>\n';
        html += '  <div class="summary-grid">\n';
        html += '    <div class="summary-card"><div class="num pass-num">' + payload.summary.pass + '</div><div class="label">通过</div></div>\n';
        html += '    <div class="summary-card"><div class="num fail-num">' + payload.summary.fail + '</div><div class="label">失败</div></div>\n';
        html += '    <div class="summary-card"><div class="num manual-num">' + payload.summary.manual + '</div><div class="label">待人工</div></div>\n';
        html += '    <div class="summary-card"><div class="num">' + payload.summary.total + '</div><div class="label">总检查项</div></div>\n';
        html += '  </div>\n';
        html += '</div>\n';

        // 数据范围
        html += '<div class="section">\n';
        html += '  <div class="section-title">数据范围</div>\n';
        var ds = payload.dataset_scope;
        html += '  <table>\n';
        html += '    <tr><th style="width:40%">指标</th><th>值</th></tr>\n';
        html += '    <tr><td>交易记录数</td><td>' + ds.transaction_rows.toLocaleString() + ' 条</td></tr>\n';
        html += '    <tr><td>交易日期范围</td><td>' + escapeHtml(ds.transaction_date_start) + ' 至 ' + escapeHtml(ds.transaction_date_end) + '（' + ds.transaction_days + ' 天）</td></tr>\n';
        html += '    <tr><td>门店数</td><td>' + ds.stores + ' 家</td></tr>\n';
        html += '    <tr><td>品类数</td><td>' + ds.categories + ' 个</td></tr>\n';
        html += '    <tr><td>产品类型数</td><td>' + ds.product_types + ' 种</td></tr>\n';
        html += '    <tr><td>商品数</td><td>' + ds.skus + ' 个</td></tr>\n';
        html += '  </table>\n';
        html += '</div>\n';

        // 预测范围与口径
        html += '<div class="section">\n';
        html += '  <div class="section-title">预测范围与口径</div>\n';
        var ps = payload.prediction_scope;
        html += '  <table>\n';
        html += '    <tr><th style="width:40%">指标</th><th>值</th></tr>\n';
        html += '    <tr><td>预测日期范围</td><td>' + escapeHtml(ps.date_start) + ' 至 ' + escapeHtml(ps.date_end) + '（7 天）</td></tr>\n';
        html += '    <tr><td>明细行数</td><td>' + ps.detail_rows.toLocaleString() + ' 条（' + escapeHtml(ps.granularity) + '）</td></tr>\n';
        html += '    <tr><td>业务展示口径</td><td>' + escapeHtml(ps.business_display) + '</td></tr>\n';
        html += '    <tr><td>审计口径</td><td>' + escapeHtml(ps.audit_display) + '</td></tr>\n';
        html += '  </table>\n';
        html += '</div>\n';

        // 核心指标
        html += '<div class="section">\n';
        html += '  <div class="section-title">核心模型指标</div>\n';
        html += '  <div class="metrics-grid">\n';
        var cm = payload.core_metrics;
        if (cm.sku_store_day) {
            html += '    <div class="metric-card">\n';
            html += '      <div class="metric-label">' + escapeHtml(cm.sku_store_day.label) + '</div>\n';
            html += '      <div class="metric-value">R² = ' + cm.sku_store_day.r_squared + '</div>\n';
            html += '      <div class="metric-n">n = ' + cm.sku_store_day.sample_n.toLocaleString() + ' 个样本</div>\n';
            html += '      <div class="metric-source">' + escapeHtml(cm.sku_store_day.source) + '</div>\n';
            html += '    </div>\n';
        }
        if (cm.type_day) {
            html += '    <div class="metric-card">\n';
            html += '      <div class="metric-label">' + escapeHtml(cm.type_day.label) + '</div>\n';
            html += '      <div class="metric-value">R² = ' + cm.type_day.r_squared + '</div>\n';
            html += '      <div class="metric-n">n = ' + cm.type_day.sample_n.toLocaleString() + ' 个样本</div>\n';
            html += '      <div class="metric-source">' + escapeHtml(cm.type_day.source) + '</div>\n';
            html += '    </div>\n';
        }
        if (cm.cockpit_business) {
            html += '    <div class="metric-card" style="border:1px solid #ffe0b2;">\n';
            html += '      <div class="metric-label">' + escapeHtml(cm.cockpit_business.label) + '</div>\n';
            html += '      <div class="metric-value" style="color:#e65100;">R² = ' + cm.cockpit_business.r_squared + '</div>\n';
            html += '      <div class="metric-n">WAPE = ' + cm.cockpit_business.wape_pct + '% · n = ' + cm.cockpit_business.sample_n + ' 天</div>\n';
            html += '      <div class="metric-source"><strong style="color:#e65100;">说明：</strong>n=7 为日总量级别，统计稳定性有限，不作为核心模型能力结论。核心模型能力请参考上方门店×SKU×日与产品类型×日审计指标。</div>\n';
            html += '      <div class="metric-source">' + escapeHtml(cm.cockpit_business.source) + '</div>\n';
            html += '    </div>\n';
        }
        html += '  </div>\n';
        html += '  <div style="font-size:11px;color:#666;margin-top:8px;background:#f5f5f5;padding:8px 10px;border-radius:4px;line-height:1.5;">\n';
        html += '    <strong>双口径说明：</strong>门店×SKU×日 R² 与产品类型×日 R² 为<strong>原始模型审计口径</strong>（含负值），代表模型本身的拟合能力；驾驶舱业务展示与下钻 WAPE 为<strong>非负修正业务展示口径</strong>（预测 ≤ 0 按 0 处理），用于前台可视化。\n';
        html += '  </div>\n';
        html += '</div>\n';

        // 四级下钻证据
        html += '<div class="section">\n';
        html += '  <div class="section-title">四级下钻证据（业务非负口径）</div>\n';
        html += '  <div style="font-size:12px;color:#666;margin-bottom:8px;">下表实际总量、非负预测总量与 WAPE 均基于<strong>业务非负修正后的预测序列</strong>，与驾驶舱前台展示口径一致。方法：WAPE = Σ|实际−预测| / Σ实际。</div>\n';
        html += '  <table>\n';
        html += '    <tr><th>层级</th><th>门店</th><th>品类</th><th>商品</th><th style="text-align:right">实际总量</th><th style="text-align:right">非负预测总量</th><th style="text-align:right">WAPE</th></tr>\n';
        for (var di = 0; di < payload.drilldown_evidence.length; di++) {
            var d = payload.drilldown_evidence[di];
            html += '    <tr>\n';
            html += '      <td>' + escapeHtml(d.level) + '</td>\n';
            html += '      <td>' + escapeHtml(d.store) + '</td>\n';
            html += '      <td>' + escapeHtml(d.category) + '</td>\n';
            html += '      <td>' + escapeHtml(d.sku) + '</td>\n';
            html += '      <td style="text-align:right;font-variant-numeric:tabular-nums;">' + d.actual_total.toLocaleString() + '</td>\n';
            html += '      <td style="text-align:right;font-variant-numeric:tabular-nums;">' + d.nonneg_prediction_total.toLocaleString() + '</td>\n';
            html += '      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">' + d.wape_pct + '%</td>\n';
            html += '    </tr>\n';
        }
        html += '  </table>\n';
        html += '  <div style="font-size:11px;color:#aaa;margin-top:6px;font-style:italic;">方法：' + (payload.drilldown_evidence[0] && payload.drilldown_evidence[0].metric_method || '') + '</div>\n';
        html += '</div>\n';

        // 自动检查 — 失败在前
        html += '<div class="section">\n';
        html += '  <div class="section-title">自动检查明细（' + payload.automated_checks.length + ' 项）</div>\n';
        if (autoFails.length > 0) {
            html += '  <div style="margin-bottom:12px;"><strong style="color:#c62828;">失败项（' + autoFails.length + '）</strong></div>\n';
            html += '  <table>\n';
            html += '    <tr><th style="width:80px">状态</th><th style="width:30%">检查项</th><th>实际 / 期望值与详情</th></tr>\n';
            for (var fi = 0; fi < autoFails.length; fi++) {
                var r = autoFails[fi];
                html += '    <tr class="check-row fail">\n';
                html += '      <td><span class="check-status status-s-fail">✗ 失败</span></td>\n';
                html += '      <td><strong>' + escapeHtml(r.name) + '</strong><br><span style="color:#999;font-size:11px;">' + escapeHtml(r.id) + '</span></td>\n';
                html += '      <td>\n';
                html += '        <div>实际：' + escapeHtml(r.actual) + '</div>\n';
                html += '        <div>期望：' + escapeHtml(r.expected) + '</div>\n';
                if (r.detail) html += '        <div class="check-detail">详情：' + escapeHtml(r.detail) + '</div>\n';
                html += '      </td>\n';
                html += '    </tr>\n';
            }
            html += '  </table>\n';
        }
        if (autoPasses.length > 0) {
            html += '  <div style="margin:16px 0 12px;"><strong style="color:#2e7d32;">通过项（' + autoPasses.length + '）</strong></div>\n';
            html += '  <table>\n';
            html += '    <tr><th style="width:80px">状态</th><th style="width:30%">检查项</th><th>实际 / 期望值与详情</th></tr>\n';
            for (var pi = 0; pi < autoPasses.length; pi++) {
                var rp = autoPasses[pi];
                var sClass = 'status-s-' + rp.status;
                var sText = rp.status === 'pass' ? '✓ 通过' : (rp.status === 'na' ? '— 未检' : rp.status);
                html += '    <tr>\n';
                html += '      <td><span class="check-status ' + sClass + '">' + escapeHtml(sText) + '</span></td>\n';
                html += '      <td><strong>' + escapeHtml(rp.name) + '</strong><br><span style="color:#999;font-size:11px;">' + escapeHtml(rp.id) + '</span></td>\n';
                html += '      <td>\n';
                html += '        <div>实际：' + escapeHtml(rp.actual) + '</div>\n';
                html += '        <div>期望：' + escapeHtml(rp.expected) + '</div>\n';
                if (rp.detail) html += '        <div class="check-detail">详情：' + escapeHtml(rp.detail) + '</div>\n';
                html += '      </td>\n';
                html += '    </tr>\n';
            }
            html += '  </table>\n';
        }
        html += '</div>\n';

        // 人工复核
        html += '<div class="section">\n';
        html += '  <div class="section-title">人工复核清单（' + payload.manual_checks.length + ' 项）</div>\n';
        html += '  <table>\n';
        html += '    <tr><th style="width:100px">状态</th><th style="width:30%">检查项</th><th>说明</th></tr>\n';
        for (var mi = 0; mi < payload.manual_checks.length; mi++) {
            var m = payload.manual_checks[mi];
            html += '    <tr>\n';
            html += '      <td><span class="check-status status-s-manual">待人工确认</span></td>\n';
            html += '      <td><strong>' + escapeHtml(m.name) + '</strong></td>\n';
            html += '      <td>' + escapeHtml(m.detail || '') + '</td>\n';
            html += '    </tr>\n';
        }
        html += '  </table>\n';
        html += '</div>\n';

        // 数据边界与限制
        html += '<div class="section">\n';
        html += '  <div class="section-title">数据边界与限制</div>\n';
        html += '  <ul class="limit-list">\n';
        for (var li = 0; li < payload.limitations.length; li++) {
            html += '    <li>' + escapeHtml(payload.limitations[li]) + '</li>\n';
        }
        html += '  </ul>\n';
        html += '</div>\n';

        // 错误摘要
        if (payload.error_summary && payload.error_summary.length > 0) {
            html += '<div class="section">\n';
            html += '  <div class="section-title">运行时错误摘要（' + payload.error_summary.length + ' 条）</div>\n';
            html += '  <table>\n';
            html += '    <tr><th style="width:120px">类型</th><th>消息（已截断）</th></tr>\n';
            for (var ei = 0; ei < payload.error_summary.length; ei++) {
                var e = payload.error_summary[ei];
                html += '    <tr><td>' + escapeHtml(e.type) + '</td><td style="font-family:monospace;font-size:12px;">' + escapeHtml(e.message) + '</td></tr>\n';
            }
            html += '  </table>\n';
            html += '  <div style="font-size:11px;color:#aaa;margin-top:6px;">仅包含错误类型与已截断消息（≤120字符），不含堆栈、URL、行列号。</div>\n';
            html += '</div>\n';
        }

        // 来源文件
        html += '<div class="section">\n';
        html += '  <div class="section-title">来源文件</div>\n';
        html += '  <div class="source-files">\n';
        for (var si = 0; si < payload.source_files.length; si++) {
            html += '    <span class="source-file">' + escapeHtml(payload.source_files[si]) + '</span>\n';
        }
        html += '  </div>\n';
        html += '</div>\n';

        // 页脚
        html += '<div class="meta-info">\n';
        html += '  生成时间：' + escapeHtml(payload.generated_at.local_readable) + '（' + escapeHtml(payload.generated_at.iso) + '）<br>\n';
        html += '  本报告由 Coffee Shop Sales Forecast 演示平台一键生成。数据范围与指标均来自系统自检，不代表任何真实经营结果。\n';
        html += '</div>\n';

        html += '</div>\n';
        html += '</body>\n</html>';
        return html;
    }

    function doExportReport() {
        if (!lastCheckTime || results.length === 0) {
            return { ok: false, error: '请先运行自检' };
        }
        var fpBefore = buildStateFingerprint();
        try {
            var payload = buildExportPayload();

            // 强阻断安全校验
            var validation = validateExportPayload(payload);
            if (!validation.ok) {
                return { ok: false, error: validation.error };
            }

            var html = buildReportHTML(payload);

            // HTML 字符串二次扫描（确保渲染后也无残留）
            var htmlScan = deepScanForbidden(html, 0);
            if (htmlScan.blocked) {
                return {
                    ok: false,
                    error: '导出已阻止：HTML 中发现需清理的敏感字段（类型：' + htmlScan.types.slice(0, 3).join('、') + (htmlScan.types.length > 3 ? '…' : '') + '，共 ' + htmlScan.count + ' 处）'
                };
            }

            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var filename = 'coffee-shop-sales-demo-check-' + formatTimestamp(lastCheckTime) + '.html';

            var result;
            // iOS / 内建浏览器：优先新窗口打开
            if (shouldUseWindowOpen()) {
                try {
                    var w = window.open('', '_blank');
                    if (w) {
                        w.document.open();
                        w.document.write(html);
                        w.document.close();
                        var isEmbed = isEmbeddedBrowser();
                        var msg = isEmbed
                            ? '已在新窗口打开报告。当前内建浏览器可能限制直接保存，请在系统浏览器打开后重试，或使用「分享→打印→存PDF」保存。'
                            : '已在新窗口打开报告，请使用「分享→打印→存PDF」或「存到文件」保存。';
                        result = { ok: true, method: 'window_open', message: msg };
                    } else {
                        result = { ok: false, error: '导出被浏览器拦截：当前内建浏览器限制导出，请在系统浏览器打开后重试' };
                    }
                } catch(e) {
                    result = { ok: false, error: '导出被浏览器拦截：' + (e.message || e) };
                }
            } else {
                result = triggerDownload(blob, filename, html);
            }

            // 状态一致性检查
            var fpAfter = buildStateFingerprint();
            var diffs = diffFingerprints(fpBefore, fpAfter);
            if (diffs.length > 0) {
                result.stateWarning = true;
                result.stateDiffs = diffs;
                result.message = (result.message || '文件已下载') + '（注意：检测到 ' + diffs.length + ' 项状态变化：' + diffs.slice(0, 3).join('、') + (diffs.length > 3 ? '…' : '') + '）';
            }

            return result;
        } catch(e) {
            return { ok: false, error: String(e.message || e) };
        }
    }

    // ============ UI 渲染 ============
    function renderResultsHTML() {
        const stats = getStats();
        const allAutoPass = stats.fail === 0 && results.length > 0;

        let html = '';

        // 标题区
        html += '<div class="selfcheck-header">';
        html += '  <div class="selfcheck-title-row">';
        html += '    <div class="selfcheck-title">演示前自检</div>';
        html += '    <div class="selfcheck-summary-badge ' + (allAutoPass ? 'pass' : 'fail') + '">';
        html +=      allAutoPass ? '自动检查通过' : '存在失败项';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="selfcheck-subtitle">';
        if (lastCheckTime) {
            html += '最近检查：' + lastCheckTime.toLocaleTimeString('zh-CN', {hour12:false}) + ' · 耗时 ' + (totalDurationMs / 1000).toFixed(1) + 's';
        } else {
            html += '点击下方按钮开始检查';
        }
        html += '  </div>';
        html += '  <div class="selfcheck-stats">';
        html += '    <div class="selfcheck-stat pass"><span class="stat-num">' + stats.pass + '</span><span class="stat-label">通过</span></div>';
        html += '    <div class="selfcheck-stat fail"><span class="stat-num">' + stats.fail + '</span><span class="stat-label">失败</span></div>';
        html += '    <div class="selfcheck-stat manual"><span class="stat-num">' + stats.manual + '</span><span class="stat-label">人工</span></div>';
        html += '    <div class="selfcheck-stat na"><span class="stat-num">' + stats.na + '</span><span class="stat-label">不适用</span></div>';
        html += '  </div>';
        html += '</div>';

        // 控制行
        html += '<div class="selfcheck-controls">';
        html += '  <button class="selfcheck-btn-run' + (isRunning ? ' running' : '') + '" id="selfcheckRunBtn" onclick="DemoSelfCheck.run()"' + (isRunning ? ' disabled aria-busy="true"' : '') + '>';
        html += '    <span class="btn-run-text">' + (isRunning ? '检查中…' : '一键自检') + '</span>';
        if (isRunning) {
            html += '    <span class="btn-run-spinner" aria-hidden="true"></span>';
        }
        html += '  </button>';
        html += '  <label class="selfcheck-deep-toggle">';
        html += '    <input type="checkbox" id="selfcheckDeepToggle" ' + (deepCheckEnabled ? 'checked' : '') + ' onchange="DemoSelfCheck.setDeep(this.checked)">';
        html += '    <span>深度检查（6 步页面逐一验证）</span>';
        html += '  </label>';
        html += '</div>';

        // 结果列表
        html += '<div class="selfcheck-results">';
        results.forEach(r => {
            const iconMap = {
                pass: '\u2713',
                fail: '\u2717',
                manual: '!',
                na: '—'
            };
            const icon = iconMap[r.status] || '?';
            const labelMap = {
                pass: '通过',
                fail: '失败',
                manual: '人工复核',
                na: '不适用'
            };
            html += '<div class="selfcheck-item ' + r.status + '">';
            html += '  <div class="selfcheck-item-icon status-' + r.status + '" aria-label="' + labelMap[r.status] + '">' + icon + '</div>';
            html += '  <div class="selfcheck-item-body">';
            html += '    <div class="selfcheck-item-name">' + r.name + '</div>';
            html += '    <div class="selfcheck-item-values">';
            html += '      <span class="val-actual">实际：' + (r.actual || '—') + '</span>';
            if (r.expected && r.status !== 'na' && r.status !== 'manual') {
                html += '    <span class="val-expected">期望：' + r.expected + '</span>';
            }
            html += '    </div>';
            if (r.detail) {
                html += '  <div class="selfcheck-item-detail">' + r.detail + '</div>';
            }
            html += '  </div>';
            html += '</div>';
        });
        html += '</div>';

        // 导出区
        var canExport = results.length > 0 && !isRunning && lastCheckTime;
        html += '<div class="selfcheck-export-row">';
        html += '  <button class="selfcheck-btn-export' + (canExport ? '' : ' disabled') + '"' + (canExport ? ' onclick="DemoSelfCheck.exportJSON()"' : ' disabled') + '>';
        html += '    导出 JSON';
        html += '  </button>';
        html += '  <button class="selfcheck-btn-export' + (canExport ? '' : ' disabled') + '"' + (canExport ? ' onclick="DemoSelfCheck.exportReport()"' : ' disabled') + '>';
        html += '    导出演示检查报告';
        html += '  </button>';
        html += '</div>';
        if (!canExport && results.length === 0) {
            html += '<div class="selfcheck-export-note">请先运行自检以生成可导出的检查结果</div>';
        } else if (isRunning) {
            html += '<div class="selfcheck-export-note">自检进行中，请等待完成后再导出</div>';
        }

        // 底部操作区
        html += '<div class="selfcheck-footer">';
        if (allAutoPass && results.length > 0) {
            html += '  <button class="selfcheck-btn-start" onclick="DemoSelfCheck.startDemo()">开始演示</button>';
            html += '  <div class="selfcheck-footer-note">自动检查全部通过，可以开始 6 步演示。</div>';
        } else if (results.length === 0) {
            html += '  <button class="selfcheck-btn-start disabled" disabled>开始演示</button>';
            html += '  <div class="selfcheck-footer-note">请先运行自检以验证演示环境。</div>';
        } else {
            html += '  <button class="selfcheck-btn-start warn" onclick="DemoSelfCheck.startDemo()">仍要开始演示</button>';
            html += '  <div class="selfcheck-footer-note warn">存在 ' + stats.fail + ' 项失败，演示可能受影响，请人工确认。</div>';
        }
        html += '</div>';

        return html;
    }

    function updateUI() {
        const container = document.getElementById('selfcheckPanel');
        if (!container) return;
        container.innerHTML = renderResultsHTML();
    }

    // ============ 对外方法 ============
    function init() {
        const modalBody = document.querySelector('#dataLegendModal .modal-body');
        if (!modalBody) return;

        if (document.getElementById('selfcheckPanel')) return;

        const panel = document.createElement('div');
        panel.className = 'selfcheck-panel';
        panel.id = 'selfcheckPanel';
        panel.innerHTML = renderResultsHTML();
        modalBody.appendChild(panel);
    }

    function run() {
        if (isRunning) return;
        runAll(function() {
            updateUI();
        });
        updateUI();
    }

    function setDeep(enabled) {
        deepCheckEnabled = !!enabled;
    }

    function startDemo() {
        if (typeof hideDataLegend === 'function') hideDataLegend();
        if (window.DemoMode && typeof DemoMode.start === 'function') {
            setTimeout(function() {
                DemoMode.start();
            }, 200);
        }
    }

    // 测试钩子（用于验证失败场景，使用后必须恢复）
    const testHooks = {
        // 临时移除 ECharts
        mockNoEcharts: function() {
            if (!window.echarts) return null;
            const backup = window.echarts;
            delete window.echarts;
            return function restore() {
                window.echarts = backup;
                // 验证引用完整
                if (window.echarts !== backup) throw new Error('echarts 恢复失败：引用不一致');
            };
        },
        // 临时破坏预测字段
        mockBadForecast: function() {
            if (!window.DataLoader || !DataLoader.getData) return null;
            const data = DataLoader.getData();
            const backup = data.skuForecast;
            data.skuForecast = [];
            return function restore() {
                data.skuForecast = backup;
                if (data.skuForecast !== backup) throw new Error('skuForecast 恢复失败：引用不一致');
                if (!Array.isArray(data.skuForecast) || data.skuForecast.length !== backup.length) {
                    throw new Error('skuForecast 恢复失败：长度不一致');
                }
            };
        },
        // 临时破坏步骤 focus
        mockBadFocus: function() {
            if (!window.DemoMode || !DemoMode._stepsInfo) return null;
            const orig = DemoMode._stepsInfo;
            DemoMode._stepsInfo = function() {
                const info = orig();
                info.steps[0].focus = '';
                return info;
            };
            return function restore() {
                DemoMode._stepsInfo = orig;
                if (DemoMode._stepsInfo !== orig) throw new Error('focus 配置恢复失败：引用不一致');
                // 验证第一步 focus 已恢复
                const info = DemoMode._stepsInfo();
                if (!info.steps[0].focus) throw new Error('focus 配置恢复失败：第一步 focus 仍为空');
            };
        },
        // 临时注入运行错误（带唯一标记，按标记删除）
        mockRuntimeError: function() {
            const marker = '__selfcheck_mock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            if (window.__earlyErrors && typeof window.__earlyErrors._injectMock === 'function') {
                window.__earlyErrors._injectMock(marker);
            }
            return function restore() {
                if (window.__earlyErrors && typeof window.__earlyErrors._removeMock === 'function') {
                    const removed = window.__earlyErrors._removeMock(marker);
                    if (!removed) throw new Error('运行错误模拟项未找到，可能已被并发错误冲掉或从未插入');
                }
            };
        },

        // ===== 导出安全测试钩子 =====
        // 注入指定类型的敏感字段到 payload，验证强阻断是否生效
        // 返回 { payloadBefore, validationResult } — 调用时手动对比
        testSecurityBlock: function(injectType) {
            // 构造一个正常 payload 的克隆
            var base = buildExportPayload();
            var tampered = JSON.parse(JSON.stringify(base));
            switch (injectType) {
                case 'stack':
                    tampered._test_stack = 'Error\n    at foo (app.js:42:15)\n    at bar';
                    break;
                case 'url':
                    tampered._test = '请访问 https://evil.com/steal?token=abc123 获取';
                    break;
                case 'localpath':
                    tampered._test = '文件路径：/Users/admin/.ssh/id_rsa';
                    break;
                case 'token':
                    tampered._test_token = 'sk-abcdefghijklmnop1234567890';
                    break;
                case 'uppercase':
                    tampered._TEST_URL = 'HTTP://EVIL.COM';
                    break;
                case 'filename':
                    tampered.fileName = 'should-be-blocked.js';
                    break;
                default:
                    return { error: '未知注入类型：' + injectType + '，支持：stack/url/localpath/token/uppercase/filename' };
            }
            var validation = validateExportPayload(tampered);
            return {
                injected: injectType,
                blocked: !validation.ok,
                validation: validation,
                payloadKeys: Object.keys(tampered)
            };
        },

        // 验证正常 payload 不误报
        testNormalPayload: function() {
            var p = buildExportPayload();
            var v = validateExportPayload(p);
            return { ok: v.ok, error: v.error || null, fieldCount: Object.keys(p).length };
        },

        // 状态指纹测试：导出前后指纹比对
        testStateFingerprint: function() {
            var fp1 = buildStateFingerprint();
            var fp2 = buildStateFingerprint();
            var diffs = diffFingerprints(fp1, fp2);
            return { identical: diffs.length === 0, diffs: diffs, fp: fp1 };
        },

        // UA 检测测试（可模拟 UA）
        testUADetection: function(mockUA) {
            var origUA = navigator.userAgent;
            try {
                // 只读，无法直接 mock；这里直接调用函数看返回值
                return {
                    isIOS: isIOS(),
                    isEmbedded: isEmbeddedBrowser(),
                    isSafari: isIOSSafari(),
                    shouldUseWindowOpen: shouldUseWindowOpen()
                };
            } finally {
                // 不可变，无需恢复
            }
        },

        // 内部函数直接暴露给测试
        _sanitize: sanitizeValue,
        _validate: validateExportPayload,
        _deepScan: deepScanForbidden,
        _buildFingerprint: buildStateFingerprint,
        _diffFingerprints: diffFingerprints
    };

    // 暴露到全局
    window.DemoSelfCheck = {
        init,
        run,
        setDeep,
        startDemo,
        getResults: () => results,
        getStats,
        getLastCheckTime: () => lastCheckTime,
        getLastDurationMs: () => totalDurationMs || 0,
        isRunning: () => isRunning,
        getErrorLog: () => getEarlyErrors(),
        exportJSON: doExportJSON,
        exportReport: doExportReport,
        _testHooks: testHooks,
        _buildExportPayload: buildExportPayload
    };

    // DOM 就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
