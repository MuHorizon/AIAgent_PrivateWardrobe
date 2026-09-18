module.exports = {
  /**
   * 修改
   * @url admin/system_uni/error-log/sys/update 前端调用的url参数地址
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { id, md5, status, comment } = data;
    let dbName = 'vk-error-log';

    let info = await vk.baseDao.findById({
      dbName,
      id,
    });
    if (!info) {
      return { code: -1, msg: '记录不存在' };
    }
    // 执行数据库API请求
    res.num = await vk.baseDao.update({
      dbName,
      whereJson: {
        md5,
        status: info.status,
      },
      dataJson: {
        status,
      },
    });
    return res;
  },
};
