module.exports = {
  /**
   * 用户登录 - 华为登录
   * @url user/pub/loginByHuawei 前端调用的url参数地址
   * @description 支持鸿蒙App和鸿蒙元服务
   * data 请求参数 说明
   * @param {String} code 登录返回的code
   * @param {String} type 指定操作类型，可选值为login、register，不传此参数时表现为已注册则登录，未注册则进行注册
   * @param {String} nickname 用户昵称，仅注册时有效
   * @param {String} avatar 用户头像，仅注册时有效
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   * @param {String} token 登录成功之后返回的token信息
   * @param {String} tokenExpired token过期时间
   * @param {Object} userInfo 用户信息
   */
  main: async (event) => {
    let { data = {}, util, originalParam } = event;
    let { uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { code, type, nickname, avatar } = data;

    if (!code) {
      return { code: -1, msg: 'code不能为空' };
    }

    // 标记当前平台的provider
    const provider = 'huawei';

    // 额外写入的自定义字段数据（可以自己增加，建议只传一些显示的信息，不要传余额字段等，因为前端不可信任）
    let customData = {
      nickname,
      avatar,
    };

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
      code: code,
      needKey: true,
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
      encryptedKey, // 加密信息
      openid, // 用户的openid
      unionid, // 用户的unionid
    };

    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------
    const loginUtil = vk.require('service/user/util/loginUtil');
    return await loginUtil.login(
      {
        clientInfo: originalParam.context,
        type,
        provider,
        appid: clientId, // 这里的appid就是clientId
        openid,
        unionid,
        customData,
        extraRes,
        addLog: true,
      },
      util
    );
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
