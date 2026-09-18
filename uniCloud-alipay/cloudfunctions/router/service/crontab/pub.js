'use strict';
let vk = uniCloud.vk; // 全局vk实例

const tasks = require('./tasks');
const taskConfig = require('./taskConfig.js');

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
    vk = uniCloud.vk; // 将vk定义为全局对象
    const clientInfo = this.getClientInfo();
    const cloudInfo = this.getCloudInfo();
    // 如果不是定时触发也不是本地运行，则拦截
    if (clientInfo.source !== 'timing' && cloudInfo.runtimeEnv !== 'local') {
      return { code: -1, msg: '不支持的运行方式' };
    }
  },
  // 加载定时任务
  ...tasks,
  /**
   * 定时任务（主入口）
   * @url crontab/pub.timing 前端调用的url参数地址
   */
  timing: async function () {
    const timingTask = vk.createTimingTask(this);
    return await timingTask(taskConfig);
  },
};

module.exports = cloudObject;
