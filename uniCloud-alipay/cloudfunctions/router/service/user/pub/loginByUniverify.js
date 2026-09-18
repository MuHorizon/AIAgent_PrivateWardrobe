module.exports = {
  /**
   * APP端 手机一键登录
   * @url user/pub/loginByUniverify 前端调用的url参数地址
   * @param {String} access_token 			uni.login登录成功后，返回的access_token参数
   * @param {String} openid 						uni.login登录成功后，返回的openid参数
   * @param {String} type 							指定操作类型，可选值为login、register，不传此参数时表现为手机号已注册则登录，手机号未注册则进行注册
   * @param {String} password 					密码，type为register时生效
   * @param {String} inviteCode 				邀请人的邀请码，type为register时生效
   * @param {Boolean} needPermission 	设置为true时会在checkToken时返回用户权限（permission），建议在管理控制台中使用
   * res 返回参数说明
   * @param {Number} code			错误码，0表示成功
   * @param {String} msg				详细信息
   * @param {String} uid 			当前token对应的用户uid
   * @param {String} type			操作类型，login为登录、register为注册
   * @param {String} mobile		登录者手机号
   * @param {String} userInfo	用户全部信息
   * @param {String} token			登录成功之后返回的token信息
   * @param {String} tokenExpired		token过期时间
   */
  main: async (event) => {
    let { data = {}, userInfo, util, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { access_token, openid, type, password, inviteCode, needPermission, nickname, avatar, gender, encryptedProvider, encryptedKey } = data;

    // 一键登录依赖检查
    if (!vk.pubfn.checkModule('uni-cloud-verify')) {
      return { code: -1, msg: '检测到未添加一键登录依赖，右键router云函数-管理公共模块或扩展库依赖-添加uni-cloud-verify扩展库，最后需重启项目' };
    }

    // 获取一键登录配置
    const univerifyConfig = vk.pubfn.getUniIdConfig(config, 'service.univerify') || {};

    // 获取手机号
    let getPhoneNumberData = {
      provider: 'univerify',
      appid: univerifyConfig.appid || originalParam.context.APPID,
      access_token,
      openid,
    };
    let getPhoneNumberRes = await uniCloud.getPhoneNumber(getPhoneNumberData);

    let mobile = getPhoneNumberRes.phoneNumber;

    if (vk.pubfn.isNull(mobile)) {
      return getPhoneNumberRes;
    }

    // 生成随机的6位数验证码
    let code = vk.pubfn.random(6);

    // 通过手机号登录或注册
    await uniID.setVerifyCode({ mobile, code, expiresIn: 60, type: type ? type : 'login' });
    res = await uniID.loginBySms({ mobile, code, type, password, inviteCode, needPermission });

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
      if (encryptedKey && encryptedProvider) {
        // 如果encryptedKey有值，则执行绑定微信
        const loginUtil = vk.require('service/user/util/loginUtil');
        await loginUtil.bind(
          {
            clientInfo: originalParam.context,
            userInfo: res.userInfo,
            provider: encryptedProvider,
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
        type: 'login',
        login_type: 'univerify',
        user_id: res.uid,
        context: originalParam.context,
      },
      util
    );

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
