/**
 * CoffeeIQ 数据加载器 v2.1
 * 基于 direct-tweedie-sparse 新模型（Global LightGBM）
 * 负责加载和预处理所有数据文件
 * 
 * 首屏加载（轻量）：
 *   - 历史聚合：agg_*.csv
 *   - 预测明细：sku_forecast.csv（8400条，5窗口×7天×3店×80SKU）
 *   - 质量报告：quality_report.csv（508行，分层×方法）
 *   - 运行合同：run_contract.json
 *   - Dashboard：dashboard.json（含每日预测、特征重要性、风险排名等）
 * 
 * 懒加载（进入对应页面时）：
 *   - SHAP贡献：shap_contributions.csv（445200条）
 *   - 情景模拟：scenario_results.csv（226800条）
 */

const DataLoader = (function() {
    let loaded = false;
    let shapLoaded = false;
    let shapLoading = false;    // 加载中防并发
    let shapLoadPromise = null; // 缓存 Promise
    let scenarioLoaded = false;
    let scenarioLoading = false;
    let scenarioLoadPromise = null;
    let data = {};

    // 核心数据
    data.dailyStore = null;
    data.dailyTotal = null;
    data.categoryStore = null;
    data.skuList = null;
    data.hourly = null;
    data.dow = null;
    data.weatherSlim = null;
    data.weatherFull = null;
    data.categoryStoreDaily = null;

    // 新模型预测数据
    data.skuForecast = null;        // 8400条明细预测
    data.qualityReport = null;      // 分层质量报告（多方法）
    data.runContract = null;        // 运行合同
    data.dashboard = null;          // Dashboard JSON

    // 懒加载大数据
    data.shapContributions = null;  // 445200条
    data.scenarioResults = null;    // 226800条

    // 派生索引
    data.shapIndex = null;          // prediction_id -> shap行数组
    data.scenarioIndex = null;      // prediction_id -> scenario数组

    // 派生汇总
    data.summary = {};
    data.storeNames = ["Lower Manhattan", "Hell's Kitchen", "Astoria"];
    data.categories = [];
    data.productTypes = [];

    // ============ CSV / JSON 加载 ============
    async function loadCSV(url) {
        const response = await fetch(url);
        const text = await response.text();
        return parseCSV(text);
    }

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((h, idx) => {
                    let val = values[idx].trim();
                    if (val !== '' && !isNaN(val) && val !== 'true' && val !== 'false') {
                        val = parseFloat(val);
                    }
                    row[h] = val;
                });
                rows.push(row);
            }
        }
        return rows;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    async function loadJSON(url) {
        const response = await fetch(url);
        return await response.json();
    }

    // ============ 首屏初始化 ============
    async function init() {
        if (loaded) return data;

        console.log('CoffeeIQ v2.1: 正在加载数据...');

        try {
            const [
                dailyStore, dailyTotal, categoryStore, skuList, hourly, dow,
                weatherSlim, weatherFull, categoryStoreDaily,
                skuForecast, qualityReport, runContract, dashboard
            ] = await Promise.all([
                loadCSV('data/agg_daily_store.csv'),
                loadCSV('data/agg_daily_total.csv'),
                loadCSV('data/agg_category_store.csv'),
                loadCSV('data/agg_sku_list.csv'),
                loadCSV('data/agg_hourly.csv'),
                loadCSV('data/agg_dow.csv'),
                loadCSV('data/agg_weather_slim.csv'),
                loadCSV('data/weather.xlsx'),
                loadCSV('data/agg_category_store_daily.csv'),
                loadCSV('data/sku_forecast.csv'),
                loadCSV('data/quality_report.csv'),
                loadJSON('data/run_contract.json'),
                loadJSON('data/dashboard.json')
            ]);

            data.dailyStore = dailyStore;
            data.dailyTotal = dailyTotal;
            data.categoryStore = categoryStore;
            data.skuList = skuList;
            data.hourly = hourly;
            data.dow = dow;
            data.weatherSlim = weatherSlim;
            data.weatherFull = weatherFull;
            data.categoryStoreDaily = categoryStoreDaily;
            data.skuForecast = skuForecast;
            data.qualityReport = qualityReport;
            data.runContract = runContract;
            data.dashboard = dashboard;

            // 计算概览数据
            computeSummary();

            loaded = true;
            console.log('CoffeeIQ v2.1: 数据加载完成（8400预测 / 5窗口 / 35天）');
            return data;
        } catch (e) {
            console.error('CoffeeIQ: 数据加载失败', e);
            throw e;
        }
    }

    // ============ 懒加载 SHAP ============
    // 带加载中锁 + Promise 缓存 + 错误重试，避免并发重复请求
    function loadShap(retryCount) {
        retryCount = retryCount || 0;
        if (shapLoaded) return Promise.resolve(data.shapContributions);
        if (shapLoading && shapLoadPromise) return shapLoadPromise;

        shapLoading = true;
        shapLoadPromise = _doLoadShap(retryCount)
            .then(function(rows) {
                data.shapContributions = rows;
                buildShapIndex();
                shapLoaded = true;
                shapLoading = false;
                console.log('CoffeeIQ: SHAP 加载完成，共 ' + rows.length + ' 条');
                // 通知页面更新加载状态
                if (typeof CustomEvent !== 'undefined') {
                    document.dispatchEvent(new CustomEvent('coffeeiq:shap-loaded', { detail: { count: rows.length } }));
                }
                return rows;
            })
            .catch(function(e) {
                shapLoading = false;
                shapLoadPromise = null;
                console.error('CoffeeIQ: SHAP 加载失败（第 ' + (retryCount + 1) + ' 次）', e);
                throw e;
            });
        return shapLoadPromise;
    }

    async function _doLoadShap(retryCount) {
        console.log('CoffeeIQ: 正在加载 SHAP 贡献（下钻专用预聚合子集，第 ' + (retryCount + 1) + ' 次尝试）...');
        if (typeof CustomEvent !== 'undefined') {
            document.dispatchEvent(new CustomEvent('coffeeiq:shap-loading', { detail: { stage: 'fetching', attempt: retryCount + 1 } }));
        }
        try {
            // 预生成子集：仅含下钻可选范围（35天 × 3门店 × 前5商品 = 525个预测）的全部53特征贡献，
            // 27825行 / 约4.6MB，替代运行时下载解析77MB全量（445200行）
            const response = await fetch('data/shap_drill.csv');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const text = await response.text();
            if (typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent('coffeeiq:shap-loading', { detail: { stage: 'parsing', attempt: retryCount + 1 } }));
            }
            const rows = parseCSV(text);
            return rows;
        } catch (e) {
            if (retryCount < 2) {
                // 最多重试 2 次，间隔递增
                await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
                return _doLoadShap(retryCount + 1);
            }
            throw e;
        }
    }

    function buildShapIndex() {
        const idx = {};
        data.shapContributions.forEach(row => {
            const pid = row.prediction_id;
            if (!idx[pid]) idx[pid] = [];
            idx[pid].push(row);
        });
        data.shapIndex = idx;
    }

    // ============ 懒加载情景模拟 ============
    function loadScenarios(retryCount) {
        retryCount = retryCount || 0;
        if (scenarioLoaded) return Promise.resolve(data.scenarioResults);
        if (scenarioLoading && scenarioLoadPromise) return scenarioLoadPromise;

        scenarioLoading = true;
        scenarioLoadPromise = _doLoadScenarios(retryCount)
            .then(function(rows) {
                data.scenarioResults = rows;
                buildScenarioIndex();
                scenarioLoaded = true;
                scenarioLoading = false;
                console.log('CoffeeIQ: 情景模拟加载完成，共 ' + rows.length + ' 条');
                if (typeof CustomEvent !== 'undefined') {
                    document.dispatchEvent(new CustomEvent('coffeeiq:scenario-loaded', { detail: { count: rows.length } }));
                }
                return rows;
            })
            .catch(function(e) {
                scenarioLoading = false;
                scenarioLoadPromise = null;
                console.error('CoffeeIQ: 情景模拟加载失败（第 ' + (retryCount + 1) + ' 次）', e);
                throw e;
            });
        return scenarioLoadPromise;
    }

    async function _doLoadScenarios(retryCount) {
        console.log('CoffeeIQ: 正在加载情景模拟结果（226800 条，第 ' + (retryCount + 1) + ' 次尝试）...');
        if (typeof CustomEvent !== 'undefined') {
            document.dispatchEvent(new CustomEvent('coffeeiq:scenario-loading', { detail: { stage: 'fetching', attempt: retryCount + 1 } }));
        }
        try {
            const response = await fetch('data/scenario_results.csv');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const text = await response.text();
            if (typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent('coffeeiq:scenario-loading', { detail: { stage: 'parsing', attempt: retryCount + 1 } }));
            }
            const rows = parseCSV(text);
            return rows;
        } catch (e) {
            if (retryCount < 2) {
                await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
                return _doLoadScenarios(retryCount + 1);
            }
            throw e;
        }
    }

    function buildScenarioIndex() {
        const idx = {};
        data.scenarioResults.forEach(row => {
            const pid = row.prediction_id;
            if (!idx[pid]) idx[pid] = [];
            idx[pid].push(row);
        });
        data.scenarioIndex = idx;
    }

    // ============ 概览数据计算 ============
    function computeSummary() {
        const totalQty = data.dailyTotal.reduce((sum, d) => sum + d.qty, 0);
        const totalRevenue = data.dailyTotal.reduce((sum, d) => sum + d.revenue, 0);

        const stores = [...new Set(data.dailyStore.map(d => d.store_location))];

        const categories = [...new Set(data.categoryStore.map(d => d.product_category))];
        data.categories = categories.sort((a, b) => {
            const aQty = data.categoryStore.filter(c => c.product_category === a).reduce((s, c) => s + c.qty, 0);
            const bQty = data.categoryStore.filter(c => c.product_category === b).reduce((s, c) => s + c.qty, 0);
            return bQty - aQty;
        });

        const productTypes = [...new Set(data.skuList.map(s => s.product_type))];
        data.productTypes = productTypes;

        const skuCount = data.skuList.length;

        // 从 dashboard.hierarchy 构建 product_id → 中文名映射
        // 240 条 = 3店 × 80 SKU，同一 SKU 跨店中文名必须一致
        const skuZhMap = {};
        const skuLabelMap = {};
        const skuConsistencyIssues = [];
        if (data.dashboard && data.dashboard.hierarchy) {
            data.dashboard.hierarchy.forEach(h => {
                const pid = String(h.sku);
                const zh = (h.product_name_zh || '').trim();
                const label = (h.product_label || '').trim();
                if (skuZhMap[pid] !== undefined) {
                    // 同名 SKU 跨店一致性校验
                    if (skuZhMap[pid] !== zh) {
                        skuConsistencyIssues.push(pid);
                    }
                } else if (zh) {
                    skuZhMap[pid] = zh;
                    skuLabelMap[pid] = label || zh;
                }
            });
        }
        data.skuZhMap = skuZhMap;
        data.skuZhMapped = Object.keys(skuZhMap).length;
        data.skuZhConsistencyIssues = skuConsistencyIssues.length;

        // 从 quality_report 中取 overall 层 lightgbm 指标
        const overallRows = data.qualityReport.filter(
            r => r.level === 'overall' && r.entity_id === 'all'
        );
        const modelRow = overallRows.find(r => r.method === 'lightgbm') || {};

        // 回测期日期
        const forecastDates = [...new Set(data.skuForecast.map(d => d.date))].sort();

        data.summary = {
            totalQty,
            totalRevenue,
            storeCount: stores.length,
            stores,
            categoryCount: categories.length,
            productTypeCount: productTypes.length,
            skuCount,
            dayCount: data.dailyTotal.length,
            dateRange: {
                start: data.dailyTotal[0].date,
                end: data.dailyTotal[data.dailyTotal.length - 1].date
            },
            // 新模型测试期指标（来自 quality_report，35天）
            backtest: {
                method: 'direct_tweedie_1_3_sparse',
                modelName: data.runContract.model_name,
                modelRunId: data.runContract.run_id,
                windowCount: data.runContract.backtest_window_count,
                horizonDays: data.runContract.forecast_horizon_days,
                validationStart: forecastDates[0],
                validationEnd: forecastDates[forecastDates.length - 1],
                validationDays: forecastDates.length,
                sampleCount: data.skuForecast.length,
                mae: +modelRow.mae || 0,
                rmse: +modelRow.rmse || 0,
                wape: +modelRow.wape * 100 || 0,
                r2: +modelRow.r2 || 0,
                within10pct: +modelRow.within_10pct * 100 || 0,
                within20pct: +modelRow.within_20pct * 100 || 0,
                intervalCoverage: +modelRow.interval_coverage * 100 || 0,
                intervalMeanWidth: +modelRow.interval_mean_width || 0,
                directionAccuracy: +modelRow.change_direction_accuracy * 100 || 0,
                dates: forecastDates
            },
            // 各分层指标（从 quality_report 读取）
            metricsByLevel: buildLevelMetrics()
        };
    }

    // 从 quality_report 构建分层指标字典
    function buildLevelMetrics() {
        const result = {};
        const lightgbmRows = data.qualityReport.filter(r => r.method === 'lightgbm');
        lightgbmRows.forEach(r => {
            const key = r.level;
            if (!result[key]) result[key] = [];
            result[key].push({
                entity_id: r.entity_id,
                entity_name: r.entity_name,
                sample_count: +r.sample_count,
                mae: +r.mae,
                rmse: +r.rmse,
                wape: +r.wape * 100,
                r2: +r.r2,
                within10pct: +r.within_10pct * 100,
                within20pct: +r.within_20pct * 100,
                interval_coverage: +r.interval_coverage * 100,
                interval_mean_width: +r.interval_mean_width,
                direction_accuracy: +r.change_direction_accuracy * 100,
                validation_start: r.validation_start,
                validation_end: r.validation_end,
                candidate_eligible: r.candidate_eligible
            });
        });
        return result;
    }

    // ============ 工具函数 ============
    function groupBySum(arr, keyFn, valueFn) {
        const map = {};
        arr.forEach(d => {
            const k = keyFn(d);
            const v = valueFn ? valueFn(d) : { actual: d.qty, predicted: d.pred_lightgbm };
            if (!map[k]) { map[k] = { ...v }; }
            else {
                for (const key in v) {
                    map[k][key] = (map[k][key] || 0) + v[key];
                }
            }
        });
        return Object.values(map);
    }

    // 计算一组 {actual, predicted} 的指标
    function calcMetrics(items) {
        const n = items.length;
        if (n < 2) return { r2: 0, mae: 0, wape: 0, hit10: 0, hit20: 0, n };

        let sumActual = 0, sumAbsErr = 0, hit10 = 0, hit20 = 0;
        items.forEach(d => { sumActual += d.actual; });
        const meanActual = sumActual / n;

        let ssTot = 0, ssRes = 0;
        items.forEach(d => {
            const actual = d.actual;
            const pred = d.predicted;
            ssTot += Math.pow(actual - meanActual, 2);
            ssRes += Math.pow(actual - pred, 2);
            const absErr = Math.abs(actual - pred);
            sumAbsErr += absErr;
            const ratio = absErr / (actual + 1);
            if (ratio < 0.1) hit10++;
            if (ratio < 0.2) hit20++;
        });

        return {
            r2: ssTot > 0 ? 1 - (ssRes / ssTot) : 0,
            mae: sumAbsErr / n,
            wape: sumActual > 0 ? sumAbsErr / sumActual * 100 : 0,
            hit10: hit10 / n * 100,
            hit20: hit20 / n * 100,
            n
        };
    }

    // ============ 历史数据查询 ============
    function getStoreDailyData(storeName) {
        if (storeName === 'all') {
            const byDate = {};
            data.dailyStore.forEach(d => {
                if (!byDate[d.date]) byDate[d.date] = { qty: 0, revenue: 0, transactions: 0 };
                byDate[d.date].qty += d.qty;
                byDate[d.date].revenue += d.revenue;
                byDate[d.date].transactions += d.transactions;
            });
            return Object.entries(byDate).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
        }
        return data.dailyStore.filter(d => d.store_location === storeName).sort((a, b) => a.date.localeCompare(b.date));
    }

    function getCategoryData(storeName) {
        if (storeName === 'all') {
            const byCat = {};
            data.categoryStore.forEach(d => {
                if (!byCat[d.product_category]) byCat[d.product_category] = { qty: 0, revenue: 0 };
                byCat[d.product_category].qty += d.qty;
                byCat[d.product_category].revenue += d.revenue;
            });
            return Object.entries(byCat).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.qty - a.qty);
        }
        return data.categoryStore.filter(d => d.store_location === storeName)
            .map(d => ({ category: d.product_category, qty: d.qty, revenue: d.revenue }))
            .sort((a, b) => b.qty - a.qty);
    }

    function getHourlyData(storeName) {
        if (storeName === 'all') {
            const byHour = {};
            data.hourly.forEach(d => {
                if (!byHour[d.hour]) byHour[d.hour] = 0;
                byHour[d.hour] += d.qty;
            });
            return Object.entries(byHour).map(([hour, qty]) => ({ hour: parseInt(hour), qty })).sort((a, b) => a.hour - b.hour);
        }
        return data.hourly.filter(d => d.store_location === storeName)
            .map(d => ({ hour: d.hour, qty: d.qty }))
            .sort((a, b) => a.hour - b.hour);
    }

    // ============ 预测数据查询 ============

    // 按门店/品类/SKU过滤 skuForecast，按日聚合
    // 返回 { dates, actuals, predictions, p10, p50, p90, levelLabel, sampleCount, sparseCount }
    function getForecastSeries(storeName, category, skuId) {
        const sf = data.skuForecast;
        if (!sf || sf.length === 0) return emptyForecastResult();

        let filtered = sf;
        const parts = [];
        let sparseCount = 0;

        // 门店过滤
        if (storeName && storeName !== 'all') {
            filtered = filtered.filter(d => d.store_name === storeName);
            parts.push(getStoreDisplayName(storeName));
        } else {
            parts.push('全部门店');
        }

        // SKU过滤（最细粒度）
        if (skuId && skuId !== 'all') {
            filtered = filtered.filter(d => d.product_id == skuId);
            const sku = data.skuList.find(s => s.product_id == skuId);
            parts.push(getSkuDisplayName(sku ? sku.product_detail : '', sku ? sku.product_id : ''));
        } else if (category && category !== 'all') {
            filtered = filtered.filter(d => d.category === category);
            parts.push(getCategoryDisplayName(category));
        } else {
            parts.push('全部品类');
        }

        if (filtered.length === 0) return emptyForecastResult(parts.join(' · '));

        sparseCount = filtered.filter(d => d.is_sparse === 1 || d.is_sparse === '1' || d.is_sparse === true).length;

        // 判断是否为多 SKU 聚合（单门店 × 单 SKU = 非聚合，其余都是聚合）
        const uniqueStores = new Set(filtered.map(d => d.store_name));
        const uniqueSkus = new Set(filtered.map(d => d.product_id));
        const isAggregate = !(uniqueStores.size === 1 && uniqueSkus.size === 1);
        const comboCount = uniqueStores.size * uniqueSkus.size;

        // 按日期聚合
        const byDate = {};
        const datesSet = new Set();
        filtered.forEach(d => {
            const dt = d.date;
            datesSet.add(dt);
            if (!byDate[dt]) {
                byDate[dt] = { actual: 0, pred: 0, p10: 0, p50: 0, p90: 0 };
            }
            byDate[dt].actual += d.qty;
            byDate[dt].pred += d.pred_lightgbm;
            byDate[dt].p10 += d.pred_p10;
            byDate[dt].p50 += d.pred_p50;
            byDate[dt].p90 += d.pred_p90;
        });

        const dates = [...datesSet].sort();
        const actuals = dates.map(d => byDate[d].actual);
        const predictions = dates.map(d => byDate[d].pred);
        const p10 = dates.map(d => byDate[d].p10);
        const p50 = dates.map(d => byDate[d].p50);
        const p90 = dates.map(d => byDate[d].p90);

        return {
            dates,
            actuals,
            predictions,
            p10, p50, p90,
            levelLabel: parts.join(' · '),
            sampleCount: filtered.length,
            sparseCount,
            isAggregate,
            comboCount,
            storeCount: uniqueStores.size,
            skuCount: uniqueSkus.size
        };
    }

    function emptyForecastResult(label) {
        return {
            dates: [], actuals: [], predictions: [], p10: [], p50: [], p90: [],
            levelLabel: label || '', sampleCount: 0, sparseCount: 0,
            isAggregate: false, comboCount: 0, storeCount: 0, skuCount: 0
        };
    }

    // 从日序列计算指标
    function calcForecastMetrics(dates, actuals, predictions) {
        const n = dates.length;
        if (n < 1) return { mae: 0, wape: 0, hit20: 0, hit10: 0, r2: 0, n: 0 };

        let sumAbsErr = 0, sumActual = 0, hit20 = 0, hit10 = 0;
        for (let i = 0; i < n; i++) {
            const a = actuals[i];
            const p = predictions[i];
            const absErr = Math.abs(a - p);
            sumAbsErr += absErr;
            sumActual += a;
            const ratio = absErr / (a + 1);
            if (ratio < 0.1) hit10++;
            if (ratio < 0.2) hit20++;
        }

        let r2 = 0;
        if (n >= 2) {
            const meanActual = sumActual / n;
            let ssTot = 0, ssRes = 0;
            for (let i = 0; i < n; i++) {
                ssTot += Math.pow(actuals[i] - meanActual, 2);
                ssRes += Math.pow(actuals[i] - predictions[i], 2);
            }
            r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
        }

        return {
            mae: sumAbsErr / n,
            wape: sumActual > 0 ? sumAbsErr / sumActual * 100 : 0,
            hit20: hit20 / n * 100,
            hit10: hit10 / n * 100,
            r2,
            n
        };
    }

    // —— 预测数据导出（含分位数）——
    // 返回按日聚合的完整序列：日期、实际销量、点预测、P10、P50、P90
    // 与图表展示的数据完全一致，用于导出或外部对接
    function getForecastExport(storeName, category, skuId) {
        const s = getForecastSeries(storeName, category, skuId);
        if (s.dates.length === 0) return { rows: [], meta: {} };

        const rows = s.dates.map((d, i) => ({
            date: d,
            actual: +s.actuals[i].toFixed(4),
            pred_point: +s.predictions[i].toFixed(4),
            pred_p10: +s.p10[i].toFixed(4),
            pred_p50: +s.p50[i].toFixed(4),
            pred_p90: +s.p90[i].toFixed(4)
        }));

        return {
            rows,
            meta: {
                levelLabel: s.levelLabel,
                storeCount: s.storeCount,
                skuCount: s.skuCount,
                comboCount: s.comboCount,
                days: s.dates.length,
                isAggregate: s.isAggregate,
                aggregationNote: s.isAggregate
                    ? '分项分位预测求和，作为组合需求区间近似'
                    : '单门店 × 单商品，分位值为直接预测结果'
            }
        };
    }

    // 聚合口径说明文本：用于图表下方或 tooltip 展示
    function getAggregationNote(storeName, category, skuId) {
        const s = getForecastSeries(storeName, category, skuId);
        if (s.dates.length === 0) return '';
        if (!s.isAggregate) return ''; // 单店×单商品无需提示
        return `聚合区间：${s.storeCount}家门店 × ${s.skuCount}个商品（共${s.comboCount}个组合）。分项分位预测求和，作为组合需求区间近似。`;
    }

    // 获取SKU预测汇总（测试期各SKU指标）
    function getSkuForecastByStore(storeName) {
        // 从 quality_report 中取 sku 级 lightgbm 结果
        const rows = data.qualityReport.filter(r => r.level === 'sku' && r.method === 'lightgbm');
        if (storeName === 'all') return rows;
        // sku 级 entity_name 含门店信息，简单过滤
        return rows.filter(r => {
            const h = data.dashboard.hierarchy.find(h => h.sku == r.entity_id);
            return h && h.store === storeName;
        });
    }

    // ============ 天气数据 ============
    function getWeatherForDates(startDate, endDate) {
        return data.weatherSlim.filter(d => d.date >= startDate && d.date <= endDate);
    }

    function getBacktestWeather() {
        const dates = data.summary.backtest.dates;
        return data.weatherSlim.filter(d => dates.includes(d.date));
    }

    function getFullDateRange() {
        const start = data.dailyTotal[0].date;
        const end = data.dailyTotal[data.dailyTotal.length - 1].date;
        const dates = [];
        let d = new Date(start);
        const last = new Date(end);
        while (d <= last) {
            dates.push(d.toISOString().slice(0, 10));
            d.setDate(d.getDate() + 1);
        }
        return dates;
    }

    function getCategoryDailyByStore(storeName) {
        const allDates = getFullDateRange();
        const dateSet = {};
        allDates.forEach(d => { dateSet[d] = {}; });

        const rows = storeName === 'all'
            ? data.categoryStoreDaily
            : data.categoryStoreDaily.filter(d => d.store_location === storeName);

        rows.forEach(r => {
            if (!dateSet[r.date]) dateSet[r.date] = {};
            if (!dateSet[r.date][r.product_category]) dateSet[r.date][r.product_category] = 0;
            dateSet[r.date][r.product_category] += r.qty;
        });

        const categories = [...new Set(rows.map(r => r.product_category))];
        const series = {};
        categories.forEach(c => { series[c] = allDates.map(d => dateSet[d][c] || 0); });

        return { dates: allDates, categories, series, n: allDates.length };
    }

    // ============ 质量报告查询 ============

    // 获取指定层级、方法、实体的质量行
    function getQualityRows(level, method, entityId) {
        return data.qualityReport.filter(r =>
            r.level === level &&
            r.method === method &&
            (!entityId || r.entity_id === entityId)
        );
    }

    // 获取所有方法在 overall 级的对比
    function getOverallBaselineComparison() {
        return data.qualityReport
            .filter(r => r.level === 'overall' && r.entity_id === 'all')
            .map(r => ({
                method: r.method,
                methodLabel: getMethodLabel(r.method),
                mae: +r.mae,
                rmse: +r.rmse,
                wape: +r.wape * 100,
                r2: +r.r2,
                within10pct: +r.within_10pct * 100,
                within20pct: +r.within_20pct * 100,
                directionAccuracy: +r.change_direction_accuracy * 100,
                sampleCount: +r.sample_count
            }));
    }

    // 获取各窗口指标（lightgbm）
    function getWindowMetrics() {
        return data.qualityReport
            .filter(r => r.level === 'window' && r.method === 'lightgbm')
            .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
            .map(r => ({
                windowStart: r.entity_id,
                windowLabel: r.entity_name,
                mae: +r.mae,
                rmse: +r.rmse,
                wape: +r.wape * 100,
                r2: +r.r2,
                sampleCount: +r.sample_count
            }));
    }

    // 方法名中文标签
    function getMethodLabel(method) {
        const map = {
            'lightgbm': '直接多步Tweedie稀疏模型（当前）',
            'baseline_yesterday': '昨日基线',
            'baseline_last_week': '上周同日基线',
            'baseline_rolling_28d': '28日滚动均值基线'
        };
        return map[method] || method;
    }

    // ============ SHAP 查询（需先 loadShap） ============
    function getShapForPrediction(predictionId) {
        if (!data.shapIndex) return [];
        return data.shapIndex[predictionId] || [];
    }

    // 获取某 prediction_id 的 top-K 正负贡献
    function getTopShapContributions(predictionId, topK) {
        topK = topK || 8;
        const contribs = getShapForPrediction(predictionId);
        if (contribs.length === 0) return { positive: [], negative: [], baseValue: 0, shapSum: 0 };

        const baseValue = +contribs[0].base_value;
        const shapSum = +contribs[0].shap_sum;

        const sorted = [...contribs].sort((a, b) => Math.abs(b.shap_contribution) - Math.abs(a.shap_contribution));
        const positive = sorted.filter(c => +c.shap_contribution > 0).slice(0, topK);
        const negative = sorted.filter(c => +c.shap_contribution < 0).slice(0, topK);

        return { positive, negative, baseValue, shapSum, total: contribs.length };
    }

    // 从日期/门店/sku查找 prediction_id
    function findPredictionId(date, storeId, skuId) {
        const row = data.skuForecast.find(d =>
            d.date === date &&
            (d.store_id == storeId || d.store_name === storeId) &&
            d.product_id == skuId
        );
        return row ? row.prediction_id : null;
    }

    // ============ 情景模拟查询（需先 loadScenarios） ============
    function getScenariosForPrediction(predictionId) {
        if (!data.scenarioIndex) return [];
        return data.scenarioIndex[predictionId] || [];
    }

    function getScenarioContract() {
        return data.dashboard.scenario_contract;
    }

    // ============ 稀疏标签信息 ============
    function getSparseInfo(storeId, skuId) {
        const row = data.skuForecast.find(d =>
            d.store_id == storeId && d.product_id == skuId
        );
        if (!row) return null;
        return {
            is_sparse: row.is_sparse === 1 || row.is_sparse === '1' || row.is_sparse === true,
            zero_rate: +row.zero_rate,
            adi: +row.adi,
            mean_qty: +row.mean_qty
        };
    }

    // ============ Pearson 相关系数 ============
    function pearson(x, y) {
        const n = x.length;
        if (n < 3) return null;
        let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) {
            sx += x[i]; sy += y[i]; sxy += x[i] * y[i];
            sxx += x[i] * x[i]; syy += y[i] * y[i];
        }
        const vx = n * sxx - sx * sx;
        const vy = n * syy - sy * sy;
        if (vx <= 0 || vy <= 0) return null;
        const den = Math.sqrt(vx * vy);
        if (den === 0) return null;
        return (n * sxy - sx * sy) / den;
    }

    // ============ 中文显示映射 ============
    var STORE_ZH = {
        'Lower Manhattan': '曼哈顿下城店',
        "Hell's Kitchen": '地狱厨房店',
        'Astoria': '阿斯托利亚店'
    };

    var CATEGORY_ZH = {
        'Coffee': '咖啡',
        'Tea': '现制茶饮',
        'Coffee beans': '咖啡豆',
        'Loose Tea': '散装茶叶',
        'Drinking Chocolate': '现制热巧克力',
        'Packaged Chocolate': '包装巧克力',
        'Bakery': '烘焙点心',
        'Flavours': '风味糖浆',
        'Branded': '品牌周边'
    };

    var TYPE_ZH = {
        'Barista Espresso': '意式浓缩咖啡',
        'Brewed Chai tea': '现冲印度奶茶',
        'Gourmet brewed coffee': '精品现冲咖啡',
        'Hot chocolate': '热巧克力',
        'Brewed Black tea': '现冲红茶',
        'Brewed herbal tea': '现冲花草茶',
        'Scone': '司康饼',
        'Cookie ': '曲奇',
        'Biscotti': '意式脆饼',
        'Pastry': '酥皮点心',
        'Organic Beans': '有机咖啡豆',
        'House blend Beans': '招牌拼配咖啡豆',
        'Drip coffee': '滴滤咖啡',
        'Sugar free syrup': '无糖糖浆',
        'Regular syrup': '常规糖浆',
        'Bottled water': '瓶装水',
        'Smoothies': '思慕雪',
        'Coffee Glass': '咖啡玻璃杯',
        'Coffee mug ': '咖啡马克杯',
        'Fancy coffee drinks': '精品特调',
        'Premium Beans': '精品咖啡豆',
        'Chai tea': '印度奶茶',
        'Brewed Green tea': '现冲绿茶',
        'Green tea': '绿茶',
        'Black tea': '红茶',
        'Herbal tea': '花草茶',
        'Iced coffee': '冰咖啡',
        'Espresso shot': '浓缩咖啡份',
        'Cortado': '短笛拿铁'
    };

    function getStoreDisplayName(name) { return STORE_ZH[name] || name; }
    function getCategoryDisplayName(name) { return CATEGORY_ZH[name] || name; }
    function getProductTypeDisplayName(name) { return TYPE_ZH[name] || name; }

    // 本地化补充映射：集中式覆盖 product_name_zh 中尚未中文化的商品
    // 只影响用户可见显示名，不修改原始 product_id、英文原名、预测数据或筛选键
    const SKU_ZH_LOCAL = {
        '78': '苏格兰奶油司康',
        '81': '咖啡豆主题T恤'
    };

    function getSkuDisplayName(detail, id) {
        // 显示名优先级：本地化补充映射 > dashboard.hierarchy.product_name_zh > 占位
        // 主显示只显示中文，不带英文括号和SKU编号
        const pid = String(id);
        if (SKU_ZH_LOCAL[pid]) {
            return SKU_ZH_LOCAL[pid];
        }
        if (data.skuZhMap && data.skuZhMap[pid]) {
            return data.skuZhMap[pid];
        }
        // 无映射时回退顺序：product_label 的中文部分 → 明确占位
        // 注意：这里不应返回英文或SKU编号，避免误导用户
        return '商品名称待补充';
    }

    function getSkuEnglishName(detail, id) {
        // 仅用于内部审计、非默认 tooltip 等需要英文原名的场景
        if (!detail) return '';
        return detail;
    }

    function getSkuTooltip(sku) {
        // tooltip 中可显示英文原名作为辅助说明
        const zhName = getSkuDisplayName(sku.product_detail, sku.product_id);
        const enName = getSkuEnglishName(sku.product_detail, sku.product_id);
        const catName = getCategoryDisplayName(sku.product_category || sku.category);
        const typeName = getProductTypeDisplayName(sku.product_type || sku.type);
        let tooltip = zhName;
        if (enName && enName !== zhName) tooltip += '\n' + enName;
        tooltip += '\n品类：' + catName + '\n类型：' + typeName;
        return tooltip;
    }

    function getStoreShortName(name) {
        const map = {
            'Lower Manhattan': '曼哈顿',
            "Hell's Kitchen": '厨房',
            'Astoria': '阿斯托'
        };
        return map[name] || name;
    }

    function getCategoryShortName(name) {
        const zh = getCategoryDisplayName(name);
        return zh.slice(0, 4);
    }

    // 中文覆盖率统计
    function getChineseCoverageStats() {
        const totalCats = data.categories.length;
        const zhCats = data.categories.filter(c => CATEGORY_ZH[c]).length;

        const totalTypes = data.productTypes.length;
        const zhTypes = data.productTypes.filter(t => TYPE_ZH[t]).length;

        return {
            categories: { total: totalCats, withChinese: zhCats, coverage: (zhCats / totalCats * 100).toFixed(1) + '%' },
            productTypes: { total: totalTypes, withChinese: zhTypes, coverage: (zhTypes / totalTypes * 100).toFixed(1) + '%' },
            skus: {
                total: data.skuList.length,
                withChinese: data.skuZhMapped || 0,
                coverage: data.skuList.length > 0 ? ((data.skuZhMapped || 0) / data.skuList.length * 100).toFixed(1) + '%' : '0%',
                consistencyIssues: data.skuZhConsistencyIssues || 0,
                source: 'dashboard.hierarchy.product_name_zh',
                note: data.skuZhMapped === data.skuList.length && (data.skuZhConsistencyIssues || 0) === 0
                    ? '80/80 全覆盖，跨店一致'
                    : '覆盖率不足或存在跨店不一致'
            }
        };
    }

    return {
        init,
        loadShap,
        loadScenarios,
        getData: () => data,
        isLoaded: () => loaded,
        isShapLoaded: () => shapLoaded,
        isShapLoading: () => shapLoading,
        isScenarioLoaded: () => scenarioLoaded,
        isScenarioLoading: () => scenarioLoading,

        // 历史数据
        getStoreDailyData,
        getCategoryData,
        getHourlyData,
        getWeatherForDates,
        getBacktestWeather,
        getFullDateRange,
        getCategoryDailyByStore,

        // 预测数据
        getForecastSeries,
        calcForecastMetrics,
        calcMetrics,
        getSkuForecastByStore,
        getSparseInfo,
        findPredictionId,
        getForecastExport,
        getAggregationNote,

        // 质量报告
        getQualityRows,
        getOverallBaselineComparison,
        getWindowMetrics,
        getMethodLabel,

        // SHAP
        getShapForPrediction,
        getTopShapContributions,

        // 情景模拟
        getScenariosForPrediction,
        getScenarioContract,

        // 工具
        pearson,

        // 中文显示
        getStoreDisplayName,
        getCategoryDisplayName,
        getProductTypeDisplayName,
        getSkuDisplayName,
        getSkuEnglishName,
        getSkuTooltip,
        getStoreShortName,
        getCategoryShortName,
        getChineseCoverageStats,
    };
})();
