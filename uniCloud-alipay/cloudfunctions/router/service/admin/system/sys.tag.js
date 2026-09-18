'use strict';
let vk = uniCloud.vk; // 全局vk实例
// 涉及的表名
const Tables = require('../../../dao/config.js');

const db = uniCloud.database(); // 全局数据库引用
const _ = db.command; // 数据库操作符
const $ = _.aggregate; // 聚合查询操作符
/**
 * 权限注意：访问以下链接查看
 * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#内置权限
 */
const cloudObject = {
  isCloudObject: true, // 标记为云对象模式
  /**
   * 请求前处理，主要用于调用方法之前进行预处理，一般用于拦截器、统一的身份验证、参数校验、定义全局对象等。
   * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#before-预处理
   */
  _before: async function () {
    vk = this.vk; // 将vk定义为全局对象
    // let { customUtil, uniID, config, pubFun } = this.getUtil(); // 获取工具包
  },
  /**
   * 请求后处理，主要用于处理本次调用方法的返回结果或者抛出的错误
   * 文档地址：https://vkdoc.fsq.pub/client/uniCloud/cloudfunctions/cloudObject.html#after-后处理
   */
  _after: async function (options) {
    let { err, res } = options;
    if (err) {
      if (err instanceof Error) {
        return; // 如果是Error类型，直接return;不处理
      }
      return err;
    }
    return res;
  },
  /**
   * 获取标签列表
   * @url admin/system/sys.tag.getList 前端调用的url参数地址
   */
  getList: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    res = await vk.daoCenter.userTagDao.getTableData({
      data,
      sortArr: [{ name: '_id', type: 'desc' }],
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  /**
   * 新增标签
   * @url admin/system/sys.tag.save 前端调用的url参数地址
   * @param {String} name 标签名称
   */
  save: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { name } = data;
    if (vk.pubfn.isNull(name)) {
      return { code: -1, msg: '标签名称不能为空' };
    }
    name = name.trim();
    // 检查是否已存在同名标签
    let count = await vk.daoCenter.userTagDao.count({ name });
    if (count > 0) {
      return { code: -1, msg: '标签名称已存在' };
    }
    let _id = await vk.daoCenter.userTagDao.add({ name });
    res._id = _id;
    res.msg = '添加成功';
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  /**
   * 删除标签
   * @url admin/system/sys.tag.delete 前端调用的url参数地址
   * @param {String} _id 标签ID
   */
  delete: async function (data) {
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { _id } = data;
    if (vk.pubfn.isNull(_id)) {
      return { code: -1, msg: '标签ID不能为空' };
    }
    // 删除标签
    await vk.daoCenter.userTagDao.deleteById(_id);
    // 同步清理用户表中该标签引用
    await vk.daoCenter.userDao.update({
      whereJson: {
        tags: _id,
      },
      dataJson: {
        tags: _.pull(_id),
      },
    });
    res.msg = '删除成功';
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
  /**
   * 模板函数
   * @url admin/system/sys.tag.test 前端调用的url参数地址
   */
  test: async function (data) {
    let res = { code: 0, msg: '' };
    let { uid } = this.getClientInfo(); // 获取客户端信息
    // 业务逻辑开始-----------------------------------------------------------

    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};

module.exports = cloudObject;
