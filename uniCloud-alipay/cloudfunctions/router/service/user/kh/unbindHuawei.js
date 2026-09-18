module.exports = {
  /**
   * 解绑华为账号
   * @url user/kh/unbindHuawei 前端调用的url参数地址
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

    let {
      clientId, // 需要解绑的clientId，不传则解绑所有
    } = data;

    // 标记当前平台的provider
    const provider = 'huawei';
    const providerName = '华为';

    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------
    // 以下代码一般不需要更改-----------------------------------------------------------

    const loginUtil = vk.require('service/user/util/loginUtil');
    res = await loginUtil.unbind(
      {
        userInfo,
        provider,
        providerName,
        appid: clientId, // 这里的appid就是clientId
      },
      util
    );

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
