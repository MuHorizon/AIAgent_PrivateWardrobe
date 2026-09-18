'use strict';

const db = uniCloud.database();

const cloudObject = {
  isCloudObject: true,

  /**
   * 查询当前用户的穿衣画像。
   * @url client/wardrobe/profile.get
   * Agent 视角：这是 get_user_profile 工具的第一版实现，用来恢复当前用户的长期 Memory。
   */
  get: async function () {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    const queryRes = await db
      .collection('user_profile')
      .where({
        user_id: uid,
      })
      .limit(1)
      .get();

    res.profile = queryRes.data && queryRes.data[0] ? queryRes.data[0] : null;

    return res;
  },

  /**
   * 保存当前用户的穿衣画像。
   * @url client/wardrobe/profile.save
   * Agent 视角：这是 update_user_memory 工具的第一版实现，把用户偏好沉淀到 user_profile 表。
   */
  save: async function (data = {}) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo();
    let { profile = {} } = data;

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    const now = Date.now();
    const dataJson = buildProfileData(uid, profile, now);
    const collection = db.collection('user_profile');
    const queryRes = await collection
      .where({
        user_id: uid,
      })
      .limit(1)
      .get();

    if (queryRes.data && queryRes.data[0]) {
      const profileId = queryRes.data[0]._id;
      await collection.doc(profileId).update(dataJson);
      res.profile = {
        ...queryRes.data[0],
        ...dataJson,
        _id: profileId,
      };
      return res;
    }

    const addRes = await collection.add({
      ...dataJson,
      created_at: now,
    });

    res.profile = {
      ...dataJson,
      _id: addRes.id,
      created_at: now,
    };

    return res;
  },
};

module.exports = cloudObject;

/**
 * 整理可写入数据库的画像字段。
 * 显式画像只有三个字段：性别（必填）、身高（建议）、AI服务偏好（可选）。
 * 其余穿搭偏好（风格、颜色、版型等）全部由 AI 从行为中学习，存入 implicit_profile。
 */
function buildProfileData(uid, profile, now) {
  const data = {
    user_id: uid,
    updated_at: now,
  };

  if (profile.gender !== undefined) data.gender = safeString(profile.gender);
  if (profile.height !== undefined) data.height = safeNumber(profile.height);
  if (profile.service_preferences !== undefined) data.service_preferences = safeStringList(profile.service_preferences);
  if (profile.tryon_person_image_url !== undefined) data.tryon_person_image_url = safeString(profile.tryon_person_image_url);
  if (profile.tryon_person_file_id !== undefined) data.tryon_person_file_id = safeString(profile.tryon_person_file_id);
  if (profile.tryon_body_analysis !== undefined) data.tryon_body_analysis = safeObject(profile.tryon_body_analysis);

  return data;
}

/**
 * 清洗文本字段。
 * 画像会进入 Agent 提示词和推荐上下文，先去掉非字符串和多余空格，降低脏数据影响。
 */
function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 清洗数字字段。
 * 身高体重后续用于版型建议，非法数字不写入，避免 Agent 基于错误数值推理。
 */
function safeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : '';
}

/**
 * 清洗数组字段。
 * 多选偏好是 Agent 推荐排序的重要信号，只保留有效字符串并去重。
 */
function safeStringList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((item) => safeString(item)).filter(Boolean))];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
