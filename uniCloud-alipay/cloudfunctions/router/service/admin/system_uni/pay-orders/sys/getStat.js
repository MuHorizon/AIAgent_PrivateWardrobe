// 涉及的表名
const dbName = require('../../../../../dao/config.js');
// 默认筛选状态：已支付成功（status > 0）
const DEFAULT_STATUS = 'paid-success';
// 默认统计维度：按天
const DEFAULT_GROUP_BY = 'day';
// 退款状态列表：2=已部分退款，3=已全额退款
const REFUND_STATUS_LIST = [2, 3];
// 统计指标定义（isMoney 表示是否为金额类指标，展示时需除以100转元）
const METRIC_KEYS = [
  { key: 'payAmount', isMoney: true }, // 支付金额
  { key: 'payCount', isMoney: false }, // 支付笔数
  { key: 'refundAmount', isMoney: true }, // 退款金额
  { key: 'refundCount', isMoney: false }, // 退款笔数
  { key: 'netIncome', isMoney: true }, // 净收入（支付金额 - 退款金额）
  { key: 'avgOrderAmount', isMoney: true }, // 客单价（支付金额 / 支付笔数）
];

let vk = uniCloud.vk;

const db = uniCloud.database(); // 全局数据库引用
const _ = db.command; // 数据库操作符
const $ = _.aggregate; // 聚合查询操作符

module.exports = {
  /**
   * 支付订单收入统计（聚合查询版本，不再全量拉取订单）
   * @url admin/system_uni/pay-orders/sys/getStat 前端调用的url参数地址
   * data 请求参数说明
   * @param {Number} startTime 当前统计周期开始时间戳
   * @param {Number} endTime 当前统计周期结束时间戳
   * @param {String} groupBy 统计维度 day/week/month
   * @param {String} status 订单状态筛选
   * @param {String} platform 平台筛选
   * @param {String} payType 支付方式筛选
   * @param {String} orderType 订单类型筛选
   * @param {String} pid 商户ID筛选
   */
  main: async (event) => {
    const { data = {}, util } = event;

    vk = util.vk;

    const query = createQuery(data);
    if (query.code) {
      return query;
    }

    const staticWhere = createStaticWhere(query);
    const funnelWhere = createStaticWhere(query, { ignoreStatus: true });

    const needRefund = shouldLoadRefundOrders(query);
    const { stack } = await vk.pubfn.batchRun({
      main: [
        async () => getPreviousPeriodPaymentByDay({ staticWhere, query }),
        async () => getCurrentPeriodPaymentByDay({ staticWhere, query }),
        async () => getCurrentPeriodPlatformBreakdown({ staticWhere, query }),
        async () => getCurrentPeriodPayTypeBreakdown({ staticWhere, query }),
        async () => getCurrentPeriodOrderTypeBreakdown({ staticWhere, query }),
        async () => (needRefund ? getCurrentPeriodRefundByDay({ staticWhere, query }) : []),
        async () => (needRefund ? getRefundOverview({ staticWhere, query }) : { current: [], previous: [] }),
        async () => (needRefund ? getRefundBreakdown({ staticWhere, query }) : []),
        async () => getPidOptions(),
        async () => getFunnel({ query, funnelWhere }),
      ],
      concurrency: 5,
    });
    const previousDayResult = stack[0];
    const currentDayResult = stack[1];
    const platformBreakdown = stack[2];
    const payTypeBreakdown = stack[3];
    const orderTypeBreakdown = stack[4];
    const refundDayResult = stack[5];
    const refundOverviewResult = stack[6];
    const refundBreakdownResult = stack[7];
    const pidOptions = stack[8];
    const funnel = stack[9];

    // 从每日趋势数据中聚合当期总览
    const overview = createMetricState();
    for (const row of currentDayResult) {
      overview.payAmount += getNumber(row.totalAmount, 0);
      overview.payCount += getNumber(row.count, 0);
    }

    // 从上期每日数据中聚合上期总览
    const previousOverview = createMetricState();
    for (const row of previousDayResult) {
      previousOverview.payAmount += getNumber(row.totalAmount, 0);
      previousOverview.payCount += getNumber(row.count, 0);
    }

    // 趋势数据
    const trend = computeTrend(currentDayResult, refundDayResult, query);

    // 平台 / 支付方式 / 订单类型下钻
    const { platformMap, payTypeMap, orderTypeMap, options } = computeBreakdown(platformBreakdown, payTypeBreakdown, orderTypeBreakdown);

    // 退款总览（数据库端 $unwind + $group 聚合结果）
    for (const row of refundOverviewResult.current) {
      overview.refundAmount += getNumber(row.refundAmount, 0);
      overview.refundCount += getNumber(row.refundCount, 0);
    }
    for (const row of refundOverviewResult.previous) {
      previousOverview.refundAmount += getNumber(row.refundAmount, 0);
      previousOverview.refundCount += getNumber(row.refundCount, 0);
    }

    // 退款下钻（按平台/订单类型合并到对应维度）
    for (const row of refundBreakdownResult) {
      const platformKey = normalizePlatform(row.platform);
      const orderTypeKey = row.type || 'other';
      const refundAmount = getNumber(row.refundAmount, 0);
      const refundCount = getNumber(row.refundCount, 0);

      if (!platformMap[platformKey]) {
        platformMap[platformKey] = { key: platformKey, payAmount: 0, payCount: 0, refundAmount: 0, refundCount: 0, netIncome: 0 };
      }
      platformMap[platformKey].refundAmount += refundAmount;
      platformMap[platformKey].refundCount += refundCount;

      if (!orderTypeMap[orderTypeKey]) {
        orderTypeMap[orderTypeKey] = { key: orderTypeKey, payAmount: 0, payCount: 0, refundAmount: 0, refundCount: 0, netIncome: 0 };
      }
      orderTypeMap[orderTypeKey].refundAmount += refundAmount;
      orderTypeMap[orderTypeKey].refundCount += refundCount;
    }

    // 计算净值和均值
    finalizeMetricState(overview);
    finalizeMetricState(previousOverview);

    const platformRows = Object.keys(platformMap)
      .map((key) => finalizeTableRow(platformMap[key]))
      .sort(sortByPayAmount);
    const orderTypeRows = Object.keys(orderTypeMap)
      .map((key) => finalizeTableRow(orderTypeMap[key]))
      .sort(sortByPayAmount);
    const payTypeShare = createPayTypeShare(payTypeMap, overview.payAmount);

    return {
      code: 0,
      msg: 'ok',
      query: {
        startTime: query.startTime,
        endTime: query.endTime,
        groupBy: query.groupBy,
        status: query.status,
        platform: query.platform,
        payType: query.payType,
        orderType: query.orderType,
        pid: query.pid,
      },
      summary: createSummary(overview, previousOverview),
      trend,
      dailyTrend: currentDayResult,
      refundByDay: refundDayResult,
      payTypeShare,
      platformRows,
      orderTypeRows,
      options: {
        platforms: createOptionList(options.platformOptionsMap),
        payTypes: createOptionList(options.payTypeOptionsMap),
        orderTypes: createOptionList(options.orderTypeOptionsMap),
        pids: pidOptions,
      },
      funnel,
      generatedAt: Date.now(),
    };
  },
};

// ============ 查询构建 ============

function createQuery(data) {
  const nowRange = vk.pubfn.getDayOffsetStartAndEnd(0, new Date());
  const defaultRange = vk.pubfn.getDayOffsetStartAndEnd(-29, new Date());
  const startTime = getNumber(data.startTime, defaultRange.startTime);
  const endTime = getNumber(data.endTime, nowRange.endTime);
  if (startTime > endTime) {
    return { code: -1, msg: '统计开始时间不能大于结束时间' };
  }

  const period = endTime - startTime + 1;
  const previousEndTime = startTime - 1;
  const previousStartTime = previousEndTime - period + 1;
  let groupBy = data.groupBy || DEFAULT_GROUP_BY;
  if (['day', 'week', 'month'].indexOf(groupBy) === -1) {
    groupBy = DEFAULT_GROUP_BY;
  }

  return {
    startTime,
    endTime,
    previousStartTime,
    previousEndTime,
    groupBy,
    status: data.status || DEFAULT_STATUS,
    platform: data.platform || '',
    payType: data.payType || '',
    orderType: data.orderType || '',
    pid: data.pid || '',
  };
}

function createStaticWhere(query, options = {}) {
  const whereJson = {};
  if (query.platform) {
    whereJson.platform = query.platform;
  }
  if (query.payType) {
    whereJson.pay_type = new RegExp(`^${vk.pubfn.escapeRegExp(query.payType)}_`);
  }
  if (query.orderType) {
    whereJson.type = query.orderType;
  }
  if (query.pid) {
    whereJson.pid = query.pid;
  }
  if (options.ignoreStatus) {
    return whereJson;
  }
  if (query.status === 'paid-success') {
    whereJson.status = _.gt(0);
  } else if (query.status === 'refunded') {
    whereJson.status = _.in(REFUND_STATUS_LIST);
  } else if (query.status !== 'all' && query.status !== '') {
    whereJson.status = Number(query.status);
  }
  return whereJson;
}

// ============ 数据库聚合查询 ============

/**
 * 上期每日支付聚合（用于上期总览对比）
 * select sum(total_fee) as totalAmount, sum(1) as count
 * from vk-pay-orders
 * where [静态条件] and pay_date >= previousStartTime and pay_date < startTime
 * group by dateToString(pay_date, '%Y-%m-%d')
 */
async function getPreviousPeriodPaymentByDay({ staticWhere, query }) {
  const res = await vk.baseDao.selects({
    dbName: dbName.payOrder,
    pageSize: 1000,
    getMain: true,
    whereJson: Object.assign({}, staticWhere, {
      pay_date: _.gte(query.previousStartTime).lt(query.startTime),
    }),
    groupJson: {
      _id: $.dateToString({
        date: $.add([new Date(0), '$pay_date']),
        format: '%Y-%m-%d',
        timezone: '+08:00',
      }),
      totalAmount: $.sum('$total_fee'),
      count: $.sum(1),
    },
  });
  return Array.isArray(res) ? res : [];
}

/**
 * 当期每日支付聚合（用于趋势图 + 当期总览）
 * select sum(total_fee) as totalAmount, sum(1) as count
 * from vk-pay-orders
 * where [静态条件] and pay_date >= startTime and pay_date <= endTime
 * group by dateToString(pay_date, '%Y-%m-%d')
 */
async function getCurrentPeriodPaymentByDay({ staticWhere, query }) {
  const res = await vk.baseDao.selects({
    dbName: dbName.payOrder,
    pageSize: 1000,
    getMain: true,
    whereJson: Object.assign({}, staticWhere, {
      pay_date: _.gte(query.startTime).lte(query.endTime),
    }),
    groupJson: {
      _id: $.dateToString({
        date: $.add([new Date(0), '$pay_date']),
        format: '%Y-%m-%d',
        timezone: '+08:00',
      }),
      totalAmount: $.sum('$total_fee'),
      count: $.sum(1),
    },
    sortArr: [{ name: '_id', type: 'asc' }],
  });
  return Array.isArray(res) ? res : [];
}

/**
 * 当期按平台聚合
 */
async function getCurrentPeriodPlatformBreakdown({ staticWhere, query }) {
  const res = await vk.baseDao.selects({
    dbName: dbName.payOrder,
    pageSize: 1000,
    getMain: true,
    whereJson: Object.assign({}, staticWhere, {
      pay_date: _.gte(query.startTime).lte(query.endTime),
    }),
    groupJson: {
      _id: '$platform',
      platform: $.first('$platform'),
      totalAmount: $.sum('$total_fee'),
      count: $.sum(1),
    },
  });
  return Array.isArray(res) ? res : [];
}

/**
 * 当期按支付方式聚合
 */
async function getCurrentPeriodPayTypeBreakdown({ staticWhere, query }) {
  const res = await vk.baseDao.selects({
    dbName: dbName.payOrder,
    pageSize: 1000,
    getMain: true,
    whereJson: Object.assign({}, staticWhere, {
      pay_date: _.gte(query.startTime).lte(query.endTime),
    }),
    groupJson: {
      _id: '$pay_type',
      pay_type: $.first('$pay_type'),
      totalAmount: $.sum('$total_fee'),
      count: $.sum(1),
    },
  });
  return Array.isArray(res) ? res : [];
}

/**
 * 当期按订单类型聚合
 */
async function getCurrentPeriodOrderTypeBreakdown({ staticWhere, query }) {
  const res = await vk.baseDao.selects({
    dbName: dbName.payOrder,
    pageSize: 1000,
    getMain: true,
    whereJson: Object.assign({}, staticWhere, {
      pay_date: _.gte(query.startTime).lte(query.endTime),
    }),
    groupJson: {
      _id: '$type',
      type: $.first('$type'),
      totalAmount: $.sum('$total_fee'),
      count: $.sum(1),
    },
  });
  return Array.isArray(res) ? res : [];
}

/**
 * 当期每日退款聚合（用于趋势图退款线）
 * $unwind 展开 refund_list → 按退款时间过滤 → 按天分组
 */
async function getCurrentPeriodRefundByDay({ staticWhere, query }) {
  const baseMatch = Object.assign({}, staticWhere, {
    refund_num: _.gt(0),
    pay_date: _.gte(query.previousStartTime).lte(query.endTime),
  });
  delete baseMatch.status;

  const collection = db.collection(dbName.payOrder);
  const res = await collection
    .aggregate()
    .match(baseMatch)
    .unwind('$refund_list')
    .match({ 'refund_list.refund_date': _.gte(query.startTime).lte(query.endTime) })
    .group({
      _id: $.dateToString({
        date: $.add([new Date(0), '$refund_list.refund_date']),
        format: '%Y-%m-%d',
        timezone: '+08:00',
      }),
      refundAmount: $.sum('$refund_list.refund_fee'),
      refundCount: $.sum(1),
    })
    .end();
  return res.data || [];
}

/**
 * 退款总览（原生聚合：$unwind 展开 refund_list → 按退款时间过滤 → 分别统计当期/上期）
 * 返回 { current: [{refundAmount, refundCount}], previous: [{refundAmount, refundCount}] }
 */
async function getRefundOverview({ staticWhere, query }) {
  const baseMatch = Object.assign({}, staticWhere, {
    refund_num: _.gt(0),
    pay_date: _.gte(query.previousStartTime).lte(query.endTime),
  });
  // 退款统计需统计所有有退款记录的订单，不受支付状态筛选限制，故移除 status 条件
  delete baseMatch.status;

  const collection = db.collection(dbName.payOrder);

  // 查询当期退款聚合
  async function queryCurrentRefund() {
    return collection
      .aggregate()
      .match(baseMatch)
      .unwind('$refund_list')
      .match({ 'refund_list.refund_date': _.gte(query.startTime).lte(query.endTime) })
      .group({
        _id: null,
        refundAmount: $.sum('$refund_list.refund_fee'),
        refundCount: $.sum(1),
      })
      .end();
  }

  // 查询上期退款聚合
  async function queryPreviousRefund() {
    return collection
      .aggregate()
      .match(baseMatch)
      .unwind('$refund_list')
      .match({ 'refund_list.refund_date': _.gte(query.previousStartTime).lt(query.startTime) })
      .group({
        _id: null,
        refundAmount: $.sum('$refund_list.refund_fee'),
        refundCount: $.sum(1),
      })
      .end();
  }

  const { stack } = await vk.pubfn.batchRun({
    main: [queryCurrentRefund, queryPreviousRefund],
    concurrency: 2,
  });
  const currentRes = stack[0];
  const previousRes = stack[1];
  return {
    current: currentRes.data || [],
    previous: previousRes.data || [],
  };
}

/**
 * 退款下钻（原生聚合：$unwind → 按退款时间过滤 → 按平台+订单类型分组）
 * 返回 [{platform, type, refundAmount, refundCount}, ...]
 */
async function getRefundBreakdown({ staticWhere, query }) {
  const baseMatch = Object.assign({}, staticWhere, {
    refund_num: _.gt(0),
    pay_date: _.gte(query.previousStartTime).lte(query.endTime),
  });
  delete baseMatch.status;

  const collection = db.collection(dbName.payOrder);
  const res = await collection
    .aggregate()
    .match(baseMatch)
    .unwind('$refund_list')
    .match({ 'refund_list.refund_date': _.gte(query.startTime).lte(query.endTime) })
    .group({
      _id: { platform: '$platform', type: '$type' },
      platform: $.first('$platform'),
      type: $.first('$type'),
      refundAmount: $.sum('$refund_list.refund_fee'),
      refundCount: $.sum(1),
    })
    .end();
  return res.data || [];
}

/**
 * 获取商户ID列表（_id 即为 pid）
 */
async function getPidOptions() {
  const res = await vk.baseDao.select({
    dbName: dbName.payConfig,
    pageSize: 1000,
    getMain: true,
    fieldJson: { _id: true, name: true },
  });
  const rows = Array.isArray(res) ? res : res && res.rows ? res.rows : [];
  return rows.map((item) => ({ label: item.name || item._id, value: item._id })).filter((item) => item.value);
}

async function getFunnel({ query, funnelWhere }) {
  const { stack } = await vk.pubfn.batchRun({
    main: [
      async () => getLoginUserCount(query),
      async () => getOrderCount({ query, funnelWhere }),
      async () => getPaidOrderCount({ query, funnelWhere }),
      async () => getCallbackSuccessCount({ query, funnelWhere }),
    ],
    concurrency: 4,
  });

  const loginUserCount = getNumber(stack[0], 0);
  const orderCount = getNumber(stack[1], 0);
  const paidOrderCount = getNumber(stack[2], 0);
  const callbackSuccessCount = getNumber(stack[3], 0);

  return [
    createFunnelRow('login-user', '登录用户', loginUserCount, '仅按日期范围统计'),
    createFunnelRow('order-count', '下单数（含未付款）', orderCount),
    createFunnelRow('paid-order', '支付订单（含退款）', paidOrderCount),
    createFunnelRow('callback-success', '支付成功', callbackSuccessCount),
  ];
}

async function getLoginUserCount(query) {
  const res = await db
    .collection(dbName.loginLog)
    .aggregate()
    .match({
      type: 'login',
      state: 1,
      _add_time: _.gte(query.startTime).lte(query.endTime),
    })
    .group({
      _id: '$user_id',
    })
    .group({
      _id: null,
      total: $.sum(1),
    })
    .end();
  const rows = res.data || [];
  return rows[0] ? getNumber(rows[0].total, 0) : 0;
}

async function getOrderCount({ query, funnelWhere }) {
  return vk.baseDao.count({
    dbName: dbName.payOrder,
    whereJson: Object.assign({}, funnelWhere, {
      create_date: _.gte(query.startTime).lte(query.endTime),
      status: _.neq(-1),
    }),
  });
}

async function getPaidOrderCount({ query, funnelWhere }) {
  return vk.baseDao.count({
    dbName: dbName.payOrder,
    whereJson: Object.assign({}, funnelWhere, {
      create_date: _.gte(query.startTime).lte(query.endTime),
      status: _.in([1, 2, 3]),
    }),
  });
}

async function getCallbackSuccessCount({ query, funnelWhere }) {
  return vk.baseDao.count({
    dbName: dbName.payOrder,
    whereJson: Object.assign({}, funnelWhere, {
      create_date: _.gte(query.startTime).lte(query.endTime),
      user_order_success: true,
    }),
  });
}

function createFunnelRow(key, label, value, desc) {
  return {
    key,
    label,
    value,
    desc: desc || '',
  };
}

// ============ 趋势计算 ============

function computeTrend(dayResult, refundDayResult, query) {
  // 初始化所有时间桶（确保无订单的日期也有数据）
  const trendMap = createTrendMap(query);

  // 填充支付聚合数据
  for (const row of dayResult) {
    const key = row._id;
    if (trendMap[key]) {
      trendMap[key].payAmount = getNumber(row.totalAmount, 0);
      trendMap[key].payCount = getNumber(row.count, 0);
    }
  }

  // 填充退款聚合数据
  for (const row of refundDayResult) {
    const key = row._id;
    if (trendMap[key]) {
      trendMap[key].refundAmount = getNumber(row.refundAmount, 0);
      trendMap[key].refundCount = getNumber(row.refundCount, 0);
    }
  }

  // 按 groupBy 聚合
  if (query.groupBy === 'month') {
    return computeMonthTrend(trendMap, query);
  } else if (query.groupBy === 'week') {
    return computeWeekTrend(trendMap, query);
  } else {
    return computeDayTrend(trendMap);
  }
}

function computeDayTrend(trendMap) {
  return Object.keys(trendMap)
    .sort()
    .map((key) => {
      const item = trendMap[key];
      return {
        label: vk.pubfn.timeFormat(item.timestamp, 'MM-dd'),
        payAmount: vk.pubfn.toDecimal(item.payAmount / 100, 2),
        refundAmount: vk.pubfn.toDecimal(item.refundAmount / 100, 2),
        netIncome: vk.pubfn.toDecimal((item.payAmount - item.refundAmount) / 100, 2),
      };
    });
}

function computeWeekTrend(trendMap, query) {
  const weekMap = {};
  for (const key of Object.keys(trendMap)) {
    const item = trendMap[key];
    const weekStart = vk.pubfn.getWeekOffsetStartAndEnd(0, new Date(item.timestamp)).startTime;
    const weekKey = vk.pubfn.timeFormat(weekStart, 'yyyy-MM-dd');
    if (!weekMap[weekKey]) {
      const weekEnd = weekStart + 6 * 86400000;
      weekMap[weekKey] = {
        payAmount: 0,
        refundAmount: 0,
        label: `${vk.pubfn.timeFormat(weekStart, 'MM-dd')} ~ ${vk.pubfn.timeFormat(weekEnd, 'MM-dd')}`,
      };
    }
    weekMap[weekKey].payAmount += item.payAmount;
    weekMap[weekKey].refundAmount += item.refundAmount;
  }
  return Object.keys(weekMap)
    .sort()
    .map((key) => {
      const item = weekMap[key];
      return {
        label: item.label,
        payAmount: vk.pubfn.toDecimal(item.payAmount / 100, 2),
        refundAmount: vk.pubfn.toDecimal(item.refundAmount / 100, 2),
        netIncome: vk.pubfn.toDecimal((item.payAmount - item.refundAmount) / 100, 2),
      };
    });
}

function computeMonthTrend(trendMap, query) {
  const monthMap = {};
  for (const key of Object.keys(trendMap)) {
    const item = trendMap[key];
    const monthKey = vk.pubfn.timeFormat(item.timestamp, 'yyyy-MM');
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = {
        payAmount: 0,
        refundAmount: 0,
        label: vk.pubfn.timeFormat(item.timestamp, 'MM月'),
      };
    }
    monthMap[monthKey].payAmount += item.payAmount;
    monthMap[monthKey].refundAmount += item.refundAmount;
  }
  return Object.keys(monthMap)
    .sort()
    .map((key) => {
      const item = monthMap[key];
      return {
        label: item.label,
        payAmount: vk.pubfn.toDecimal(item.payAmount / 100, 2),
        refundAmount: vk.pubfn.toDecimal(item.refundAmount / 100, 2),
        netIncome: vk.pubfn.toDecimal((item.payAmount - item.refundAmount) / 100, 2),
      };
    });
}

// ============ 下钻分析 ============

function computeBreakdown(platformRows, payTypeRows, orderTypeRows) {
  const platformMap = {};
  const payTypeMap = {};
  const orderTypeMap = {};
  const platformOptionsMap = {};
  const payTypeOptionsMap = {};
  const orderTypeOptionsMap = {};

  for (const row of platformRows) {
    const platformKey = normalizePlatform(row.platform);
    const amount = getNumber(row.totalAmount, 0);
    const count = getNumber(row.count, 0);
    platformMap[platformKey] = { key: platformKey, payAmount: amount, payCount: count, refundAmount: 0, refundCount: 0, netIncome: 0 };
    platformOptionsMap[platformKey] = { label: platformKey, value: platformKey };
  }

  for (const row of payTypeRows) {
    const payTypeKey = row.pay_type || 'other';
    payTypeMap[payTypeKey] = (payTypeMap[payTypeKey] || 0) + getNumber(row.totalAmount, 0);
    payTypeOptionsMap[payTypeKey] = { label: payTypeKey, value: payTypeKey };
  }

  for (const row of orderTypeRows) {
    const orderTypeKey = row.type || 'other';
    const amount = getNumber(row.totalAmount, 0);
    const count = getNumber(row.count, 0);
    orderTypeMap[orderTypeKey] = { key: orderTypeKey, payAmount: amount, payCount: count, refundAmount: 0, refundCount: 0, netIncome: 0 };
    orderTypeOptionsMap[orderTypeKey] = { label: orderTypeKey, value: orderTypeKey };
  }

  return {
    platformMap,
    payTypeMap,
    orderTypeMap,
    options: { platformOptionsMap, payTypeOptionsMap, orderTypeOptionsMap },
  };
}

// ============ 工具函数 ============

function createMetricState() {
  return { payAmount: 0, payCount: 0, refundAmount: 0, refundCount: 0, netIncome: 0, avgOrderAmount: 0 };
}

function finalizeMetricState(metric) {
  metric.netIncome = metric.payAmount - metric.refundAmount;
  metric.avgOrderAmount = metric.payCount > 0 ? metric.payAmount / metric.payCount : 0;
}

function createSummary(current, previous) {
  const summary = {};
  for (const { key, isMoney } of METRIC_KEYS) {
    summary[key] = createMetricCard(current[key], previous[key], isMoney);
  }
  return summary;
}

function createMetricCard(currentValue, previousValue, isMoney) {
  const diff = currentValue - previousValue;
  return {
    value: isMoney ? vk.pubfn.toDecimal(currentValue, 2) : currentValue,
    previousValue: isMoney ? vk.pubfn.toDecimal(previousValue, 2) : previousValue,
    diffValue: isMoney ? vk.pubfn.toDecimal(diff, 2) : diff,
    rate: previousValue !== 0 ? Number(((diff / previousValue) * 100).toFixed(2)) : null,
  };
}

function createTrendMap(query) {
  const trendMap = {};
  let cursor = query.startTime;
  while (cursor <= query.endTime) {
    const dateStr = vk.pubfn.timeFormat(cursor, 'yyyy-MM-dd');
    trendMap[dateStr] = {
      timestamp: cursor,
      payAmount: 0,
      payCount: 0,
      refundAmount: 0,
      refundCount: 0,
    };
    cursor = vk.pubfn.getDayOffsetStartAndEnd(1, new Date(cursor)).startTime;
  }
  return trendMap;
}

function finalizeTableRow(row) {
  return {
    key: row.key,
    payAmount: vk.pubfn.toDecimal(row.payAmount, 2),
    payCount: row.payCount,
    refundAmount: vk.pubfn.toDecimal(row.refundAmount, 2),
    refundCount: row.refundCount,
    netIncome: vk.pubfn.toDecimal(row.payAmount - row.refundAmount, 2),
  };
}

function createPayTypeShare(payTypeMap, totalAmount) {
  return Object.keys(payTypeMap)
    .map((key) => {
      const amount = payTypeMap[key];
      return {
        key,
        amount: vk.pubfn.toDecimal(amount, 2),
        percent: totalAmount > 0 ? Number(((amount / totalAmount) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function createOptionList(optionMap) {
  return Object.keys(optionMap)
    .filter((key) => key !== 'other')
    .sort()
    .map((key) => optionMap[key]);
}

function normalizePlatform(platform) {
  if (!platform) return 'other';
  if (platform === 'web') return 'h5';
  if (platform === 'app') return 'app-plus';
  return platform;
}

function getNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isNaN(n) ? defaultValue : n;
}

function sortByPayAmount(a, b) {
  return b.payAmount === a.payAmount ? b.netIncome - a.netIncome : b.payAmount - a.payAmount;
}

function shouldLoadRefundOrders(query) {
  const s = query.status;
  return s === 'all' || s === '' || s === 'paid-success' || s === 'refunded' || REFUND_STATUS_LIST.includes(Number(s));
}
