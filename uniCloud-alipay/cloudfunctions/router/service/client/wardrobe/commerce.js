'use strict';

const db = uniCloud.database();

const cloudObject = {
  isCloudObject: true,

  /**
   * 查询收藏内容。
   * @url client/wardrobe/commerce.favorites
   * Agent 设计点：
   * 收藏是显式正反馈。穿搭收藏会进入推荐 Memory，商品收藏会进入购物意图 Memory。
   * 这里把两类收藏放在同一个入口返回，方便“我的-收藏”页形成商业项目常见的内容资产页。
   */
  favorites: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const outfitRes = await db
      .collection('outfit_records')
      .where({
        user_id: uid,
        status: 'active',
        is_favorite: true,
      })
      .orderBy('updated_at', 'desc')
      .limit(50)
      .get();
    const productRes = await db
      .collection('price_favorites')
      .where({
        user_id: uid,
        status: 'active',
      })
      .orderBy('updated_at', 'desc')
      .limit(50)
      .get();

    return {
      code: 0,
      msg: '',
      outfits: outfitRes.data || [],
      products: productRes.data || [],
    };
  },

  /**
   * 查询会员权益。
   * @url client/wardrobe/commerce.member
   * Agent 设计点：
   * 试穿、高清图、更多衣柜容量都是成本型能力，必须有权益和额度边界。
   * 这里先实现权益台账，不直接接支付；后续接支付后只需要在订单成功回调里更新这些字段。
   */
  member: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const profile = await getOrCreateProfile(uid);
    const plan = profile.member_plan || 'free';
    const quota = Number(profile.tryon_quota_balance);

    return {
      code: 0,
      msg: '',
      member: {
        plan,
        plan_text: plan === 'pro' ? '高级会员' : '免费版',
        tryon_quota_balance: Number.isFinite(quota) ? quota : 3,
        closet_limit: plan === 'pro' ? 1000 : 80,
        hd_tryon_enabled: plan === 'pro',
        price_tracking_limit: plan === 'pro' ? 100 : 5,
        expires_at: profile.member_expires_at || '',
      },
      plans: [
        {
          key: 'free',
          title: '免费版',
          price: '0',
          features: ['80 件衣柜容量', '基础 AI 搭配', '每月 3 次试穿'],
        },
        {
          key: 'pro',
          title: '高级会员',
          price: '待接支付',
          features: ['1000 件衣柜容量', '高级 AI 搭配', '更多试穿额度', '价格追踪上限提升'],
        },
      ],
    };
  },

  /**
   * 开发期授予会员或额度。
   * @url client/wardrobe/commerce.activatePlan
   * Agent 设计点：
   * 正式商业项目应由支付回调发放权益。当前先保留一个服务端入口，方便没有支付网关时测试试穿额度扣减和会员 UI。
   */
  activatePlan: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { plan = 'pro' } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const now = Date.now();
    const nextPlan = safeString(plan) === 'pro' ? 'pro' : 'free';
    const patch = {
      member_plan: nextPlan,
      member_expires_at: nextPlan === 'pro' ? now + 30 * 24 * 60 * 60 * 1000 : '',
      tryon_quota_balance: nextPlan === 'pro' ? 30 : 3,
      updated_at: now,
    };

    await upsertProfile(uid, patch);
    return {
      code: 0,
      msg: '',
      member: patch,
    };
  },

  /**
   * 查询设置。
   * @url client/wardrobe/commerce.settings
   * Agent 设计点：
   * 设置页不仅是 UI。通知、隐私、数据使用授权会决定 Agent 能否主动提醒、是否能使用历史反馈做长期记忆。
   */
  settings: async function () {
    let { uid } = this.getClientInfo();
    if (!uid) return { code: -1, msg: '用户未登录' };

    const profile = await getOrCreateProfile(uid);
    return {
      code: 0,
      msg: '',
      settings: {
        daily_reminder_enabled: profile.daily_reminder_enabled !== false,
        price_alert_enabled: profile.price_alert_enabled !== false,
        memory_learning_enabled: profile.memory_learning_enabled !== false,
        private_image_mode: Boolean(profile.private_image_mode),
      },
    };
  },

  /**
   * 保存设置。
   * @url client/wardrobe/commerce.saveSettings
   * Agent 设计点：
   * 用户可以关闭长期记忆学习。关闭后反馈仍可作为历史展示，但推荐 Agent 不应继续把它压缩进偏好字段。
   */
  saveSettings: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { settings = {} } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const patch = {
      daily_reminder_enabled: settings.daily_reminder_enabled !== false,
      price_alert_enabled: settings.price_alert_enabled !== false,
      memory_learning_enabled: settings.memory_learning_enabled !== false,
      private_image_mode: Boolean(settings.private_image_mode),
      updated_at: Date.now(),
    };
    await upsertProfile(uid, patch);

    return {
      code: 0,
      msg: '',
      settings: patch,
    };
  },

  /**
   * 收藏商品。
   * @url client/wardrobe/commerce.favoriteProduct
   * Agent 设计点：
   * 商品收藏代表“可能购买/想比较”的商业意图。后续可以用于价格提醒、搭配补齐和带货转化。
   */
  favoriteProduct: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { product = {}, status = '' } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const normalized = normalizeProduct(product);
    if (!normalized.title && !normalized.url) return { code: -1, msg: '商品信息不完整' };

    const now = Date.now();
    const collection = db.collection('price_favorites');
    const queryRes = await collection
      .where({
        user_id: uid,
        product_key: normalized.product_key,
      })
      .limit(1)
      .get();

    const row = {
      ...normalized,
      user_id: uid,
      status: safeString(status || product.status) === 'inactive' ? 'inactive' : 'active',
      updated_at: now,
    };

    if (queryRes.data && queryRes.data[0]) {
      const id = queryRes.data[0]._id;
      await collection.doc(id).update(row);
      return { code: 0, msg: '', favorite: { ...queryRes.data[0], ...row, _id: id } };
    }

    const addRes = await collection.add({
      ...row,
      created_at: now,
    });
    return { code: 0, msg: '', favorite: { ...row, _id: addRes.id, id: addRes.id, created_at: now } };
  },

  /**
   * 价格追踪。
   * @url client/wardrobe/commerce.trackPrice
   * Agent 设计点：
   * 价格追踪把“一次搜索”变成“持续商业机会”。这里先记录目标价格和商品链接；
   * 定时任务、降价提醒和佣金链接可以在后续运营后台接入。
   */
  trackPrice: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { product = {}, target_price = '' } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const normalized = normalizeProduct(product);
    if (!normalized.title && !normalized.url) return { code: -1, msg: '商品信息不完整' };

    const now = Date.now();
    const record = {
      ...normalized,
      user_id: uid,
      target_price: safeString(target_price),
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    const addRes = await db.collection('price_track_records').add(record);

    return {
      code: 0,
      msg: '',
      track: {
        ...record,
        _id: addRes.id,
        id: addRes.id,
      },
    };
  },

  /**
   * 查询价格追踪记录。
   * @url client/wardrobe/commerce.priceTracks
   * Agent 设计点：
   * 价格追踪和商品收藏是两种不同商业意图：收藏表示想保留，追踪表示等待价格触发。
   * 分开查询可以让后续定时降价提醒、目标价命中和转化归因更清晰。
   */
  priceTracks: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { product_key = '', url = '' } = data;
    if (!uid) return { code: -1, msg: '用户未登录' };

    const whereJson = {
      user_id: uid,
      status: 'active',
    };
    const productKey = safeString(product_key);
    const productUrl = safeString(url);
    if (productKey) whereJson.product_key = productKey;
    if (!productKey && productUrl) whereJson.url = productUrl;

    const queryRes = await db
      .collection('price_track_records')
      .where(whereJson)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    return {
      code: 0,
      msg: '',
      rows: queryRes.data || [],
    };
  },
};

module.exports = cloudObject;

async function getOrCreateProfile(uid) {
  const queryRes = await db
    .collection('user_profile')
    .where({
      user_id: uid,
    })
    .limit(1)
    .get();

  if (queryRes.data && queryRes.data[0]) return queryRes.data[0];

  const now = Date.now();
  const profile = {
    user_id: uid,
    member_plan: 'free',
    tryon_quota_balance: 3,
    memory_learning_enabled: true,
    daily_reminder_enabled: true,
    price_alert_enabled: true,
    private_image_mode: false,
    created_at: now,
    updated_at: now,
  };
  const addRes = await db.collection('user_profile').add(profile);
  return {
    ...profile,
    _id: addRes.id,
  };
}

async function upsertProfile(uid, patch) {
  const collection = db.collection('user_profile');
  const queryRes = await collection
    .where({
      user_id: uid,
    })
    .limit(1)
    .get();

  if (queryRes.data && queryRes.data[0]) {
    await collection.doc(queryRes.data[0]._id).update(patch);
    return;
  }

  await collection.add({
    user_id: uid,
    ...patch,
    created_at: Date.now(),
  });
}

function normalizeProduct(product = {}) {
  const title = safeString(product.title);
  const url = safeString(product.url);
  const productKey = safeString(product.product_key) || url || title;
  return {
    product_key: productKey,
    title,
    price: safeString(product.price),
    platform: safeString(product.platform),
    image_url: safeString(product.image_url),
    url,
    summary: safeString(product.summary),
    query: safeString(product.query),
  };
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
