# 豆包 AI 配置

本项目通过 OpenAI SDK 接入火山方舟 Ark Runtime 的 OpenAI 兼容接口。API Key 只允许配置在云函数环境变量中，不写入前端代码或仓库文件。

## 接入方式

统一使用 OpenAI SDK 的 Responses API：

```js
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
});

await client.responses.create({
  model: process.env.ARK_TEXT_MODEL,
  input: '...',
});
```

图片理解同样使用 Responses API，按火山文档的 `input_image + input_text` 方式传入图片 URL。

## 云函数环境变量

必填：

```text
ARK_API_KEY=你的火山方舟 API Key
```

可选：

```text
ARK_TEXT_MODEL=火山方舟控制台里已开通的文本模型 ID 或 ep- 开头的推理接入点 ID
ARK_VISION_MODEL=火山方舟控制台里已开通的视觉模型 ID 或 ep- 开头的推理接入点 ID
```

注意：不要直接照抄网上的模型名。OpenAI SDK 的 `model` 参数传给火山方舟时，以你账号控制台实际可选、已开通的模型 ID 或 Endpoint ID 为准。

模拟试穿使用火山引擎图片换装 V2，需要额外配置火山 OpenAPI AK/SK：

```text
VOLC_ACCESS_KEY=你的火山引擎 Access Key
VOLC_SECRET_KEY=你的火山引擎 Secret Key
VOLC_REGION=cn-north-1
VOLC_TRYON_VERSION=v2
VOLC_TRYON_OPENAPI_VERSION=2024-06-06
VOLC_TRYON_REQ_KEY=dressing_diffusionV2
VOLC_TRYON_SUBMIT_ACTION=DressingDiffusionV2SubmitTask
VOLC_TRYON_RESULT_ACTION=DressingDiffusionV2GetResult
```

全网比价需要配置服务端搜索 MCP 网关：

```text
SEARCH_MCP_API_URL=你的搜索MCP服务HTTP地址
SEARCH_MCP_API_KEY=你的搜索MCP访问密钥
SEARCH_MCP_TIMEOUT=30000
```

## 当前代码位置

```text
uniCloud-alipay/cloudfunctions/router/service/client/wardrobe/debug.js
uniCloud-alipay/cloudfunctions/router/service/client/wardrobe/clothes.js
uniCloud-alipay/cloudfunctions/router/service/client/wardrobe/outfit.js
```

## 当前状态

已实现：

- `client/wardrobe/outfit.generate`：优先调用豆包文本模型生成穿搭，失败时回退规则版。
- `client/wardrobe/clothes.analyze`：调用豆包视觉理解模型识别衣物图片。
- `client/wardrobe/debug.status`：检查云函数环境变量是否配置完整，不返回密钥内容。
- `client/wardrobe/debug.tasks`：查看当前用户最近 AI 任务状态。
- `ai_tasks`：记录 Prompt 摘要、模型输出、重试错误、兜底原因。
- `client/wardrobe/chat.send`：对话式穿搭助手，信息不足时追问，信息足够时生成穿搭。
- `client/wardrobe/tryon.generate`：模拟试穿服务端入口，需要配置外部试穿服务。
- `client/wardrobe/priceSearch.search`：全网比价服务端入口，需要配置搜索 MCP 网关。

部署后先打开小程序里的“AI 调试”页面，确认 `API Key` 显示为“已配置”，再测试图片识别和生成搭配。
