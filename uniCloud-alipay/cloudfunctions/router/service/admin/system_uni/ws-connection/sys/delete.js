module.exports = {
  /**
   * 删除
   * @url admin/system_uni/ws-connection/sys/delete 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} _id 		id
   * res 返回参数说明
   * @param {Number} code		错误码，0表示成功
   * @param {String} msg			详细信息
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { cid } = data;
    // 参数非空检测
    if (vk.pubfn.isNullOne(cid)) {
      return { code: -1, msg: 'cid不能为空' };
    }

    const ws = vk.getWebSocketManage();
    try {
      await ws.close({
        cid,
      });
    } catch (err) {
      console.error('err: ', err);
    } finally {
      // 无论关闭是否成功，均删除数据库内保存的连接信息
      await vk.baseDao.deleteById({
        dbName: 'vk-ws-connection',
        id: cid,
      });
    }
    return res;
  },
};
