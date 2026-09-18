const vk = uniCloud.vk; // 全局vk实例
const db = uniCloud.database(); // 全局数据库引用
const _ = db.command; // 数据库操作符
const $ = _.aggregate; // 聚合查询操作符

const path = require('path');
const moduleName = path.basename(__filename, path.extname(__filename));

/**
 * 用户统计
 * 主要统计登录注册用户的数量
 */
module.exports = async function () {
  let res = { code: 0, msg: '' };
  // 业务逻辑开始-----------------------------------------------------------

  const calcStats = async (obj = {}) => {
    let { type, dimension, start_time, end_time } = obj;

    let num = await vk.daoCenter.statResultDao.count({
      type,
      dimension,
      start_time,
      end_time,
    });

    let dateStr = '';
    if (dimension === 'month') {
      dateStr = vk.pubfn.timeFormat(start_time, 'yyyy-MM');
    } else if (dimension === 'hour') {
      dateStr = vk.pubfn.timeFormat(start_time, 'yyyy-MM-dd hh时');
    } else {
      dateStr = vk.pubfn.timeFormat(start_time, 'yyyy-MM-dd');
    }
    if (num > 0) {
      console.log(`[${moduleName}]: ${type}-${dimension}统计 : 无需重复添加${dateStr}`);
      return;
    }
    let { now } = vk.pubfn.getCommonTime(start_time);
    // 注册用户
    let user_register_count = await vk.daoCenter.userDao.count({
      register_date: _.gte(start_time).lte(end_time),
    });
    // 登录用户
    let user_login_count = await vk.daoCenter.loginLogDao.count({
      whereJson: {
        _add_time: _.gte(start_time).lte(end_time),
      },
      groupJson: {
        _id: '$user_id', // _id是分组id， $ 后面接字段名，如user_id字段进行分组
      },
    });
    // 添加结果
    await vk.daoCenter.statResultDao.add({
      type,
      dimension,
      start_time,
      end_time,
      date: now,
      user_register_count,
      user_login_count,
    });
    console.log(`[${moduleName}]: ${type}-${dimension}统计 : ${dateStr}用户登录数量完成`);
  };

  const run = async (date) => {
    // 以昨天0点的时间为基准计算
    let { yesterdayStart, now: todayNow } = vk.pubfn.getCommonTime(date);

    // 小时统计：统计上一小时用户登录数量
    let { startTime: start_time, endTime: end_time } = vk.pubfn.getHourOffsetStartAndEnd(-1, date);
    await calcStats({
      type: 'user',
      dimension: 'hour',
      start_time,
      end_time,
    });

    // 日统计：如果当前小时是0点，则统计昨日用户登录数量
    if (todayNow.hour === 0) {
      let { todayStart: start_time, todayEnd: end_time } = vk.pubfn.getCommonTime(yesterdayStart);
      await calcStats({
        type: 'user',
        dimension: 'day',
        start_time,
        end_time,
      });
    }

    // 周统计：如果当前是周一的0点，则再统计上周用户登录数量
    if (todayNow.week === 1 && todayNow.hour === 0) {
      let { weekStart: start_time, weekEnd: end_time } = vk.pubfn.getCommonTime(yesterdayStart);
      await calcStats({
        type: 'user',
        dimension: 'week',
        start_time,
        end_time,
      });
    }

    // 月统计：如果当前是每月1号的0点，则再统计上月用户登录数量
    if (todayNow.day === 1 && todayNow.hour === 0) {
      let { monthStart: start_time, monthEnd: end_time } = vk.pubfn.getCommonTime(yesterdayStart);
      await calcStats({
        type: 'user',
        dimension: 'month',
        start_time,
        end_time,
      });
    }
  };

  await run();

  // 打开下方注释，从今天开始往前计算前90天的统计数据

  // let { hourStart } = vk.pubfn.getCommonTime();
  // for (let i = 1; i < 90 * 24; i++) {
  //   await run(hourStart - 1000 * 3600 * i);
  // }

  // 业务逻辑结束-----------------------------------------------------------
  return res;
};
