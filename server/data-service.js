/**
 * CoffeeIQ 数据服务层
 * 复用前端 data/ 下的真实 CSV / JSON，为 REST API 与 MCP 工具提供统一查询能力。
 *
 * 加载策略：
 *   - 启动即载：dashboard.json、sku_forecast(8400)、quality_report、各聚合小表
 *   - 懒加载：  scenario_results(22.7万行) / shap_drill(2.8万行)，首次调用时读取并建索引
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------- CSV ----------
function parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out;
}

function toTyped(v) {
    const s = (v ?? '').trim();
    if (s === '') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    const n = Number(s);
    return s !== '' && !Number.isNaN(n) ? n : s;
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        if (vals.length !== headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = toTyped(vals[idx]); });
        rows.push(row);
    }
    return rows;
}

function readCSV(name) {
    return parseCSV(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

// ---------- 状态 ----------
const state = {
    ready: false,
    dashboard: null,
    skuForecast: [],
    quality: [],
    skuList: [],
    dailyStore: [],
    dailyTotal: [],
    categoryStoreDaily: [],
    weather: [],
    // 懒加载
    _scenarioByPid: null,
    _scenarioLoading: null,
    _shapByPid: null,
    _shapLoading: null,
};

// 预测明细按 (store|date|product) 建轻索引，加速工具查询
const idx = {
    byStore: new Map(),     // store_name -> rows
    byProduct: new Map(),   // product_id -> rows
    forecastDates: [],
};

function init() {
    if (state.ready) return state;
    state.dashboard = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dashboard.json'), 'utf8'));
    state.skuForecast = readCSV('sku_forecast.csv');
    state.quality = readCSV('quality_report.csv');
    state.skuList = readCSV('agg_sku_list.csv');
    state.dailyStore = readCSV('agg_daily_store.csv');
    state.dailyTotal = readCSV('agg_daily_total.csv');
    state.categoryStoreDaily = readCSV('agg_category_store_daily.csv');
    state.weather = readCSV('agg_weather_slim.csv');

    for (const r of state.skuForecast) {
        if (!idx.byStore.has(r.store_name)) idx.byStore.set(r.store_name, []);
        idx.byStore.get(r.store_name).push(r);
        if (!idx.byProduct.has(r.product_id)) idx.byProduct.set(r.product_id, []);
        idx.byProduct.get(r.product_id).push(r);
    }
    idx.forecastDates = [...new Set(state.skuForecast.map(r => r.date))].sort();

    state.ready = true;
    return state;
}

// ---------- 懒加载：情景模拟 ----------
async function loadScenarioIndex() {
    if (state._scenarioByPid) return state._scenarioByPid;
    if (state._scenarioLoading) return state._scenarioLoading;
    state._scenarioLoading = new Promise((resolve, reject) => {
        try {
            const rows = readCSV('scenario_results.csv');
            const map = new Map();
            for (const r of rows) {
                if (!map.has(r.prediction_id)) map.set(r.prediction_id, []);
                map.get(r.prediction_id).push({
                    scenario_index: r.scenario_index,
                    temperature_id: r.temperature_id,
                    rain_id: r.rain_id,
                    holiday_id: r.holiday_id,
                    temperature_2m_mean: r.temperature_2m_mean,
                    precipitation_sum: r.precipitation_sum,
                    is_holiday_detailed: r.is_holiday_detailed,
                    is_long_weekend: r.is_long_weekend,
                    simulated_prediction: r.simulated_prediction,
                });
            }
            state._scenarioByPid = map;
            resolve(map);
        } catch (e) { reject(e); }
    });
    return state._scenarioLoading;
}

// ---------- 懒加载：SHAP ----------
async function loadShapIndex() {
    if (state._shapByPid) return state._shapByPid;
    if (state._shapLoading) return state._shapLoading;
    state._shapLoading = new Promise((resolve, reject) => {
        try {
            const rows = readCSV('shap_drill.csv');
            const map = new Map();
            for (const r of rows) {
                if (!map.has(r.prediction_id)) map.set(r.prediction_id, []);
                map.get(r.prediction_id).push(r);
            }
            state._shapByPid = map;
            resolve(map);
        } catch (e) { reject(e); }
    });
    return state._shapLoading;
}

// ---------- 工具函数 ----------
function round(v, n = 2) {
    return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(n)) : v;
}
function inDateRange(date, from, to) {
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}
function clampLimit(v, max = 200, def = 50) {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) return def;
    return Math.min(n, max);
}

// ---------- 领域查询 ----------
function getOverview() {
    const d = state.dashboard;
    return {
        platform: 'CoffeeIQ · 门店销量预测智能平台',
        model_run_id: d.metadata.model_run_id,
        model_name: d.metadata.model_name,
        candidate_status: d.metadata.candidate_status,
        generated_at: d.metadata.generated_at,
        validation_window: { start: d.metadata.validation_start, end: d.metadata.validation_end, days: d.metadata.validation_days, backtest_windows: d.metadata.backtest_windows },
        sample_count: d.metadata.sample_count,
        feature_count: d.metadata.feature_count,
        overall_metrics: d.metrics,
        stores: d.labels.stores,
        categories: d.labels.categories,
        forecast_date_range: { start: idx.forecastDates[0], end: idx.forecastDates[idx.forecastDates.length - 1], days: idx.forecastDates.length },
        limitations: d.metadata.limitations,
    };
}

function getDailyForecast({ date_from, date_to, store } = {}) {
    const d = state.dashboard;
    if (!store || store === 'all' || store === '__all__') {
        return d.daily_predictions
            .filter(r => inDateRange(r.date, date_from, date_to))
            .map(r => ({ date: r.date, actual: round(r.actual, 1), forecast: round(r.pred, 1), error: round(r.error, 1), abs_percent_error: round(r.actual ? Math.abs(r.error) / r.actual : null, 4) }));
    }
    const sp = d.store_predictions[store];
    if (!sp) throw new Error(`未知门店：${store}；可选：${d.labels.stores.join(' / ')}`);
    // store_predictions 为并行数组：{ dates:[], actual:[], pred:[] }
    return (sp.dates || [])
        .map((date, i) => ({ date, actual: round(sp.actual[i], 1), forecast: round(sp.pred[i], 1) }))
        .filter(r => inDateRange(r.date, date_from, date_to))
        .map(r => ({ ...r, error: round((r.actual ?? 0) - (r.forecast ?? 0), 1), abs_percent_error: round(r.actual ? Math.abs(r.actual - r.forecast) / r.actual : null, 4) }));
}

function getSkuForecast({ store, product_id, product_query, date, date_from, date_to, horizon_day, limit } = {}) {
    let rows = state.skuForecast;
    if (store) rows = rows.filter(r => r.store_name === store);
    if (product_id != null && product_id !== '') rows = rows.filter(r => r.product_id === Number(product_id));
    if (date) rows = rows.filter(r => r.date === date);
    if (date_from || date_to) rows = rows.filter(r => inDateRange(r.date, date_from, date_to));
    if (horizon_day != null && horizon_day !== '') rows = rows.filter(r => r.horizon_day === Number(horizon_day));
    if (product_query) {
        const q = String(product_query).toLowerCase();
        rows = rows.filter(r => {
            const sku = state.skuList.find(s => s.product_id === r.product_id);
            const name = sku ? `${sku.product_detail}` : '';
            return String(r.product_id) === q
                || (r.category || '').toLowerCase().includes(q)
                || (r.product_type || '').toLowerCase().includes(q)
                || name.toLowerCase().includes(q);
        });
    }
    const lim = clampLimit(limit, 500, 50);
    return rows.slice(0, lim).map(r => ({
        prediction_id: r.prediction_id,
        date: r.date,
        horizon_day: r.horizon_day,
        store: r.store_name,
        product_id: r.product_id,
        category: r.category,
        product_type: r.product_type,
        point_forecast: round(r.pred_lightgbm, 2),
        p10: round(r.pred_p10, 2),
        p50: round(r.pred_p50, 2),
        p90: round(r.pred_p90, 2),
        uncertainty_width: round((r.pred_p90 ?? 0) - (r.pred_p10 ?? 0), 2),
    }));
}

function getModelQuality({ level, entity_id, method, limit } = {}) {
    let rows = state.quality;
    if (level) rows = rows.filter(r => r.level === level);
    if (entity_id != null && entity_id !== '') rows = rows.filter(r => String(r.entity_id) === String(entity_id));
    if (method) rows = rows.filter(r => r.method === method);
    const lim = clampLimit(limit, 508, 100);
    return rows.slice(0, lim).map(r => ({
        level: r.level, entity_id: r.entity_id, entity_name: r.entity_name, method: r.method,
        sample_count: r.sample_count, mae: round(r.mae, 3), rmse: round(r.rmse, 3),
        wape_pct: round(r.wape, 2), r2: round(r.r2, 3),
        within_10pct: round(r.within_10pct, 2), within_20pct: round(r.within_20pct, 2),
        interval_coverage_pct: round(r.interval_coverage, 2),
        change_direction_accuracy: round(r.change_direction_accuracy, 3),
        candidate_eligible: r.candidate_eligible,
    }));
}

function getFeatureImportance({ limit } = {}) {
    const lim = clampLimit(limit, 53, 15);
    return state.dashboard.feature_importance.slice(0, lim).map(r => ({
        feature: r.feature, label: r.label, category: r.category, importance: round(r.importance, 4),
    }));
}

function getRestockRisks({ date, store, limit } = {}) {
    const rr = state.dashboard.risk_rankings;
    const dates = Object.keys(rr.by_date).sort();
    const targetDate = date || dates[dates.length - 1];
    const day = rr.by_date[targetDate];
    if (!day) throw new Error(`该日期无风险排名，可选范围 ${dates[0]} ~ ${dates[dates.length - 1]}`);
    const scopeKey = (!store || store === 'all') ? '__all__' : store;
    const arr = day[scopeKey];
    if (!arr) throw new Error(`该门店无风险数据：${store}`);
    const lim = clampLimit(limit, 50, 10);
    return {
        date: targetDate,
        metric: rr.metric, unit: rr.unit, scope_note: rr.scope_note,
        uses_actual_sales: rr.uses_actual_sales,
        items: arr.slice(0, lim).map(r => ({
            prediction_id: r.prediction_id, store: r.store, category: r.category, type: r.type,
            product_id: r.sku, product_name: r.product_name_zh || r.product_name,
            point_forecast: round(r.prediction, 2), p90: round(r.p90, 2),
            upside_gap_cups: round(r.upside_gap, 2), interval_width: round(r.interval_width, 2),
        })),
    };
}

function getWeather({ date_from, date_to, limit } = {}) {
    const lim = clampLimit(limit, 400, 30);
    return state.weather
        .filter(r => inDateRange(r.date, date_from, date_to))
        .slice(0, lim)
        .map(r => ({
            date: r.date, day_name: r.day_name, temp_mean_c: r.temperature_2m_mean,
            precipitation_mm: r.precipitation_sum, is_rain: !!r.is_rain, is_clear: !!r.is_clear,
            humidity_pct: r.relative_humidity_2m_mean, is_weekend: !!r.is_weekend,
            is_holiday: !!r.is_us_holiday, holiday_name: r.holiday_name || null,
        }));
}

function listProducts({ category, product_query, limit } = {}) {
    let rows = state.skuList;
    if (category) rows = rows.filter(r => r.product_category === category);
    if (product_query) {
        const q = String(product_query).toLowerCase();
        rows = rows.filter(r =>
            String(r.product_id).includes(q)
            || (r.product_detail || '').toLowerCase().includes(q)
            || (r.product_type || '').toLowerCase().includes(q)
            || (r.product_category || '').toLowerCase().includes(q));
    }
    const lim = clampLimit(limit, 240, 50);
    return rows.slice(0, lim).map(r => ({
        product_id: r.product_id, name: r.product_detail, type: r.product_type,
        category: r.product_category, total_qty_181d: r.total_qty,
        total_revenue_181d: round(r.total_revenue, 2), avg_price: round(r.avg_price, 2),
        avg_daily_qty: round(r.total_qty / 181, 2), days_sold: r.days_sold,
    }));
}

async function explainPrediction({ prediction_id, top_n } = {}) {
    if (!prediction_id) throw new Error('prediction_id 必填');
    const base = state.skuForecast.find(r => r.prediction_id === prediction_id);
    if (!base) throw new Error(`未找到 prediction_id：${prediction_id}`);
    const shapMap = await loadShapIndex();
    let contribs = shapMap.get(prediction_id) || [];
    const n = clampLimit(top_n, 53, 10);
    const top = [...contribs].sort((a, b) => Math.abs(b.shap_contribution) - Math.abs(a.shap_contribution)).slice(0, n);
    return {
        prediction_id,
        date: base.date, store: base.store_name, product_id: base.product_id,
        category: base.category, product_type: base.product_type,
        point_forecast: round(base.pred_lightgbm, 3),
        base_value: round(base.base_value, 3),
        top_drivers: top.map(c => ({
            feature: c.feature, feature_value: c.feature_value,
            shap_contribution: round(c.shap_contribution, 3),
            direction: c.direction,
        })),
        note: state.dashboard.shap_note,
    };
}

async function runScenario({ prediction_id, temperature, rain, holiday } = {}) {
    if (!prediction_id) throw new Error('prediction_id 必填');
    const base = state.skuForecast.find(r => r.prediction_id === prediction_id);
    if (!base) throw new Error(`未找到 prediction_id：${prediction_id}`);
    const map = await loadScenarioIndex();
    const rows = map.get(prediction_id);
    if (!rows || !rows.length) throw new Error('该预测不在情景模拟范围内（仅下钻可选范围：35天×3门店×前5商品）');
    const contract = state.dashboard.scenario_contract;
    const norm = v => (v == null || v === '' ? null : isNaN(Number(v)) ? String(v) : Number(v));
    const t = norm(temperature), rn = norm(rain), h = norm(holiday);
    const matched = rows.filter(r =>
        (t === null || r.temperature_id === t || r.temperature_2m_mean === t) &&
        (rn === null || r.rain_id === rn || r.precipitation_sum === rn) &&
        (h === null || r.holiday_id === h));
    const pool = matched.length ? matched : rows;
    // 取平均模拟预测（同条件组合通常唯一）
    const avg = pool.reduce((s, r) => s + (Number(r.simulated_prediction) || 0), 0) / pool.length;
    return {
        prediction_id,
        requested: {
            temperature_id: temperature ?? null, rain_id: rain ?? null, holiday_id: holiday ?? null,
        },
        matched_scenarios: matched.length,
        baseline_point_forecast: round(base.pred_lightgbm, 2),
        simulated_forecast: round(avg, 2),
        delta_cups: round(avg - base.pred_lightgbm, 2),
        delta_percent: round(base.pred_lightgbm ? (avg - base.pred_lightgbm) / base.pred_lightgbm : null, 4),
        scenario_example: pool[0] ? {
            temperature_c: pool[0].temperature_2m_mean, precipitation_mm: pool[0].precipitation_sum,
            is_holiday: !!pool[0].is_holiday_detailed, is_long_weekend: !!pool[0].is_long_weekend,
        } : null,
        available_options: {
            temperature: contract.temperature_options, rain: contract.rain_options, holiday: contract.holiday_options,
        },
        causal_note: contract.causal,
        fallback_used: !matched.length,
    };
}

export const DataService = {
    init,
    getOverview,
    getDailyForecast,
    getSkuForecast,
    getModelQuality,
    getFeatureImportance,
    getRestockRisks,
    getWeather,
    listProducts,
    explainPrediction,
    runScenario,
};
