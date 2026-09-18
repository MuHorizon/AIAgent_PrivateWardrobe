'use strict';

const OpenAI = require('openai');
const db = uniCloud.database();

/**
 * AI Agent 学习注释：长期记忆 / 用户隐式画像
 * ------------------------------------------------------------
 * 这个文件对应你笔记里的“agent长期记忆”和“上下文压缩”。
 *
 * 1. 显式画像 vs 隐式画像
 *    显式画像：用户主动填写的 gender、height、service_preferences。
 *    隐式画像：AI 根据衣柜、收藏、拒绝、穿着、对话推断出来的偏好。
 *
 * 2. 短期记忆 vs 长期记忆
 *    chat_messages 是短期记忆：恢复某一个会话。
 *    ai_memory / implicit_profile 是长期记忆：跨会话持续影响推荐。
 *
 * 3. 为什么要压缩？
 *    如果每次搭配都把所有衣服、所有聊天、所有历史记录塞给模型，token 会很高且效果不稳定。
 *    所以这里先聚合成统计摘要，再让模型输出结构化画像。
 *
 * 4. 置信度 confidence
 *    隐式画像不是用户亲口确认的信息，所以每个维度都带 confidence。
 *    后续推荐只使用置信度足够的维度，避免 AI “猜错用户”后持续影响推荐。
 */
const cloudObject = {
  isCloudObject: true,

  /**
   * 触发 AI 分析用户隐式画像。
   * @url client/wardrobe/aiProfile.analyze
   *
   * Agent 设计点：
   * 用户不需要填一份长问卷。AI 从五个数据源持续学习用户偏好：
   * 1. 上传的衣服 —— 衣柜的颜色/风格/版型/材质分布
   * 2. 收藏的搭配 —— 哪些组合被认可
   * 3. 点赞/喜欢 —— 正向强化信号
   * 4. 拒绝推荐 —— 不喜欢什么
   * 5. 对话 —— 身体关注点、生活方式、场景需求
   *
   * 每次分析调用豆包 Text 模型，输入是聚合后的行为数据摘要，
   * 输出是结构化的隐式画像 JSON，每个维度带置信度。
   */
  analyze: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_TEXT_MODEL || '';
    if (!apiKey || !model) return { code: -1, msg: '豆包未配置' };

    console.log('[aiProfile] ====== 开始分析用户', uid, '======');

    // Step 1：聚合五类数据源。
    // AI Agent 学习注释：这一步不是直接问模型，而是先做数据整理。
    // 数据源越干净，模型越容易总结出稳定画像。
    const sources = await gatherDataSources(uid);
    console.log('[aiProfile] 数据源汇总:', JSON.stringify(sources.summary));

    if (sources.summary.total_data_points === 0) {
      return {
        code: 0, msg: '暂无足够行为数据',
        profile: buildEmptyImplicitProfile(),
        data_sources: sources.summary,
      };
    }

    // Step 2：豆包分析。
    // AI Agent 学习注释：让 LLM 做“总结和归纳”，而不是让它直接查数据库。
    // 输入是后端整理好的摘要，输出是固定 JSON 画像。
    let profile;
    try {
      profile = await analyzeWithDoubao(sources, apiKey, model);
    } catch (err) {
      console.error('[aiProfile] 豆包分析失败，使用规则版', err.message);
      profile = analyzeWithRules(sources);
    }

    // Step 3：写入 user_profile。
    // AI Agent 学习注释：把模型总结出的长期记忆保存下来，
    // 后续 outfit.generate / tryon.autoComplete 可以直接读取，不必每次重新分析。
    await saveImplicitProfile(uid, profile, sources.summary);

    console.log('[aiProfile] ====== 分析完成 ======');

    return {
      code: 0, msg: '',
      profile,
      data_sources: sources.summary,
    };
  },

  /**
   * 读取当前隐式画像。
   * @url client/wardrobe/aiProfile.get
   */
  get: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const queryRes = await db.collection('user_profile').where({ user_id: uid }).limit(1).get();
    const profile = queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};

    return {
      code: 0, msg: '',
      implicit_profile: profile.implicit_profile || buildEmptyImplicitProfile(),
      explicit: {
        gender: profile.gender || '',
        height: profile.height || '',
        service_preferences: profile.service_preferences || [],
      },
    };
  },
};

module.exports = cloudObject;

/**
 * 聚合五类行为数据源。
 *
 * AI Agent 学习注释：长期记忆的数据来源
 * - clothes：用户拥有什么，能反映颜色/风格/品类偏好。
 * - outfit_records：用户收藏、不喜欢、穿过什么，属于更强的行为反馈。
 * - ai_memory.chat_context：用户在聊天里表达过的需求，例如“想显高”“不要太正式”。
 *
 * 这些不是直接全部给模型，而是先统计和截取摘要，控制 token。
 */
async function gatherDataSources(uid) {
  // 1. 上传的衣服
  const clothesRes = await db.collection('clothes').where({ user_id: uid, status: 'active' }).limit(200).get();
  const clothes = clothesRes.data || [];

  // 2 & 3 & 4. 穿搭记录 + 反馈
  const outfitRes = await db.collection('outfit_records').where({ user_id: uid, status: 'active' }).orderBy('updated_at', 'desc').limit(100).get();
  const outfits = outfitRes.data || [];

  const favorited = outfits.filter((o) => o.is_favorite);
  const disliked = outfits.filter((o) => o.feedback === 'disliked');
  const worn = outfits.filter((o) => o.worn_date);

  // 5. 对话记忆
  let chatMemories = [];
  try {
    const chatRes = await db.collection('ai_memory').where({ user_id: uid, memory_type: 'chat_context' }).orderBy('created_at', 'desc').limit(30).get();
    chatMemories = chatRes.data || [];
  } catch (e) { /* 集合可能未初始化 */ }

  // 5b. 偏好记忆
  let preferenceMemories = [];
  try {
    const prefRes = await db.collection('ai_memory').where({ user_id: uid, memory_type: 'preference' }).orderBy('created_at', 'desc').limit(50).get();
    preferenceMemories = prefRes.data || [];
  } catch (e) {}

  // 汇总统计
  const colorCounts = {};
  const styleCounts = {};
  const categoryCounts = {};
  const fitCounts = {};
  const materialCounts = {};

  clothes.forEach((c) => {
    if (c.color) colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
    if (c.category) categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    if (c.fit) fitCounts[c.fit] = (fitCounts[c.fit] || 0) + 1;
    if (c.material) materialCounts[c.material] = (materialCounts[c.material] || 0) + 1;
    (c.style_tags || []).forEach((s) => { styleCounts[s] = (styleCounts[s] || 0) + 1; });
  });

  // 被拒绝搭配中的衣物特征
  const avoidedColors = {};
  const avoidedStyles = {};
  disliked.forEach((o) => {
    (o.outfit_items || []).forEach((item) => {
      if (item.color) avoidedColors[item.color] = (avoidedColors[item.color] || 0) + 1;
      (item.style_tags || []).forEach((s) => { avoidedStyles[s] = (avoidedStyles[s] || 0) + 1; });
    });
  });

  // 对话文本聚合
  const chatTexts = chatMemories.map((m) => {
    try { const c = typeof m.content === 'string' ? JSON.parse(m.content) : m.content; return c.user || ''; } catch (e) { return ''; }
  }).filter(Boolean).slice(0, 20);

  return {
    clothes_count: clothes.length,
    outfits_count: outfits.length,
    favorited_count: favorited.length,
    disliked_count: disliked.length,
    worn_count: worn.length,
    chat_rounds: chatMemories.length,

    wardrobe_distribution: {
      colors: topKeys(colorCounts, 8),
      styles: topKeys(styleCounts, 8),
      categories: topKeys(categoryCounts, 8),
      fits: topKeys(fitCounts, 5),
      materials: topKeys(materialCounts, 5),
    },

    feedback_signals: {
      favorited_outfits: favorited.slice(0, 5).map((o) => ({ title: o.title, scene: o.scene, reason: o.reason })),
      avoided_colors: topKeys(avoidedColors, 5),
      avoided_styles: topKeys(avoidedStyles, 5),
      recently_worn: worn.slice(0, 3).map((o) => ({ title: o.title, date: o.worn_date })),
    },

    chat_excerpts: chatTexts,

    summary: {
      total_data_points: clothes.length + outfits.length + chatMemories.length,
      wardrobe_size: clothes.length,
      feedback_count: favorited.length + disliked.length + worn.length,
      chat_turns: chatMemories.length,
    },
  };
}

/**
 * 豆包分析隐式画像。
 *
 * AI Agent 学习注释：结构化长期记忆
 * 这里要求模型返回固定 JSON，每个维度都是 { value, confidence }。
 * value 是推断结果，confidence 是可信度。
 * 这比让模型自由写一段“用户喜欢简约风”更适合后续程序读取。
 */
async function analyzeWithDoubao(sources, apiKey, model) {
  const instructions = [
    '你是一个用户画像分析师。根据用户的行为数据推断其穿搭偏好隐式画像。',
    '行为数据包括：衣柜衣物分布、收藏/不喜欢/穿着记录、对话文本。',
    '',
    '请返回严格 JSON，不要 Markdown。每个维度需包含 value 和 confidence（0-1）：',
    '{',
    '  "style": { "value": "极简风", "confidence": 0.85 },',
    '  "color_preference": { "value": ["黑色","白色","灰色"], "confidence": 0.9 },',
    '  "color_avoid": { "value": ["荧光色"], "confidence": 0.6 },',
    '  "fit_preference": { "value": "宽松", "confidence": 0.75 },',
    '  "material_preference": { "value": ["棉","麻"], "confidence": 0.7 },',
    '  "category_bias": { "value": {"上衣":0.4,"下装":0.25,"鞋":0.15}, "confidence": 0.95 },',
    '  "style_avoid": { "value": ["过于正式","太花哨"], "confidence": 0.5 },',
    '  "category_avoid": { "value": [], "confidence": 0.3 },',
    '  "body_concerns": { "value": ["显腿长"], "confidence": 0.4 },',
    '  "comfort_priority": { "value": "high", "confidence": 0.5 },',
    '  "formality_level": { "value": "casual", "confidence": 0.7 },',
    '  "price_tier": { "value": "中端", "confidence": 0.3 },',
    '  "temperature_sensitivity": { "value": "neutral", "confidence": 0.3 },',
    '  "summary": { "value": "一句话总结这个用户的穿搭偏好", "confidence": 0.8 }',
    '}',
    '',
    '规则：',
    '- 衣柜数据置信度高（数据量大），对话推断置信度低（主观表达）。',
    '- 数据不足的维度 confidence 设低，不要瞎编。',
    '- color_preference 从衣柜颜色分布 + 收藏搭配中推断。',
    '- color_avoid 从被拒绝搭配中推断。',
    '- body_concerns 从对话中推断（"显高""遮肉""腿短"等）。',
    '- comfort_priority 从材质分布和对话推断。',
    '- formality_level 从风格分布和对话推断。',
  ].join('\n');

  const input = JSON.stringify({
    wardrobe: sources.wardrobe_distribution,
    feedback: sources.feedback_signals,
    chat: sources.chat_excerpts,
    data_summary: sources.summary,
  }, null, 2);

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    timeout: 20000,
    maxRetries: 0,
  });

  const response = await client.responses.create({
    model, instructions, input, temperature: 0.1,
  }, { timeout: 20000, maxRetries: 0 });

  const outputText = typeof response.output_text === 'string' ? response.output_text.trim() : '';
  if (!outputText) throw new Error('豆包返回为空');

  let parsed;
  try { parsed = JSON.parse(outputText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); } catch (e) {
    const start = outputText.indexOf('{'), end = outputText.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('输出不是 JSON');
    parsed = JSON.parse(outputText.slice(start, end + 1));
  }

  return normalizeImplicitProfile(parsed);
}

/**
 * 规则版分析（兜底，不调豆包）。
 *
 * AI Agent 学习注释：降级策略
 * 当模型不可用时，仍然可以用统计规则生成基础画像。
 * 这样长期记忆能力不会因为一次模型失败完全中断。
 */
function analyzeWithRules(sources) {
  const d = sources.wardrobe_distribution;
  const fb = sources.feedback_signals;
  const total = sources.clothes_count || 1;

  return normalizeImplicitProfile({
    style: { value: topKey(d.styles) || '', confidence: Math.min(0.7, d.styles[0] ? d.styles[0].count / total : 0) },
    color_preference: { value: d.colors.slice(0, 3).map((c) => c.key), confidence: 0.8 },
    color_avoid: { value: fb.avoided_colors.slice(0, 3).map((c) => c.key), confidence: fb.avoided_colors.length > 0 ? 0.6 : 0.2 },
    fit_preference: { value: topKey(d.fits) || '', confidence: 0.5 },
    material_preference: { value: d.materials.slice(0, 3).map((m) => m.key), confidence: 0.6 },
    category_bias: { value: {}, confidence: 0.9 },
    style_avoid: { value: fb.avoided_styles.slice(0, 2).map((s) => s.key), confidence: 0.4 },
    category_avoid: { value: [], confidence: 0.1 },
    body_concerns: { value: [], confidence: 0.1 },
    comfort_priority: { value: 'medium', confidence: 0.3 },
    formality_level: { value: 'casual', confidence: 0.5 },
    price_tier: { value: '', confidence: 0.1 },
    temperature_sensitivity: { value: 'neutral', confidence: 0.2 },
    summary: { value: total >= 10 ? `衣柜${total}件，偏好${topKey(d.styles) || '简约'}风格` : '数据不足', confidence: 0.5 },
  });
}

/**
 * 归一化隐式画像，保证所有维度存在且格式正确。
 *
 * AI Agent 学习注释：模型输出保护
 * 模型可能漏字段、字段类型不稳定、confidence 不是数字。
 * normalizeImplicitProfile 把输出整理成稳定结构，后续业务代码就不用到处判断异常格式。
 */
function normalizeImplicitProfile(parsed) {
  const dims = ['style', 'color_preference', 'color_avoid', 'fit_preference', 'material_preference',
    'category_bias', 'style_avoid', 'category_avoid', 'body_concerns', 'comfort_priority',
    'formality_level', 'price_tier', 'temperature_sensitivity', 'summary'];
  const profile = {};

  dims.forEach((key) => {
    const dim = parsed[key] || {};
    profile[key] = {
      value: dim.value !== undefined ? dim.value : (Array.isArray(parsed[key]) ? [] : ''),
      confidence: Number(dim.confidence) || 0.1,
    };
  });

  return profile;
}

function buildEmptyImplicitProfile() {
  return normalizeImplicitProfile({});
}

async function saveImplicitProfile(uid, profile, dataSummary) {
  try {
    // AI Agent 学习注释：长期记忆落库
    // implicit_profile 存在 user_profile 里，表示“这个用户长期稳定的偏好”。
    // data_source_counts 记录这次画像基于多少数据生成，方便判断画像是否可靠。
    const queryRes = await db.collection('user_profile').where({ user_id: uid }).limit(1).get();
    const patch = {
      implicit_profile: {
        ...profile,
        last_analyzed_at: Date.now(),
        data_source_counts: dataSummary,
      },
      updated_at: Date.now(),
    };

    if (queryRes.data && queryRes.data[0]) {
      await db.collection('user_profile').doc(queryRes.data[0]._id).update(patch);
    } else {
      await db.collection('user_profile').add({ user_id: uid, ...patch, created_at: Date.now() });
    }
  } catch (err) {
    console.error('[aiProfile] 保存隐式画像失败', err);
  }
}

function topKeys(counts, n) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
}

function topKey(list) {
  if (!list || !list.length) return '';
  return list[0].key || '';
}
