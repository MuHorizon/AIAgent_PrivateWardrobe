const vk = uniCloud.vk; // 全局vk实例
const db = uniCloud.database(); // 全局数据库引用
const _ = db.command; // 数据库操作符
const $ = _.aggregate; // 聚合查询操作符

module.exports = async function () {
  let res = { code: 0, msg: '' };
  // 业务逻辑开始-----------------------------------------------------------
  console.log('我是1号定时任务');

  // 业务逻辑结束-----------------------------------------------------------
  return res;
};
