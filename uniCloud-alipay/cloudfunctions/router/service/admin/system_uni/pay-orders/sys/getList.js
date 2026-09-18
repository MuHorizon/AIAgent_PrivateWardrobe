// 涉及的表名
const dbName = require('../../../../../dao/config.js');

module.exports = {
  /**
   * vk-pay支付插件支付订单查询
   * @url admin/system_uni/pay-orders/sys/getList 前端调用的url参数地址
   * data 请求参数 说明
   * @param {Number}         pageIndex 当前页码
   * @param {Number}         pageSize  每页显示数量
   * @param {Array<Object>}  sortRule  排序规则
   * @param {object}         formData  查询条件数据源
   * @param {Array<Object>}  columns   查询条件规则
   * res 返回参数说明
   * @param {Number}         code      错误码，0表示成功
   * @param {String}         msg       详细信息
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { formData = {} } = data;
    let { status } = formData;
    let whereJson = {};
    if (vk.pubfn.isNotNull(status)) {
      if (status === 'paid-success') {
        // 已支付（含退款）
        whereJson.status = _.in([1, 2, 3]);
      } else if (status === 'refunded') {
        // 已支付（含退款）
        whereJson.status = _.in([2, 3]);
      } else {
        whereJson.status = Number(status);
      }
    }
    res = await vk.baseDao.getTableData({
      dbName: dbName.payOrder,
      data,
      whereJson,
      // 副表列表
      foreignDB: [
        {
          dbName: 'uni-id-users',
          localKey: 'user_id',
          foreignKey: '_id',
          as: 'userInfo',
          limit: 1,
          fieldJson: { token: false, password: false },
        },
      ],
    });
    return res;
  },
};
