'use strict';

const OpenAI = require('openai');
const outfit = require('./outfit.js');
const db = uniCloud.database();
const SUMMARY_TRIGGER_MESSAGES = 20;
const SUMMARY_KEEP_MESSAGES = 8;

/**
 * AI Agent 学习注释：聊天 Agent 的总入口
 * ------------------------------------------------------------
 * 这个文件可以对照你的学习笔记看，它把多个 Agent 知识点串在一起：
 *
 * 1. Role / System Prompt
 *    buildChatAgentInstructions() 里写了模型的角色、任务边界和输出协议。
 *    这相当于告诉模型：“你不是普通聊天机器人，你是穿搭助手的意图理解模块。”
 *
 * 2. Context
 *    send() 会把用户本轮输入、上一轮 context、用户画像、衣柜数量、长期记忆、
 *    当前会话最近消息一起组织成 input，再交给 LLM 判断。
 *
 * 3. 短期对话记忆
 *    chat_messages 保存当前会话内每一条 user / assistant 消息。
 *    getRecentChatHistory(uid, sessionId) 会读取当前会话最近 12 条作为短期上下文。
 *
 * 4. 会话管理
 *    chat_sessions 保存“历史对话列表”：标题、最后一句、消息数量、更新时间。
 *    前端的“历史 / 新对话 / 切换对话 / 删除对话”都是调用这个文件的方法。
 *
 * 5. 长期记忆
 *    ai_memory 保存跨会话的压缩记忆，例如用户常见需求、搭配偏好。
 *    它不是完整聊天记录，而是给后续 Agent 使用的摘要型记忆。
 *
 * 6. Function Tool 思想
 *    模型不直接查数据库、不直接生成最终衣服列表。
 *    它先理解意图；当判断信息足够时，由后端调用 outfit.generate 这个“工具”
 *    去查衣柜、组合搭配、保存结果。
 *
 * 7. 降级策略
 *    LLM 调用失败时 fallbackIntentUnderstanding() 用规则兜底。
 *    这在 Agent 产品里很重要：模型失败不能让主流程完全不可用。
 *
 * 8. 动态工具卡片
 *    buildAssistantCards() 会把 AI 回复升级成“文字 + 可操作卡片”。
 *    用户不用只靠输入文字推进流程，也可以点场景、点试穿、点添加衣服。
 *
 * 9. 会话摘要压缩
 *    maybeCompressSessionSummary() 在对话变长后，把旧消息总结进 chat_sessions.summary。
 *    后续 prompt 只带摘要 + 最近几条消息，减少 token，同时长对话不丢上下文。
 */
const cloudObject = {
  isCloudObject: true,

  /**
   * 对话式穿搭助手（多轮 Agent 版）。
   * @url client/wardrobe/chat.send
   *
   * Agent 设计点：
   * 这个文件现在用豆包 LLM 做真正的意图识别、上下文追问、工具规划和长期记忆更新，
   * 不再只是简单规则提取场景/天气。流程：
   *
   * 1. 读取用户衣柜、画像、长期记忆、最近对话历史。
   * 2. 组装多轮对话 Context（system + 历史 messages + 当前用户消息）。
   * 3. LLM 判断：信息足够 → 调用 outfit.generate 生成穿搭；
   *    信息不足 → 返回追问 question。
   * 4. LLM 输出结构化 JSON，包含意图、追问、工具调用建议。
   * 5. 如果 LLM 不可用，回退到规则版（原有简单提取逻辑）。
   *
   * 注意：大模型调用不做任何封装，直接使用 new OpenAI(...).responses.create(...)，
   * 和 outfit.js 保持一致的调用风格。
   */
  send: async function (data = {}) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();
    let { message = '', context = {}, session_id = '' } = data;
    const text = safeString(message);

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    if (!text) {
      return {
        code: 0, msg: '', type: 'question',
        reply: '你今天准备去哪里？可以告诉我场景、天气、温度，或者想要的感觉。',
      };
    }

    // AI Agent 知识点：会话管理
    // session_id 为空表示“新对话第一次发消息”；ensureChatSession 会自动创建 chat_sessions 记录。
    // session_id 不为空表示用户正在继续某个历史对话，会复用原会话，避免刷新后上下文丢失。
    const session = await ensureChatSession({ uid, sessionId: session_id, firstMessage: text });
    const sessionId = session._id;

    // Step 1: 读取 Agent 上下文。这几类数据共同构成 LLM 的决策依据。
    // - allClothes：当前用户真实衣柜，后续推荐不能凭空编造衣服。
    // - profile：用户主动填写的长期画像，例如性别、身高、喜欢的风格。
    // - memory：跨会话长期记忆，来自历史反馈和对话摘要。
    // - history：当前会话短期记忆，帮助模型理解“刚才我们聊到哪了”。
    const allClothes = await getActiveClothes(uid);
    const profile = await getProfile(uid);
    const memory = await getPreferenceMemory(uid);
    const history = await getRecentChatHistory(uid, sessionId);

    // Step 2: LLM 判断下一步。
    // 这里不是让模型直接返回穿搭，而是先让模型判断“该追问，还是该调用搭配工具”。
    // 这就是 Agent 的核心：LLM 负责决策，后端工具负责执行。
    let intentResult = null;
    try {
      intentResult = await understandIntentWithDoubao({
        uid, text, context, profile, memory,
        clothesCount: allClothes.length,
        history,
        sessionSummary: session.summary || '',
      });
    } catch (err) {
      console.error('豆包意图理解失败，回退规则版', err);
    }

    // AI Agent 知识点：降级兜底。
    // 真实产品不能完全依赖模型稳定性；模型超时、配置缺失、输出不合法时，规则版也能继续工作。
    if (!intentResult) {
      intentResult = fallbackIntentUnderstanding({ text, context, clothesCount: allClothes.length });
    }

    // Step 3: 如果 LLM 判断信息不足，就只追问，不调用搭配生成工具。
    // 同时把 user / assistant 两条消息写入 chat_messages，保证刷新后能恢复这轮对话。
    if (intentResult.type === 'question') {
      const reply = intentResult.reply || buildFollowUpFromIntent(intentResult);
      const cards = buildAssistantCards({
        replyType: 'question',
        request: intentResult.request || {},
        records: [],
        clothesCount: allClothes.length,
      });
      await saveChatMessage({ uid, sessionId, role: 'user', text, request: intentResult.request || {} });
      await saveChatMessage({ uid, sessionId, role: 'assistant', text: reply, request: intentResult.request || {}, cards });
      const updatedSession = await updateChatSessionAfterReply({ uid, session, userMessage: text, aiReply: reply, messageAdded: 2 });
      await maybeCompressSessionSummary({ uid, session: updatedSession, profile });

      return {
        code: 0, msg: '', type: 'question',
        reply,
        cards,
        request: intentResult.request || {},
        intent: intentResult.intent || {},
        session: updatedSession,
        session_id: sessionId,
      };
    }

    // Step 4: 信息足够，调用 Function Tool。
    // outfit.generate 可以理解为给 Agent 的“生成穿搭工具”：
    // 它会查数据库、筛选衣柜、调用模型/规则生成、校验衣物 ID、保存 outfit_records。
    const request = intentResult.request || buildOutfitRequestFromChatFallback({ message: text, context });
    const generateRes = await outfit.generate.call(this, { request });

    if (generateRes.code && generateRes.code !== 0) {
      const reply = generateRes.msg || '这次没能从你的衣柜里组合出合适搭配，可以先多添加几件常穿单品。';
      const cards = buildAssistantCards({
        replyType: 'empty_outfit',
        request,
        records: [],
        clothesCount: allClothes.length,
      });
      await saveChatMessage({ uid, sessionId, role: 'user', text, request });
      await saveChatMessage({ uid, sessionId, role: 'assistant', text: reply, request, cards });
      const updatedSession = await updateChatSessionAfterReply({ uid, session, userMessage: text, aiReply: reply, messageAdded: 2 });
      await maybeCompressSessionSummary({ uid, session: updatedSession, profile });
      return {
        code: 0,
        msg: '',
        type: 'question',
        reply,
        cards,
        request,
        records: [],
        session: updatedSession,
        session_id: sessionId,
        intent: intentResult.intent || {},
      };
    }

    res.type = 'outfit';
    res.reply = buildOutfitReply(generateRes.records || [], intentResult);
    res.request = request;
    res.records = generateRes.records || [];
    res.cards = buildAssistantCards({
      replyType: 'outfit',
      request,
      records: res.records,
      clothesCount: allClothes.length,
    });
    res.source = generateRes.source || '';
    res.ai_error = generateRes.ai_error || '';
    res.ai_task_id = generateRes.ai_task_id || '';
    res.intent = intentResult.intent || {};
    res.session_id = sessionId;

    // Step 5: 长期记忆。
    // chat_messages 是完整短期记录，适合恢复当前会话；
    // ai_memory 是压缩后的长期记忆，适合跨会话复用，避免每次都把大量历史对话塞进 prompt。
    if (profile.memory_learning_enabled !== false) {
      try {
        await saveChatMemory(uid, text, res.reply, intentResult);
      } catch (err) {
        console.error('保存对话记忆失败', err);
      }
    }

    // 保存当前会话内的原始消息，属于“短期记忆 / 会话管理”。
    await saveChatMessage({ uid, sessionId, role: 'user', text, request });
    await saveChatMessage({ uid, sessionId, role: 'assistant', text: res.reply, request, records: res.records, cards: res.cards });
    res.session = await updateChatSessionAfterReply({ uid, session, userMessage: text, aiReply: res.reply, messageAdded: 2 });
    await maybeCompressSessionSummary({ uid, session: res.session, profile });

    return res;
  },

  /**
   * 查询当前用户的对话列表。
   * @url client/wardrobe/chat.listSessions
   *
   * AI Agent 学习注释：会话管理
   * 这个接口只返回会话摘要，不返回完整消息。
   * 原因是历史列表只需要标题、最后一句、更新时间；完整消息等用户点进去再读。
   * 这样可以减少数据库读取量，也避免前端一次加载太多历史上下文。
   */
  listSessions: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const queryRes = await db
      .collection('chat_sessions')
      .where({ user_id: uid, status: 'active' })
      .orderBy('updated_at', 'desc')
      .limit(50)
      .get();

    return { code: 0, msg: '', rows: queryRes.data || [] };
  },

  /**
   * 读取单个对话消息。
   * @url client/wardrobe/chat.sessionDetail
   *
   * AI Agent 学习注释：短期对话记忆
   * chat_messages 保存的是某一个 session 内的 user / assistant 原始消息。
   * 用户切换历史对话时，前端调用这个接口恢复 messages 和 context。
   * 这解决了“刷新页面丢失聊天记录”和“前后端上下文不一致”的问题。
   */
  sessionDetail: async function (data = {}) {
    let { uid } = this.getClientInfo();
    const sessionId = safeString(data.session_id);
    if (!uid) return { code: -1, msg: '用户未登录' };
    if (!sessionId) return { code: -1, msg: '缺少会话ID' };

    const session = await getOwnedSession(uid, sessionId);
    if (!session) return { code: -1, msg: '会话不存在' };

    const messageRes = await db
      .collection('chat_messages')
      .where({ user_id: uid, session_id: sessionId, status: 'active' })
      .orderBy('created_at', 'asc')
      .limit(100)
      .get();

    return { code: 0, msg: '', session, messages: messageRes.data || [] };
  },

  /**
   * 新建空对话。
   * @url client/wardrobe/chat.createSession
   *
   * AI Agent 学习注释：新建对话
   * 新对话的意义是清空短期上下文，让下一次提问不受旧对话影响。
   * 例如上一轮在聊“婚礼”，新对话里问“明天上班”时，就不应该继续套用婚礼场景。
   */
  createSession: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const now = Date.now();
    const record = {
      user_id: uid,
      title: '新的搭配对话',
      title_source: 'default',
      summary: '',
      summarized_message_count: 0,
      last_message: '',
      message_count: 0,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    const addRes = await db.collection('chat_sessions').add(record);
    return { code: 0, msg: '', session: { ...record, _id: addRes.id, id: addRes.id } };
  },

  /**
   * 删除对话。
   * @url client/wardrobe/chat.removeSession
   *
   * AI Agent 学习注释：软删除
   * 这里不直接物理删除，而是把 status 改成 deleted。
   * 这样做的好处是数据更安全，后续如果要做用户行为分析或误删恢复，还有空间。
   */
  removeSession: async function (data = {}) {
    let { uid } = this.getClientInfo();
    const sessionId = safeString(data.session_id);
    if (!uid) return { code: -1, msg: '用户未登录' };
    if (!sessionId) return { code: -1, msg: '缺少会话ID' };

    const now = Date.now();
    const updateRes = await db
      .collection('chat_sessions')
      .where({ _id: sessionId, user_id: uid })
      .update({ status: 'deleted', updated_at: now });
    await db
      .collection('chat_messages')
      .where({ session_id: sessionId, user_id: uid })
      .update({ status: 'deleted', updated_at: now });

    return { code: 0, msg: '', updated: updateRes.updated || 0 };
  },
};

module.exports = cloudObject;

async function ensureChatSession({ uid, sessionId, firstMessage }) {
  // AI Agent 学习注释：会话创建入口
  // 用户第一次发消息时，前端还没有 session_id。
  // 后端在这里创建会话，并用第一条用户问题生成标题。
  // 后续前端会保存返回的 session_id，再发消息时带回来，形成同一轮多轮对话。
  const existing = sessionId ? await getOwnedSession(uid, sessionId) : null;
  if (existing) return existing;

  const now = Date.now();
  const title = buildSessionTitle(firstMessage);
  const record = {
    user_id: uid,
    title,
    title_source: 'first_message',
    summary: '',
    summarized_message_count: 0,
    last_message: truncateText(firstMessage, 80),
    message_count: 0,
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  const addRes = await db.collection('chat_sessions').add(record);
  return { ...record, _id: addRes.id, id: addRes.id };
}

async function getOwnedSession(uid, sessionId) {
  try {
    const queryRes = await db
      .collection('chat_sessions')
      .where({ _id: sessionId, user_id: uid, status: 'active' })
      .limit(1)
      .get();
    return queryRes.data && queryRes.data[0] ? queryRes.data[0] : null;
  } catch (err) {
    return null;
  }
}

async function saveChatMessage({ uid, sessionId, role, text, request = {}, records = [], cards = [] }) {
  try {
    // AI Agent 学习注释：短期记忆落库
    // role 对应你笔记里的 system / user / assistant 里的 user 和 assistant。
    // system 不保存到这里，因为 system 是后端固定 prompt，每次由代码动态构建。
    // request 保存结构化意图，records 保存本轮生成的搭配结果，cards 保存动态工具卡片。
    // cards 也是短期记忆的一部分：用户切换会话后，仍然能看到当时 AI 给出的操作入口。
    const now = Date.now();
    await db.collection('chat_messages').add({
      user_id: uid,
      session_id: sessionId,
      role,
      text: truncateText(text, 2000),
      request,
      records: Array.isArray(records) ? records.slice(0, 3) : [],
      cards: Array.isArray(cards) ? cards.slice(0, 4) : [],
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    console.error('保存聊天消息失败（可能集合未创建）', err);
  }
}

async function maybeCompressSessionSummary({ uid, session, profile = {} }) {
  // AI Agent 学习注释：会话摘要压缩
  // 一轮对话通常包含 user + assistant 两条消息。
  // 当 message_count 超过 20 条，也就是大约 10 轮后，继续把所有旧消息塞进 prompt 会浪费 token。
  // 这里把旧消息总结进 chat_sessions.summary，后续只带“摘要 + 最近几条消息”。
  const messageCount = Number(session.message_count) || 0;
  const summarizedCount = Number(session.summarized_message_count) || 0;
  if (messageCount < SUMMARY_TRIGGER_MESSAGES) return;
  if (messageCount - summarizedCount < SUMMARY_KEEP_MESSAGES + 6) return;

  try {
    const queryRes = await db
      .collection('chat_messages')
      .where({ user_id: uid, session_id: session._id, status: 'active' })
      .orderBy('created_at', 'asc')
      .limit(100)
      .get();
    const messages = queryRes.data || [];
    const compressEnd = Math.max(0, messages.length - SUMMARY_KEEP_MESSAGES);
    if (compressEnd <= summarizedCount) return;

    const messagesToCompress = messages.slice(summarizedCount, compressEnd);
    if (!messagesToCompress.length) return;

    const oldSummary = safeString(session.summary);
    const summary = await summarizeMessagesWithDoubao({
      oldSummary,
      messages: messagesToCompress,
      profile,
    });
    const patch = {
      summary,
      summarized_message_count: compressEnd,
      updated_at: Date.now(),
    };
    await db
      .collection('chat_sessions')
      .where({ _id: session._id, user_id: uid })
      .update(patch);
    session.summary = summary;
    session.summarized_message_count = compressEnd;
  } catch (err) {
    console.error('压缩会话摘要失败', err);
  }
}

async function summarizeMessagesWithDoubao({ oldSummary, messages, profile }) {
  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_TEXT_MODEL || '';
  const fallback = buildRuleSummary({ oldSummary, messages });
  if (!apiKey || !model) return fallback;

  const instructions = [
    '你是私人穿搭助手的会话摘要模块。',
    '你的任务是把较早的多轮对话压缩成短摘要，供后续 Agent 继续理解上下文。',
    '摘要要保留：用户目标、场景、天气/温度、风格偏好、明确拒绝点、已经推荐/试穿过的方向。',
    '不要编造用户没有说过的信息。',
    '只返回 200 字以内中文摘要，不要 Markdown。',
  ].join('\n');
  const input = JSON.stringify({
    previous_summary: oldSummary || '',
    user_profile: {
      gender: profile.gender || '',
      preferred_styles: profile.preferred_styles || [],
    },
    messages: messages.map((item) => ({
      role: item.role,
      text: truncateText(item.text, 500),
      request: item.request || {},
    })),
  }, null, 2);

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      timeout: 15000,
      maxRetries: 0,
    });
    const response = await client.responses.create({
      model,
      instructions,
      input,
      temperature: 0.1,
    }, {
      timeout: 15000,
      maxRetries: 0,
    });
    return truncateText(response.output_text || fallback, 260);
  } catch (err) {
    console.error('豆包会话摘要失败，使用规则摘要', err.message || err);
    return fallback;
  }
}

function buildRuleSummary({ oldSummary, messages }) {
  const snippets = messages
    .filter((item) => item.role === 'user')
    .map((item) => safeString(item.text))
    .filter(Boolean)
    .slice(-6);
  const summary = [
    oldSummary ? `之前摘要：${oldSummary}` : '',
    snippets.length ? `近期用户需求：${snippets.join('；')}` : '',
  ].filter(Boolean).join('。');
  return truncateText(summary || '用户在当前会话中持续咨询穿搭建议。', 260);
}

function buildAssistantCards({ replyType, request = {}, records = [], clothesCount = 0 }) {
  // AI Agent 学习注释：动态工具卡片
  // 传统聊天只返回 text，用户还要继续打字。
  // 这里返回 cards，让 AI 回复能带“可点击的下一步”，例如选择场景、确认试穿、添加衣服。
  // 前端只负责渲染协议，不需要猜 AI 想让用户做什么。
  if (!clothesCount) {
    return [{
      type: 'quick_actions',
      title: '先建立你的衣橱',
      desc: '添加几件常穿单品后，我才能基于真实衣柜推荐。',
      actions: [
        { label: '添加衣服', action: 'go_page', pageUrl: '/pages/wardrobe/upload' },
      ],
    }];
  }

  if (replyType === 'outfit' && records.length) {
    const first = records[0] || {};
    return [{
      type: 'outfit_confirm',
      title: first.title || '这套搭配可以直接使用',
      desc: first.reason || '我已经从你的衣柜里挑了一套可用组合。',
      items: (first.outfit_items || []).slice(0, 4).map((item) => ({
        _id: item._id,
        name: item.name || item.category || '单品',
        image_url: item.image_url || '',
        category: item.category || '',
      })),
      actions: [
        { label: '去 AI 试穿', action: 'go_page', pageUrl: '/pages/wardrobe/tryon' },
        { label: '看穿搭历史', action: 'go_page', pageUrl: '/pages/wardrobe/outfit-history' },
      ],
    }];
  }

  const scene = safeString(request.scene);
  if (!scene) {
    return [{
      type: 'scene_picker',
      title: '选择今天的场景',
      desc: '点一下就能继续生成，不用再手动输入。',
      options: [
        { label: '上班通勤', text: '上班通勤，想要利落舒服' },
        { label: '约会见面', text: '约会见面，想要自然有氛围感' },
        { label: '旅行出门', text: '旅行出门，想要轻便好走' },
        { label: '朋友聚会', text: '朋友聚会，想要有一点亮点' },
      ],
    }];
  }

  return [{
    type: 'quick_actions',
    title: '还可以继续',
    desc: '你可以补充偏好，或直接进入相关功能。',
    actions: [
      { label: '生成完整搭配', action: 'send_text', text: `${scene}场景，帮我从衣柜里生成一套完整搭配` },
      { label: 'AI 试穿', action: 'go_page', pageUrl: '/pages/wardrobe/tryon' },
    ],
  }];
}

async function updateChatSessionAfterReply({ uid, session, userMessage, aiReply, messageAdded }) {
  // AI Agent 学习注释：会话摘要
  // chat_sessions 不保存全部内容，只保存列表展示需要的信息：
  // 标题、最后一句、消息数量、更新时间。
  // 这相当于微信聊天列表里的“会话摘要”，用于快速切换历史对话。
  const now = Date.now();
  const currentCount = Number(session.message_count) || 0;
  const patch = {
    last_message: truncateText(aiReply || userMessage, 80),
    message_count: currentCount + (Number(messageAdded) || 0),
    updated_at: now,
  };

  if (!session.title || session.title === '新的搭配对话') {
    patch.title = buildSessionTitle(userMessage);
    patch.title_source = 'first_message';
  }

  try {
    await db
      .collection('chat_sessions')
      .where({ _id: session._id, user_id: uid })
      .update(patch);
  } catch (err) {
    console.error('更新聊天会话失败（可能集合未创建）', err);
  }

  return {
    ...session,
    ...patch,
  };
}

function buildSessionTitle(text) {
  // AI Agent 学习注释：标题生成策略
  // 这里没有再调用一次大模型做标题总结，原因是：
  // 1. 标题不是核心业务结果，额外调用会增加费用和等待时间。
  // 2. 用户第一条问题通常已经能表达主题，例如“明天朋友婚礼怎么穿”。
  // 3. 截取第一句 + 限长可以稳定生成可读标题。
  // 如果后续要升级，可以新增 title_source = 'ai_summary'，异步让模型总结标题。
  const normalized = safeString(text)
    .replace(/\s+/g, ' ')
    .replace(/^[，。！？、,.!?\s]+|[，。！？、,.!?\s]+$/g, '');
  const firstSentence = normalized.split(/[。！？!?；;\n]/)[0] || normalized;
  const title = truncateText(firstSentence, 18).replace(/[，。！？、,.!?\s]+$/g, '');
  return title || '新的搭配对话';
}

/**
 * 用豆包理解用户意图。
 * Agent 设计点：
 * 这是真正的 LLM Agent 核心——不是硬编码关键词匹配，而是让模型理解用户自然语言，
 * 并返回结构化意图。模型需要判断：
 * - 用户想做什么（生成穿搭/查询衣柜/试穿/比价/管理衣物）
 * - 当前信息是否足够（场景、天气、温度是否已明确）
 * - 如果不够，应该追问什么
 * - 如果能生成，抽取场景/天气/温度/描述
 *
 * 输出格式是严格 JSON，方便后端解析和分流。
 */
async function understandIntentWithDoubao({ uid, text, context, profile, memory, clothesCount, history, sessionSummary }) {
  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_TEXT_MODEL || '';

  if (!apiKey || !model) throw new Error('缺少豆包配置');

  const instructions = buildChatAgentInstructions();
  const input = JSON.stringify({
    current_message: text,
    previous_context: {
      request: context.request || {},
      // AI Agent 学习注释：摘要压缩后的上下文
      // session_summary 保存较早对话的压缩摘要，recent_history 保存最近几条原文。
      // 这样长会话不会因为截断旧消息而丢掉核心意图。
      session_summary: sessionSummary || '',
    },
    user_profile: {
      gender: profile.gender || '',
      age_range: profile.age_range || '',
      preferred_styles: profile.preferred_styles || [],
      preferred_scenes: profile.preferred_scenes || [],
      liked_colors: profile.liked_colors || [],
      disliked_colors: profile.disliked_colors || [],
    },
    preference_memory: memory || {},
    wardrobe_summary: {
      total_clothes: clothesCount,
      has_clothes: clothesCount > 0,
    },
    recent_history: (history || []).slice(-6).map((h) => ({
      role: h.role,
      excerpt: (h.text || '').slice(0, 200),
    })),
  }, null, 2);

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    timeout: 15000,
    maxRetries: 0,
  });

  const response = await client.responses.create({
    model,
    instructions,
    input,
    temperature: 0.15,
  }, {
    timeout: 15000,
    maxRetries: 0,
  });

  const outputText = typeof response.output_text === 'string'
    ? response.output_text.trim()
    : '';

  if (!outputText) throw new Error('豆包返回为空');

  // 解析 JSON 输出
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(outputText));
  } catch (err) {
    const jsonText = extractFirstJsonObject(outputText);
    if (!jsonText) throw new Error('豆包意图输出不是 JSON');
    parsed = JSON.parse(jsonText);
  }

  return normalizeIntentResult(parsed, { text, context });
}

/**
 * 构建对话 Agent 的 system instructions。
 * Agent 设计点：
 * 这是 Agent 的"角色 + 能力边界 + 输出协议"定义。
 * - 角色：私人穿搭助手，理解自然语言穿搭需求
 * - 能力边界：可以判断意图、追问、提取穿搭参数
 * - 输出协议：必须返回 JSON，包含 type、intent、request、reply
 */
function buildChatAgentInstructions() {
  return [
    '你是一个私人穿搭助手的对话理解模块。你的任务不是直接推荐衣服，而是理解用户意图并结构化输出。',
    '',
    '你需要判断：',
    '1. intent.type：outfit_generate（生成穿搭）/ closet_query（查询衣柜）/ try_on（试穿）/ price_search（比价）/ manage_clothes（管理衣物）/ general_chat（一般对话）',
    '2. 当前信息是否足够生成穿搭。如果场景、天气、温度、风格偏好都不明确，应该追问。',
    '3. 如果能生成穿搭，从用户消息中提取：scene（场景）、weather（天气）、temperature（温度数字）、text（用户描述）。',
    '',
    '输出必须是严格 JSON，不要 Markdown，不要解释性文字：',
    '{',
    '  "type": "outfit" 或 "question",',
    '  "intent": { "type": "outfit_generate", "confidence": 0.85 },',
    '  "request": { "scene": "上班", "weather": "晴", "temperature": 25, "text": "想要简约正式一点" },',
    '  "reply": "如果追问，这里填追问内容；如果生成穿搭，这里留空"',
    '}',
    '',
    '规则：',
    '- wardrobe_summary.has_clothes 为 false 时，先引导用户上传衣服。',
    '- 追问不超过 2 轮，如果用户已经回答过场景/天气，就不要再问同样的内容。',
    '- 不要编造用户没有给出的信息。temperature 必须是数字或空。',
    '- confidence 是 0 到 1 的数字，表示对意图判断的置信度。',
  ].join('\n');
}

/**
 * 归一化意图理解结果。
 * Agent 设计点：
 * LLM 输出可能有各种变体，这里统一成稳定结构，并兜底缺失字段。
 */
function normalizeIntentResult(parsed, { text, context }) {
  const intent = parsed.intent || {};
  const request = parsed.request || {};
  const previousRequest = context.request || {};

  return {
    type: parsed.type === 'question' ? 'question' : 'outfit',
    intent: {
      type: safeString(intent.type) || 'outfit_generate',
      confidence: Number(intent.confidence) || 0.8,
    },
    request: {
      scene: safeString(request.scene) || previousRequest.scene || '',
      weather: safeString(request.weather) || previousRequest.weather || '',
      temperature: Number(request.temperature) || previousRequest.temperature || '',
      text: safeString(request.text) || text,
      from_chat: true,
    },
    reply: safeString(parsed.reply),
  };
}

/**
 * 规则版意图理解（兜底）。
 * Agent 设计点：
 * 当豆包不可用时，仍用简单规则提取场景/天气/温度，保证产品可用。
 * 这是 Agent 的"降级模式"——不智能但可靠。
 */
function fallbackIntentUnderstanding({ text, context, clothesCount }) {
  if (!clothesCount) {
    return {
      type: 'question',
      intent: { type: 'closet_query', confidence: 1 },
      request: {},
      reply: '你的衣柜还是空的，先去上传几件常穿的衣服吧，我才能帮你搭配。',
    };
  }

  const request = buildOutfitRequestFromChatFallback({ message: text, context });
  const hasScene = Boolean(request.scene);
  const hasWeather = Boolean(request.weather || request.temperature);
  const hasText = safeString(request.text).length >= 8;

  if (!hasScene && !hasWeather && !hasText) {
    return {
      type: 'question',
      intent: { type: 'outfit_generate', confidence: 0.3 },
      request,
      reply: buildFollowUpFromIntent({ request }),
    };
  }

  return {
    type: 'outfit',
    intent: { type: 'outfit_generate', confidence: 0.7 },
    request,
    reply: '',
  };
}

/**
 * 根据缺失字段生成追问文案。
 * Agent 设计点：
 * 追问不是随机的——优先问场景（最重要的穿搭约束），其次问天气/温度。
 */
function buildFollowUpFromIntent(intentResult) {
  const request = intentResult.request || {};
  if (!request.scene) return '你准备去什么场景？比如上班、约会、旅行、运动、聚会或海边。';
  if (!request.weather && !request.temperature) return '今天大概什么天气或多少度？我会按体感帮你避开太热或太冷的搭配。';
  return '你想穿得更正式、休闲、清爽，还是更适合拍照？告诉我更多偏好，我会搭得更精准。';
}

function buildOutfitRequestFromChatFallback({ message, context }) {
  const previousRequest = context.request || {};
  const temperature = extractTemperature(message) || previousRequest.temperature || '';

  return {
    scene: extractScene(message) || previousRequest.scene || '',
    weather: extractWeather(message) || previousRequest.weather || '',
    temperature,
    text: truncateText(message, 300),
    from_chat: true,
    saved_at: Date.now(),
  };
}

function buildOutfitReply(records, intentResult) {
  if (!records.length) return '我还没从你的衣柜里找到足够合适的组合，可以先多上传几件常穿单品。';
  const first = records[0];
  const prefix = intentResult && intentResult.intent && intentResult.intent.confidence > 0.8
    ? '根据你的需求，'
    : '我先给你挑了';
  return `${prefix}「${first.title}」。${first.reason || ''}`;
}

/**
 * 保存对话记忆。
 * Agent 设计点：
 * 每轮对话生成后，把用户需求和 AI 回复的摘要写入 ai_memory 表。
 * 这不是长期偏好（偏好由 outfit.feedback 沉淀），而是对话上下文，
 * 让后续对话能参考最近的穿搭讨论。
 */
async function saveChatMemory(uid, userMessage, aiReply, intentResult) {
  const now = Date.now();
  const record = {
    user_id: uid,
    memory_type: 'chat_context',
    content: JSON.stringify({
      user: truncateText(userMessage, 300),
      assistant: truncateText(aiReply, 500),
      intent: intentResult.intent || {},
    }),
    source: 'chat.send',
    weight: 0.3,
    created_at: now,
    updated_at: now,
  };

  try {
    await db.collection('ai_memory').add(record);
  } catch (err) {
    // ai_memory 表可能还没初始化，这不影响主流程
    console.error('保存对话记忆失败（可能 ai_memory 集合未创建）', err);
  }
}

/**
 * 读取最近对话历史。
 * Agent 设计点：
 * 对话历史是短期上下文。最近 10 轮对话保留原文，
 * 更早的对话应由 Memory 压缩模块总结后写入 ai_memory。
 */
async function getRecentChatHistory(uid, sessionId) {
  if (sessionId) {
    try {
      const messageRes = await db
        .collection('chat_messages')
        .where({
          user_id: uid,
          session_id: sessionId,
          status: 'active',
        })
        .orderBy('created_at', 'desc')
        .limit(12)
        .get();

      return (messageRes.data || [])
        .reverse()
        .map((item) => ({
          role: item.role,
          text: item.text || '',
        }));
    } catch (err) {}
  }

  try {
    const queryRes = await db
      .collection('ai_memory')
      .where({
        user_id: uid,
        memory_type: 'chat_context',
      })
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();

    return (queryRes.data || []).map((item) => {
      let content = {};
      try { content = typeof item.content === 'string' ? JSON.parse(item.content) : item.content; } catch (e) {}
      return {
        role: 'user',
        text: content.user || '',
        reply: content.assistant || '',
      };
    }).reverse();
  } catch (err) {
    return [];
  }
}

async function getProfile(uid) {
  const queryRes = await db
    .collection('user_profile')
    .where({ user_id: uid })
    .limit(1)
    .get();
  return queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};
}

async function getActiveClothes(uid) {
  const queryRes = await db
    .collection('clothes')
    .where({ user_id: uid, status: 'active' })
    .limit(200)
    .get();
  return queryRes.data || [];
}

/**
 * 读取用户反馈并压缩成偏好记忆。
 * Agent 设计点：
 * Memory 不能简单等于"把所有历史记录塞给模型"。
 * 这里把喜欢、不喜欢、穿过的搭配压缩成统计摘要，减少 token 成本。
 */
async function getPreferenceMemory(uid) {
  const queryRes = await db
    .collection('outfit_records')
    .where({ user_id: uid, status: 'active' })
    .orderBy('updated_at', 'desc')
    .limit(80)
    .get();
  return buildPreferenceMemory(queryRes.data || []);
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
    feedback_count: records.filter((r) => r.feedback || r.is_favorite || r.worn_date).length,
  };
}

function topValues(items, field, limit) {
  const counts = {};
  for (let i = 0; i < items.length; i++) {
    const value = safeString(items[i] && items[i][field]);
    if (value) counts[value] = (counts[value] || 0) + 1;
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, limit);
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
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, limit);
}

function extractScene(text) {
  const scenes = ['上班', '约会', '旅行', '聚会', '运动', '海边', '日常'];
  for (let i = 0; i < scenes.length; i++) {
    if (text.indexOf(scenes[i]) > -1) return scenes[i];
  }
  if (text.indexOf('通勤') > -1 || text.indexOf('公司') > -1) return '上班';
  if (text.indexOf('跑步') > -1 || text.indexOf('健身') > -1) return '运动';
  return '';
}

function extractWeather(text) {
  const weathers = ['晴', '晴天', '阴', '阴天', '雨', '下雨', '雪', '大风', '降温', '热', '冷'];
  for (let i = 0; i < weathers.length; i++) {
    if (text.indexOf(weathers[i]) > -1) return weathers[i];
  }
  return '';
}

function extractTemperature(text) {
  const match = text.match(/(-?\d{1,2})\s*(度|℃|c|C)/);
  return match ? Number(match[1]) : '';
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

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateText(text, maxLength) {
  const value = safeString(text);
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
