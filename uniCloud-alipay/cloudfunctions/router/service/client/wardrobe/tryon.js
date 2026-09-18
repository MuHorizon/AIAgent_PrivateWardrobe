'use strict';

const crypto = require('crypto');
const OpenAI = require('openai');
const db = uniCloud.database();

/**
 * AI Agent 学习注释：AI 试穿 Agent
 * ------------------------------------------------------------
 * 这个文件涉及“多模态、Function Tool、成本控制、异步任务、Context Memory”。
 *
 * 1. 多模态
 *    analyzeBody() 读取用户全身照，识别体型/比例/风格印象。
 *    shoppingDecision() 读取商品图，判断是否适合买。
 *
 * 2. Function Tool
 *    autoComplete() 是“补齐整套搭配”的工具。
 *    generate() 是“提交试穿任务”的工具。
 *    模型负责决策和补齐，真正提交给火山引擎由后端工具执行。
 *
 * 3. 成本控制
 *    AI 试穿耗时且费用高，所以前端默认让用户一次选择上衣、下装、鞋、包/外套等整套单品。
 *    autoComplete() 会尽量补齐缺少单品，避免一次机会只试一件上衣。
 *
 * 4. 异步任务
 *    图片试穿不是普通聊天，不能等模型一次性返回。
 *    generate() 提交任务后只保存 task_id，前端再轮询 checkResult()。
 *
 * 5. Memory / Context
 *    user_profile 和 implicit_profile 会参与补齐搭配、购物决策。
 *    用户上传过的全身照也保存在 user_profile，减少重复上传。
 */
const cloudObject = {
  isCloudObject: true,

  /**
   * AI 分析人像（身材、比例、风格印象）。
   * @url client/wardrobe/tryon.analyzeBody
   *
   * AI Agent 学习注释：多模态 Context
   * 用户全身照是一种图片上下文。模型把图片转换成 body_type、height_estimate 等结构化字段。
   * 后续 autoComplete / shoppingDecision 可以把这些字段当成用户画像的一部分使用。
   */
  analyzeBody: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { person_image_url = '' } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_VISION_MODEL || '';
    if (!apiKey || !model) return { code: 0, msg: '', body: null };
    if (!person_image_url) return { code: -1, msg: '缺少人物照片' };

    try {
      const prompt = [
        '分析这张全身照的人物特征，返回 JSON：',
        '{"body_type":"苹果形/梨形/沙漏形/矩形/倒三角","height_estimate":"偏矮/中等/偏高","shoulder_type":"宽肩/窄肩/标准","style_impression":"简约/街头/商务/甜美/运动","notable_features":["腿长","腰细"等]}',
        '不确定的字段留空字符串。只返回 JSON，不要 Markdown。',
      ].join('\n');

      const client = new OpenAI({ apiKey, baseURL: 'https://ark.cn-beijing.volces.com/api/v3', timeout: 30000, maxRetries: 0 });
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content: [
          { type: 'input_image', image_url: person_image_url },
          { type: 'input_text', text: prompt },
        ]}],
      }, { timeout: 30000, maxRetries: 0 });

      const text = typeof response.output_text === 'string' ? response.output_text.trim() : '';
      let body = {};
      try { body = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch (e) {
        const start = text.indexOf('{'), end = text.lastIndexOf('}');
        if (start > -1 && end > start) body = JSON.parse(text.slice(start, end + 1));
      }
      return { code: 0, msg: '', body };
    } catch (err) {
      console.error('人像分析失败', err.message);
      return { code: 0, msg: '', body: null };
    }
  },

  /**
   * AI 自动补全搭配。
   * @url client/wardrobe/tryon.autoComplete
   *
   * AI Agent 学习注释：工具调用 + 成本优化
   * 用户可能只选了上衣或下装，但一次 AI 试穿很贵。
   * 所以这里先让文本模型从衣柜里补齐缺少的上衣、下装、鞋、包/配饰，
   * 再一起提交试穿，提升一次调用的价值。
   *
   * 注意：模型只能从 wardrobe 里选 _id，后端会过滤不存在的 ID。
   */
  autoComplete: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { mode = 'top', given_items = [], body_analysis = null } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_TEXT_MODEL || '';
    if (!apiKey || !model) return { code: -1, msg: '豆包未配置' };

    const clothesRes = await db.collection('clothes').where({ user_id: uid, status: 'active' }).limit(200).get();
    const wardrobe = clothesRes.data || [];
    if (!wardrobe.length) return { code: -1, msg: '衣橱为空' };

    const profile = await getProfile(uid);
    const implicit = profile.implicit_profile || {};

    const modeInstructionMap = {
      top: '用户给的是上衣，你需要搭配下装 + 鞋 + 可选配饰。',
      bottom: '用户给的是下装，你需要搭配上衣 + 鞋 + 可选配饰。',
      full: '用户可能只给了一件或几件单品，你需要补齐缺少的上衣、下装、鞋和可选配饰，组成一套适合试穿的完整造型。',
    };

    const instructions = [
      '你是穿搭搭配助手。用户给了一件或几件衣服，你需要从 wardrobe 中挑选匹配的其余单品，组成一套完整搭配。',
      modeInstructionMap[mode] || modeInstructionMap.full,
      '要求：只从 wardrobe 中选择，考虑颜色协调、风格统一。',
      '返回 JSON：{"outfit_items":[{"_id":"xxx","name":"名称","category":"分类"}],"reason":"搭配理由"}',
      '只返回 JSON，不要 Markdown。',
    ].join('\n');

    // AI Agent 学习注释：Context 组合
    // given_items 是用户主动选择的单品；
    // wardrobe 是可供模型选择的工具数据源；
    // user_profile / implicit_profile / body_analysis 是个性化上下文。
    const input = JSON.stringify({
      mode, given_items: given_items.map(toSummary),
      wardrobe: wardrobe.map((item) => ({ _id: item._id, name: item.name || buildName(item), category: item.category, color: item.color, style_tags: item.style_tags || [], scene_tags: item.scene_tags || [] })),
      user_profile: { gender: profile.gender, height: profile.height, implicit_style: implicit.style, implicit_color_pref: implicit.color_preference },
      body_analysis: body_analysis || {},
    }, null, 2);

    try {
      const client = new OpenAI({ apiKey, baseURL: 'https://ark.cn-beijing.volces.com/api/v3', timeout: 15000, maxRetries: 0 });
      const response = await client.responses.create({ model, instructions, input, temperature: 0.2 }, { timeout: 15000, maxRetries: 0 });
      const text = typeof response.output_text === 'string' ? response.output_text.trim() : '';
      let parsed = {};
      try { parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch (e) {
        const start = text.indexOf('{'), end = text.lastIndexOf('}');
        if (start > -1 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
      }

      // AI Agent 学习注释：幻觉过滤
      // 模型返回的 _id 必须存在于当前用户 wardrobe，否则丢弃。
      // 这和 outfit.normalizeAiOutfits 的思路一致：不信任模型编造的数据。
      const items = (parsed.outfit_items || []).filter((item) => wardrobe.some((w) => w._id === item._id));
      if (!items.length) return { code: -1, msg: 'AI 未找到合适搭配' };

      const fullItems = items.map((item) => {
        const full = wardrobe.find((w) => w._id === item._id);
        return { ...item, image_url: (full && full.image_url) || '', source: 'wardrobe' };
      });

      return { code: 0, msg: '', outfit: { outfit_items: [...given_items.map((g) => ({ ...g, source: g.source || 'wardrobe' })), ...fullItems], reason: parsed.reason || 'AI 为你搭配了这一套' } };
    } catch (err) {
      console.error('自动搭配失败', err.message);
      return { code: -1, msg: '搭配失败: ' + (err.message || '') };
    }
  },

  /**
   * 购物决策。
   * @url client/wardrobe/tryon.shoppingDecision
   *
   * AI Agent 学习注释：多工具链
   * 这个流程分两步：
   * 1. 视觉模型先分析商品图，得到 product_info。
   * 2. 文本模型再结合用户画像、身材分析、已有衣柜，判断“值不值得买”。
   * 这就是一个简单的多工具/多步骤 Agent 工作流。
   */
  shoppingDecision: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { product_image_url = '', person_image_url = '', body_analysis = null } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const apiKey = process.env.ARK_API_KEY;
    const visionModel = process.env.ARK_VISION_MODEL || '';
    if (!apiKey || !visionModel) return { code: -1, msg: '豆包未配置' };
    if (!product_image_url) return { code: -1, msg: '缺少商品图片' };

    const clothesRes = await db.collection('clothes').where({ user_id: uid, status: 'active' }).limit(200).get();
    const wardrobe = clothesRes.data || [];
    const profile = await getProfile(uid);
    const implicit = profile.implicit_profile || {};

    try {
      const productPrompt = ['分析这件衣服，返回 JSON：', '{"category":"上衣/下装/外套/连衣裙/鞋/包","type":"具体类型","color":"颜色","style_tags":["风格标签"],"fit":"版型","suitable_body_types":["适合的体型"],"suitable_heights":["偏矮","中等","偏高"]}', '只返回 JSON，不要 Markdown。'].join('\n');
      const client = new OpenAI({ apiKey, baseURL: 'https://ark.cn-beijing.volces.com/api/v3', timeout: 30000, maxRetries: 0 });
      const productRes = await client.responses.create({ model: visionModel, input: [{ role: 'user', content: [{ type: 'input_image', image_url: product_image_url }, { type: 'input_text', text: productPrompt }] }] }, { timeout: 30000, maxRetries: 0 });
      const productText = typeof productRes.output_text === 'string' ? productRes.output_text.trim() : '';
      let productInfo = {};
      try { productInfo = JSON.parse(productText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch (e) { const s = productText.indexOf('{'), e2 = productText.lastIndexOf('}'); if (s > -1 && e2 > s) productInfo = JSON.parse(productText.slice(s, e2 + 1)); }

      const decisionPrompt = ['你是穿搭决策助手。根据用户身材、风格偏好和已有衣柜，判断一件新衣服是否适合。', '返回 JSON：{"score":85,"verdict":"很适合你","reason":"...","match_items":[{"_id":"xxx"}]}', 'score 0-100：90+非常合适，70-89比较合适，50-69一般，<50不太适合。', 'match_items 是从 wardrobe 中挑选的可以搭配这件新衣服的已有单品 _id，最多 5 件。只返回 JSON。'].join('\n');
      const decisionInput = JSON.stringify({ product: productInfo, body_analysis: body_analysis || {}, user_profile: { gender: profile.gender, height: profile.height, implicit_style: implicit.style, implicit_color_pref: implicit.color_preference, implicit_fit_pref: implicit.fit_preference }, wardrobe: wardrobe.map((item) => ({ _id: item._id, name: item.name || buildName(item), category: item.category, color: item.color, style_tags: item.style_tags || [] })).slice(0, 40) }, null, 2);
      const decisionRes = await client.responses.create({ model: process.env.ARK_TEXT_MODEL || visionModel, instructions: decisionPrompt, input: decisionInput, temperature: 0.1 }, { timeout: 15000, maxRetries: 0 });
      const decisionText = typeof decisionRes.output_text === 'string' ? decisionRes.output_text.trim() : '';
      let decision = {};
      try { decision = JSON.parse(decisionText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch (e) { const s = decisionText.indexOf('{'), e2 = decisionText.lastIndexOf('}'); if (s > -1 && e2 > s) decision = JSON.parse(decisionText.slice(s, e2 + 1)); }

      const matchItems = (decision.match_items || []).map((item) => { const full = wardrobe.find((w) => w._id === item._id); return full ? { _id: full._id, name: full.name || buildName(full), image_url: full.image_url || '', category: full.category, color: full.color } : item; }).filter((item) => item.name);

      return { code: 0, msg: '', decision: { score: decision.score || 50, verdict: decision.verdict || '', reason: decision.reason || '', product_info: productInfo, match_items: matchItems.slice(0, 5) } };
    } catch (err) {
      console.error('购物决策失败', err.message);
      return { code: -1, msg: '分析失败: ' + (err.message || '') };
    }
  },

  /**
   * 生成试穿图（火山引擎视觉智能 - 图片换装）。
   * @url client/wardrobe/tryon.generate
   *
   * AI Agent 学习注释：异步 Function Tool
   * 这里调用的是外部图片换装服务，不是普通 LLM 文本返回。
   * 外部服务先返回 provider_task_id，真正图片稍后生成。
   * 所以本函数只负责提交任务、扣额度、保存 tryon_records，前端再轮询 checkResult。
   */
  generate: async function (data = {}) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();
    let { vk } = this.getUtil();
    let { person_image_url = '', clothes = [], auto_complete = null, mode = 'full' } = data;

    if (!uid) return { code: -1, msg: '用户未登录' };
    if (!person_image_url) return { code: -1, msg: '请先上传全身照' };

    let allClothes = [...(clothes || [])];
    if (auto_complete && auto_complete.outfit_items) {
      const existingKeys = new Set(allClothes.map((c) => c._id || c.name));
      const extra = auto_complete.outfit_items.filter((c) => !existingKeys.has(c._id || c.name));
      allClothes = [...allClothes, ...extra];
    }
    if (!allClothes.length) return { code: -1, msg: '请先选择要试穿的衣物' };

    // AI Agent 学习注释：成本控制 / 额度
    // 试穿是高成本功能，所以用 user_profile.tryon_quota_balance 控制次数。
    // 只有真正拿到 task_id 后才扣额度，避免配置错误或提交失败也消耗用户次数。
    const profile = await getProfile(uid);
    const quota = normalizeTryonQuota(profile);
    if (quota <= 0) return { code: -1, msg: '试穿额度已用完' };

    // 提交异步任务，拿到 task_id 后立即返回（不轮询，避免云函数超时）
    const submitRes = await submitTryonTask({ vk, personImageUrl: person_image_url, clothes: allClothes });
    const quotaAfter = submitRes.task_id ? Math.max(0, quota - 1) : quota;
    if (submitRes.task_id) {
      await deductQuota(uid, profile, quota);
    }

    const now = Date.now();
    const record = {
      user_id: uid, person_image_url,
      clothing_items: allClothes.map(toSummary),
      result_image_url: '',
      provider_task_id: submitRes.task_id || '',
      mode, status: submitRes.task_id ? 'generating' : 'config_needed',
      error_message: submitRes.error_message || '',
      quota_after: quotaAfter,
      created_at: now, updated_at: now,
    };

    const addRes = await db.collection('tryon_records').add(record);
    res.record = { ...record, _id: addRes.id, id: addRes.id };
    res.task_id = submitRes.task_id || '';
    res.quota_remaining = quotaAfter;

    if (!submitRes.task_id) { res.code = -1; res.msg = submitRes.error_message || '提交任务失败'; }
    return res;
  },

  /**
   * 查询试穿任务结果。
   * @url client/wardrobe/tryon.checkResult
   *
   * 火山引擎图片换装是异步接口，提交后返回 task_id，
   * 前端轮询这个接口直到 status=done。
   */
  checkResult: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { vk } = this.getUtil();
    let { task_id = '' } = data;

    if (!uid) return { code: -1, msg: '用户未登录' };
    if (!task_id) return { code: -1, msg: '缺少 task_id' };

    const resultRes = await queryTryonTask({ vk, taskId: task_id });

    // 如果生成完成，更新 tryon_records
    if (resultRes.result_image_url) {
      try {
        await db.collection('tryon_records')
          .where({ provider_task_id: task_id, user_id: uid })
          .update({ result_image_url: resultRes.result_image_url, status: 'success', updated_at: Date.now() });
      } catch (err) { console.error('更新试穿记录失败', err); }
    }

    if (resultRes.error_message) {
      try {
        await db.collection('tryon_records')
          .where({ provider_task_id: task_id, user_id: uid })
          .update({ status: 'failed', error_message: resultRes.error_message, updated_at: Date.now() });
      } catch (err) {}
    }

    return {
      code: 0, msg: '',
      status: resultRes.status,
      result_image_url: resultRes.result_image_url || '',
      error_message: resultRes.error_message || '',
    };
  },

  /**
   * 试穿历史。
   * @url client/wardrobe/tryon.list
   */
  list: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };
    const queryRes = await db.collection('tryon_records').where({ user_id: uid }).orderBy('created_at', 'desc').limit(30).get();
    return { code: 0, msg: '', rows: queryRes.data || [] };
  },
};

module.exports = cloudObject;

// ====== Helpers ======

async function getProfile(uid) {
  const q = await db.collection('user_profile').where({ user_id: uid }).limit(1).get();
  return (q.data && q.data[0]) ? q.data[0] : {};
}

function normalizeTryonQuota(profile = {}) {
  if (profile.tryon_quota_balance === null || profile.tryon_quota_balance === undefined || profile.tryon_quota_balance === '') {
    return 3;
  }
  const quota = Number(profile.tryon_quota_balance);
  return Number.isFinite(quota) ? quota : 3;
}

async function deductQuota(uid, profile, quota) {
  const now = Date.now();
  try {
    if (profile._id) {
      await db.collection('user_profile').doc(profile._id).update({ tryon_quota_balance: Math.max(0, quota - 1), updated_at: now });
      return;
    }

    await db.collection('user_profile').add({
      user_id: uid,
      member_plan: 'free',
      tryon_quota_balance: Math.max(0, quota - 1),
      created_at: now,
      updated_at: now,
    });
  } catch (err) { console.error('扣减额度失败', err); }
}

/**
 * 火山引擎图片换装 V2。
 *
 * 文档对应：
 * - 图片换装 V2 提交任务：DressingDiffusionV2SubmitTask，Version=2024-06-06
 * - 图片换装 V2 查询任务：DressingDiffusionV2GetResult，Version=2024-06-06
 *
 * Agent 设计点：
 * 试穿是成本型图像生成工具，必须走服务端签名调用，前端只能提交人物图和衣物图。
 * 这里不封装为通用 SDK，而是在业务函数内直接拼火山 OpenAPI 请求，便于排查 req_key、Action、Version、
 * garment.data 和 req_image_store_type 是否符合文档。
 *
 * 环境变量：
 *   VOLC_ACCESS_KEY = 火山引擎 Access Key
 *   VOLC_SECRET_KEY = 火山引擎 Secret Key
 *   VOLC_TRYON_VERSION = v2 或 v1，默认 v2
 *   VOLC_REGION = 签名 region，默认 cn-north-1
 */
/**
 * 提交试穿任务（DressingDiffusionV2SubmitTask），只提交不轮询。
 */
async function submitTryonTask({ vk, personImageUrl, clothes }) {
  const accessKey = process.env.VOLC_ACCESS_KEY || '';
  const secretKey = process.env.VOLC_SECRET_KEY || '';

  console.log('[tryon][submit] VOLC_ACCESS_KEY:', accessKey ? '已配置' : '未配置');
  console.log('[tryon][submit] VOLC_SECRET_KEY:', secretKey ? '已配置' : '未配置');

  if (!accessKey || !secretKey) {
    return { task_id: '', error_message: '未配置 VOLC_ACCESS_KEY / VOLC_SECRET_KEY' };
  }

  const garmentData = buildGarmentData(clothes);
  if (!garmentData.length) {
    return { task_id: '', error_message: '没有可用的衣服图片' };
  }

  const protocol = getTryonProtocol();
  const body = {
    req_key: protocol.reqKey,
    req_image_store_type: 1,
    model: {
      url: personImageUrl,
    },
    garment: {
      data: garmentData,
    },
  };

  try {
    console.log('[tryon][submit] 提交任务:', protocol.submitAction, protocol.version, JSON.stringify(body).slice(0, 500));
    const resp = await volcRequest({ vk, accessKey, secretKey, action: protocol.submitAction, version: protocol.version, body });

    const normalized = normalizeVolcResponse(resp);
    const taskId = normalizeTaskId(normalized.data);
    if (normalized.ok && taskId) {
      console.log('[tryon][submit] 成功, task_id:', taskId);
      return { task_id: taskId, error_message: '' };
    }

    console.error('[tryon][submit] 失败:', JSON.stringify({
      code: normalized.code,
      message: normalized.message,
      request_id: normalized.request_id,
      raw: resp,
    }).slice(0, 500));
    return {
      task_id: '',
      error_message: normalized.message || `提交失败 code:${normalized.code !== undefined ? normalized.code : 'unknown'}`,
    };
  } catch (err) {
    console.error('[tryon][submit] 异常:', err.message);
    return { task_id: '', error_message: err.message || '网络错误' };
  }
}

/**
 * 查询试穿任务结果（DressingDiffusionV2GetResult），单次查询不轮询。
 */
async function queryTryonTask({ vk, taskId }) {
  const accessKey = process.env.VOLC_ACCESS_KEY || '';
  const secretKey = process.env.VOLC_SECRET_KEY || '';

  if (!accessKey || !secretKey) {
    return { status: 'error', result_image_url: '', error_message: '未配置 AK/SK' };
  }

  const protocol = getTryonProtocol();
  const body = { req_key: protocol.reqKey, task_id: taskId, req_json: JSON.stringify({ return_url: true }) };

  try {
    const resp = await volcRequest({ vk, accessKey, secretKey, action: protocol.resultAction, version: protocol.version, body });

    const normalized = normalizeVolcResponse(resp);
    if (!normalized.ok) {
      return {
        status: 'error',
        result_image_url: '',
        error_message: normalized.message,
        volc_code: normalized.code,
      };
    }

    const data = normalized.data || {};
    const status = normalizeTryonStatus(data.status);
    const urls = normalizeResultUrls(data);

    if (urls.length) {
      return { status: 'done', result_image_url: urls[0] || '', error_message: '' };
    }

    if (status === 'done' || status === 'success') {
      const urls = normalizeResultUrls(data);
      return { status: urls.length ? 'done' : 'generating', result_image_url: urls[0] || '', error_message: '' };
    }

    if (status === 'not_found' || status === 'expired') {
      return { status, result_image_url: '', error_message: status === 'expired' ? '任务已过期' : '任务未找到' };
    }

    // in_queue / generating → 继续等待
    return { status: status || 'generating', result_image_url: '', error_message: '' };
  } catch (err) {
    return { status: 'error', result_image_url: '', error_message: err.message || '网络错误' };
  }
}

/**
 * 火山引擎 OpenAPI 签名请求。
 * 用 vk.request() 发 HTTP 请求（uniCloud 标准方式）。
 */
async function volcRequest({ vk, accessKey, secretKey, action, version, body }) {
  const host = process.env.VOLC_VISUAL_HOST || 'visual.volcengineapi.com';
  const region = process.env.VOLC_REGION || 'cn-north-1';
  const service = 'cv';
  const contentType = 'application/json';
  const query = `Action=${action}&Version=${version || '2024-06-06'}`;
  const bodyStr = JSON.stringify(body);

  // 签名——时间戳格式：YYYYMMDD'T'HHMMSS'Z'（无横杠无冒号）
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const dateStr = timestamp.slice(0, 8);

  console.log('[tryon][volc] timestamp:', timestamp, 'dateStr:', dateStr);

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-date:${timestamp}\n`;
  const signedHeaders = 'content-type;host;x-date';
  const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const canonicalRequest = `POST\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStr}/${region}/${service}/request`;
  const stringToSign = `HMAC-SHA256\n${timestamp}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const kDate = hmacSha256(secretKey, dateStr);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}/?${query}`;
  console.log('[tryon][volc] authorization:', authorization.slice(0, 100) + '...');

  try {
    const resp = await vk.request({
      url,
      method: 'POST',
      timeout: 30000,
      header: {
        'Content-Type': contentType,
        'Host': host,
        'X-Date': timestamp,
        'Authorization': authorization,
      },
      data: body,
      dataType: 'json',
    });

    console.log('[tryon][volc] 响应:', JSON.stringify(resp).slice(0, 500));

    // 火山引擎返回格式：成功时顶层有 code:10000，失败时 Error 在 ResponseMetadata 中
    if (resp.ResponseMetadata && resp.ResponseMetadata.Error) {
      const err = resp.ResponseMetadata.Error;
      return { code: err.CodeN || err.Code || -1, message: err.Message || err.Code || '火山请求失败', data: null };
    }

    // 正常格式
    return resp;
  } catch (err) {
    console.error('[tryon][volc] 请求失败:', err.message || err);
    throw err;
  }
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getTryonProtocol() {
  const version = (process.env.VOLC_TRYON_VERSION || 'v2').toLowerCase();
  if (version === 'v1') {
    return {
      reqKey: process.env.VOLC_TRYON_REQ_KEY || 'dressing_diffusion',
      submitAction: process.env.VOLC_TRYON_SUBMIT_ACTION || 'DressingDiffusionSubmitTask',
      resultAction: process.env.VOLC_TRYON_RESULT_ACTION || 'DressingDiffusionGetResult',
      version: process.env.VOLC_TRYON_OPENAPI_VERSION || '2024-06-06',
    };
  }

  return {
    reqKey: process.env.VOLC_TRYON_REQ_KEY || 'dressing_diffusionV2',
    submitAction: process.env.VOLC_TRYON_SUBMIT_ACTION || 'DressingDiffusionV2SubmitTask',
    resultAction: process.env.VOLC_TRYON_RESULT_ACTION || 'DressingDiffusionV2GetResult',
    version: process.env.VOLC_TRYON_OPENAPI_VERSION || '2024-06-06',
  };
}

/**
 * 组装 V2 garment.data。
 *
 * 文档要求 garment.data 内每张服装图有 type 和 url。V2 常用 type 是 upper / bottom。
 * 业务里的“外套”本质仍属于上半身服装；鞋、包、配饰不是换装主体，不传给图片换装接口。
 */
function buildGarmentData(clothes) {
  const selected = [];
  const upper = clothes.find((item) => isUpperGarment(item) && item.image_url);
  const bottom = clothes.find((item) => isBottomGarment(item) && item.image_url);

  if (upper) selected.push({ type: 'upper', url: upper.image_url });
  if (bottom) selected.push({ type: 'bottom', url: bottom.image_url });

  if (!selected.length) {
    const firstWearable = clothes.find((item) => item && item.image_url && !isAccessory(item));
    if (firstWearable) {
      selected.push({
        type: isBottomGarment(firstWearable) ? 'bottom' : 'upper',
        url: firstWearable.image_url,
      });
    }
  }

  return selected.slice(0, 2);
}

function isUpperGarment(item = {}) {
  return ['上衣', '外套', '连衣裙'].indexOf(item.category) > -1;
}

function isBottomGarment(item = {}) {
  return item.category === '下装';
}

function isAccessory(item = {}) {
  return ['鞋', '包', '配饰'].indexOf(item.category) > -1;
}

function normalizeTaskId(resp = {}) {
  return (resp.data && (resp.data.task_id || resp.data.taskId)) || resp.task_id || resp.taskId || '';
}

/**
 * 归一化火山 OpenAPI 返回。
 *
 * 设计点：
 * 火山 API Explorer 展示的是 { code, data, message, status }，但不同网关/SDK/错误场景可能出现：
 * - data / Data / Result 字段大小写差异
 * - status 顶层是 10000，data.status 是 done/running
 * - ResponseMetadata.Error 结构
 * 这里统一成 ok/code/message/data，避免前端看到 "code:undefined" 这种没有排查价值的错误。
 */
function normalizeVolcResponse(resp = {}) {
  if (resp.ResponseMetadata && resp.ResponseMetadata.Error) {
    const err = resp.ResponseMetadata.Error;
    return {
      ok: false,
      code: err.CodeN || err.Code || -1,
      message: err.Message || err.Code || '火山请求失败',
      data: null,
      request_id: resp.ResponseMetadata.RequestId || '',
    };
  }

  const payload = resp.Result || resp.result || resp.data || resp.Data || resp;
  const data = payload.data || payload.Data || payload.result || payload.Result || {};
  const code = payload.code !== undefined
    ? payload.code
    : (payload.status !== undefined
      ? payload.status
      : (payload.StatusCode !== undefined
        ? payload.StatusCode
        : (resp.code !== undefined ? resp.code : resp.status)));
  const message = payload.message || payload.Message || resp.message || resp.Message || '';
  const ok = code === 10000 || message === 'Success';

  return {
    ok,
    code,
    message: message || (ok ? '' : `火山查询失败 code:${code !== undefined ? code : 'unknown'}`),
    data,
    request_id: payload.request_id || payload.RequestId || (resp.ResponseMetadata && resp.ResponseMetadata.RequestId) || '',
  };
}

function normalizeTryonStatus(status) {
  if (status === 10000) return 'done';
  const value = String(status || '').toLowerCase();
  if (!value) return '';
  if (value === 'done' || value === 'success' || value === 'succeeded') return 'done';
  if (value === 'failed' || value === 'fail' || value === 'error') return 'error';
  if (value === 'expired') return 'expired';
  if (value === 'not_found') return 'not_found';
  if (value === 'running' || value === 'generating' || value === 'in_queue' || value === 'queueing' || value === 'pending') return 'generating';
  return value;
}

function normalizeResultUrls(data = {}) {
  const directUrls = Array.isArray(data.image_urls) ? data.image_urls : [];
  if (directUrls.length) return directUrls;

  const urls = [];
  if (data.resp_data) {
    try {
      const parsed = typeof data.resp_data === 'string' ? JSON.parse(data.resp_data) : data.resp_data;
      const results = Array.isArray(parsed.results) ? parsed.results : [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].url) urls.push(results[i].url);
      }
      const urlList = Array.isArray(parsed.binary_data_url_list) ? parsed.binary_data_url_list : [];
      urls.push(...urlList);
    } catch (err) {
      console.error('[tryon][result] 解析 resp_data 失败:', err.message || err);
    }
  }
  return urls;
}

function toSummary(item) {
  return { _id: item._id, name: item.name || buildName(item), category: item.category, color: item.color, image_url: item.image_url, source: item.source || 'wardrobe' };
}

function buildName(item) {
  const t = item.type || item.category || '衣物';
  return item.color ? `${item.color}${t}` : t;
}
