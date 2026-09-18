module.exports = {
  /**
   * 分页查询
   * @url admin/system_uni/error-log/sys/getList 前端调用的url参数地址
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
    let dbName = 'vk-error-log';
    res = await vk.baseDao.getTableData({
      dbName,
      data,
      groupJson: {
        _id: '$md5', // _id是分组id， $ 后面接字段名，如user_id字段进行分组
        _add_time: $.last('$_add_time'),
        id: $.last('$_id'),
        request_id: $.last('$request_id'),
        err: $.last('$err'),
        md5: $.last('$md5'),
        user_id: $.last('$user_id'),
        url: $.last('$url'),
        data: $.last('$data'),
        status: $.last('$status'),
        count: $.sum(1),
      },
      // 副表列表
      foreignDB: [
        {
          dbName: 'uni-id-users',
          localKey: 'user_id',
          foreignKey: '_id',
          as: 'userInfo',
          limit: 1,
          fieldJson: {
            _id: true,
            avatar: true,
            nickname: true,
            gender: true,
          },
        },
      ],
    });
    return res;
  },
};
