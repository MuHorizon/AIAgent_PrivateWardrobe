const Tables = require('./config.js');

/**
 * 数据库访问基类（BaseDao）
 * 对 vk.baseDao 的面向对象封装，提供基础的 CRUD、聚合查询、联表查询、事务支持等功能。
 * 子类继承后只需设置 `this.tableName` 即可自动绑定对应数据表，无需在每次调用时传入 dbName。
 * @class BaseDao
 * @author VK
 */

class BaseDao {
  /**
   * 创建 BaseDao 实例
   * @param {Object} util - 云函数工具集对象，由路由框架自动注入
   * @param {Object} util.vk - vk 实例，包含 baseDao、pubfn 等工具方法
   * @param {Object} util.db - uniCloud 数据库实例
   */
  constructor(util) {
    const { vk, db } = util;
    /** @type {Object} vk.baseDao 底层数据访问对象 */
    this.dao = vk.baseDao;
    /** @type {Object} uniCloud 数据库实例 */
    this.db = db;
    /** @type {Object} 数据库操作命令（db.command），用于构建查询条件，如 _.gt()、_.in() 等 */
    this._ = db.command;
    /** @type {Object} 聚合操作符（db.command.aggregate），用于聚合管道中的表达式，如 $.sum()、$.avg() 等 */
    this.$ = db.command.aggregate;
    /** @type {string} 数据表名称，子类应在构造函数中设置此值 */
    this.tableName = '';
    this._getUtil = () => {
      return util;
    };
  }

  /**
   * 获取云函数工具集对象
   * @type {Object}
   */
  get util() {
    return this._getUtil();
  }

  /**
   * 获取 vk 实例（包含 baseDao、pubfn 等工具方法）
   * @type {Object}
   */
  get vk() {
    return this._getUtil().vk;
  }

  /**
   * 获取集合引用（一般用于需要直接操作 collection 的复杂场景）
   * @param {string} [tableName] - 表名，不传则使用当前实例的 this.tableName
   * @returns {Object} uniCloud 数据库集合引用
   * @throws {Error} 当 tableName 未设置时抛出异常
   * @example
   * // 使用当前表
   * let col = this.collection();
   * // 使用指定表
   * let col = this.collection('other-table');
   */
  collection(tableName) {
    if (!tableName) tableName = this.tableName;
    if (!tableName) {
      throw new Error('tableName is required');
    }
    return this.db.collection(tableName);
  }

  /**
   * 查 - 根据 `_id` 获取单条记录
   * @param {string|Object} condition - 记录的 `_id` 字符串，或包含详细参数的对象：
   *   - 简易模式：直接传 `_id` 字符串
   *   - 完整模式：传 `{ db, id, fieldJson }` 对象
   * @param {Object} [condition.db] - 指定数据库实例（用于事务等场景）
   * @param {string} [condition.id] - 记录的 `_id`（完整模式时使用）
   * @param {Object} [condition.fieldJson] - 字段显示规则（完整模式时使用）
   * @param {Object} [fieldJson] - 字段显示规则（仅简易模式时生效）
   * @returns {Promise<Object>} 查询结果（表记录对象），如果记录不存在可能返回 undefined
   * @example
   * // 简易版
   * let info = await this.findById(_id);
   * // 简易版（指定字段）
   * let info = await this.findById(_id, { name: 1, age: 1 });
   * // 完整版（支持事务）
   * let info = await this.findById({
   *   db, // 指定db对象（如事务实例）
   *   id: _id,
   *   fieldJson: { name: 1 }
   * });
   */
  async findById(condition, fieldJson) {
    let res = {};
    if (typeof condition === 'object') {
      // 支持事务和指定db对象
      res = await this.dao.findById({
        ...condition,
        dbName: this.tableName,
      });
    } else {
      // 不支持事务
      res = await this.dao.findById({
        dbName: this.tableName,
        id: condition,
        fieldJson,
      });
    }
    return res;
  }

  /**
   * 查 - 根据whereJson获取单条记录
   * @param {Object} condition - 查询条件对象，有两种传参方式：
   *   - 简易模式：直接传 whereJson 条件对象，如 `{ status: 1 }`
   *   - 完整模式：传包含 whereJson 等属性的对象 `{ db, whereJson, fieldJson, sortArr }`
   * @param {Object} [condition.db] - 指定数据库实例（用于事务等场景）
   * @param {Object} [condition.whereJson] - 查询条件（完整模式时使用）
   * @param {Object} [condition.fieldJson] - 字段显示规则
   * @param {Array<Object>} [condition.sortArr] - 排序规则，如 `[{ name: "_add_time", type: "desc" }]`
   * @param {Object} [fieldJson] - 字段显示规则（仅简易模式时生效）
   * @returns {Promise<Object|null>} 查询结果（表记录对象），未找到则返回 null
   * @example
   * // 简易版
   * let info = await this.findByWhereJson({ status: 1 });
   * // 简易版（指定字段）
   * let info = await this.findByWhereJson({ status: 1 }, { name: 1, age: 1 });
   * // 完整版（支持事务、排序）
   * let info = await this.findByWhereJson({
   *   db, // 指定db对象
   *   whereJson: { status: 1 },
   *   fieldJson: { name: 1 }
   * });
   */
  async findByWhereJson(condition, fieldJson) {
    let res = {};
    if (condition && typeof condition.whereJson === 'object') {
      // 支持指定db对象
      res = await this.dao.findByWhereJson({
        ...condition,
        dbName: this.tableName,
      });
    } else {
      res = await this.dao.findByWhereJson({
        dbName: this.tableName,
        whereJson: condition,
        fieldJson,
      });
    }
    return res;
  }

  /**
   * 增 - 添加一条记录
   * 注意：默认会自动添加 `_add_time`（当前时间戳）
   * @param {Object} condition - 添加的数据，有两种传参方式：
   *   - 简易模式：直接传数据对象，如 `{ name: 'test' }`
   *   - 完整模式：传包含 dataJson 等属性的对象 `{ db, dataJson }`
   * @param {Object} [condition.db] - 指定数据库实例（用于事务等场景）
   * @param {Object} [condition.dataJson] - 需要添加的数据（完整模式时使用）
   * @param {boolean} [condition.cancelAddTime] - 是否取消自动添加 `_add_time` 字段
   * @param {Object} [db] - 指定数据库实例（仅简易模式时生效，用于事务等场景）
   * @returns {Promise<string|null>} 返回值为添加数据的 `_id`，添加失败返回 null
   * @example
   * // 简易版
   * let id = await this.add({ name: 'test' });
   * // 简易版（支持事务）
   * let id = await this.add({ name: 'test' }, db);
   * // 完整版（支持事务）
   * let id = await this.add({
   *   db, // 指定db对象
   *   dataJson: { name: 'test' }
   * });
   */
  async add(condition, db) {
    let res = {};
    if (condition && condition.dataJson) {
      // 支持事务
      res = await this.dao.add({
        ...condition,
        dbName: this.tableName,
      });
    } else {
      // 支持事务
      res = await this.dao.add({
        db,
        dbName: this.tableName,
        dataJson: condition,
      });
    }
    return res;
  }

  /**
   * 增 - 批量添加多条记录
   * 注意：默认会自动添加 `_add_time` 字段。
   * 超过 10 万条时默认不返回 ids 以提升性能。
   * @param {Array<Object>|Object} condition - 添加的数据，有两种传参方式：
   *   - 简易模式：直接传数据数组，如 `[{ name: 'test1' }, { name: 'test2' }]`
   *   - 完整模式：传包含 dataJson 等属性的对象
   * @param {Object} [condition.db] - 指定数据库实例（用于事务等场景）
   * @param {Array<Object>} [condition.dataJson] - 需要添加的数据数组（完整模式时使用）
   * @param {boolean} [condition.cancelAddTime] - 是否取消自动添加 `_add_time` 字段
   * @param {Object} [db] - 指定数据库实例（仅简易模式时生效）
   * @returns {Promise<Array<string>|null>} 返回值为添加数据的 `_id` 数组，添加失败返回 null，如果超过 10 万条时不返回 ids 以提升性能。
   * @example
   * // 简易版
   * let ids = await this.adds([{ name: 'test1' }, { name: 'test2' }]);
   * // 完整版（支持事务）
   * let ids = await this.adds({
   *   db, // 指定db对象
   *   dataJson: [{ name: 'test1' }, { name: 'test2' }]
   * });
   */
  async adds(condition, db) {
    let res = {};
    if (condition && condition.dataJson) {
      res = await this.dao.adds({
        ...condition,
        dbName: this.tableName,
      });
    } else {
      res = await this.dao.adds({
        db,
        dbName: this.tableName,
        dataJson: condition,
      });
    }
    return res;
  }

  /**
   * 删 - 根据条件删除记录（支持批量删除）
   * @param {Object} whereJson - 删除条件（不能为空，防止误删全部数据）
   * @param {Object} [db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<number>} 返回实际删除的记录数量
   * @example
   * // 简易版
   * let num = await this.del({ status: 0 });
   * // 支持事务
   * let num = await this.del(whereJson, db);
   */
  async del(whereJson, db) {
    let res = {};
    res = await this.dao.del({
      db,
      dbName: this.tableName,
      whereJson,
    });
    return res;
  }

  /**
   * 删 - 根据 `_id` 删除单条记录
   * @param {string} _id - 记录的 `_id`（不能为空）
   * @param {Object} [db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<number>} 返回实际删除的记录数量（0 或 1）
   * @example
   * // 简易版
   * let num = await this.deleteById(_id);
   * // 支持事务
   * let num = await this.deleteById(_id, db);
   */
  async deleteById(_id, db) {
    let res = {};
    res = await this.dao.deleteById({
      db,
      dbName: this.tableName,
      id: _id,
    });
    return res;
  }

  /**
   * 改 - 根据条件批量修改记录
   * @param {Object} obj - 修改参数对象
   * @param {Object} obj.whereJson - 修改条件（不能为空）
   * @param {Object} obj.dataJson - 需要修改的数据（不能为空）
   * @param {Object} [obj.db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<number>} 返回值为受影响的行数
   * @example
   * let num = await this.update({
   *   whereJson: { status: 0 },
   *   dataJson: { status: 1 }
   * });
   */
  async update(obj = {}) {
    let res = {};
    res = await this.dao.update({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 改 - 根据ID修改单条记录
   * @param {Object} obj - 修改参数对象
   * @param {string} obj.id - 记录的 `_id`
   * @param {Object} obj.dataJson - 需要修改的数据（不能为空）
   * @param {boolean} [obj.getUpdateData=false] - 是否返回修改后的完整数据（为 true 时内部会再执行一次 findById 查询）
   * @param {Object} [obj.db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<number|Object>} 当 `getUpdateData` 为 true 时返回修改后的完整记录对象，否则返回受影响的行数
   * @example
   * // 返回受影响行数
   * let num = await this.updateById({
   *   id: _id,
   *   dataJson: { name: 'new name' }
   * });
   * // 返回修改后的数据
   * let data = await this.updateById({
   *   id: _id,
   *   dataJson: { name: 'new name' },
   *   getUpdateData: true
   * });
   */
  async updateById(obj = {}) {
    let res = {};
    res = await this.dao.updateById({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 改 - 更新并返回更新后的数据
   * 无论条件匹配到多少条记录，只会修改并返回第一条记录。
   * @param {Object} obj - 修改参数对象
   * @param {Object} [obj.whereJson] - 修改条件
   * @param {Object} obj.dataJson - 需要修改的数据（不能为空）
   * @param {Object} [obj.db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<Object|null>} 返回修改后的完整记录对象（doc），如果没有数据被修改则返回 null/undefined
   * @example
   * // 通过 whereJson 更新
   * let doc = await this.updateAndReturn({
   *   whereJson: { _id: "xxx", status: 0 },
   *   dataJson: { status: 1 }
   * });
   */
  async updateAndReturn(obj = {}) {
    let res = {};
    res = await this.dao.updateAndReturn({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 改/增 - 根据 `_id` 判断：存在则修改，不存在则添加（upsert 语义）
   * 注意：`id` 和 `dataJson._id` 至少传一个；如果两者都传，则必须一致，否则会报错。
   * @param {Object} obj - 操作参数对象
   * @param {string} [obj.id] - 记录的 `_id`（与 `dataJson._id` 二选一）
   * @param {Object} obj.dataJson - 需要设置的数据（不能为空）。可在 dataJson 中通过 `_id` 字段指定记录 ID。
   * @param {Object} [obj.db] - 指定数据库实例（用于事务等场景）
   * @returns {Promise<Object>} 操作结果对象，包含以下字段：
   *   - `type` {string} - 操作类型，'update' 表示更新了已有记录，'add' 表示新增了记录
   *   - `updated` {number} - 更新的记录数
   *   - `id` {string} - 新增时返回记录的 `_id`
   * @example
   * // 通过 dataJson._id 指定
   * let res = await this.setById({
   *   dataJson: { _id: 'xxx', name: 'test' }
   * });
   * // 通过 id 参数指定
   * let res = await this.setById({
   *   id: 'xxx',
   *   dataJson: { name: 'test' }
   * });
   * console.log(res.type); // 'update' 或 'add'
   */
  async setById(obj = {}) {
    let res = {};
    res = await this.dao.setById({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 获取满足条件的记录总数
   * 支持简单条件查询和带联表/分组的高级查询。
   * @param {Object} condition - 查询条件，有两种传参方式：
   *   - 简易模式：直接传 whereJson 条件对象，如 `{ status: 1 }`
   *   - 完整模式：传包含 whereJson 等属性的对象 `{ db, whereJson, foreignDB, groupJson, lastWhereJson }`
   * @param {Object} [condition.db] - 指定数据库实例（用于事务等场景）
   * @param {Object} [condition.whereJson] - 查询条件（完整模式时使用）
   * @param {Array<Object>} [condition.foreignDB] - 联表规则（配合聚合使用）
   * @param {Object} [condition.groupJson] - 分组规则（配合聚合使用）
   * @param {Object} [condition.lastWhereJson] - 联表或分组后的查询条件
   * @param {Object} [db] - 指定数据库实例（仅简易模式时生效）
   * @returns {Promise<number>} 满足条件的记录总数
   * @example
   * // 简易版
   * let num = await this.count({ status: 1 });
   * // 支持事务
   * let num = await this.count(whereJson, db);
   * // 先分组再 count（完整模式）
   * let num = await this.count({
   *   whereJson: {},
   *   groupJson: {}
   * });
   */
  async count(condition, db) {
    let res = {};
    if (condition && condition.whereJson && (condition.groupJson || condition.db)) {
      res = await this.dao.count({
        db,
        ...condition,
        dbName: this.tableName,
      });
    } else {
      res = await this.dao.count({
        db,
        dbName: this.tableName,
        whereJson: condition,
      });
    }
    return res;
  }

  /**
   * 查 - 求和
   * @param {Object} obj - 包含fieldName、whereJson、db的对象
   * @param {String} obj.fieldName - 需要求和的字段名
   * @param {Object} [obj.whereJson] - 筛选条件
   * @param {Object} [obj.db] - 指定数据库实例
   * @returns {Promise<Number>} 求和结果
   * @example
   * let sum = await this.sum({
   *   fieldName: "amount",
   *   whereJson: { status: 1 }
   * });
   */
  async sum(obj) {
    let res = {};
    res = await this.dao.sum({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 求最大值
   * @param {Object} obj - 包含fieldName、whereJson、db的对象
   * @param {String} obj.fieldName - 需要求最大值的字段名
   * @param {Object} [obj.whereJson] - 筛选条件
   * @param {Object} [obj.db] - 指定数据库实例
   * @returns {Promise<Number>} 最大值
   * @example
   * let max = await this.max({
   *   fieldName: "price",
   *   whereJson: { status: 1 }
   * });
   */
  async max(obj) {
    let res = {};
    res = await this.dao.max({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 求最小值
   * @param {Object} obj - 包含fieldName、whereJson、db的对象
   * @param {String} obj.fieldName - 需要求最小值的字段名
   * @param {Object} [obj.whereJson] - 筛选条件
   * @param {Object} [obj.db] - 指定数据库实例
   * @returns {Promise<Number>} 最小值
   * @example
   * let min = await this.min({
   *   fieldName: "price",
   *   whereJson: { status: 1 }
   * });
   */
  async min(obj) {
    let res = {};
    res = await this.dao.min({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 求平均值
   * @param {Object} obj - 包含fieldName、whereJson、db的对象
   * @param {String} obj.fieldName - 需要求平均值的字段名
   * @param {Object} [obj.whereJson] - 筛选条件
   * @param {Object} [obj.db] - 指定数据库实例
   * @returns {Promise<Number>} 平均值
   * @example
   * let avg = await this.avg({
   *   fieldName: "score",
   *   whereJson: { status: 1 }
   * });
   */
  async avg(obj) {
    let res = {};
    res = await this.dao.avg({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 获取数据列表（单表查询）
   * 当 `pageSize` 设为 <= 0 时查询全部数据；当 `pageSize` > 1000 时自动切换为 selectAll 模式（内部分批查询）。
   * @param {Object} obj - 查询参数对象
   * @param {number} [obj.pageIndex=1] - 第几页，默认 1
   * @param {number} [obj.pageSize=10] - 每页显示数量，默认 10。设为 -1 查全部，> 1000 自动分批查询。
   * @param {boolean} [obj.getCount=false] - 是否返回满足条件的记录总数（会执行 count 操作），默认 false
   * @param {boolean} [obj.hasMore=false] - 当 getCount 为 false 时，是否需要精确的 hasMore（内部多查一条来判断），默认 false
   * @param {boolean} [obj.getMain=false] - 是否只返回 rows 数组（不返回分页等信息），默认 false
   * @param {boolean} [obj.getOne=false] - 是否只返回第一条数据（rows 将变为单个对象），默认 false
   * @param {Object} [obj.whereJson] - where 查询条件
   * @param {Object} [obj.fieldJson] - 字段显示规则（用来控制只显示哪些字段或不显示哪些字段）
   * @param {Array<Object>} [obj.sortArr] - 排序规则，如 `[{ name: "_add_time", type: "desc" }]`
   * @param {Object} [obj.db] - 指定数据库实例（用于事务等场景）
   * @param {boolean} [obj.debug=false] - 是否返回调试信息（包含数据库执行耗时），默认 false
   * @returns {Promise<Object|Array>} 查询结果（getMain 为 true 时返回数组，getOne 为 true 时返回单个对象，否则返回分页结果对象）
   * @returns {number} returns.code - 状态码，0 为成功
   * @returns {string} returns.msg - 提示信息
   * @returns {Array<Object>} returns.rows - 数据列表，没有数据时返回空数组（getOne 时为单个对象）
   * @returns {number} returns.total - 满足条件的记录总数（getCount 为 false 时为 `(pageIndex-1)*pageSize + rows.length`）
   * @returns {boolean} returns.hasMore - 是否还有下一页
   * @returns {Object} returns.pagination - 当前分页参数 `{ pageIndex, pageSize }`
   * @returns {boolean} returns.getCount - 是否执行了 count 操作
   * @returns {Object} [returns.debug] - 调试信息（仅 debug 为 true 时返回），包含 `runTime` 耗时统计
   * @example
   * let res = await this.select({
   *   pageIndex: 1,
   *   pageSize: 20,
   *   getCount: true,
   *   hasMore: true,
   *   whereJson: { status: 1 },
   *   fieldJson: { name: 1, age: 1 },
   *   sortArr: [{ "name": "_id", "type": "desc" }]
   * });
   * // res.rows: 数据列表
   * // res.total: 总记录数
   * // res.hasMore: 是否还有下一页
   * // res.pagination: { pageIndex: 1, pageSize: 20 },
   * // res.getCount: 是否执行了 count 操作
   */
  async select(obj = {}) {
    let res = {};
    res = await this.dao.select({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 获取数据列表（支持联表查询，基于聚合管道实现）
   * 支持多表连接查询（理论上不限连表数量）、分组、数组拆分、地理位置查询等高级功能。
   * 如果传入了 `treeProps` 参数，会自动转为树形结构查询。
   * @param {Object} obj - 查询参数对象
   * @param {Object} [obj.whereJson={}] - 主表 where 条件
   * @param {number} [obj.pageIndex=1] - 第几页，默认 1
   * @param {number} [obj.pageSize=10] - 每页显示数量，默认 10。设为 <= 0 查全部。
   * @param {boolean} [obj.getOne=false] - 是否只返回第一条数据（rows 将变为单个对象），默认 false
   * @param {boolean} [obj.getMain=false] - 是否只返回 rows 数组，默认 false
   * @param {boolean} [obj.getCount=false] - 是否返回满足条件的记录总数（会执行 count），默认 false
   * @param {boolean} [obj.hasMore=false] - 当 getCount 为 false 时，是否需要精确的 hasMore，默认 false
   * @param {Object} [obj.geoNearJson] - 地理位置查询配置（GeoNear）
   * @param {Object} [obj.groupJson] - 主表分组规则（副表不支持分组）
   * @param {Array<Object>} [obj.sortArr=[]] - 主表排序规则，如 `[{ name: "_add_time", type: "desc" }]`
   * @param {Array<Object>} [obj.foreignDB=[]] - 连表规则数组
   * @param {string} obj.foreignDB[].dbName - 副表表名
   * @param {string} obj.foreignDB[].localKey - 主表外键名（用于和副表匹配的字段）
   * @param {string} obj.foreignDB[].foreignKey - 副表外键名
   * @param {string} obj.foreignDB[].as - 副表连表结果的别名
   * @param {string} [obj.foreignDB[].localKeyType] - 主表外键类型，设为 `'array'` 表示主表外键是数组
   * @param {string} [obj.foreignDB[].foreignKeyType] - 副表外键类型，设为 `'array'` 表示副表外键是数组
   * @param {string} [obj.foreignDB[].localKeyIndex] - 当 localKeyType 为 array 时有效，输出副表记录在主表外键数组中索引的字段名
   * @param {Object} [obj.foreignDB[].whereJson] - 副表 where 条件
   * @param {Array<Object>} [obj.foreignDB[].sortArr] - 副表排序规则
   * @param {number} [obj.foreignDB[].limit] - 副表限制取多少条数据，limit=1 时默认以对象形式返回
   * @param {Array<Object>} [obj.foreignDB[].foreignDB] - 副表的连表规则（支持多级嵌套）
   * @param {Object} [obj.foreignDB[].addFields] - 副表添加自定义字段规则
   * @param {Object} [obj.foreignDB[].fieldJson] - 副表字段显示规则
   * @param {Object} [obj.lastWhereJson] - 连表后的查询条件（聚合操作结束后的 where 条件，慎用，影响性能）
   * @param {Array<Object>} [obj.lastSortArr=[]] - 连表后的排序条件（聚合操作结束后的排序规则，慎用，影响性能）
   * @param {Object} [obj.addFields] - 添加自定义字段规则（用来添加虚拟/计算字段）
   * @param {Object} [obj.fieldJson={}] - 字段显示规则（控制最终返回哪些字段）
   * @param {Object} [obj.treeProps] - 树形结构查询配置，传入后自动使用 tree 模式查询
   * @param {string} [obj.treeProps.id='_id'] - 节点 ID 字段名
   * @param {string} [obj.treeProps.parent_id='parent_id'] - 父节点 ID 字段名
   * @param {string} [obj.treeProps.children='children'] - 子节点列表字段名
   * @param {number} [obj.treeProps.level=10] - 最大递归层级（范围 1~20）
   * @param {number} [obj.treeProps.limit=1000] - 每层最大查询条数
   * @param {Object} [obj.db] - 指定数据库实例
   * @param {boolean} [obj.debug=false] - 是否返回调试信息（包含数据库执行耗时），默认 false
   * @returns {Promise<Object|Array|Object>} 查询结果（getMain 为 true 时返回数组，getOne 为 true 时返回单个对象）
   * @returns {Array<Object>} returns.rows - 数据列表，没有数据时返回空数组（getOne 时为单个对象）
   * @returns {number} returns.total - 满足条件的记录总数（getCount 为 false 时为 `(pageIndex-1)*pageSize + rows.length`）
   * @returns {boolean} returns.hasMore - 是否还有下一页
   * @returns {Object} returns.pagination - 当前分页参数 `{ pageIndex, pageSize }`
   * @returns {boolean} returns.getCount - 是否执行了 count 操作
   * @returns {Object} [returns.debug] - 调试信息（仅 debug 为 true 时返回）
   * @example
   * let res = await this.selects({
   *   pageIndex: 1,
   *   pageSize: 20,
   *   getCount: true,
   *   whereJson: { status: 1 },
   *   fieldJson: { name: 1 },
   *   sortArr: [{ "name": "_id", "type": "desc" }],
   *   foreignDB: [{
   *     dbName: "副表表名",
   *     localKey: "主表外键名",
   *     foreignKey: "副表外键名",
   *     as: "副表as字段",
   *     limit: 1,
   *     whereJson: { deleted: false },
   *     fieldJson: { name: 1, age: 1 }
   *   }]
   * });
   */
  async selects(obj = {}) {
    let res = {};
    res = await this.dao.selects({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }

  /**
   * 查 - 获取表格渲染数据（快速查询，适配 vk-admin 万能表格组件）
   * 根据前端传递的 `data` 自动生成查询条件，内部自动判断使用 `select` 或 `selects`。
   * 无联表/分组时使用 select（默认 getCount=true），有联表/分组时使用 selects。
   * @param {Object} obj - 查询参数对象
   * @param {Object} obj.data - 前端传递的表格查询参数（来自 vk-admin 万能表格）
   * @param {Object} [obj.data.formData] - 查询条件的值（搜索表单数据）
   * @param {Array<Object>} [obj.data.columns] - 字段查询规则（定义 formData 中各字段的查询模式）
   * @param {string} obj.data.columns[].key - 字段名（对应 formData 中的 key）
   * @param {string} [obj.data.columns[].mode] - 查询模式：`=` 等于、`%%` 模糊、`%*` 左匹配、`*%` 右匹配、`>` `>=` `<` `<=` 比较、`in` `nin` 数组包含、`!=` 不等于、`[]` `[)` `(]` `()` 范围
   * @param {string} [obj.data.columns[].fieldName] - 实际数据库字段名（不传则使用 key）
   * @param {*} [obj.data.columns[].value] - 直接指定值（优先于 formData[key]）
   * @param {*} [obj.data.columns[].defaultValue] - 默认值（当 formData[key] 为空时使用）
   * @param {boolean} [obj.data.columns[].lastWhereJson] - 是否作为聚合后的 where 条件
   * @param {number} [obj.data.pageIndex] - 当前页码
   * @param {number} [obj.data.pageSize] - 每页显示数量
   * @param {Object} [obj.data.pagination] - 分页参数对象 `{ pageIndex, pageSize }`（优先级高于单独的 pageIndex/pageSize）
   * @param {Array<Object>} [obj.data.sortRule] - 前端传递的排序规则（会覆盖默认排序）
   * @param {Object} [obj.data.fieldJson] - 前端传递的字段显示规则
   * @param {boolean} [obj.data.getCount] - 前端指定是否需要 count（设为 false 可跳过 count）
   * @param {number} [obj.data.total] - 上一次查询的 total（当 getCount 为 false 时回传给前端）
   * @param {Object} [obj.whereJson] - 强制 where 条件（会与 data 生成的条件合并，使用 `_.and`）
   * @param {Object} [obj.fieldJson] - 强制字段显示规则（会与 data.fieldJson 合并）
   * @param {boolean} [obj.getCount] - 是否执行 count（默认：无联表时 true，有 lastWhereJson/lastSortArr 时 false）
   * @param {boolean} [obj.getMain=false] - 是否只返回 rows 数组
   * @param {Object} [obj.geoNearJson] - 地理位置查询配置
   * @param {Object} [obj.treeProps] - 树形结构查询配置（与 selects 用法一致）
   * @param {Object} [obj.groupJson] - 主表分组规则
   * @param {string} [obj.foreignKey] - 主表外键字段名
   * @param {Array<Object>} [obj.foreignDB] - 连表规则数组（传入后自动使用 selects 模式查询）
   * @param {Object} [obj.lastWhereJson] - 强制聚合结束后的 where 条件（会与 data 生成的 lastWhereJson 合并）
   * @param {Array<Object>} [obj.lastSortArr] - 聚合后的排序条件
   * @param {Array<Object>} [obj.sortArr] - 默认排序规则（被 data.sortRule 覆盖，未配置时默认 `[{ name: '_id', type: 'desc' }]`）
   * @param {Object} [obj.addFields] - 添加自定义字段规则
   * @param {Object} [obj.db] - 指定数据库实例
   * @param {boolean} [obj.debug=false] - 是否返回调试信息
   * @returns {Promise<Object>} 查询结果
   * @returns {Array<Object>} returns.rows - 数据列表
   * @returns {number} returns.total - 满足条件的记录总数
   * @returns {boolean} returns.hasMore - 是否还有下一页
   * @returns {Object} returns.pagination - 当前分页参数 `{ pageIndex, pageSize }`
   * @returns {boolean} returns.getCount - 是否执行了 count 操作
   * @example
   * let res = await this.getTableData({
   *   data
   * });
   */
  async getTableData(obj = {}) {
    let res = {};
    res = await this.dao.getTableData({
      ...obj,
      dbName: this.tableName,
    });
    return res;
  }
}

module.exports = {
  BaseDao,
  Tables,
};
