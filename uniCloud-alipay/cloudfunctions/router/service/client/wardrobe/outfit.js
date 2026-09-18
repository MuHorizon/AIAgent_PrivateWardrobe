'use strict';

const OpenAI = require('openai');
const db = uniCloud.database();

/**
 * AI Agent 学习注释：穿搭生成 Agent
 * ------------------------------------------------------------
 * 这个文件是“AI 真正帮用户搭衣服”的核心，可以对照你的笔记理解：
 *
 * 1. Context
 *    generate() 会读取 request、用户画像、隐式画像、长期记忆、衣柜数据。
 *    这些信息就是模型理解业务和用户个人情况的上下文。
 *
 * 2. Tool / 数据库工具
 *    数据库 clothes 是 Agent 的私有工具数据源。
 *    searchCloset() 相当于“查衣柜工具”：先从真实衣柜里筛出适合本次需求的候选。
 *
 * 3. Token 优化
 *    不把 200 件衣服全部粗暴塞给模型，而是先规则打分筛到最多 40 件。
 *    这就是“只携带必要上下文”，减少 token、提升推荐稳定性。
 *
 * 4. Memory
 *    getPreferenceMemory() 会把历史收藏、不喜欢、穿过的记录压缩成偏好摘要。
 *    这让用户不用每次重复说“我喜欢什么颜色/不喜欢什么风格”。
 *
 * 5. 幻觉约束
 *    模型只能返回 clothes_ids，后端再用 normalizeAiOutfits() 校验 ID 是否来自当前用户衣柜。
 *    这样即使模型想象了一件不存在的衣服，也不会进入最终结果。
 *
 * 6. 观测与调试
 *    ai_tasks 会记录 prompt、模型输出、失败原因和兜底状态。
 *    这是 Agent 产品常用的可观测性设计，方便排查“为什么 AI 这样推荐”。
 */
const cloudObject = {
  isCloudObject: true,

  /**
   * 生成穿搭方案。
   * @url client/wardrobe/outfit.generate
   *
   * 新手阅读路线：
   * 1. 前端 AI 搭配页提交 request，例如场景、天气、温度和用户补充描述。
   * 2. 云函数确认当前登录用户 uid，保证 Agent 只读取这个用户自己的衣柜。
   * 3. 读取 clothes 表、user_profile 表、outfit_records 表，形成本轮上下文。
   * 4. searchCloset 先用规则筛出少量真实衣物，相当于 Agent 的“查衣柜工具”。
   * 5. generateOutfitCandidates 优先调用豆包文本模型，失败时回退规则版。
   * 6. 后端校验模型返回的衣物 ID，防止 AI 编造衣柜里不存在的衣服。
   * 7. 保存到 outfit_records，并把 ai_task_id 返回给前端，方便调试页追踪。
   */
  generate: async function (data = {}) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();
    let { request = {} } = data;

    // Step 1: 身份是 Agent 的第一层上下文。没有 uid，就不能读取私有衣柜和偏好。
    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    // Step 2: 读取用户真实衣柜。后续 AI 只能从这些衣服中选择，不能凭空推荐。
    const allClothes = await getActiveClothes(uid);
    if (!allClothes.length) {
      return { code: -1, msg: '衣柜暂无可用衣物' };
    }

    // Step 3: 读取长期上下文。
    // profile 是用户主动填写的显式画像（性别、身高、服务偏好），
    // implicitProfile 是 AI 从行为中学习的隐式画像（风格、颜色偏好等），
    // memory 是历史反馈压缩后的偏好信号。
    const profile = await getProfile(uid);
    const implicitProfile = getImplicitProfile(profile);
    const memory = await getPreferenceMemory(uid);

    // Step 4: Tool / RAG 思想的简化版。
    // 这里还不是向量 RAG，而是规则检索：根据场景、天气、风格、历史偏好给衣物打分。
    // 目标和 RAG 一样：不要把所有资料都给模型，只取和本次问题最相关的一小部分。
    const closetSearch = searchCloset({
      request,
      profile,
      memory,
      clothes: allClothes,
    });

    // Step 5: 把“精简后的上下文”交给模型生成搭配。
    // 注意：模型看到的是候选衣物摘要，不是完整数据库记录；
    // 真正保存结果时仍以后端数据库为准。
    const generationResult = await generateOutfitCandidates({
      uid,
      request,
      profile,
      implicitProfile,
      memory,
      clothes: closetSearch.clothes,
      closetSearch,
    });
    const candidates = generationResult.candidates;
    if (!candidates.length) {
      return { code: -1, msg: '当前衣柜还不足以组合穿搭' };
    }

    // Step 6: 把最终可展示结果落库。
    // AI 原始输出不是产品数据，必须经过 normalizeAiOutfits 校验和重组后再保存。
    // 前端展示 outfit_records，而不是直接展示模型返回的 JSON。
    const now = Date.now();
    const records = [];
    for (let i = 0; i < candidates.length; i++) {
      const record = {
        ...candidates[i],
        user_id: uid,
        request,
        source: generationResult.source,
        ai_task_id: generationResult.aiTaskId || '',
        feedback: '',
        is_favorite: false,
        status: 'active',
        created_at: now,
        updated_at: now,
      };
      const addRes = await db.collection('outfit_records').add(record);
      records.push({
        ...record,
        _id: addRes.id,
        id: addRes.id,
      });
    }

    res.records = records;
    res.source = generationResult.source;
    res.ai_error = generationResult.aiError || '';
    res.ai_task_id = generationResult.aiTaskId || '';
    res.closet_search = {
      total: allClothes.length,
      selected: closetSearch.clothes.length,
    };

    return res;
  },

  /**
   * 查询当前用户的穿搭历史。
   * @url client/wardrobe/outfit.list
   * 历史记录会成为后续长期反馈 Memory 的来源，例如收藏、不喜欢、今天穿了哪套。
   */
  list: async function () {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    const queryRes = await db
      .collection('outfit_records')
      .where({
        user_id: uid,
        status: 'active',
      })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    res.rows = queryRes.data || [];

    return res;
  },

  /**
   * 更新穿搭反馈并沉淀为长期偏好记忆。
   * @url client/wardrobe/outfit.feedback
   *
   * Agent 设计点：
   * 反馈不是简单地更新一个字段。用户每一次"收藏""不喜欢""今天穿这套"
   * 都会经过以下处理链：
   * 1. 更新 outfit_records 的反馈字段（即时可见）。
   * 2. 如果开启了长期记忆学习，把反馈压缩到 ai_memory 表。
   * 3. 长期记忆会生成三类信号：
   *    - 偏好摘要（喜欢什么颜色/风格/分类）
   *    - 黑名单规则（明确不喜欢什么）
   *    - 穿着频次（哪些单品被频繁穿着，哪些被冷落）
   * 4. 这些信号在下一次 searchCloset 和 generateOutfitCandidates 时自动生效。
   *
   * 注意：memory_learning_enabled 关闭时只保存反馈字段，不更新长期记忆。
   */
  feedback: async function (data = {}) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();
    let { _id, feedback = '', is_favorite, worn_date = '' } = data;
    let dataJson = {
      updated_at: Date.now(),
    };

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    if (!_id) {
      return { code: -1, msg: '缺少穿搭记录ID' };
    }

    if (feedback) dataJson.feedback = safeString(feedback);
    if (typeof is_favorite === 'boolean') dataJson.is_favorite = is_favorite;
    if (worn_date) dataJson.worn_date = safeString(worn_date);

    const updateRes = await db
      .collection('outfit_records')
      .where({
        _id,
        user_id: uid,
      })
      .update(dataJson);

    res.updated = updateRes.updated || 0;

    // Step 2: 如果开启了长期记忆学习，把反馈沉淀为可检索记忆。
    // Agent 设计点：这里把单次反馈压缩成偏好摘要，而不是简单追加原始记录。
    // 压缩后的记忆可以控制 token 成本，同时让模型更容易理解用户的长期偏好趋势。
    const profile = await getProfile(uid);
    if (profile.memory_learning_enabled !== false) {
      try {
        // 读取刚更新的记录，获取完整的 outfit_items
        const recordRes = await db.collection('outfit_records').doc(_id).get();
        const record = (recordRes.data && recordRes.data[0]) || {};

        await updatePreferenceMemory(uid, {
          ...record,
          feedback: feedback || record.feedback,
          is_favorite: typeof is_favorite === 'boolean' ? is_favorite : record.is_favorite,
          worn_date: worn_date || record.worn_date,
        });

        if (worn_date || feedback === 'worn') {
          await markOutfitItemsWorn(uid, record.outfit_items || []);
        }
      } catch (err) {
        // 记忆更新失败不影响反馈保存的主流程
        console.error('更新偏好记忆失败', err);
      }
    }

    return res;
  },
};

module.exports = cloudObject;

async function getProfile(uid) {
  const queryRes = await db
    .collection('user_profile')
    .where({ user_id: uid })
    .limit(1)
    .get();
  return queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};
}

/**
 * 提取隐式画像。
 * Agent 设计点：隐式画像存储在 user_profile.implicit_profile 中，
 * 由 aiProfile.analyze 周期性生成。穿搭推荐时直接读取，不再实时分析。
 */
function getImplicitProfile(profile) {
  return (profile && profile.implicit_profile) ? profile.implicit_profile : {};
}

async function getActiveClothes(uid) {
  const queryRes = await db
    .collection('clothes')
    .where({
      user_id: uid,
      status: 'active',
    })
    .limit(200)
    .get();

  return queryRes.data || [];
}

/**
 * 读取用户反馈并压缩成偏好记忆。
 * Agent 设计点：
 * Memory 不能简单等于“把所有历史记录塞给模型”。这里把喜欢、不喜欢、穿过的搭配压缩成统计摘要，
 * 既能让模型理解长期偏好，又能减少 token 成本和历史隐私暴露。
 *
 * AI Agent 学习注释：
 * 这是“长期记忆”的一种实现方式。它没有保存一大段自然语言，而是把历史行为压缩成：
 * liked_colors / disliked_colors / liked_styles / recently_worn_ids 等结构化信号。
 * 结构化记忆比原始聊天更省 token，也更容易被程序用于排序和过滤。
 */
async function getPreferenceMemory(uid) {
  const queryRes = await db
    .collection('outfit_records')
    .where({
      user_id: uid,
      status: 'active',
    })
    .orderBy('updated_at', 'desc')
    .limit(80)
    .get();

  const recordMemory = buildPreferenceMemory(queryRes.data || []);
  const aiMemory = await getStructuredAiMemory(uid);

  return mergePreferenceMemory(recordMemory, aiMemory);
}

/**
 * 生成穿搭候选。
 * Agent 设计点：
 * 1. 优先使用豆包模型，因为穿搭推荐需要理解用户自然语言需求，并基于画像和衣柜做组合。
 * 2. 模型输出必须是结构化 JSON，后端再校验衣物 ID，避免模型编造用户没有的衣服。
 * 3. 豆包调用失败、缺少 API Key、JSON 解析失败或输出不可用时，回退到规则版生成，保证小程序可用。
 *
 * AI Agent 学习注释：
 * 这里体现了“LLM + 规则系统”的混合 Agent。
 * LLM 擅长理解自然语言和组合理由；规则系统擅长兜底、稳定、可控。
 * 商业项目里不要把所有关键路径都押在模型一次输出上。
 */
async function generateOutfitCandidates({ uid, request, profile, implicitProfile, memory, clothes, closetSearch }) {
  const taskId = await createAiTask({
    uid,
    request,
    profile,
    memory,
    clothes,
    closetSearch,
  });

  try {
    const candidates = await generateOutfitCandidatesWithDoubao({
      taskId,
      request,
      profile,
      implicitProfile,
      memory,
      clothes,
      closetSearch,
    });

    if (candidates.length) {
      await updateAiTaskSuccess({
        taskId,
        candidates,
      });

      return {
        source: 'doubao',
        aiTaskId: taskId,
        candidates,
      };
    }
  } catch (err) {
    console.error('豆包穿搭 Agent 生成失败，回退规则版', err);
    await updateAiTaskFail({
      taskId,
      err,
      fallbackReason: 'fallback_to_rule',
    });
    const fallbackCandidates = buildOutfitCandidates({ request, profile, implicitProfile, memory, clothes });

    return {
      source: 'rule_fallback',
      aiTaskId: taskId,
      aiError: err.message || '豆包生成失败',
      candidates: fallbackCandidates,
    };
  }

  await updateAiTaskFail({
    taskId,
    err: new Error('豆包未返回可用穿搭'),
    fallbackReason: 'empty_ai_candidates',
  });

  return {
    source: 'rule_fallback',
    aiTaskId: taskId,
    aiError: '豆包未返回可用穿搭',
    candidates: buildOutfitCandidates({ request, profile, implicitProfile, memory, clothes }),
  };
}

/**
 * 调用豆包生成穿搭候选。
 * Agent 设计点：
 * - request 是本轮 Context，代表用户当下的场景、天气和自然语言目标。
 * - profile 是长期 Memory，代表用户稳定偏好，不需要用户每次重复说明。
 * - clothes 是 Tool 数据源，也就是 search_closet 的结果；模型只能从这些真实衣物中挑选。
 * - Prompt 要明确禁止编造衣物，并要求返回 JSON，方便后端做确定性校验和落库。
 *
 * AI Agent 学习注释：
 * 这一步是“LLM 决策/生成”，但不是“LLM 直接拥有最终决定权”。
 * 模型只能提出候选 clothes_ids；真正是否可用，由 normalizeAiOutfits 做确定性校验。
 */
async function generateOutfitCandidatesWithDoubao({ taskId, request, profile, implicitProfile, memory, clothes, closetSearch }) {
  const promptPayload = buildDoubaoPromptPayload({
    request,
    profile,
    implicitProfile,
    memory,
    clothes,
    closetSearch,
  });
  const instructions = buildDoubaoInstructions();
  await updateAiTaskRunning({
    taskId,
    instructions,
    promptPayload,
  });

  let lastError = null;
  let lastOutputText = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const model = process.env.ARK_TEXT_MODEL || '';
      const payload = {
        model,
        // AI Agent 学习注释：system instructions
        // instructions 是模型本轮的系统规则，相当于定义 Agent 的角色、输出协议和禁止事项。
        instructions: buildAttemptInstructions(instructions, attempt),
        // AI Agent 学习注释：本轮上下文 input
        // input 里只放推荐需要的信息：用户需求、画像、记忆、候选衣物。
        // 不放完整用户账号、不放无关数据库字段，降低 token 和隐私暴露。
        input: JSON.stringify({
          ...promptPayload,
          retry_hint: attempt === 1 ? '' : buildRetryHint(lastError, lastOutputText),
        }, null, 2),
        temperature: attempt === 1 ? 0.2 : 0.05,
      };

      if (!process.env.ARK_API_KEY) throw new Error('缺少环境变量 ARK_API_KEY');
      if (!model) throw new Error('缺少环境变量 ARK_TEXT_MODEL');

      const client = new OpenAI({
        apiKey: process.env.ARK_API_KEY,
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        timeout: 15000,
        maxRetries: 0,
      });

      const response = await client.responses.create(payload, {
        timeout: 15000,
        maxRetries: 0,
      });
      const outputText =
        typeof response.output_text === 'string'
          ? response.output_text.trim()
          : (response.output || [])
              .map((item) => (item.content || []).map((part) => part.text || '').join('\n'))
              .join('\n')
              .trim();
      lastOutputText = outputText;
      await updateAiTaskModelOutput({
        taskId,
        outputText,
        rawResponse: response,
        payload,
        attempt,
      });

      const parsed = parseDoubaoJson(outputText);
      const candidates = normalizeAiOutfits(parsed, {
        request,
        clothes,
      });

      if (!candidates.length) {
        throw new Error('豆包输出没有通过衣物ID校验');
      }

      return candidates;
    } catch (err) {
      lastError = err;
      await updateAiTaskAttemptError({
        taskId,
        err,
        attempt,
      });
    }
  }

  throw lastError || new Error('豆包生成失败');
}

/**
 * 创建 AI 任务记录。
 * Agent 设计点：
 * ai_tasks 是 Agent 的“可观测性”表。一次模型调用不是黑盒：我们需要知道它拿到了什么上下文、
 * 走到哪个阶段、模型返回了什么、为什么触发兜底。这样后续调 Prompt 和排查推荐问题才有依据。
 */
async function createAiTask({ uid, request, profile, memory, clothes, closetSearch }) {
  const now = Date.now();
  const task = {
    user_id: uid,
    task_type: 'outfit_generate',
    provider: 'doubao',
    model: process.env.ARK_TEXT_MODEL || '',
    input: {
      request,
      profile_summary: summarizeProfile(profile),
      memory_summary: memory,
      clothes_count: clothes.length,
      clothes_ids: clothes.map((item) => item._id).filter(Boolean),
      closet_search: summarizeClosetSearch(closetSearch),
    },
    output: {},
    status: 'created',
    error_message: '',
    fallback_reason: '',
    created_at: now,
    updated_at: now,
  };

  try {
    const addRes = await db.collection('ai_tasks').add(task);
    return addRes.id;
  } catch (err) {
    // AI 任务记录是 Agent 可观测性能力，不是用户推荐链路的必要依赖。
    // 如果数据库集合未初始化或临时写入失败，主流程仍继续调用模型或规则兜底，避免“日志失败导致推荐失败”。
    console.error('AI 任务记录创建失败，继续执行穿搭生成', err);
    return '';
  }
}

/**
 * 标记 AI 任务进入模型调用阶段。
 * Agent 设计点：
 * 这里记录 Prompt 协议和上下文摘要，不记录 API Key。Prompt 是 Agent 行为的核心配置，
 * 后续如果模型编造衣物或 JSON 不稳定，需要回看这一版 Prompt 才能定位问题。
 */
async function updateAiTaskRunning({ taskId, instructions, promptPayload }) {
  if (!taskId) return;

  try {
    await db.collection('ai_tasks').doc(taskId).update({
      status: 'running',
      prompt: {
        instructions,
        payload_summary: summarizePromptPayload(promptPayload),
      },
      updated_at: Date.now(),
    });
  } catch (err) {
    // 记录 running 阶段失败只影响排查材料，不应该中断模型调用。
    console.error('AI 任务运行状态记录失败', err);
  }
}

/**
 * 记录模型原始文本输出。
 * Agent 设计点：
 * 结构化解析失败时，原始输出是最重要的调试材料。保存文本可以判断是 Prompt 约束不够、
 * 模型返回了 Markdown，还是返回的衣物 ID 不在真实衣柜中。
 */
async function updateAiTaskModelOutput({ taskId, outputText, rawResponse, payload, attempt }) {
  if (!taskId) return;

  try {
    const output = await getAiTaskOutput(taskId);
    await db.collection('ai_tasks').doc(taskId).update({
      output: {
        ...output,
        raw_text: truncateText(outputText, 6000),
        raw_response: rawResponse,
        request_payload: payload,
        last_attempt: attempt || 1,
      },
      updated_at: Date.now(),
    });
  } catch (err) {
    // raw_text 是调 Prompt 的辅助信息；即使保存失败，也继续解析模型结果。
    console.error('AI 模型原始输出记录失败', err);
  }
}

/**
 * 记录单次模型尝试失败。
 * Agent 设计点：
 * “重试”不是盲目再请求一次，而是把失败原因记录下来并作为下一轮 retry_hint。
 * 这样第二次调用会更明确地修正 JSON 格式、衣物 ID 或字段缺失问题。
 */
async function updateAiTaskAttemptError({ taskId, err, attempt }) {
  if (!taskId) return;

  try {
    const output = await getAiTaskOutput(taskId);
    const attempts = Array.isArray(output.attempt_errors) ? output.attempt_errors : [];
    attempts.push({
      attempt,
      message: (err && err.message) || '模型尝试失败',
      created_at: Date.now(),
    });

    await db.collection('ai_tasks').doc(taskId).update({
      output: {
        ...output,
        attempt_errors: attempts.slice(-4),
      },
      updated_at: Date.now(),
    });
  } catch (recordErr) {
    console.error('AI 尝试失败记录失败', recordErr);
  }
}

/**
 * 标记 AI 任务成功。
 * Agent 设计点：
 * 成功记录只保存候选摘要，不重复保存完整图片等冗余数据；真正用户可见结果在 outfit_records。
 */
async function updateAiTaskSuccess({ taskId, candidates }) {
  if (!taskId) return;

  try {
    const output = await getAiTaskOutput(taskId);
    await db.collection('ai_tasks').doc(taskId).update({
      status: 'success',
      output: {
        ...output,
        candidates: candidates.map((item) => ({
          title: item.title,
          clothes_ids: item.clothes_ids,
          score: item.score,
        })),
      },
      updated_at: Date.now(),
    });
  } catch (err) {
    // 成功态记录失败不能反过来让推荐失败；用户可见结果已经会写入 outfit_records。
    console.error('AI 任务成功状态记录失败', err);
  }
}

/**
 * 标记 AI 任务失败或进入兜底。
 * Agent 设计点：
 * 失败不等于用户流程失败；只要规则兜底能生成，产品仍可用。这里把模型失败原因单独记录，
 * 方便后续优化模型配置、Prompt 或 JSON 校验逻辑。
 */
async function updateAiTaskFail({ taskId, err, fallbackReason }) {
  if (!taskId) return;

  try {
    await db.collection('ai_tasks').doc(taskId).update({
      status: 'failed',
      error_message: (err && err.message) || 'AI 任务失败',
      fallback_reason: fallbackReason,
      updated_at: Date.now(),
    });
  } catch (recordErr) {
    // 兜底原因记录失败时，只在云函数日志中保留错误，不能影响规则兜底返回。
    console.error('AI 任务失败状态记录失败', recordErr);
  }
}

/**
 * 读取 AI 任务已有输出字段。
 * Agent 设计点：
 * 一个模型调用会分阶段产生日志：先保存 raw_text，再保存 candidates。
 * 更新 output 前先读取旧值并合并，可以避免后一次更新覆盖前一次的调试材料。
 */
async function getAiTaskOutput(taskId) {
  const queryRes = await db.collection('ai_tasks').doc(taskId).get();
  const row = queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};
  return row.output && typeof row.output === 'object' ? row.output : {};
}

function summarizeProfile(profile = {}) {
  return {
    gender: profile.gender || '',
    age_range: profile.age_range || '',
    body_type: profile.body_type || '',
    preferred_styles: profile.preferred_styles || [],
    preferred_scenes: profile.preferred_scenes || [],
    liked_colors: profile.liked_colors || [],
    disliked_colors: profile.disliked_colors || [],
  };
}

function summarizePromptPayload(promptPayload = {}) {
  return {
    outfit_request: promptPayload.outfit_request || {},
    user_profile: promptPayload.user_profile || {},
    preference_memory: promptPayload.preference_memory || {},
    closet_search: promptPayload.closet_search || {},
    wardrobe_items: (promptPayload.wardrobe_items || []).map((item) => ({
      _id: item._id,
      name: item.name,
      category: item.category,
      color: item.color,
      style_tags: item.style_tags,
      season_tags: item.season_tags,
      scene_tags: item.scene_tags,
    })),
  };
}

function truncateText(text, maxLength) {
  const value = safeString(text);
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function summarizeClosetSearch(closetSearch = {}) {
  return {
    total: closetSearch.total || 0,
    selected: closetSearch.clothes ? closetSearch.clothes.length : 0,
    strategy: closetSearch.strategy || '',
    category_counts: closetSearch.category_counts || {},
  };
}

/**
 * 检索并筛选本次推荐要给模型的衣柜单品。
 * Agent 设计点：
 * search_closet 是推荐 Agent 的“工具调用”。模型不应该看到无限多的衣物，而应该看到和本次场景相关、
 * 覆盖基础品类、数量可控的一组候选。这样既降低 token 成本，也减少模型在大量无关单品中选错的概率。
 *
 * AI Agent 学习注释：这就是 RAG 思想的业务版。
 * RAG 的核心不是一定要向量数据库，而是“先检索相关资料，再把相关资料放进上下文”。
 * 当前项目还没有 embedding/vector database，所以这里用规则打分实现 search_closet。
 * 后续如果加入向量库，可以把 scoreClothingForSearch 替换或叠加向量相似度。
 */
function searchCloset({ request, profile, memory, clothes }) {
  const scoredItems = clothes
    .map((item) => ({
      item,
      score: scoreClothingForSearch(item, request, profile, memory),
    }))
    .sort((a, b) => b.score - a.score);
  const selectedMap = {};
  const selected = [];

  addTopItemsByCategory(selected, selectedMap, scoredItems, '上衣', 8);
  addTopItemsByCategory(selected, selectedMap, scoredItems, '下装', 8);
  addTopItemsByCategory(selected, selectedMap, scoredItems, '鞋', 6);
  addTopItemsByCategory(selected, selectedMap, scoredItems, '外套', shouldUseOuter(request) ? 6 : 3);
  addTopItemsByCategory(selected, selectedMap, scoredItems, '包', 4);
  addTopItemsByCategory(selected, selectedMap, scoredItems, '配饰', 4);

  for (let i = 0; i < scoredItems.length && selected.length < 40; i++) {
    addSelectedClothing(selected, selectedMap, scoredItems[i].item);
  }

  return {
    total: clothes.length,
    clothes: selected,
    strategy: 'category_coverage_scene_memory_score',
    category_counts: countByCategory(selected),
  };
}

function scoreClothingForSearch(item, request, profile = {}, memory = {}) {
  // AI Agent 学习注释：检索打分
  // 这一步相当于“在调用 LLM 前先帮它筛资料”。
  // 比如用户喜欢白色就加分，最近穿过就减分，天气热时外套减分。
  // 这些规则减少模型选择错误，也减少传给模型的候选数量。
  let score = scoreClothing(item, request, profile.preferred_styles || []);
  const scene = safeString(request.scene);
  const temperature = Number(request.temperature) || 0;
  const text = safeString(request.text);
  const likedColors = mergeLists(profile.liked_colors, memory.liked_colors);
  const dislikedColors = mergeLists(profile.disliked_colors, memory.disliked_colors);
  const likedCategories = memory.liked_categories || [];
  const dislikedCategories = memory.disliked_categories || [];
  const likedStyles = mergeLists(profile.preferred_styles, memory.liked_styles);
  const dislikedStyles = memory.disliked_styles || [];
  const recentlyWornIds = memory.recently_worn_ids || [];

  if (likedColors.indexOf(item.color) > -1) score += 16;
  if (dislikedColors.indexOf(item.color) > -1) score -= 24;
  if (likedCategories.indexOf(item.category) > -1) score += 8;
  if (dislikedCategories.indexOf(item.category) > -1) score -= 18;
  if ((item.style_tags || []).some((tag) => likedStyles.indexOf(tag) > -1)) score += 12;
  if ((item.style_tags || []).some((tag) => dislikedStyles.indexOf(tag) > -1)) score -= 18;
  if ((item.wear_count || 0) >= 3) score += 6;
  if (recentlyWornIds.indexOf(item._id) > -1) score -= 10;
  if (scene && (item.scene_tags || []).indexOf(scene) > -1) score += 18;
  if (text && text.indexOf('清爽') > -1 && (item.season_tags || []).indexOf('夏') > -1) score += 10;
  if (temperature >= 28 && item.category === '外套') score -= 14;

  return score;
}

function addTopItemsByCategory(selected, selectedMap, scoredItems, category, limit) {
  let added = 0;
  for (let i = 0; i < scoredItems.length && added < limit; i++) {
    const item = scoredItems[i].item;
    if (item.category !== category) continue;
    if (addSelectedClothing(selected, selectedMap, item)) added++;
  }
}

function addSelectedClothing(selected, selectedMap, item) {
  if (!item || !item._id || selectedMap[item._id]) return false;
  selectedMap[item._id] = true;
  selected.push(item);
  return true;
}

function countByCategory(clothes) {
  const counts = {};
  for (let i = 0; i < clothes.length; i++) {
    const category = clothes[i].category || '未分类';
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

function buildPreferenceMemory(records) {
  const likedItems = [];
  const dislikedItems = [];
  const wornItems = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const items = record.outfit_items || [];
    if (record.is_favorite || record.feedback === 'liked') likedItems.push(...items);
    if (record.feedback === 'disliked') dislikedItems.push(...items);
    if (record.feedback === 'worn' || record.worn_date) wornItems.push(...items);
  }

  return {
    liked_colors: topValues(likedItems, 'color', 5),
    disliked_colors: topValues(dislikedItems, 'color', 5),
    liked_categories: topValues(likedItems, 'category', 5),
    disliked_categories: topValues(dislikedItems, 'category', 5),
    liked_styles: topArrayValues(likedItems, 'style_tags', 6),
    disliked_styles: topArrayValues(dislikedItems, 'style_tags', 6),
    recently_worn_ids: wornItems.map((item) => item._id).filter(Boolean).slice(0, 20),
    feedback_count: records.filter((record) => record.feedback || record.is_favorite || record.worn_date).length,
  };
}

/**
 * 读取结构化长期记忆。
 * Agent 设计点：
 * outfit_records 是原始行为记录，ai_memory 是压缩后的长期偏好。
 * 推荐时同时读取二者，可以让“收藏/不喜欢/穿过”的即时反馈和长期沉淀都参与 search_closet 排序。
 */
async function getStructuredAiMemory(uid) {
  try {
    const queryRes = await db
      .collection('ai_memory')
      .where({
        user_id: uid,
      })
      .orderBy('updated_at', 'desc')
      .limit(80)
      .get();

    const rows = queryRes.data || [];
    const liked = [];
    const disliked = [];
    const worn = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const content = parseMemoryContent(row.content);
      if (!content) continue;

      const target = row.memory_type === 'blacklist'
        ? disliked
        : row.memory_type === 'wear_frequency'
          ? worn
          : liked;

      target.push(content);
    }

    return {
      liked_colors: flattenTop(liked, 'colors', 6),
      disliked_colors: flattenTop(disliked, 'colors', 6),
      liked_categories: flattenTop(liked, 'categories', 6),
      disliked_categories: flattenTop(disliked, 'categories', 6),
      liked_styles: flattenTop(liked, 'styles', 8),
      disliked_styles: flattenTop(disliked, 'styles', 8),
      recently_worn_ids: worn.map((item) => item.clothes_ids || []).reduce((all, ids) => all.concat(ids), []).slice(0, 20),
      memory_count: rows.length,
    };
  } catch (err) {
    // ai_memory 是增强记忆层；集合未初始化时仍可用 outfit_records 统计推荐。
    return {};
  }
}

function parseMemoryContent(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function flattenTop(items, field, limit) {
  const counts = {};
  for (let i = 0; i < items.length; i++) {
    const values = Array.isArray(items[i][field]) ? items[i][field] : [];
    for (let j = 0; j < values.length; j++) {
      const value = safeString(values[j]);
      if (value) counts[value] = (counts[value] || 0) + 1;
    }
  }
  return sortCountKeys(counts).slice(0, limit);
}

function mergePreferenceMemory(base = {}, extra = {}) {
  return {
    liked_colors: mergeLists(base.liked_colors, extra.liked_colors),
    disliked_colors: mergeLists(base.disliked_colors, extra.disliked_colors),
    liked_categories: mergeLists(base.liked_categories, extra.liked_categories),
    disliked_categories: mergeLists(base.disliked_categories, extra.disliked_categories),
    liked_styles: mergeLists(base.liked_styles, extra.liked_styles),
    disliked_styles: mergeLists(base.disliked_styles, extra.disliked_styles),
    recently_worn_ids: mergeLists(base.recently_worn_ids, extra.recently_worn_ids),
    feedback_count: base.feedback_count || 0,
    memory_count: extra.memory_count || 0,
  };
}

function topValues(items, field, limit) {
  const counts = {};
  for (let i = 0; i < items.length; i++) {
    const value = safeString(items[i] && items[i][field]);
    if (value) counts[value] = (counts[value] || 0) + 1;
  }
  return sortCountKeys(counts).slice(0, limit);
}

function topArrayValues(items, field, limit) {
  const counts = {};
  for (let i = 0; i < items.length; i++) {
    const values = Array.isArray(items[i] && items[i][field]) ? items[i][field] : [];
    for (let j = 0; j < values.length; j++) {
      const value = safeString(values[j]);
      if (value) counts[value] = (counts[value] || 0) + 1;
    }
  }
  return sortCountKeys(counts).slice(0, limit);
}

function sortCountKeys(counts) {
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}

function mergeLists() {
  const result = [];
  for (let i = 0; i < arguments.length; i++) {
    const list = Array.isArray(arguments[i]) ? arguments[i] : [];
    for (let j = 0; j < list.length; j++) {
      const value = safeString(list[j]);
      if (value && result.indexOf(value) === -1) result.push(value);
    }
  }
  return result;
}

function buildAttemptInstructions(instructions, attempt) {
  if (attempt === 1) return instructions;
  return `${instructions}\n这是一次修正重试：上一轮输出未通过后端校验，请只返回符合 JSON 协议且 clothes_ids 全部来自 wardrobe_items 的结果。`;
}

function buildRetryHint(lastError, lastOutputText) {
  return {
    last_error: (lastError && lastError.message) || '',
    last_output_excerpt: truncateText(lastOutputText, 1000),
    required_fix: '返回严格 JSON，并且每个 clothes_ids 必须是 wardrobe_items 中真实存在的 _id。',
  };
}

/**
 * 构建豆包提示词说明。
 * Agent 设计点：
 * 这里相当于给模型定义“角色 + 工具边界 + 输出协议”：
 * - 角色：私人穿搭助手。
 * - 工具边界：只能使用输入里的 wardrobe_items，不允许推荐不存在的单品。
 * - 输出协议：必须返回 JSON，后端会解析并保存。
 */
function buildDoubaoInstructions() {
  return [
    '你是一个私人穿搭助手，只能基于用户真实衣柜生成穿搭。',
    '不要推荐 wardrobe_items 中不存在的衣物，不要编造衣物 ID。',
    '结合 user_profile、preference_memory、implicit_profile、outfit_request、wardrobe_items 生成 1 到 2 套穿搭。',
    'implicit_profile 是 AI 从用户穿搭行为中自动学习的偏好画像，每个维度带置信度(confidence)，高置信度的维度应优先参考。',
    'preference_memory 来自用户收藏、不喜欢、今天穿等历史反馈；它只表示偏好倾向，不允许替代 wardrobe_items。',
    '每套搭配至少包含 2 件衣物，优先包含上衣、下装、鞋；如果缺少某类衣物，可以用已有单品组成合理方案。',
    '输出必须是严格 JSON，不要输出 Markdown，不要输出解释性前后缀。',
    'JSON 格式：{"outfits":[{"title":"string","scene":"string","weather":"string","clothes_ids":["string"],"reason":"string","focus_item":"string","weather_tip":"string","swap_tip":"string","score":88}]}',
    'score 是 0 到 100 的整数，reason 用中文说明搭配逻辑、场景适配和用户偏好依据。',
    'focus_item 说明本套重点单品；weather_tip 说明天气温度适配；swap_tip 说明天气或场景变化时如何替换。',
  ].join('\n');
}

/**
 * 构建发送给模型的上下文。
 * Agent 设计点：
 * 发送给模型的数据要“足够但不过量”。这里不传用户完整账号信息，只传穿搭需要的画像字段；
 * 衣柜也只传 ID、名称、分类、颜色、标签等推荐必要字段，减少隐私暴露和 token 成本。
 */
function buildDoubaoPromptPayload({ request, profile, memory, implicitProfile, clothes, closetSearch }) {
  return {
    outfit_request: {
      scene: truncateText(request.scene, 20),
      weather: truncateText(request.weather, 30),
      temperature: Number(request.temperature) || '',
      text: truncateText(request.text, 300),
    },
    user_profile: {
      gender: truncateText(profile.gender, 20),
      height: profile.height || '',
      service_preferences: profile.service_preferences || [],
    },
    implicit_profile: buildImplicitProfileSummary(implicitProfile || {}),
    preference_memory: memory || {},
    closet_search: summarizeClosetSearch(closetSearch),
    wardrobe_items: clothes.map(toPromptClothing),
  };
}

/**
 * 提取隐式画像中高置信度的维度作为推荐上下文。
 * Agent 设计点：
 * 只把 confidence >= 0.3 的维度传给模型，避免低质量推断干扰推荐。
 */
function buildImplicitProfileSummary(implicit) {
  const summary = {};
  const keys = Object.keys(implicit);
  keys.forEach((key) => {
    const dim = implicit[key];
    if (dim && typeof dim === 'object' && dim.confidence >= 0.3) {
      summary[key] = { value: dim.value, confidence: dim.confidence };
    }
  });
  return summary;
}

/**
 * 转换衣物为模型可读格式。
 * Agent 设计点：
 * _id 是模型选择衣物时必须返回的稳定引用；后端会用它反查真实衣物，防止幻觉。
 */
function toPromptClothing(item) {
  return {
    _id: item._id,
    name: item.name || buildClothingName(item),
    category: item.category,
    type: item.type,
    color: item.color,
    material: item.material,
    fit: item.fit,
    style_tags: item.style_tags || [],
    season_tags: item.season_tags || [],
    scene_tags: item.scene_tags || [],
  };
}

/**
 * 解析豆包 JSON 输出。
 * Agent 设计点：
 * 大模型偶尔会输出 ```json 代码块或额外文字；这里先做温和清洗，再解析 JSON。
 * 真正进入数据库前还会做字段和衣物 ID 校验，解析成功不等于可信。
 */
function parseDoubaoJson(outputText) {
  const text = safeString(outputText);
  if (!text) throw new Error('豆包返回为空');

  try {
    return JSON.parse(stripJsonFence(text));
  } catch (err) {
    const jsonText = extractFirstJsonObject(text);
    if (!jsonText) throw new Error('豆包返回不是 JSON');
    return JSON.parse(jsonText);
  }
}

function stripJsonFence(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

/**
 * 标准化并校验 AI 输出。
 * Agent 设计点：
 * 模型输出不能直接入库。这里做三类保护：
 * - 字段保护：标题、理由、评分都有默认值和范围限制。
 * - 权限保护：只允许使用当前用户衣柜中的 clothes_ids。
 * - 数据保护：根据合法 ID 重新生成 outfit_items，图片和名称来自数据库，不信任模型编写。
 *
 * AI Agent 学习注释：防幻觉核心
 * 模型可能会编造“白色西装裤”这种用户衣柜里不存在的衣服。
 * 所以后端只接受模型返回的 clothes_ids，并且这些 ID 必须存在于本次 searchCloset 的候选里。
 * 最终展示图片、名称、分类全部从数据库取，不从模型文本里取。
 */
function normalizeAiOutfits(parsed, { request, clothes }) {
  const outfits = Array.isArray(parsed.outfits) ? parsed.outfits : [];
  const clothesMap = buildClothesMap(clothes);
  const normalized = [];

  for (let i = 0; i < outfits.length; i++) {
    const outfit = outfits[i] || {};
    const validIds = normalizeClothesIds(outfit.clothes_ids, clothesMap);
    if (validIds.length < 2) continue;

    const items = validIds.map((id) => clothesMap[id]).filter(Boolean);

    normalized.push({
      title: safeString(outfit.title) || buildTitle(request.scene, i),
      scene: safeString(outfit.scene) || safeString(request.scene),
      weather: safeString(outfit.weather) || buildWeatherText(request),
      temperature: Number(request.temperature) || '',
      clothes_ids: validIds,
      outfit_items: items.map(toOutfitItem),
      reason: safeString(outfit.reason) || buildReason(request, [], items),
      focus_item: safeString(outfit.focus_item) || buildFocusItem(items),
      weather_tip: safeString(outfit.weather_tip) || buildWeatherTip(request),
      swap_tip: safeString(outfit.swap_tip) || buildSwapTip(request, items),
      score: normalizeScore(outfit.score, i),
    });
  }

  return normalized.slice(0, 2);
}

function buildClothesMap(clothes) {
  const map = {};
  for (let i = 0; i < clothes.length; i++) {
    const item = clothes[i];
    if (item && item._id) map[item._id] = item;
  }
  return map;
}

function normalizeClothesIds(clothesIds, clothesMap) {
  if (!Array.isArray(clothesIds)) return [];

  const ids = [];
  for (let i = 0; i < clothesIds.length; i++) {
    const id = safeString(clothesIds[i]);
    if (id && clothesMap[id] && ids.indexOf(id) === -1) {
      ids.push(id);
    }
  }
  return ids;
}

function normalizeScore(score, index) {
  const numberScore = Number(score);
  if (!Number.isFinite(numberScore)) return Math.max(72, 90 - index * 5);
  return Math.max(0, Math.min(100, Math.round(numberScore)));
}

function buildOutfitCandidates({ request, profile, implicitProfile, memory, clothes }) {
  const variants = [];
  const preferredStyles = mergeLists(profile.preferred_styles, memory && memory.liked_styles);

  for (let offset = 0; offset < 2; offset++) {
    const top = pickClothing(clothes, '上衣', request, preferredStyles, offset);
    const bottom = pickClothing(clothes, '下装', request, preferredStyles, offset);
    const shoes = pickClothing(clothes, '鞋', request, preferredStyles, offset);
    const outer = shouldUseOuter(request) ? pickClothing(clothes, '外套', request, preferredStyles, offset) : null;
    const bag = pickClothing(clothes, '包', request, preferredStyles, offset);
    const accessory = pickClothing(clothes, '配饰', request, preferredStyles, offset);
    const items = [top, bottom, outer, shoes, bag || accessory].filter(Boolean);
    const clothesIds = items.map((item) => item._id).filter(Boolean);

    if (clothesIds.length < 2) continue;

    variants.push({
      title: buildTitle(request.scene, offset),
      scene: safeString(request.scene),
      weather: buildWeatherText(request),
      temperature: Number(request.temperature) || '',
      clothes_ids: clothesIds,
      outfit_items: items.map(toOutfitItem),
      reason: buildReason(request, preferredStyles, items),
      focus_item: buildFocusItem(items),
      weather_tip: buildWeatherTip(request),
      swap_tip: buildSwapTip(request, items),
      score: Math.max(72, 92 - offset * 6),
    });
  }

  return variants;
}

function pickClothing(clothes, category, request, preferredStyles, offset) {
  const scored = clothes
    .filter((item) => item.category === category)
    .map((item) => ({
      item,
      score: scoreClothing(item, request, preferredStyles),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[offset] ? scored[offset].item : scored[0] && scored[0].item;
}

function scoreClothing(item, request, preferredStyles) {
  let score = 0;
  const scene = safeString(request.scene);
  const temperature = Number(request.temperature) || 0;
  const styleTags = item.style_tags || [];
  const sceneTags = item.scene_tags || [];
  const seasonTags = item.season_tags || [];

  if (scene && sceneTags.indexOf(scene) > -1) score += 20;
  if (preferredStyles.some((style) => styleTags.indexOf(style) > -1)) score += 14;
  if (temperature >= 28 && seasonTags.indexOf('夏') > -1) score += 12;
  if (temperature > 0 && temperature <= 18 && ['秋', '冬'].some((season) => seasonTags.indexOf(season) > -1)) score += 12;

  return score;
}

function shouldUseOuter(request) {
  const temperature = Number(request.temperature) || 0;
  return temperature > 0 && temperature <= 20;
}

function buildTitle(scene, offset) {
  const sceneText = scene || '日常';
  return offset === 0 ? `${sceneText}基础搭配` : `${sceneText}备选搭配`;
}

function buildWeatherText(request) {
  const weather = safeString(request.weather);
  const temperature = Number(request.temperature) || '';
  if (weather && temperature) return `${weather}，${temperature}度`;
  return weather || (temperature ? `${temperature}度` : '');
}

function buildReason(request, preferredStyles, items) {
  const scene = safeString(request.scene) || '当前场景';
  const styleText = preferredStyles.length ? `，并参考了你的${preferredStyles.slice(0, 2).join('、')}偏好` : '';
  const itemText = items.map((item) => item.name || item.type || item.category).join('、');
  return `这套搭配优先选择适合${scene}的单品${styleText}。组合包含${itemText}，适合作为规则版基础推荐。`;
}

function buildFocusItem(items) {
  const item = items[0];
  if (!item) return '以整体协调为主';
  return `重点放在${item.name || item.type || item.category}，让整套搭配先有明确主视觉。`;
}

function buildWeatherTip(request) {
  const weather = safeString(request.weather);
  const temperature = Number(request.temperature) || 0;
  if (temperature >= 28) return '温度偏高，优先保持轻薄、透气和方便走动。';
  if (temperature > 0 && temperature <= 18) return '温度偏低，建议根据体感增加外套或保暖层。';
  return weather ? `已参考${weather}天气，按舒适度优先组合。` : '未填写明确天气，按日常舒适度优先组合。';
}

function buildSwapTip(request, items) {
  const hasOuter = items.some((item) => item.category === '外套');
  if (shouldUseOuter(request) && !hasOuter) return '如果早晚偏冷，可以在这套外面加一件轻外套。';
  if (Number(request.temperature) >= 28) return '如果需要更正式，可以保留主色，把鞋包换成更简洁的款式。';
  return '如果场景变休闲，可以替换成同色系鞋包，保持整体不突兀。';
}

function toOutfitItem(item) {
  return {
    _id: item._id,
    name: item.name || buildClothingName(item),
    category: item.category,
    color: item.color,
    image_url: item.image_url,
    style_tags: item.style_tags || [],
    season_tags: item.season_tags || [],
    scene_tags: item.scene_tags || [],
  };
}

function buildClothingName(item) {
  const type = item.type || item.category || '衣物';
  return item.color ? `${item.color}${type}` : type;
}

/**
 * 根据用户反馈更新长期偏好记忆。
 * Agent 设计点：
 * 这是 Memory 模块的核心——把用户的显式反馈（收藏、不喜欢、穿上身）
 * 压缩为结构化偏好数据，写入 ai_memory 表。
 *
 * 记忆分三类：
 * 1. preference（偏好摘要）：喜欢什么颜色、风格、分类。
 * 2. blacklist（黑名单规则）：明确不喜欢的颜色、风格。
 * 3. wear_frequency（穿着频次）：哪些单品频繁穿着，哪些被冷落。
 *
 * 设计原则：
 * - 不保存原始穿搭记录（已经在 outfit_records 里）。
 * - 每次反馈更新时重新计算摘要，而非追加。
 * - 用 weight 表示该记忆的置信度：多次同类反馈 → 更高 weight。
 */
async function updatePreferenceMemory(uid, record) {
  const items = record.outfit_items || [];
  if (!items.length) return;

  const now = Date.now();
  const feedbackType = record.feedback || '';
  const isFavorite = record.is_favorite;
  const hasWorn = Boolean(record.worn_date);

  // 确定反馈类型和权重
  let memoryType = 'preference';
  let weight = 0.5;

  if (feedbackType === 'disliked') {
    memoryType = 'blacklist';
    weight = 0.8;
  } else if (isFavorite) {
    memoryType = 'preference';
    weight = 0.9;
  } else if (hasWorn) {
    memoryType = 'wear_frequency';
    weight = 0.7;
  }

  // 生成偏好内容
  const colors = items.map((item) => item.color).filter(Boolean);
  const categories = items.map((item) => item.category).filter(Boolean);
  const styles = [];
  items.forEach((item) => {
    if (Array.isArray(item.style_tags)) styles.push(...item.style_tags);
  });

  const content = {
    feedback_type: feedbackType || (isFavorite ? 'favorited' : hasWorn ? 'worn' : 'feedback'),
    record_id: record._id,
    record_title: record.title || '',
    colors: [...new Set(colors)],
    categories: [...new Set(categories)],
    styles: [...new Set(styles)],
    clothes_ids: items.map((item) => item._id).filter(Boolean),
    scene: record.scene || '',
    timestamp: now,
  };

  // 更新或创建记忆记录
  // 同类型记忆只保留最新 20 条，按更新时间排序
  const collection = db.collection('ai_memory');

  const memoryRecord = {
    user_id: uid,
    memory_type: memoryType,
    content: JSON.stringify(content),
    source: 'outfit.feedback',
    weight,
    created_at: now,
    updated_at: now,
  };

  try {
    await collection.add(memoryRecord);
  } catch (err) {
    // ai_memory 集合可能还未初始化
    console.error('写入偏好记忆失败（可能 ai_memory 集合未创建）', err);
  }
}

/**
 * 把“今天穿”同步到衣物穿着频次。
 * Agent 设计点：
 * 穿搭反馈是套装级行为，但推荐时需要落到单品级信号。
 * 同步更新 clothes.wear_count 后，衣柜管理页可以做常穿/闲置提醒，推荐排序也能使用真实行为。
 */
async function markOutfitItemsWorn(uid, items) {
  const now = Date.now();
  for (let i = 0; i < items.length; i++) {
    const id = items[i] && items[i]._id;
    if (!id) continue;

    try {
      const queryRes = await db.collection('clothes').where({ _id: id, user_id: uid }).limit(1).get();
      const clothing = queryRes.data && queryRes.data[0];
      if (!clothing) continue;

      const history = Array.isArray(clothing.wear_history) ? clothing.wear_history : [];
      await db.collection('clothes').where({ _id: id, user_id: uid }).update({
        wear_count: (clothing.wear_count || 0) + 1,
        wear_history: [...history.slice(-50), now],
        last_worn_at: now,
        updated_at: now,
      });
    } catch (err) {
      console.error('同步衣物穿着频次失败', id, err);
    }
  }
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
