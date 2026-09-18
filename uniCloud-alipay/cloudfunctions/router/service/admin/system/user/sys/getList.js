module.exports = {
  /**
   * 查询用户列表(可登录后台的)
   * @url admin/system/user/sys/getList 前端调用的url参数地址
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
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { dcloud_appid, appids, searchvalue } = data.formData || {};
    let whereJson = {};
    if (dcloud_appid) {
      if (dcloud_appid === '___empty-array___') {
        whereJson['dcloud_appid'] = [];
      } else if (dcloud_appid === '___error___') {
        whereJson['dcloud_appid'] = _.and(_.exists(true), _.nin(appids));
      } else if (dcloud_appid === '___non-existent___') {
        whereJson['dcloud_appid'] = _.exists(false);
      } else {
        whereJson['dcloud_appid'] = _.or(_.eq(dcloud_appid), _.exists(false));
      }
    }
    if (searchvalue) {
      // 支持根据ID精确搜索、用户名、昵称、手机号模糊搜索
      // 转义正则特殊字符
      let regStr = vk.pubfn.escapeRegExp(searchvalue);
      let regexp = new RegExp(regStr, 'i');
      whereJson = _.and(
        whereJson,
        _.or(
          {
            _id: _.eq(searchvalue),
          },
          { username: regexp },
          { nickname: regexp },
          { mobile: regexp },
          { email: regexp }
        )
      );
    }
    let dbName = 'uni-id-users';
    res = await vk.baseDao.getTableData({
      dbName,
      data,
      whereJson,
      sortArr: [{ name: 'register_date', type: 'desc' }],
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
          dbName: 'uni-id-users',
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
      ],
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
