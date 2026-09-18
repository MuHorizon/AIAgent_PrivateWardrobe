'use strict';
module.exports = {
  /**
   * 强制用户退出登录
   * @url admin/system_uni/ws-connection/sys/forceLogout 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { cid, user_id, url } = data;

    const ws = vk.getWebSocketManage({ url });
    await ws.forceLogout({
      cid,
      user_id,
      url,
      data: {
        msg: '您已掉线，请重新登录',
      },
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
