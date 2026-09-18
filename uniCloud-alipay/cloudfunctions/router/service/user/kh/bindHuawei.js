module.exports = {
  /**
   * 绑定华为账号
   * @url user/kh/bindHuawei 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} code 登录返回的code
   * @param {String} clientId 可不填（如果需要支持多小程序登录，则必填）
   * @param {String} encryptedKey code和encryptedKey二选一传即可
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   */
  main: async (event) => {
    // 业务逻辑开始-----------------------------------------------------------
    let { data = {}, userInfo, util, originalParam } = event;
    let { uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };

    let { code, encryptedKey: myEncryptedKey } = data;

    if (vk.pubfn.isNullAll(code, myEncryptedKey)) {
      return { code: -1, msg: 'code不能为空' };
    }

    // 标记当前平台的provider
    const provider = 'huawei';
    const providerName = '华为';

    // 自定义配置
    let customConfig = {};
    if (data.clientId) {
      customConfig.clientId = data.clientId;
    }
    // 处理下PLATFORM
    if (originalParam.context.PLATFORM.indexOf('app') === 0) {
      originalParam.context.PLATFORM = 'app-harmony';
    }
    // code获取openid
    let code2SessionRes = await vk.openapi.huawei.auth.code2Session({
      context: originalParam.context,
      code,
      needKey: true,
      encryptedKey: myEncryptedKey,
      ...customConfig,
    });
    if (code2SessionRes.code !== 0) {
      return code2SessionRes;
    }

    let {
      clientId, // clientId
      openid, // 用户的openid
      unionid, // 用户的unionid（只有绑定开放平台后才有此值）
      accessToken, // 用户accessToken
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
        appid: clientId, // 这里的appid就是clientId
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
