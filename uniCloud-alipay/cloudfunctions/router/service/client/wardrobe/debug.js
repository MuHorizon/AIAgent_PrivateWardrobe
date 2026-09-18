'use strict';

const OpenAI = require('openai');
const db = uniCloud.database();

const cloudObject = {
  isCloudObject: true,

  /**
   * 查询当前 AI 配置状态。
   * @url client/wardrobe/debug.status
   * Agent 设计点：
   * 这里不返回 API Key，只返回“是否已配置”。调试页可以判断云函数环境是否准备好，
   * 同时避免把密钥内容暴露给前端、小程序日志或截图。
   */
  status: async function () {
    return {
      code: 0,
      msg: '',
      provider: 'doubao',
      api_key_ready: Boolean(process.env.ARK_API_KEY),
      api_key_env_name: 'ARK_API_KEY',
      text_model: process.env.ARK_TEXT_MODEL || '',
      vision_model: process.env.ARK_VISION_MODEL || process.env.ARK_TEXT_MODEL || '',
      base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      tryon_ready: Boolean(process.env.VOLC_ACCESS_KEY && process.env.VOLC_SECRET_KEY),
      tryon_provider: 'volcengine_cv_dressing_diffusionV2',
      tryon_action_submit: process.env.VOLC_TRYON_SUBMIT_ACTION || 'DressingDiffusionV2SubmitTask',
      tryon_action_result: process.env.VOLC_TRYON_RESULT_ACTION || 'DressingDiffusionV2GetResult',
      tryon_openapi_version: process.env.VOLC_TRYON_OPENAPI_VERSION || '2024-06-06',
      tryon_region: process.env.VOLC_REGION || 'cn-north-1',
      search_mcp_ready: Boolean(process.env.SEARCH_MCP_API_URL && process.env.SEARCH_MCP_API_KEY),
    };
  },

  /**
   * 测试豆包文本模型是否真的可调用。
   * @url client/wardrobe/debug.pingText
   * 这个接口会发起一次最小模型请求，用来区分“环境变量已配置”和“账号已开通当前模型”。
   */
  pingText: async function () {
    const model = process.env.ARK_TEXT_MODEL || '';

    try {
      if (!process.env.ARK_API_KEY) throw new Error('缺少环境变量 ARK_API_KEY');
      if (!model) throw new Error('缺少环境变量 ARK_TEXT_MODEL');

      const client = new OpenAI({
        apiKey: process.env.ARK_API_KEY,
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        timeout: 15000,
        maxRetries: 0,
      });

      const response = await client.responses.create({
        model,
        input: '请只回复 OK',
        instructions: '你是连通性测试助手。只允许回复 OK。',
        temperature: 0,
      }, {
        timeout: 15000,
        maxRetries: 0,
      });
      const text =
        typeof response.output_text === 'string'
          ? response.output_text.trim()
          : (response.output || [])
              .map((item) => (item.content || []).map((part) => part.text || '').join('\n'))
              .join('\n')
              .trim();

      return {
        code: 0,
        msg: '',
        ok: true,
        provider: 'doubao',
        model,
        output: text || '',
      };
    } catch (err) {
      return {
        code: -1,
        msg: normalizeDebugError(err),
        ok: false,
        provider: 'doubao',
        model,
      };
    }
  },

  /**
   * 查询当前用户最近的 AI 任务。
   * @url client/wardrobe/debug.tasks
   * Agent 设计点：
   * ai_tasks 是排查 Agent 行为的观察窗口：能看到任务类型、模型、状态、是否兜底和错误原因。
   * 这里按当前登录用户过滤，避免用户之间的 Prompt 和图片识别记录互相可见。
   */
  tasks: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { limit = 20 } = data;

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    const queryRes = await db
      .collection('ai_tasks')
      .where({
        user_id: uid,
      })
      .orderBy('created_at', 'desc')
      .limit(Math.min(Number(limit) || 20, 50))
      .get();

    return {
      code: 0,
      msg: '',
      rows: (queryRes.data || []).map(toTaskSummary),
    };
  },

  /**
   * 查询单个 AI 任务详情。
   * @url client/wardrobe/debug.taskDetail
   * Agent 设计点：
   * 详情里会包含 Prompt 摘要和模型输出摘要，方便定位一次推荐为什么成功、失败或进入规则兜底。
   * 仍然按 user_id + _id 双条件查询，保证只能看自己的任务。
   */
  taskDetail: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { _id } = data;

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    if (!_id) {
      return { code: -1, msg: '缺少任务ID' };
    }

    const queryRes = await db
      .collection('ai_tasks')
      .where({
        _id,
        user_id: uid,
      })
      .limit(1)
      .get();

    return {
      code: 0,
      msg: '',
      task: queryRes.data && queryRes.data[0] ? queryRes.data[0] : null,
    };
  },
};

module.exports = cloudObject;

function normalizeDebugError(err) {
  const message = (err && (err.message || err.msg || err.errMsg)) || '模型连通测试失败';

  if (message.indexOf('has not activated the model') > -1) {
    return '当前火山方舟账号未开通已配置模型，请在 Ark Console 开通该模型，或把 ARK_TEXT_MODEL 改成已开通的模型 ID';
  }

  return message;
}

function toTaskSummary(task) {
  return {
    _id: task._id,
    task_type: task.task_type,
    provider: task.provider,
    model: task.model,
    status: task.status,
    fallback_reason: task.fallback_reason || '',
    error_message: task.error_message || '',
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}
