# CoffeeIQ · 门店销量预测智能平台

基于 LightGBM Tweedie 模型的咖啡门店零售需求预测平台。

## 功能
- **多维度仪表盘**：全店总览、单店明细、品类/SKU 下钻
- **预测引擎**：LightGBM Tweedie 多步直接预测，T+1~T+7 滚动预测
- **可解释性**：TreeSHAP 逐预测解释、特征重要性雷达图
- **场景模拟**：What-If 天气情景模拟、品类结构优化分析
- **MCP 开放接口**：标准化 Model Context Protocol 接口，供 AI Agent 调用

## 技术栈
- 前端：Vanilla JS + ECharts
- 后端：Node.js + Express
- 模型：LightGBM (Python)
- 数据：Coffee Shop Sales + 纽约天气数据

## 运行
```bash
npm install
npm start
```

访问 http://localhost:3000
