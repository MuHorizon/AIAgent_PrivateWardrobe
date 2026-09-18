module.exports = {
  /**
   * 分页查询
   * @url admin/system_uni/uni-id-files/categories/kh/getList 前端调用的url参数地址
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
    let dbName = 'vk-files-categories';
    let fileDbName = 'vk-files';

    let { role = [] } = userInfo;
    let fileWhereJson = {};
    if (role.indexOf('admin') === -1) {
      fileWhereJson.user_id = uid;
    }

    // 查询分类列表
    let getCategoryData = async () => {
      return await vk.baseDao.getTableData({
        dbName,
        data,
        whereJson: {},
        sortArr: [
          { name: 'sort', type: 'asc' },
          { name: '_add_time', type: 'desc' },
        ],
      });
    };
    // 按分类分组统计每个分类下的文件数
    let getFileCountByCategory = async () => {
      return await vk.baseDao.selects({
        dbName: fileDbName,
        pageIndex: 1,
        pageSize: 1000, // 只统计前1000个分组
        whereJson: fileWhereJson,
        groupJson: {
          _id: '$category_id',
          category_id: $.first('$category_id'),
          perCategoryCount: $.sum(1),
          ungroupedCount: $.sum(
            $.cond({
              if: $.or([$.eq(['$category_id', 'null']), $.eq(['$category_id', null]), $.eq(['$category_id', ''])]),
              then: 1,
              else: 0,
            })
          ),
        },
        getMain: true,
      });
    };
    let batchRunRes = await vk.pubfn.batchRun({
      main: [getCategoryData, getFileCountByCategory],
      concurrency: 10,
    });
    let categoryRes = batchRunRes.stack[0] || {};
    let fileGroupRes = batchRunRes.stack[1] || [];
    let rows = categoryRes.rows || [];
    // 构建 category_id -> count 映射
    let countMap = {};
    let allCount = 0;
    let ungroupedCount = 0;
    fileGroupRes.forEach((item) => {
      let catId = item.category_id || '';
      if (vk.pubfn.isNull(catId) || catId === 'null') {
        ungroupedCount = item.ungroupedCount || 0;
      } else {
        countMap[catId] = item.perCategoryCount || 0;
      }
      allCount += item.perCategoryCount || 0;
    });

    rows = rows.map((item) => {
      item.file_count = countMap[item._id] || 0;
      item.parent_id = item.parent_id || '';
      return item;
    });

    res.rows = rows;
    res.total = rows.length;
    res.summary = {
      all_count: allCount,
      ungrouped_count: ungroupedCount,
    };
    return res;
  },
};
