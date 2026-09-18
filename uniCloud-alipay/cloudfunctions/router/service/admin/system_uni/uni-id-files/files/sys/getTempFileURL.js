'use strict';
module.exports = {
  /**
   * 获取临时访问链接
   * @url admin/system_uni/uni-id-files/files/sys/getTempFileURL 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '', fileList: [] };
    // 业务逻辑开始-----------------------------------------------------------
    let { ids } = data;

    if (vk.pubfn.isNull(ids)) {
      return res;
    }

    let { fileList } = await vk.getTempFileURL({
      fileList: ids,
    });

    res.fileList = fileList;
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
