module.exports = {
  /**
   * 用户登录，使用token登录，仅为了实现当token过期时间设置很长时，做用户登录统计会有问题，因此需要每天执行一次token登录来增加登录日志，方便做用户每日登录统计
   * @url user/pub/loginByToken 前端调用的url参数地址
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   */
  main: async (event) => {
    let { data = {}, uniIdToken, util, originalParam } = event;
    let { uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    if (!uniIdToken) {
      return { code: -1, msg: '缺少token' };
    }
    // 验证token是否合法（设置needUserInfo为true是为了查库校验）
    let checkTokenRes = await uniID.checkToken(uniIdToken, {
      needPermission: true,
      needUserInfo: true,
    });
    if (!checkTokenRes.uid) {
      return checkTokenRes;
    }
    // 用户信息
    let userInfo = checkTokenRes.userInfo;

    // 日志服务
    const loginLogService = vk.require('service/user/util/loginLog');
    // 判断今日已经登录过（即每日只允许用token刷新一次）
    let isLogin = await loginLogService.checkTodayIsLogin(
      {
        user_id: checkTokenRes.uid,
        context: originalParam.context,
      },
      util
    );
    if (isLogin) {
      res.msg = '今日已登录过';
      return res;
    }

    // 如果今日没有登录过，则重新获得一个token（当前的旧token不删除，删除旧token会出现一些问题）
    const { token, tokenExpired } = await uniID.createToken({
      uid: checkTokenRes.uid,
      needPermission: true,
      role: checkTokenRes.role || [],
      permission: checkTokenRes.permission || [],
    });

    if (!token) {
      return { code: -1, msg: 'token生成失败' };
    }

    // 写入token，并记录登录时间和IP，最后返回最新的userInfo
    userInfo = await vk.daoCenter.userDao.updateAndReturn({
      whereJson: {
        _id: checkTokenRes.uid,
      },
      dataJson: {
        token: _.push(token), // 写入新的token
        last_login_date: Date.now(), // 记录最后一次登录的时间
        last_login_ip: originalParam.context.CLIENTIP, // 记录最后一次登录的ip
      },
    });

    let tokenMaxLimit = vk.pubfn.getUniIdConfig(config, 'tokenMaxLimit', 10);
    // 使用token登录的时候，tokenMaxLimit不能为1，否则前端并发请求时会出现需要跳登录页面的情况
    if (tokenMaxLimit === 1) {
      tokenMaxLimit = 2;
    }
    res.type = 'login';
    res.msg = '登录成功';
    res.token = token;
    res.tokenExpired = tokenExpired;
    res.tokenMaxLimit = tokenMaxLimit;
    res.uid = userInfo._id;
    res.userInfo = userInfo;
    // 添加登录日志
    await loginLogService.add(
      {
        type: 'login',
        login_type: 'token',
        user_id: res.uid,
        context: originalParam.context,
      },
      util
    );

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
