'use strict';
module.exports = {
  /**
   * 恢复账号（仅限账号未确认注销时）
   * @url user/kh/openAccount 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    res = await vk.daoCenter.userDao.openAccount({
      uid,
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
