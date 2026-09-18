module.exports = {
  /**
   * 获取支付宝openid
   * @url user/pub/code2SessionAlipay 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} code 支付宝登录返回的code
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   * @param {String} openid 用户openid
   * @param {String} accessToken 客户端为APP时返回
   * @param {String} expiresIn 客户端为APP时返回，accessToken 接口调用凭证超时时间，单位（秒）
   * @param {String} refreshToken 客户端为APP时返回，用于刷新accessToken
   * @param {String} reExpiresIn refreshToken超时时间，单位（秒）
   */
  main: async (event) => {
    let { data = {}, userInfo, util, originalParam } = event;
    let { uniID, vk } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { appid, code } = data;

    res = await vk.openapi.alipay.auth.code2Session({
      context: originalParam.context,
      appid,
      code,
      needKey: false,
    });

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
