/**
 * CoffeeIQ MCP Server
 * 把销量预测平台的数据/模型能力以 MCP 工具形式开放给外部 AI Agent。
 * 传输：Streamable HTTP（无状态），由 Express 在 /mcp 挂载并做 Bearer 鉴权。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DataService } from './data-service.js';

const StoreEnum = z.enum(['Lower Manhattan', "Hell's Kitchen", 'Astoria']);

function text(result) {
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// 统一包裹：把领域异常转成 isError 的文本响应，避免传输层 500
function tool(fn) {
    return async (args) => {
        try {
            return text(await fn(args));
        } catch (e) {
            return { isError: true, content: [{ type: 'text', text: `错误：${e.message}` }] };
        }
    };
}

export function createMcpServer() {
    const server = new McpServer(
        { name: 'coffeeiq-demand-forecast', version: '1.0.0' },
        {
            capabilities: { tools: {} },
            instructions: 'CoffeeIQ 门店销量预测开放接口。可查询门店/SKU 销量预测、预测区间(P10/P90)、模型效果、特征重要性、备货风险、天气、单条预测归因(SHAP)与天气/节假日情景模拟。数据基于纽约 3 家咖啡店真实交易，预测窗口 35 天、5 个回测窗口。销量单位为“杯”。',
        }
    );

    // 1. 平台与模型概览
    server.tool(
        'get_platform_overview',
        '获取 CoffeeIQ 平台与预测模型概览：模型名称/运行ID、整体精度指标(MAE/RMSE/WAPE/R2/区间覆盖)、门店与品类清单、可用预测日期范围。任何任务开始时建议先调用一次以了解可用范围。',
        {},
        tool(() => DataService.getOverview())
    );

    // 2. 日级需求预测
    server.tool(
        'get_daily_demand_forecast',
        '查询日级总销量（或指定门店）的预测值与实际值、误差。可限定日期区间。',
        {
            store: StoreEnum.optional().describe('门店名；留空返回全门店汇总'),
            date_from: z.string().optional().describe('起始日期 YYYY-MM-DD'),
            date_to: z.string().optional().describe('结束日期 YYYY-MM-DD'),
        },
        tool(args => DataService.getDailyForecast(args))
    );

    // 3. SKU 需求预测
    server.tool(
        'get_sku_demand_forecast',
        '查询门店×SKU×日的销量点预测与 P10/P50/P90 不确定性区间（单位：杯）。可按门店、商品ID、商品关键词、日期、预测步长 horizon_day 过滤。',
        {
            store: StoreEnum.optional(),
            product_id: z.number().int().optional().describe('商品ID，如 84'),
            product_query: z.string().optional().describe('商品名/品类/类型关键词，如 latte、Coffee beans、Tea'),
            date: z.string().optional().describe('精确日期 YYYY-MM-DD'),
            date_from: z.string().optional(),
            date_to: z.string().optional(),
            horizon_day: z.number().int().min(0).max(6).optional().describe('预测步长(0=预测基准日)'),
            limit: z.number().int().optional().describe('返回条数，默认50，最大500'),
        },
        tool(args => DataService.getSkuForecast(args))
    );

    // 4. 模型效果
    server.tool(
        'get_model_quality',
        '查询分层模型效果：overall/window/store/category/product_type/sku，指标含 MAE、RMSE、WAPE、R2、±10%/±20%命中率、区间覆盖率、趋势方向准确率、是否达标候选。',
        {
            level: z.enum(['overall', 'window', 'store', 'category', 'product_type', 'sku']).optional().describe('评估层级'),
            entity_id: z.union([z.string(), z.number()]).optional().describe('实体ID（门店名/品类/SKU id 等）'),
            method: z.string().optional().describe('预测方法名'),
            limit: z.number().int().optional(),
        },
        tool(args => DataService.getModelQuality(args))
    );

    // 5. 特征重要性
    server.tool(
        'get_feature_importance',
        '获取全局模型特征重要性排名（LightGBM），含中文含义与特征分组，用于理解模型主要依据哪些因子预测。',
        { limit: z.number().int().optional().describe('返回条数，默认15，最大53') },
        tool(args => DataService.getFeatureImportance(args))
    );

    // 6. 备货风险
    server.tool(
        'get_restock_risks',
        '获取某日（默认最新日）按“潜在追加需求杯数 P90-点预测”排序的备货关注清单，可按门店过滤。注意：仅基于需求，未接入库存/在途数据，不代表缺货概率。',
        {
            date: z.string().optional().describe('YYYY-MM-DD，默认最新预测日'),
            store: StoreEnum.optional(),
            limit: z.number().int().optional().describe('默认10，最大50'),
        },
        tool(args => DataService.getRestockRisks(args))
    );

    // 7. 天气与节假日
    server.tool(
        'get_weather_forecast',
        '查询日期区间的天气（均温、降水、是否下雨/晴天、湿度）与节假日、周末标记，用于解释天气对销量的影响。',
        {
            date_from: z.string().optional(),
            date_to: z.string().optional(),
            limit: z.number().int().optional().describe('默认30，最大400'),
        },
        tool(args => DataService.getWeather(args))
    );

    // 8. 商品目录
    server.tool(
        'list_products',
        '检索商品目录：商品ID、名称、品类、类型、近181天总销量/营收、均价、日均销量、在售天数。用于把商品名映射到 product_id。',
        {
            category: z.string().optional().describe('品类英文名，如 Coffee / Tea / Bakery'),
            product_query: z.string().optional().describe('名称/类型/品类关键词'),
            limit: z.number().int().optional().describe('默认50，最大240'),
        },
        tool(args => DataService.listProducts(args))
    );

    // 9. 单条预测归因
    server.tool(
        'explain_prediction',
        '对单条预测（prediction_id）做 SHAP 归因，返回推动预测高于/低于基准值的主要特征及贡献方向，回答“为什么这条预测是这个数”。prediction_id 可从 get_sku_demand_forecast 或 get_restock_risks 获得。',
        {
            prediction_id: z.string().describe('预测唯一ID'),
            top_n: z.number().int().optional().describe('返回前N个驱动因素，默认10，最大53'),
        },
        tool(args => DataService.explainPrediction(args))
    );

    // 10. 情景模拟
    server.tool(
        'simulate_scenario',
        '对单条预测做“假如”情景模拟：改变气温/降雨/节假日，返回模拟预测相对基线的增减杯数与百分比。可选档位见返回的 available_options。覆盖范围限下钻子集（35天×3门店×前5商品）。',
        {
            prediction_id: z.string().describe('预测唯一ID'),
            temperature: z.union([z.string(), z.number()]).optional().describe('气温档位ID（temperature_options 中）'),
            rain: z.union([z.string(), z.number()]).optional().describe('降雨档位ID（rain_options 中）'),
            holiday: z.union([z.string(), z.number()]).optional().describe('节假日档位ID（holiday_options 中）'),
        },
        tool(args => DataService.runScenario(args))
    );

    return server;
}

// 工具目录（供站内「MCP 开放接口」页展示，与上面注册的工具保持一致）
export function toolCatalog() {
    return [
        { name: 'get_platform_overview', summary: '平台与模型概览、整体精度、门店/品类与日期范围', group: '概览' },
        { name: 'get_daily_demand_forecast', summary: '日级总销量/门店销量的预测值、实际值与误差', group: '预测查询' },
        { name: 'get_sku_demand_forecast', summary: '门店×SKU×日点预测与 P10/P50/P90 区间', group: '预测查询' },
        { name: 'get_model_quality', summary: '分层模型效果：MAE/RMSE/WAPE/R2/覆盖率/方向准确率', group: '模型评估' },
        { name: 'get_feature_importance', summary: '全局特征重要性排名与中文含义', group: '模型评估' },
        { name: 'get_restock_risks', summary: '按潜在追加需求排序的备货关注清单', group: '经营洞察' },
        { name: 'get_weather_forecast', summary: '天气与节假日数据，用于解释销量波动', group: '经营洞察' },
        { name: 'list_products', summary: '检索商品目录，把商品名映射到 product_id', group: '基础数据' },
        { name: 'explain_prediction', summary: '单条预测的 SHAP 归因与主要驱动因素', group: 'AI 解释' },
        { name: 'simulate_scenario', summary: '改变气温/降雨/节假日的“假如”情景模拟', group: 'AI 解释' },
    ];
}
