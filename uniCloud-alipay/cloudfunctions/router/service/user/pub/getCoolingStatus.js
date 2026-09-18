'use strict';
module.exports = {
  /**
   * 获取注销冷静期状态
   * @url user/pub/getCoolingStatus 前端调用的url参数地址
   */
  main: async (event) => {
    let { data = {}, util, uid, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    if (uid) {
      let userInfo = await vk.daoCenter.userDao.findById(uid);
      res.status = userInfo.status;
      res.nickname = userInfo.nickname;
      res.avatar = userInfo.avatar;
      res.close_account = userInfo.close_account;
      if (res.close_account && !res.close_account.confirmed) {
        // 计算倒计时（单位毫秒）
        res.duration = userInfo.close_account.close_time - Date.now();
      }
    }
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
