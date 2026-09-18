module.exports = {
  /**
   * 分页查询
   * @url admin/system_uni/uni-id-files/files/kh/getList 前端调用的url参数地址
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
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let dbName = 'vk-files';
    let whereJson = {};
    let { role = [] } = userInfo;
    let { formData = {} } = data;
    let { category_id, category_ids = [] } = formData;

    if (category_id == 'null') {
      whereJson['category_id'] = 'null'; // 这里是字符串null是为了索引生效
    } else if (Array.isArray(category_ids) && category_ids.length > 0) {
      whereJson['category_id'] = _.in(category_ids);
    } else if (vk.pubfn.isNotNull(category_id)) {
      whereJson['category_id'] = category_id;
    }

    if (role.indexOf('admin') === -1) {
      // 如果不需要实现用户隔离，则删除掉下一行代码即可
      whereJson['user_id'] = uid;
    }

    res = await vk.baseDao.getTableData({
      dbName,
      data,
      whereJson,
    });
    return res;
  },
};
