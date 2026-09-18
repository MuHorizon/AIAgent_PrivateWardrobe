// 涉及的表名
const dbName = require('../../../../../dao/config.js');

module.exports = {
  /**
   * vk-pay支付插件用户价值排行
   * @url admin/system_uni/pay-orders/sys/getRanking 前端调用的url参数地址
   * data 请求参数说明（直接传给 vk.baseDao.getTableData）
   * @param {object}         formData  查询条件数据源
   * @param {Array<Object>}  columns   查询条件规则
   * @param {Array<Object>}  sortRule  排序规则
   */
  main: async (event) => {
    const { data = {}, util } = event;
    const { vk, _ } = util;
    const $ = _.aggregate;
    const { formData = {} } = data;

    const whereJson = {
      user_id: _.exists(true),
    };
    // 如果没有传入有效的支付日期范围，则默认查询最近30天的数据
    if (!isValidDateRange(formData.pay_date)) {
      const nowRange = vk.pubfn.getDayOffsetStartAndEnd(0, new Date());
      const defaultRange = vk.pubfn.getDayOffsetStartAndEnd(-29, new Date());
      whereJson.pay_date = _.gte(defaultRange.startTime).lte(nowRange.endTime);
    }

    const status = vk.pubfn.isNotNull(formData.status) ? formData.status : 'paid-success';
    if (status === 'paid-success') {
      whereJson.status = _.in([1, 2, 3]);
    } else if (status === 'refunded') {
      whereJson.status = _.in([2, 3]);
    } else if (status !== 'all') {
      whereJson.status = Number(status);
    }

    const res = await vk.baseDao.getTableData({
      dbName: dbName.payOrder,
      data,
      whereJson,
      groupJson: {
        _id: '$user_id',
        user_id: $.first('$user_id'),
        payAmount: $.sum('$total_fee'),
        refundAmount: $.sum($.ifNull(['$refund_fee', 0])),
        netIncome: $.sum($.subtract(['$total_fee', $.ifNull(['$refund_fee', 0])])),
        payCount: $.sum(1),
        lastPayDate: $.max('$pay_date'),
      },
      sortArr: [
        { name: 'netIncome', type: 'desc' },
        { name: 'payAmount', type: 'desc' },
        { name: 'lastPayDate', type: 'desc' },
      ],
      foreignDB: [
        {
          dbName: dbName.user,
          localKey: 'user_id',
          foreignKey: '_id',
          as: 'userInfo',
          limit: 1,
          fieldJson: {
            token: false,
            password: false,
          },
        },
      ],
    });

    const rows = Array.isArray(res.rows) ? res.rows : [];
    // 此处金额不需要 / 100，因为前端展示时会自动除以100并保留两位小数
    res.rows = rows.map((row) => {
      const payAmount = getNumber(row.payAmount, 0);
      const refundAmount = getNumber(row.refundAmount, 0);
      const payCount = getNumber(row.payCount, 0);
      row.payAmount = payAmount;
      row.refundAmount = refundAmount;
      row.netIncome = getNumber(row.netIncome, payAmount - refundAmount);
      row.avgOrderAmount = payCount > 0 ? vk.pubfn.toDecimal(payAmount / payCount, 0) : 0;
      return row;
    });

    return res;
  },
};

function getNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isNaN(n) ? defaultValue : n;
}

function isValidDateRange(value) {
  return Array.isArray(value) && value.length === 2 && Number(value[0]) > 0 && Number(value[1]) > 0;
}
