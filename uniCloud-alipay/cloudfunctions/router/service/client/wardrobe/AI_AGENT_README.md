# AI Agent 云函数阅读指南

这份文档只解释当前代码怎么跑，适合刚开始学 AI Agent 时对着云函数一步一步看。

## 先看哪几个文件

1. `chat.js`
   对话入口。它把用户一句话整理成穿搭任务，如果信息太少就追问。

2. `outfit.js`
   AI 穿搭主流程。它读取用户衣柜、画像和历史反馈，筛选衣物，调用豆包文本模型，最后保存穿搭记录。

3. `clothes.js`
   AI 识别衣服图片。它调用豆包视觉模型，把图片变成分类、颜色、风格标签等结构化字段。

4. `debug.js`
   AI 调试入口。它检查环境变量是否配置，并查询 `ai_tasks` 日志。

## 一次 AI 穿搭是怎么执行的

前端入口：

```text
pages/wardrobe/outfit.vue
  -> client/wardrobe/outfit.generate
```

后端流程：

```text
outfit.generate
  -> getClientInfo() 获取 uid
  -> getActiveClothes(uid) 读取 clothes 表
  -> getProfile(uid) 读取 user_profile 表
  -> getPreferenceMemory(uid) 从 outfit_records 里整理历史偏好
  -> searchCloset(...) 先筛选真实衣物
  -> createAiTask(...) 创建 ai_tasks 调试日志
  -> generateOutfitCandidatesWithDoubao(...) 调用豆包文本模型
  -> normalizeAiOutfits(...) 校验 AI 返回的衣物 ID
  -> outfit_records.add(...) 保存最终穿搭
```

这里对应的 Agent 概念：

```text
uid                  = 用户身份上下文
request              = 本轮用户目标
user_profile         = 用户长期画像
outfit_records       = 历史反馈记忆
clothes              = Agent 可查询的私有工具数据源
searchCloset         = 工具检索 / RAG 的第一版
豆包文本模型          = 负责组合、解释和生成方案
normalizeAiOutfits   = 防止模型胡编，保护业务数据
ai_tasks             = Agent 可观测性日志
```

## 一次衣物图片识别是怎么执行的

前端入口：

```text
pages/wardrobe/upload.vue
  -> 上传图片
  -> client/wardrobe/clothes.analyze
```

后端流程：

```text
clothes.analyze
  -> 检查 uid 和 image_url
  -> createAnalyzeTask(...) 创建 ai_tasks 日志
  -> 在 clothes.analyze 内直接写 prompt、input_image/input_text 和 client.responses.create(...)
  -> parseJsonOutput(...) 解析模型返回 JSON
  -> normalizeClothingAnalysis(...) 清洗字段
  -> 返回给前端，用户确认后 clothes.save 入库
```

这里对应的 Agent 概念：

```text
图片输入              = 多模态输入
视觉模型              = 把图片理解成结构化数据
固定 JSON 输出         = 结构化输出
用户确认              = Human-in-the-loop，避免错误数据污染衣柜
clothes 表            = 后续 Agent 推荐时可查询的私有数据库
```

## 为什么要有 ai_tasks

大模型调用不能当黑盒。`ai_tasks` 用来记录：

```text
task_type       是图片识别还是穿搭生成
provider/model  调用了哪个模型
input           输入摘要
prompt          Prompt 摘要
output.raw_text 模型原始输出
status          created / running / success / failed
fallback_reason 为什么进入规则兜底
error_message   报错原因
```

你看到的：

```text
ai_error: "缺少环境变量 ARK_API_KEY"
ai_task_id: "..."
```

意思是：任务日志已经创建成功，但在调用豆包前发现云函数环境变量没有配置。

## 当前不是完整 Agent 框架

这个项目现在是“业务流程式 Agent”，不是 LangChain、OpenAI Agents SDK 那种完整 Agent 框架。

当前已经有：

```text
Context     用户请求 + 用户画像 + 历史反馈
Tool        查询真实衣柜、保存记录、外部搜索、试穿服务
LLM         豆包文本模型生成搭配
Vision      豆包视觉模型识别图片
Memory      从历史记录压缩偏好
Guardrail   校验模型返回的衣物 ID，防止编造
Fallback    模型失败时用规则生成
Observability ai_tasks 调试日志
```

还没有完整实现：

```text
让 LLM 自己决定调用哪个工具
多轮长期聊天总结
向量检索
流式输出
真正的 MCP 工具协议
```

## 新手调试顺序

1. 先配置 `router/.env` 里的 `ARK_API_KEY`。
2. 上传部署 `router` 云函数。
3. 打开小程序 `AI 调试` 页面，看 API Key 是否已配置。
4. 上传一件衣服，测试 `clothes.analyze`。
5. 衣柜里至少有上衣、下装、鞋后，再测试 `outfit.generate`。
6. 如果失败，去 `AI 调试` 页面看对应 `ai_task_id` 的错误和模型原始输出。
