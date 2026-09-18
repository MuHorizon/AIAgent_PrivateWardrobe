const vk = uniCloud.vk; // 全局vk实例
const path = require('path');
const moduleName = path.basename(__filename, path.extname(__filename));

/**
 * 清理 vk-global-data 表已过期的缓存
 */
module.exports = async function () {
  let res = { code: 0, msg: '' };
  // 业务逻辑开始-----------------------------------------------------------

  res.deleteExpiredRes = await vk.globalDataCache.deleteExpired();
  console.log(`[${moduleName}]: vk-global-data过期缓存清理完成`, res.deleteExpiredRes);

  // 业务逻辑结束-----------------------------------------------------------
  return res;
};
