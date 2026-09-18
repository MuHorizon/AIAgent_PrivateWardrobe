module.exports = {
  /**
   * 获取QQ的openid
   * @url user/pub/code2SessionQQ 前端调用的url参数地址
   * @description 支持抖音小程序
   * data 请求参数 说明
   * @param {String} code 登录返回的code
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   * @param {String} openid 用户openid
   * @param {String} unionid 用户unionid，可以取到此值时返回
   * @param {String} sessionKey 客户端为小程序时返回
   */
  main: async (event) => {
    let { data = {}, userInfo, util, originalParam } = event;
    let { uniID, vk } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { code, appid, needCache } = data;
    res = await vk.openapi.qq.auth.code2Session({
      context: originalParam.context,
      appid,
      code,
      needKey: false, // 是否需要返回明文的sessionKey或accessToken（为了安全期间，建议设置false）
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
