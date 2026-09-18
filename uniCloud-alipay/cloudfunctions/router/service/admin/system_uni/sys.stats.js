'use strict';
let vk = uniCloud.vk; // 全局vk实例
// 涉及的表名
const dbName = require('../../../dao/config.js');

const db = uniCloud.database(); // 全局数据库引用
const _ = db.command; // 数据库操作符
const $ = _.aggregate; // 聚合查询操作符

const cacheTime = 300; // 缓存时间，单位秒

/**
 * 权限注意：访问以下链接查看
 * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#内置权限
 */
let cloudObject = {
  isCloudObject: true, // 标记为云对象模式
  /**
   * 请求前处理，主要用于调用方法之前进行预处理，一般用于拦截器、统一的身份验证、参数校验、定义全局对象等。
   * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#before-预处理
   */
  _before: async function () {
    vk = this.vk; // 将vk定义为全局对象
    // let { customUtil, uniID, config, pubFun } = this.getUtil(); // 获取工具包
    let { uid } = this.getClientInfo();
    const cloudInfo = this.getCloudInfo();
    const methodName = this.getMethodName();
    const data = this.getParams();
    // 如果是本地调试，则不走缓存，方便调试
    if (cloudInfo.runtimeEnv !== 'local') {
      this.keyName = vk.md5(
        JSON.stringify({
          methodName,
          data,
          //uid, // 该统计与用户无关，故不需要根据uid进行缓存隔离
        })
      );
      const cacheManage = vk.getCacheManage();
      let cacheInfo = await cacheManage.get(`pub-stats-${this.keyName}`);
      if (cacheInfo) {
        return {
          isCache: true,
          ...cacheInfo,
        };
      }
    }
  },
  /**
   * 请求后处理，主要用于处理本次调用方法的返回结果或者抛出的错误
   * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#after-后处理
   */
  _after: async function (options) {
    let { err, res } = options;
    if (err) {
      return; // 如果方法抛出错误，直接return;不处理
    }
    res.methodName = this.getMethodName();
    if (this.keyName) {
      const cacheManage = vk.getCacheManage();
      await cacheManage.set(`pub-stats-${this.keyName}`, res, cacheTime); // 缓存5分钟，此处缓存键名pub-stats-是为了防止和其他模块的缓存冲突
    }
    return res;
  },
  /**
   * 通用 - 获取数量相关的统计数据
   */
  _getCount: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { todayStart, todayEnd, yesterdayStart, yesterdayEnd, monthStart, monthEnd, yearStart, yearEnd } = vk.pubfn.getCommonTime();
    let day7Start = vk.pubfn.getOffsetTime(todayStart, {
      day: 7,
      mode: 'before', // after 之后 before 之前
    });

    let { dao, dateField } = data;

    // 总数量
    const getAll = async () => {
      return await dao.count();
    };
    // 今日数量
    const getToday = async () => {
      return await dao.count({
        [dateField]: _.gte(todayStart).lte(todayEnd),
      });
    };
    // 昨日数量
    const getYesterday = async () => {
      return await dao.count({
        [dateField]: _.gte(yesterdayStart).lte(yesterdayEnd),
      });
    };
    // 近7天数量
    const getDay7 = async () => {
      return await dao.count({
        [dateField]: _.gte(day7Start).lte(todayEnd),
      });
    };
    // 前日数量
    const getBeforeYesterday = async () => {
      let { startTime, endTime } = vk.pubfn.getDayOffsetStartAndEnd(-2, new Date());
      return await dao.count({
        [dateField]: _.gte(startTime).lte(endTime),
      });
    };
    // 本月数量
    const getThisMonth = async () => {
      return await dao.count({
        [dateField]: _.gte(monthStart).lte(monthEnd),
      });
    };
    // 本年数量
    const getThisYear = async () => {
      return await dao.count({
        [dateField]: _.gte(yearStart).lte(yearEnd),
      });
    };

    // 并发
    let batchRunRes = await vk.pubfn.batchRun({
      // 主执行函数
      main: [
        // 总数量
        getAll,
        // 今日数量
        getToday,
        // 昨日数量
        getYesterday,
        // 近7天数量
        getDay7,
        // 前日数量
        getBeforeYesterday,
        // 本月数量
        getThisMonth,
        // 本年数量
        getThisYear,
      ],
      // 最大并发量，如果设置为1，则会按顺序执行
      concurrency: 10,
    });
    res.result = {
      all: batchRunRes.stack[0],
      today: batchRunRes.stack[1],
      yesterday: batchRunRes.stack[2],
      day7: batchRunRes.stack[3],
      beforeYesterday: batchRunRes.stack[4],
      thisMonth: batchRunRes.stack[5],
      thisYear: batchRunRes.stack[6],
    };
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  // 通用 - 获取金额相关的统计数据
  _getAmount: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { todayStart, todayEnd, yesterdayStart, yesterdayEnd, monthStart, monthEnd, yearStart, yearEnd, lastMonthStart, lastMonthEnd } = vk.pubfn.getCommonTime();
    let day7Start = vk.pubfn.getOffsetTime(todayStart, {
      day: 7,
      mode: 'before', // after 之后 before 之前
    });
    let { dao, amountField, dateField } = data;

    // 今日
    const getToday = async () => {
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(todayStart).lte(todayEnd),
        },
      });
    };
    // 昨日
    const getYesterday = async () => {
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(yesterdayStart).lte(yesterdayEnd),
        },
      });
    };
    // 近7天
    const getDay7 = async () => {
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(day7Start).lte(todayEnd),
        },
      });
    };
    // 前日
    const getBeforeYesterday = async () => {
      let { startTime, endTime } = vk.pubfn.getDayOffsetStartAndEnd(-2, new Date());
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(startTime).lte(endTime),
        },
      });
    };
    // 本月
    const getThisMonth = async () => {
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(monthStart).lte(monthEnd),
        },
      });
    };
    // 上月
    const getLastMonth = async () => {
      return await dao.sum({
        fieldName: amountField,
        whereJson: {
          [dateField]: _.gte(lastMonthStart).lte(lastMonthEnd),
        },
      });
    };
    // 并发
    let batchRunRes = await vk.pubfn.batchRun({
      // 主执行函数
      main: [
        // 今日
        getToday,
        // 昨日
        getYesterday,
        // 近7天
        getDay7,
        // 前日
        getBeforeYesterday,
        // 本月
        getThisMonth,
        // 上月
        getLastMonth,
      ],
      // 最大并发量，如果设置为1，则会按顺序执行
      concurrency: 10,
    });
    res.result = {
      today: batchRunRes.stack[0],
      yesterday: batchRunRes.stack[1],
      day7: batchRunRes.stack[2],
      beforeYesterday: batchRunRes.stack[3],
      thisMonth: batchRunRes.stack[4],
      lastMonth: batchRunRes.stack[5],
    };
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  // 通用 - 获取 vk-data-charts 组件需要的图表数据
  _getChartData: async function (obj) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let {
      dbName, // 表名
      formData = {}, // 前端表单数据
      whereJson = {}, // 强制查询条件
      dateField, // 必须是时间戳字段
      columns = [], // 字段规则
      type, // 类型
      options, // 其他选项
      queryFn, // 自定义查询函数
    } = obj;
    let { date, daterange, mode } = formData;
    let timeFormat;
    let boundaries = [];

    if (mode === 'hour') {
      // 小时
      if (vk.pubfn.isNull(date)) {
        return { code: -1, msg: '查询日期不能为空' };
      }
      let { todayStart } = vk.pubfn.getCommonTime(date);
      for (let i = 0; i <= 24; i++) {
        let timeCalc = vk.pubfn.getOffsetTime(todayStart, {
          hours: i,
          mode: 'after',
        });
        boundaries.push(timeCalc);
      }
      timeFormat = 'h时';
    } else if (mode === 'day') {
      // 日
      if (vk.pubfn.isNull(daterange)) {
        return { code: -1, msg: '查询日期不能为空' };
      }
      let { todayStart: startTime } = vk.pubfn.getCommonTime(daterange[0]);
      let { todayStart: endTime } = vk.pubfn.getCommonTime(daterange[1]);
      let days = vk.pubfn.toDecimal((endTime - startTime) / (1000 * 3600 * 24) + 1, 0);
      if (days > 93) {
        return { code: -1, msg: '查询日期范围不能超过3个月' };
      }
      for (let i = 0; i <= days; i++) {
        let timeCalc = vk.pubfn.getOffsetTime(startTime, {
          day: i,
          mode: 'after',
        });
        boundaries.push(timeCalc);
      }
      timeFormat = 'MM-dd';
    } else if (mode === 'month') {
      // 月
      if (vk.pubfn.isNull(date)) {
        return { code: -1, msg: '查询日期不能为空' };
      }
      if (date.length !== 4) {
        return { code: -1, msg: '查询日期格式错误' };
      }
      let { monthStart } = vk.pubfn.getCommonTime(`${date}-01-01`);
      for (let i = 0; i <= 12; i++) {
        let timeCalc = vk.pubfn.getOffsetTime(monthStart, {
          month: i,
          mode: 'after',
        });
        boundaries.push(timeCalc);
      }
      timeFormat = 'M月';
    } else if (mode === 'year') {
      // 年
      if (vk.pubfn.isNull(date)) {
        return { code: -1, msg: '查询日期不能为空' };
      }
      if (date.length !== 4) {
        return { code: -1, msg: '查询日期格式错误' };
      }
      let yearStart = vk.pubfn.getOffsetTime(`${date}-01-01`, {
        year: 2,
        mode: 'before',
      });
      for (let i = 0; i <= 3; i++) {
        let timeCalc = vk.pubfn.getOffsetTime(yearStart, {
          year: i,
          mode: 'after',
        });
        boundaries.push(timeCalc);
      }
      timeFormat = 'yyyy年';
    } else {
      return { code: -1, msg: '无效的mode' };
    }
    let dataResult = [];
    if (typeof queryFn === 'function') {
      dataResult = await queryFn({ boundaries });
    } else {
      let addFields = {};
      let output = {};
      columns.forEach((col) => {
        let { key, type, distinctBy } = col;
        let outputKey = key.replace(new RegExp('\\.', 'g'), '_');
        if (type === 'count') {
          if (distinctBy) {
            output[outputKey] = $.addToSet(`$${distinctBy}`);
            addFields[outputKey] = $.size(`$${outputKey}`);
          } else {
            output[outputKey] = $.sum(1);
          }
        } else {
          output[outputKey] = $.sum(`$${key}`);
        }
      });
      // 执行数据库查询
      let aggregate = db
        .collection(dbName)
        .aggregate()
        .match({
          ...whereJson,
          [dateField]: _.gte(boundaries[0]).lte(boundaries[boundaries.length - 1]),
        })
        .bucket({
          groupBy: `$${dateField}`,
          boundaries,
          default: 'other',
          output,
        });

      if (vk.pubfn.isNotNull(addFields)) {
        aggregate.addFields(addFields);
      }

      let dbRes = await aggregate.end();
      dataResult = dbRes.data;
    }

    // 组装数据返回
    let list = boundaries.map((groupItem) => {
      let findItem = dataResult.find((item) => item._id === groupItem);
      let text = vk.pubfn.timeFormat(groupItem, timeFormat);
      if (text === '0时') {
        text = vk.pubfn.timeFormat(groupItem, 'd日h时');
      } else if (text === '1月') {
        text = vk.pubfn.timeFormat(groupItem, 'yyyy年MM月');
      }
      let result = { text };
      columns.forEach((col) => {
        let { key, type = 'number', ratio, precision } = col;
        if (type === 'money') {
          if (vk.pubfn.isNull(ratio)) ratio = 100;
          if (vk.pubfn.isNull(precision)) precision = 2;
        } else {
          if (vk.pubfn.isNull(ratio)) ratio = 1;
          if (vk.pubfn.isNull(precision)) precision = 0;
        }
        let outputKey = key.replace(new RegExp('\\.', 'g'), '_');
        let value = findItem && findItem[outputKey] ? findItem[outputKey] : 0;
        result[`${key}Value`] = vk.pubfn.toDecimal(value / ratio, precision);
      });
      return result;
    });
    // 删除最后一个数据
    list.pop();

    let categories = [];
    let seriesDataMap = columns.map(() => []);

    for (let i = 0; i < list.length; i++) {
      let item = list[i];
      categories.push(item.text);
      columns.forEach((col, index) => {
        seriesDataMap[index].push(item[`${col.key}Value`]);
      });
    }

    let pubSerieItem = {
      smooth: true,
      label: {
        show: false,
      },
    };

    let series = columns.map((col, index) => ({
      ...pubSerieItem,
      name: col.title,
      color: col.color,
      data: seriesDataMap[index],
    }));
    // 业务逻辑结束-----------------------------------------------------------
    return {
      code: 0,
      msg: 'ok',
      chartData: {
        categories,
        series,
      },
      type,
      options,
    };
  },
  /**
   * 用户统计 - 注册用户统计人数
   * @url admin/system_uni/sys.stats.getUserCount 前端调用的url参数地址
   */
  getUserCount: async function (data) {
    return this._getCount({
      dao: vk.daoCenter.userDao,
      dateField: 'register_date',
    });
  },
  /**
   * 用户统计 - 新增用户趋势图
   * @url admin/system_uni/sys.stats.getNewUserCountGroup 前端调用的url参数地址
   */
  getNewUserCountGroup: async function (data) {
    return await this._getChartData({
      dbName: dbName.user,
      formData: data,
      dateField: 'register_date',
      columns: [{ key: 'count', type: 'count', title: '新用户数量', color: '#1890FF' }],
      type: 'line',
      options: {
        yName: '用户数 / 个',
      },
    });
  },
  /**
   * 用户统计 - 登录用户趋势图（实时统计版本，目前用户登录统计使用的是下面的方案，即从统计结果中获取）
   * @url admin/system_uni/sys.stats.getUserLoginCountGroup 前端调用的url参数地址
   */
  getUserLoginCountGroup: async function (data) {
    return await this._getChartData({
      dbName: dbName.loginLog,
      formData: data,
      dateField: '_add_time',
      columns: [{ key: 'count', type: 'count', distinctBy: 'user_id', title: '登录用户数量', color: '#1890FF' }],
      type: 'line',
      options: {
        yName: '用户数 / 个',
      },
    });
  },
  /**
   * 用户统计 - 登录用户趋势图（从统计结果中获取）
   * @url admin/system_uni/sys.stats.getUserLoginCountStat 前端调用的url参数地址
   */
  getUserLoginCountStat: async function (data) {
    let { date, daterange, mode = 'day' } = data;

    if (!['day', 'hour', 'month'].includes(mode)) {
      return { code: -1, msg: '不支持的查询纬度' };
    }
    return await this._getChartData({
      formData: data,
      queryFn: async ({ boundaries }) => {
        // 因为用户登录日志表涉及的数据量很大，如十万日活的应用，每天可能会产生几十万的登录日志，如果直接从登录日志表中聚合查询性能较差，因此这里是从统计结果表中直接查询统计好的结果（统计的定时任务函数名是z_timer_stat）
        // 数据库查询
        let list = await vk.daoCenter.statResultDao.selects({
          getCount: false,
          getMain: true,
          pageIndex: 1,
          pageSize: 1000,
          whereJson: {
            type: 'user',
            dimension: mode,
            start_time: _.in(boundaries),
          },
          fieldJson: {
            _id: '$start_time',
            user_login_count: true,
          },
          sortArr: [{ name: 'start_time', type: 'asc' }],
        });

        let startTime;
        let endTime;
        if (mode === 'hour') {
          // 实时查询当前小时登录用户数量
          let { todayStart, hourStart, hourEnd } = vk.pubfn.getCommonTime();
          let todayText = vk.pubfn.timeFormat(todayStart, 'yyyy-MM-dd');
          if (todayText === date) {
            startTime = hourStart;
            endTime = hourEnd;
          }
        } else if (mode === 'day') {
          // 实时查询当日登录用户数量
          let { todayStart, todayEnd } = vk.pubfn.getCommonTime();
          let todayText = vk.pubfn.timeFormat(todayStart, 'yyyy-MM-dd');
          if (daterange && todayText === daterange[1]) {
            startTime = todayStart;
            endTime = todayEnd;
          }
        } else if (mode === 'month') {
          // 实时查询当月登录用户数量
          let { monthStart, monthEnd } = vk.pubfn.getCommonTime();
          let yearText = vk.pubfn.timeFormat(monthStart, 'yyyy');
          if (yearText === date) {
            startTime = monthStart;
            endTime = monthEnd;
          }
        }

        if (startTime && endTime) {
          let num = await vk.daoCenter.userDao.count({
            last_login_date: _.gte(startTime).lte(endTime),
          });
          let findItem = list.find((item, index) => {
            return item._id === startTime;
          });
          if (findItem) {
            findItem.user_login_count = num;
          } else {
            list.push({
              _id: startTime,
              user_login_count: num,
            });
          }
        }

        return list;
      },
      columns: [{ key: 'user_login_count', type: 'count', title: '登录用户数量', color: '#1890FF' }],
      type: 'line',
      options: {
        yName: '用户数 / 个',
      },
    });
  },
  /**
   * 用户统计 - 登录用户统计人数
   * @url admin/system_uni/sys.stats.getLoginUserCount 前端调用的url参数地址
   */
  getLoginUserCount: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { todayStart, todayEnd, yesterdayStart, yesterdayEnd, monthStart, monthEnd, yearStart, yearEnd } = vk.pubfn.getCommonTime();
    let day7Start = vk.pubfn.getOffsetTime(todayStart, {
      day: 7,
      mode: 'before', // after 之后 before 之前
    });

    // 总数量（包含只注册，但从未登录过的用户）
    const getAll = async () => {
      return await vk.daoCenter.userDao.count();
    };
    // 今日数量
    const getToday = async () => {
      return await vk.daoCenter.userDao.count({
        last_login_date: _.gte(todayStart).lte(todayEnd),
      });
    };
    // 昨日数量
    const getYesterday = async () => {
      let statResultInfo = await vk.daoCenter.statResultDao.findByWhereJson({
        type: 'user',
        dimension: 'day',
        start_time: yesterdayStart,
      });
      return (statResultInfo && statResultInfo.user_login_count) || 0;
    };
    // 近7天数量
    const getDay7 = async () => {
      return await vk.daoCenter.userDao.count({
        last_login_date: _.gte(day7Start).lte(todayEnd),
      });
    };
    // 前日数量
    const getBeforeYesterday = async () => {
      let { startTime, endTime } = vk.pubfn.getDayOffsetStartAndEnd(-2, new Date());
      let statResultInfo = await vk.daoCenter.statResultDao.findByWhereJson({
        type: 'user',
        dimension: 'day',
        start_time: startTime,
      });
      return (statResultInfo && statResultInfo.user_login_count) || 0;
    };
    // 本月数量
    const getThisMonth = async () => {
      return await vk.daoCenter.userDao.count({
        last_login_date: _.gte(monthStart).lte(monthEnd),
      });
    };
    // 本年数量
    const getThisYear = async () => {
      return await vk.daoCenter.userDao.count({
        last_login_date: _.gte(yearStart).lte(yearEnd),
      });
    };
    // 近7天数量总数（不去重复）
    const getDay7Total = async () => {
      return await vk.daoCenter.statResultDao.sum({
        fieldName: 'user_login_count',
        whereJson: {
          type: 'user',
          dimension: 'day',
          start_time: _.gte(day7Start).lte(todayEnd),
        },
      });
    };
    // 并发
    let batchRunRes = await vk.pubfn.batchRun({
      // 主执行函数
      main: [
        // 总数量
        getAll,
        // 今日数量
        getToday,
        // 昨日数量
        getYesterday,
        // 近7天数量
        getDay7,
        // 前日数量
        getBeforeYesterday,
        // 本月数量
        getThisMonth,
        // 本年数量
        getThisYear,
        // 近7天数量总数（不去重复）
        getDay7Total,
      ],
      // 最大并发量，如果设置为1，则会按顺序执行
      concurrency: 10,
    });
    res.result = {
      all: batchRunRes.stack[0],
      today: batchRunRes.stack[1],
      yesterday: batchRunRes.stack[2],
      day7: batchRunRes.stack[3],
      beforeYesterday: batchRunRes.stack[4],
      thisMonth: batchRunRes.stack[5],
      thisYear: batchRunRes.stack[6],
      day7Total: batchRunRes.stack[7],
    };
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  /**
   * 模板函数
   * @url admin/system_uni/sys.stats.test 前端调用的url参数地址
   */
  test: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};

module.exports = cloudObject;
