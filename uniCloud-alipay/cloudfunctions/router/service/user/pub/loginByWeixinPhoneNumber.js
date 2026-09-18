module.exports = {
  /**
   * 用户登录（微信手机号授权登录）
   * @url user/pub/loginByWeixinPhoneNumber 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} nickname 用户昵称，仅注册时有效
   * @param {String} avatar 用户头像，仅注册时有效
   * @param {String} gender 性别，仅注册时有效
   * @param {String} encryptedData（code和encryptedData+iv二选一）
   * @param {String} iv（code和encryptedData+iv二选一）
   * @param {String} encryptedKey code2SessionWeixin 接口返回的encryptedKey
   * @param {String} code 通过 getphonenumber 事件获取到的code（code和encryptedData+iv二选一）
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   * @param {String} token 登录成功之后返回的token信息
   * @param {String} tokenExpired token过期时间
   */
  main: async (event) => {
    let { data = {}, util, originalParam } = event;
    let { uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = {};
    // 业务逻辑开始-----------------------------------------------------------
    let { nickname, avatar, gender, inviteCode, encryptedData, iv, encryptedKey, code } = data;

    // 标记当前平台的provider
    const provider = 'wx'; // 历史原因，这里用wx，而非weixin
    const providerName = '微信';

    // 获取绑定的手机号
    res = await vk.openapi.weixin.decrypt.getPhoneNumber({
      encryptedKey,
      code,
      encryptedData,
      iv,
    });
    if (res.code !== 0) return res;
    let { mobile } = res;
    let mobileCode = vk.pubfn.random(6);
    // 指定操作类型，可选值为login、register，不传此参数时表现为手机号已注册则登录，手机号未注册则进行注册
    let type;
    // 通过手机号登录
    await uniID.setVerifyCode({ mobile, code: mobileCode, expiresIn: 60, type: 'login' });
    res = await uniID.loginBySms({ mobile, code: mobileCode, type, inviteCode });
    if (!res.token) return res;
    if (!res.msg) {
      res.msg = res.type === 'register' ? '注册成功' : '登录成功';
    }
    if (res.type === 'register') {
      if (!res.userInfo._id) res.userInfo._id = res.uid;
      let mobileStr = mobile.substring(7);
      // 额外写入的自定义字段数据（可以自己增加，建议只传一些显示的信息，不要传余额字段等，因为前端不可信任）
      let customData = {
        nickname: nickname || `手机尾号${mobileStr}用户`,
        avatar,
        gender,
      };
      if (encryptedKey) {
        // 如果encryptedKey有值，则执行绑定微信
        const loginUtil = vk.require('service/user/util/loginUtil');
        await loginUtil.bind(
          {
            clientInfo: originalParam.context,
            userInfo: res.userInfo,
            provider,
            providerName,
            encryptedKey,
            customData,
          },
          util
        );
      } else {
        res.userInfo = await vk.baseDao.updateAndReturn({
          dbName: 'uni-id-users',
          whereJson: {
            _id: res.uid,
          },
          dataJson: customData,
        });
      }
    }
    // 日志服务
    const loginLogService = vk.require('service/user/util/loginLog');
    await loginLogService.add(
      {
        type: res.type,
        login_type: 'weixinPhoneNumber',
        user_id: res.uid,
        context: originalParam.context,
      },
      util
    );
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
