'use strict';
module.exports = {
  /**
   * 获取用户详情
   * @url admin/system/user/sys/getInfo 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { _id } = data;
    if (vk.pubfn.isNull(_id)) return { code: -1, msg: '_id不能为空' };
    let dbName = 'uni-id-users';
    res.info = await vk.baseDao.selects({
      dbName,
      getMain: true,
      getOne: true,
      // 主表where条件
      whereJson: {
        _id,
      },
      // 主表字段显示规则
      fieldJson: { token: false, password: false },
      // 副表列表
      foreignDB: [
        {
          dbName: 'opendb-app-list',
          localKey: 'dcloud_appid',
          foreignKey: 'appid',
          localKeyType: 'array',
          as: 'appList',
          limit: 500,
        },
        {
          dbName,
          localKey: $.arrayElemAt(['$inviter_uid', 0]), // 主表外键字段名
          foreignKey: '_id', // 副表外键字段名
          as: 'inviterUserInfo',
          limit: 1, // 当limit = 1时，以对象形式返回，否则以数组形式返回
        },
        {
          dbName: 'uni-id-roles',
          localKey: 'role',
          foreignKey: 'role_id',
          localKeyType: 'array',
          as: 'roleList',
          limit: 500,
        },
        {
          dbName: 'vk-user-tag',
          localKey: 'tags',
          foreignKey: '_id',
          localKeyType: 'array',
          as: 'tagList',
          limit: 500,
        },
      ],
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
