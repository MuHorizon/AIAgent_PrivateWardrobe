module.exports = {
  /**
   * 修改
   * @url admin/system_uni/uni-id-files/categories/sys/update 前端调用的url参数地址
   * data 请求参数 说明
   * @param {String} _id 					id
   * @param {String} name 					分类名称
   * @param {String} description 	数据描述
   * @param {Number} sort					排序值
   * @param {String} parent_id 		父id
   * res 返回参数说明
   * @param {Number} code 错误码，0表示成功
   * @param {String} msg 详细信息
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { _id, name, description, sort, parent_id = '' } = data;
    // 参数非空检测
    if (vk.pubfn.isNull(_id)) {
      return { code: -1, msg: '_id不能为空' };
    }
    if (vk.pubfn.isNull(name)) {
      return { code: -1, msg: '名称不能为空' };
    }
    if (parent_id === _id) {
      return { code: -1, msg: '父分组不能选择自己' };
    }
    let dbName = 'vk-files-categories';

    if (vk.pubfn.isNotNull(parent_id)) {
      // 检查父分组是否存在
      let parentInfo = await vk.baseDao.findById({
        dbName,
        id: parent_id,
        fieldJson: { _id: 1 },
      });
      if (!parentInfo) {
        return { code: -1, msg: '父分组不存在' };
      }
      // 逐级向上检查，防止循环引用
      let currentId = parent_id;
      while (vk.pubfn.isNotNull(currentId)) {
        if (currentId === _id) {
          return { code: -1, msg: '父分组不能选择当前分组或其子分组' };
        }
        let info = await vk.baseDao.findById({
          dbName,
          id: currentId,
          fieldJson: { parent_id: 1 },
        });
        currentId = info ? info.parent_id : '';
      }
    } else {
      parent_id = '';
    }

    // 检测name是否已存在
    let num = await vk.baseDao.count({
      dbName,
      whereJson: {
        name,
        _id: _.neq(_id),
      },
    });
    if (num > 0) {
      return { code: -1, msg: `名称【${name}】不能重复!` };
    }
    // 执行数据库API请求
    res.num = await vk.baseDao.updateById({
      dbName,
      id: _id,
      dataJson: {
        name,
        description,
        parent_id,
        sort,
      },
    });
    return res;
  },
};
