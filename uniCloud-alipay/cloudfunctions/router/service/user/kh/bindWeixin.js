module.exports = {
  /**
   * 绑定微信
   * @url user/kh/bindWeixin 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} code 登录返回的code
   * @param {String} appid 可不填（如果需要支持多小程序登录，则必填）
   * @param {String} encryptedKey code和encryptedKey二选一传即可
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   */
  main: async (event) => {
    let { data = {}, userInfo, util, originalParam } = event;
    let { uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };

    let { code, appid: myAppId, encryptedKey: myEncryptedKey } = data;

    if (vk.pubfn.isNullAll(code, myEncryptedKey)) {
      return { code: -1, msg: 'code不能为空' };
    }

    // 标记当前平台的provider
    const provider = 'wx'; // 历史原因，这里用wx，而非weixin
    const providerName = '微信';

    // 自定义配置
    let customConfig = {};
    /**
     * 支持多小程序登录
     * 此处data可以额外接收appid和appsecret参数（appid可以从前端传，而appsecret可以配置在全局配置中（common/uni-config-center/vk-unicloud/index.js），也可以自己从数据库获取）
     * 如果不传appid，则默认使用uni-id的配置信息
     * 特别注意：如果使用多小程序登录，则同一用户在不同小程序登录时，会分别创建不同的用户（除非unionid是一样的才是同一个用户）。
     */
    // 打开下方注释，动态赋值appid和appsecret即可支持多小程序登录
    if (myAppId) {
      customConfig.appid = myAppId;
    }
    // customConfig.appsecret = "xxxx";

    // code获取openid
    let code2SessionRes = await vk.openapi.weixin.auth.code2Session({
      context: originalParam.context, // 内部会根据context来判断是小程序还是APP还是公众号
      code,
      needKey: true, // 需要返回密钥信息
      encryptedKey: myEncryptedKey,
      ...customConfig,
    });
    if (code2SessionRes.code !== 0) {
      return code2SessionRes;
    }

    let {
      appid, // appid
      openid, // 用户的openid
      unionid, // 用户的unionid（只有绑定开放平台后才有此值）
      sessionKey, // 用户的sessionKey
      accessToken, // 用户accessToken
      refreshToken, // 用户refreshToken
      expiresIn: accessTokenExpired, // 用户accessToken过期时间
      encryptedKey, // 加密信息
    } = code2SessionRes;

    // 设置额外返回给前端的数据
    let extraRes = {
      encryptedKey,
      openid, // 用户的openid
      unionid, // 用户的unionid
    };

    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------

    const loginUtil = vk.require('service/user/util/loginUtil');
    res = await loginUtil.bind(
      {
        clientInfo: originalParam.context,
        userInfo,
        provider,
        providerName,
        appid,
        openid,
        unionid,
        extraRes,
      },
      util
    );

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
