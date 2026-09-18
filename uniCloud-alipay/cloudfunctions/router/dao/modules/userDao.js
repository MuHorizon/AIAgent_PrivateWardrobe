// Dao 2.0版本

const { BaseDao, Tables } = require('../base.js');

// 用户表统一不返回 token 和 password
const userFieldJson = {
  token: false,
  password: false,
};

/**
 * 用户表的数据库操作
 * @class UserDao
 * @extends BaseDao
 */
class UserDao extends BaseDao {
  constructor(obj) {
    super(obj);
    this.tableName = Tables.user;
  }

  /**
   * 注意：基本的CRUD方法已经在BaseDao中实现，如果没有特殊业务逻辑，可以不用重写
   * 基本调用示例：

  // 查询单条记录（简易版）
  let userInfo = await vk.daoCenter.userDao.findById(id);

  // 查询单条记录（完整版，支持事务）
  let userInfo = await vk.daoCenter.userDao.findById({
    db, // 指定db对象
    id: id,
    fieldJson: {}
  });

  // 根据条件查询单条记录
  let userInfo = await vk.daoCenter.userDao.findByWhereJson({

  });

  // 添加记录
  await vk.daoCenter.userDao.add(dataJson);

  // 批量添加
  await vk.daoCenter.userDao.adds(dataArr);

  // 根据ID修改
  await vk.daoCenter.userDao.updateById({
    id: id,
    dataJson: {

    }
  });

  // 批量修改
  await vk.daoCenter.userDao.update({
    whereJson: {

    },
    dataJson: {

    }
  });

  // 删除记录
  await vk.daoCenter.userDao.deleteById(id);

  // 批量删除
  await vk.daoCenter.userDao.del({

  });

  // 统计数量
  let count = await vk.daoCenter.userDao.count({

  });

  // 求和/最大值/最小值/平均值
  // 求和
  let sum = await vk.daoCenter.userDao.sum({ fieldName: "amount", whereJson: { } });
  // 求最大值
  let max = await vk.daoCenter.userDao.max({ fieldName: "amount", whereJson: { } });
  // 求最小值
  let min = await vk.daoCenter.userDao.min({ fieldName: "amount", whereJson: { } });
  // 求平均值
  let avg = await vk.daoCenter.userDao.avg({ fieldName: "amount", whereJson: { } });

  // select 查询列表（不支持联表查询，性能比selects高）
  res = await vk.daoCenter.userDao.select({
    pageIndex: 1,
    pageSize: 20,
    getCount: false,
    whereJson: {

    },
    sortArr: [{ name: "register_date", type: "desc" }]
  });

  // selects 查询列表（支持联表查询）
  res = await vk.daoCenter.userDao.selects({
    pageIndex: 1,
    pageSize: 20,
    getCount: false,
    whereJson: {

    },
    fieldJson: {},
    sortArr: [{ name: "register_date", type: "desc" }],
    // 副表列表
    foreignDB: [{
      dbName: "副表表名",
      localKey: "主表外键名",
      foreignKey: "副表外键名",
      as: "副表连表结果的别名",
      limit: 1,	// 当limit为1时，以对象形式返回
      // 副表查询条件
      whereJson: {},
      // 副表字段显示规则
      fieldJson: {}
    }]
  });

  // 获取表格数据（与selects参数一致，也支持连表，默认 getCount 为 true）
  res = await vk.daoCenter.userDao.getTableData({
    data
  });

  // 设置强制查询条件
  res = await vk.daoCenter.userDao.getTableData({
    data,
    // 强制where条件
    whereJson: {

    }
  });

   */

  /**
   * 获取用户信息（重写父类方法，增加默认字段过滤，此函数请勿删除）
   * 调用示例
   * await vk.daoCenter.userDao.findById(user_id);
   * @param {String|Object} condition - 用户ID或包含db、id、fieldJson的对象
   * @param {Object} [fieldJson] - 字段显示规则，默认不显示 token 和 password
   * @returns {Promise<Object>} 返回用户信息对象，默认不包含 token 和 password 字段
   */
  async findById(condition, fieldJson = userFieldJson) {
    let res = {};
    // 数据库操作开始-----------------------------------------------------------
    if (typeof condition === 'object') {
      // 支持事务和指定db对象
      res = await this.dao.findById({
        ...condition,
        dbName: this.tableName,
        fieldJson: condition.fieldJson || fieldJson,
      });
    } else {
      // 不支持事务
      res = await this.dao.findById({
        dbName: this.tableName,
        id: condition,
        fieldJson,
      });
    }
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 查 - 根据whereJson获取单条记录（重写父类方法，增加默认字段过滤）
   * @param {Object} condition - 条件对象或包含db、whereJson、fieldJson的对象
   * @param {Object} [fieldJson] - 字段显示规则，默认不显示 token 和 password
   * @returns {Promise<Object>} 返回单条用户记录对象，默认不包含 token 和 password 字段
   * 调用示例
  let userInfo = await vk.daoCenter.userDao.findByWhereJson({

  });
   */
  async findByWhereJson(condition, fieldJson = userFieldJson) {
    let res = {};
    // 数据库操作开始-----------------------------------------------------------
    if (condition && typeof condition.whereJson === 'object') {
      // 支持指定db对象
      res = await this.dao.findByWhereJson({
        ...condition,
        dbName: this.tableName,
        fieldJson: condition.fieldJson || fieldJson,
      });
    } else {
      res = await this.dao.findByWhereJson({
        dbName: this.tableName,
        whereJson: condition,
        fieldJson,
      });
    }
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 根据邀请码获取用户信息
   * let inviterUserInfo = await vk.daoCenter.userDao.findByInviteCode(invite_code);
   * @param {String} invite_code 邀请码
   * @returns {Promise<Object>} 返回用户信息对象，默认不包含 token 和 password 字段
   */
  async findByInviteCode(invite_code) {
    let res = {};
    // 数据库操作开始-----------------------------------------------------------
    res = await this.findByWhereJson({
      my_invite_code: invite_code,
    });
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 增 - 添加一条记录（重写父类方法，取消自动添加创建时间，此函数请勿删除）
   * @param {Object} obj 添加的数据或包含db、dataJson的对象
   * @returns {Promise<Object>} 返回包含 id 和 inserted 等字段的操作结果对象
   * 调用示例
  await vk.daoCenter.userDao.add({

  });
  或
   * 调用示例
  await vk.daoCenter.userDao.add({
    db: transaction,
    dataJson: {

    }
  });
   */
  async add(obj) {
    let res = {};
    // 数据库操作开始-----------------------------------------------------------
    if (obj.db && obj.dataJson) {
      // 支持事务
      res = await this.dao.add({
        ...obj,
        cancelAddTime: true, // 因为user表使用了register_date作为创建时间
        dbName: this.tableName,
      });
    } else {
      // 不支持事务
      res = await this.dao.add({
        dbName: this.tableName,
        cancelAddTime: true, // 因为user表使用了register_date作为创建时间
        dataJson: obj,
      });
    }
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 增 - 添加多条记录（重写父类方法，取消自动添加创建时间）
   * @param {Array} dataArr 添加的数据数组
   * @returns {Promise<Object>} 返回包含 inserted 和 ids 等字段的操作结果对象
   * 调用示例
  await vk.daoCenter.userDao.adds(dataArr);
   */
  async adds(dataArr) {
    let res = {};
    // 数据库操作开始-----------------------------------------------------------
    res = await this.dao.adds({
      dbName: this.tableName,
      cancelAddTime: true, // 因为user表使用了register_date作为创建时间
      dataJson: dataArr,
    });
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 自定义业务方法示例
   * 在这里可以添加该表特有的业务逻辑方法
   */

  /**
   * 获取用户信息（旧版）
   * _id
   * username
   * mobile
   * email
   * wx_openid.app-plus
   * wx_openid.mp-weixin
   * wx_unionid
   * ali_openid
   * my_invite_code
   * 调用示例
   await vk.daoCenter.userDao.findByUserInfo({
    mobile:mobile
   });
   * @param {Object} userInfo 用户信息
   * @returns {Promise<Object|undefined>} 返回用户信息对象，默认不包含 token 和 password 字段；如果未找到返回 undefined
   */
  async findByUserInfo(userInfo) {
    let res;
    // 数据库操作开始-----------------------------------------------------------
    let whereJson = {};
    let list = ['_id', 'username', 'mobile', 'email', 'wx_openid.app-plus', 'wx_openid.mp-weixin', 'wx_unionid', 'ali_openid', 'my_invite_code'];
    let orArr = [];
    for (let i = 0; i < list.length; i++) {
      let keyName = list[i];
      let orObj = {};
      if (this.vk.pubfn.isNotNull(userInfo[keyName])) orObj[keyName] = userInfo[keyName];
      if (this.vk.pubfn.isNotNull(orObj)) {
        orArr.push(orObj);
      }
    }
    if (orArr.length > 0) {
      whereJson = this._.or(orArr);
      res = await this.findByWhereJson(whereJson);
    }
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 根据ID数组获取用户列表
   * 调用示例
   * await vk.daoCenter.userDao.listByIds(userIdArr);
   * @param {Array} userIdArr 用户ID数组
   * @returns {Promise<Array>} 返回用户列表数组，默认不包含 token 和 password 字段
   */
  async listByIds(userIdArr) {
    let res = await this.select({
      pageIndex: 1,
      pageSize: userIdArr.length,
      getMain: true,
      fieldJson: userFieldJson,
      whereJson: {
        _id: this._.in(userIdArr),
      },
    });
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 根据手机号直接注册账号并登录
   * 若手机号已存在,则直接登录
   * @param {Object} data 参数
   * @param {String} data.mobile 手机号（必填）
   * @param {String} [data.password] 初始密码
   * @param {String} [data.inviteCode] 邀请人的邀请码
   * @param {String} [data.myInviteCode] 设置当前注册用户自己的邀请码
   * @param {Boolean} [data.needPermission] 设置为true时会在checkToken时返回用户权限（permission），建议在管理控制台中使用
   * @returns {Promise<Object>} 返回包含 uid、token、tokenExpired、userInfo 等字段的登录结果对象
   * 调用示例
   await vk.daoCenter.userDao.registerUserByMobile({
     mobile,
   });
   */
  async registerUserByMobile(data) {
    const { uniID } = this.util;
    let res = {};
    let { mobile, password, inviteCode, myInviteCode, needPermission } = data;
    // 数据库操作开始-----------------------------------------------------------
    let code = this.vk.pubfn.random(6);
    // 设置验证码
    await uniID.setVerifyCode({
      mobile,
      code,
      expiresIn: 60,
      type: 'login',
    });
    // 若手机号不存在，则注册并登录。存在，则直接登录。
    res = await uniID.loginBySms({
      mobile,
      code,
      password,
      inviteCode,
      myInviteCode,
      needPermission,
    });
    if (res.uid && this.vk.pubfn.isNull(res.userInfo)) {
      res.userInfo = await this.findById(res.uid);
    }
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 重置用户密码
   * data 请求参数说明
   * @param {Object} data 参数对象
   * @param {String} data.uid 用户ID
   * @param {String} data.password 需要重置的密码
   * @returns {Promise<Object>} 返回操作结果对象
   * 调用示例
  await vk.daoCenter.userDao.resetPwd({
    uid: uid,
    password: "123456"
  });
   */
  async resetPwd(data) {
    const { uniID } = this.util;
    let res = {};
    let { uid, password } = data;
    // 数据库操作开始-----------------------------------------------------------
    res = await uniID.resetPwd({ uid, password });
    // 数据库操作结束-----------------------------------------------------------
    return res;
  }

  /**
   * 获取一个未被使用的7位数分享码（此函数请勿删除）
   * @param {Object} [data={}] 参数对象
   * @param {String} [data.my_invite_code] 自定义邀请码（可选）
   * @returns {Promise<String>} 返回一个未被使用的7位数邀请码字符串
   * 调用示例
  await vk.daoCenter.userDao.getValidInviteCode();
   */
  async getValidInviteCode(data = {}) {
    // 数据库操作开始-----------------------------------------------------------
    let { my_invite_code } = data;
    if (my_invite_code) {
      // 如果用户传了自定义的分享码，也需要判断下是否存在
      let num = await this.count({
        my_invite_code,
      });
      if (num === 0) {
        return my_invite_code;
      }
    }
    let inviteCode = await this.vk.pubfn.randomAsync(
      7,
      '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
      async (val) => {
        let num = await this.count({
          my_invite_code: val,
        });
        return num === 0 ? true : false;
      },
      10
    ); // 最大重试10次
    // 数据库操作结束-----------------------------------------------------------
    return inviteCode;
  }

  /**
   * 注销账号
   * @param {Object} [data={}] 参数对象
   * @param {String} data.uid 用户ID（必填）
   * @param {Number} [data.delay=0] 延迟注销时间（单位为秒），0表示立即注销，若设置大于0，则需要在定时任务中再次执行注销账号，且不传delay参数
   * @param {String} [data.reason] 注销原因
   * @returns {Promise<Object>} 返回包含 code、msg、destroyed 等字段的操作结果对象
   * 调用示例
  await vk.daoCenter.userDao.closeAccount({
    uid: "用户id",
    delay: 0, // 延迟注销时间（单位为秒），0表示立即注销，若设置大于0，则需要在定时任务中再次执行注销账号，且不传delay参数
    reason: "", // 注销原因
  });
   */
  async closeAccount(data = {}) {
    let { uid, delay = 0, reason } = data;
    if (this.vk.pubfn.isNull(uid)) return { code: -1, msg: '参数uid不能为空' };
    const userInfo = await this.findById(uid, { token: false });
    if (this.vk.pubfn.isNull(userInfo)) return { code: -1, msg: '要注销的用户不存在' };
    const nowTime = Date.now();
    const closeStatus = 4;
    if (userInfo.status === closeStatus && userInfo.close_account) {
      if (!userInfo.close_account.confirmed) {
        // 判断是否过了注销冷静期
        if (nowTime > userInfo.close_account.close_time) {
          delay = 0;
        } else {
          return {
            code: 0,
            msg: `该账号已提交过注销申请，账号将在${this.vk.pubfn.timeFormat(userInfo.close_account.close_time, 'yyyy-MM-dd hh:mm')}后自动注销`,
            close_account: userInfo.close_account,
          };
        }
      } else {
        return { code: -1, msg: '该账号已注销' };
      }
    }
    let dataJson;
    const close_time = nowTime + delay * 1000; // 实际注销时间
    if (delay > 0) {
      // 延时注销
      dataJson = {
        status: closeStatus, // 用户状态：0 正常 1 禁用 2 审核中 3 审核拒绝 4 已注销
        close_account: this._.set({
          confirmed: 0, // 是否已确认注销：0 未确认（代表在冷静期） 1 已确认（代表已注销）
          apply_time: nowTime, // 注销申请时间
          close_time, // 实际注销时间
          status: userInfo.status, // 注销前的状态
          reason, // 注销原因
        }),
      };
    } else {
      // 立即注销
      // 指定需要删除的字段
      const baseRemoveKeys = ['username', 'password', 'my_invite_code', 'token', 'mobile', 'mobile_confirmed', 'email', 'email_confirmed'];
      // 再删除 _openid 或 _unionid 结尾的字段
      const reg = new RegExp('(_openid|_unionid)$');
      const removeKeys = [...baseRemoveKeys, ...Object.keys(userInfo).filter((key) => reg.test(key))];
      const { removeFields, backup } = removeKeys.reduce(
        (acc, key) => {
          acc.removeFields[key] = this._.remove();
          acc.backup[key] = userInfo[key];
          return acc;
        },
        { removeFields: {}, backup: {} }
      );
      dataJson = {
        status: closeStatus, // 用户状态：0 正常 1 禁用 2 审核中 3 审核拒绝 4 已注销
        close_account: this._.set({
          confirmed: 1, // 是否已确认注销：0 未确认（代表在冷静期） 1 已确认（代表已注销）
          apply_time: nowTime, // 注销申请时间
          close_time: nowTime, // 实际注销时间
          status: userInfo.status, // 注销前的状态
          reason, // 注销原因
          backup,
        }),
        ...removeFields,
      };
    }
    // 修改数据库
    const num = await this.updateById({
      id: uid,
      dataJson,
    });
    if (num === 0) return { code: -1, msg: '注销账号失败' };
    return {
      code: 0,
      msg: delay > 0 ? `注销申请成功，账号将在${this.vk.pubfn.timeFormat(close_time, 'yyyy-MM-dd hh:mm')}后自动注销` : '注销成功',
      destroyed: delay > 0 ? false : true,
    };
  }

  /**
   * 恢复账号（仅限账号未确认注销时）
   * @param {Object} [data={}] 参数对象
   * @param {String} data.uid 用户ID（必填）
   * @returns {Promise<Object>} 返回包含 code 和 msg 字段的操作结果对象
   * 调用示例
  await vk.daoCenter.userDao.openAccount({
    uid: "用户id"
  });
   */
  async openAccount(data = {}) {
    const { uid, delay = 0 } = data;
    if (this.vk.pubfn.isNull(uid)) return { code: -1, msg: '参数uid不能为空' };
    const userInfo = await this.findById(uid, { token: false });
    if (this.vk.pubfn.isNull(userInfo)) return { code: -1, msg: '用户不存在' };
    const closeStatus = 4;
    if (userInfo.status !== closeStatus) return { code: -1, msg: '该账号未注销，无需恢复' };
    if (userInfo.close_account) {
      if (userInfo.close_account.confirmed) return { code: -1, msg: '该账号已注销，无法恢复' };
    }
    // 修改数据库
    const num = await this.updateById({
      id: uid,
      dataJson: {
        status: userInfo.close_account.status, // 恢复注销前的状态
        close_account: this._.remove(),
      },
    });
    if (num === 0) return { code: -1, msg: '恢复账号失败' };
    return { code: 0, msg: '恢复账号成功' };
  }
}

module.exports = UserDao;
