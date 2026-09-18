/**
 * 数据库表名配置模块
 * @module dao/config
 * @description 定义项目中使用的所有数据库表名常量，包括系统级别表和业务表
 */

/**
 * 数据库表名配置类型定义
 * @typedef {Object} DatabaseTables
 * @property {string} user - 用户表
 * @property {string} role - 角色表
 * @property {string} permission - 权限表
 * @property {string} menu - 菜单表
 * @property {string} appList - 应用表
 * @property {string} appVersions - 应用版本表
 * @property {string} openData - 开放数据表
 * @property {string} tempData - 临时数据表
 * @property {string} verifyCodes - 验证码表
 * @property {string} loginLog - 用户登录日志表
 * @property {string} adminLog - admin操作日志表
 * @property {string} errorLog - 错误日志表
 * @property {string} globalData - 系统全局参数表
 * @property {string} components - 动态数据组件表
 * @property {string} file - 素材表
 * @property {string} fileCategories - 素材分类表
 * @property {string} payOrder - vk-pay支付订单表
 * @property {string} payConfig - vk-pay支付配置表
 * @property {string} wsConnection - WebSocket连接表
 * @property {string} userTag - 用户标签表
 * @property {string} statResult - 统计结果表
 */

/**
 * 数据库表名配置
 * @type {DatabaseTables}
 */
module.exports = {
  // ==================== 项目业务表 ====================
  // 新增表标记点（请勿删除此行注释，自动化建Dao工具需要）

  // ==================== vk框架内置表 ====================
  user: "uni-id-users", // 用户表
  role: "uni-id-roles", // 角色表
  permission: "uni-id-permissions", // 权限表
  menu: "opendb-admin-menus", // 菜单表
  appList: "opendb-app-list", // 应用表
  appVersions: "opendb-app-versions", // 应用版本表
  openData: "opendb-open-data", // 开放数据表
  tempData: "opendb-tempdata", // 临时数据表
  verifyCodes: "opendb-verify-codes", // 验证码表
  loginLog: "uni-id-log", // 用户登录日志表
  adminLog: "opendb-admin-log", // admin操作日志表
  errorLog: "vk-error-log", // 错误日志表
  globalData: "vk-global-data", // 系统全局参数表
  components: "vk-components-dynamic", // 动态数据组件表
  file: "vk-files", // 素材表
  fileCategories: "vk-files-categories", // 素材分类表
  payOrder: "vk-pay-orders", // vk-pay支付订单表
  payConfig: "vk-pay-config", // vk-pay支付配置表
  wsConnection: "vk-ws-connection", // WebSocket连接表
  userTag: "vk-user-tag", // 用户标签表
  statResult: "vk-stat-result", // 统计结果表
};
