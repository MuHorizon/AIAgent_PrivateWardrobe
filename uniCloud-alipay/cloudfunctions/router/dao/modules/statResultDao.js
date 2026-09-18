// Dao 2.0版本

const { BaseDao, Tables } = require('../base.js');

/**
 * statResult表的数据库操作
 * @class StatResultDao
 * @extends BaseDao
 */
class StatResultDao extends BaseDao {
  constructor(obj) {
    super(obj);
    this.tableName = Tables.statResult;
  }

  /**
   * 注意：基本的CRUD方法已经在BaseDao中实现，如果没有特殊业务逻辑，可以不用重写
   * 基本调用示例：

  // 查询单条记录（简易版）
  let statResultInfo = await vk.daoCenter.statResultDao.findById(id);

  // 查询单条记录（完整版，支持事务）
  let statResultInfo = await vk.daoCenter.statResultDao.findById({
    db, // 指定db对象
    id: id,
    fieldJson: {

    }
  });

  // 根据条件查询单条记录
  let statResultInfo = await vk.daoCenter.statResultDao.findByWhereJson({

  });

  // 添加记录
  await vk.daoCenter.statResultDao.add(dataJson);

  // 批量添加
  await vk.daoCenter.statResultDao.adds(dataArr);

  // 根据ID修改
  await vk.daoCenter.statResultDao.updateById({
    id: id,
    dataJson: {

    }
  });

  // 批量修改
  await vk.daoCenter.statResultDao.update({
    whereJson: {

    },
    dataJson: {

    }
  });

  // 删除记录
  await vk.daoCenter.statResultDao.deleteById(id);

  // 批量删除
  await vk.daoCenter.statResultDao.del({

  });

  // 统计数量
  let count = await vk.daoCenter.statResultDao.count({

  });

  // 先分组再统计数量
  let count = await vk.daoCenter.statResultDao.count({
    whereJson: {},
    groupJson: {}
  });

  // 求和/最大值/最小值/平均值
  // 求和
  let sum = await vk.daoCenter.statResultDao.sum({ fieldName: "amount", whereJson: { } });
  // 求最大值
  let max = await vk.daoCenter.statResultDao.max({ fieldName: "amount", whereJson: { } });
  // 求最小值
  let min = await vk.daoCenter.statResultDao.min({ fieldName: "amount", whereJson: { } });
  // 求平均值
  let avg = await vk.daoCenter.statResultDao.avg({ fieldName: "amount", whereJson: { } });

  // select 查询列表（不支持联表查询，性能比selects高）
  res = await vk.daoCenter.statResultDao.select({
    pageIndex: 1,
    pageSize: 20,
    getCount: false,
    whereJson: {

    },
    sortArr: [{ name: "_id", type: "desc" }]
  });

  // selects 查询列表（支持联表查询）
  res = await vk.daoCenter.statResultDao.selects({
    pageIndex: 1,
    pageSize: 20,
    getCount: false,
    whereJson: {

    },
    fieldJson: {},
    sortArr: [{ name: "_id", type: "desc" }],
    // 副表列表
    foreignDB: [{
      dbName: "副表表名",
      localKey: "主表外键名",
      foreignKey: "副表外键名",
      as: "副表连表结果的别名",
      limit: 1,  // 当limit为1时，以对象形式返回
      // 副表查询条件
      whereJson: {},
      // 副表字段显示规则
      fieldJson: {}
    }]
  });

  // 获取表格数据（与selects参数一致，也支持连表，默认 getCount 为 true）
  res = await vk.daoCenter.statResultDao.getTableData({
    data
  });

  // 设置强制查询条件
  res = await vk.daoCenter.statResultDao.getTableData({
    data,
    // 强制where条件
    whereJson: {

    }
  });

   */

  // 如果需要在某个方法中添加特殊业务逻辑，可以重写对应的方法

  /**
   * 自定义业务方法示例
   * 在这里可以添加该表特有的业务逻辑方法
   */

  // 示例：自定义查询方法
  // async findByCustomCondition(params) {
  //   // 可以使用 this.collection 使用传统数据库语法进行复杂查询
  //   // 或者调用父类方法
  //   return await this.findByWhereJson(params);
  // }
}

module.exports = StatResultDao;
