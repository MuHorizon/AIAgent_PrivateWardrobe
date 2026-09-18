module.exports = {
  /**
   * 获取华为openid
   * @url user/pub/code2SessionHuawei 前端调用的url参数地址
   * @description 支持鸿蒙App和鸿蒙元服务
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
    let { code, clientId, needCache } = data;

    // 处理下PLATFORM
    if (originalParam.context.PLATFORM.indexOf('app') === 0) {
      originalParam.context.PLATFORM = 'app-harmony';
    }

    res = await vk.openapi.huawei.auth.code2Session({
      context: originalParam.context,
      clientId,
      code,
      needKey: false, // 是否需要返回明文的accessToken（为了安全期间，建议设置false）
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
