'use strict';
module.exports = {
  /**
   * 账号注销
   * @url user/kh/closeAccount 前端调用的url参数地址
   * data 请求参数
   * @param {String} reason 注销原因
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { reason } = data;
    let delay = 3600 * 24 * 7; // 延迟7天注销
    res = await vk.daoCenter.userDao.closeAccount({
      uid, // 用户id
      delay, // 延迟注销时间（单位为秒），0表示立即注销，若设置大于0，则需要在定时任务中再次执行注销账号或让用户过了冷静期后再次点击注销账号
      reason,
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
