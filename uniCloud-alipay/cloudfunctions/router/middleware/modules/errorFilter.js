/**
 * 全局异常拦截器
 */
module.exports = [
  {
    id: 'error',
    regExp: '(.*)', // 正则匹配规则，(.*)代表所有的云函数都会被拦截
    description: '全局异常拦截器',
    index: 999, // 此处必须>300 因为检测用户是否登录的过滤器的index是200（sys是300，因此为了能通用，建议填大于300的值）（越小越先执行）
    mode: 'onActionError', // 可选 onActionExecuting onActionExecuted
    enable: true, // 通过设置enable=false可以关闭该中间件
    main: async function (event, serviceRes) {
      let { data = {}, util, filterResponse, originalParam } = event;
      let { vk, db, _, $ } = util;
      let {
        requestId, // 请求id
        err = {},
      } = serviceRes;
      let {
        code, // 错误码
        message, // 错误信息
        stack, // 错误堆栈
      } = err;

      // 此处无需再打印异常信息，因为框架会自动打印异常信息
      // 可以在此处对异常进行统一处理，如保存到数据库或redis等等

      let needAdd = true; // 是否需要保存到数据库，可自行选择开关
      let isCloudRun = originalParam.context.RUNTIME_ENV === 'cloud'; // 是否云端运行，RUNTIME_ENV参数需升级到HBX4.29及以上版本才有值

      if (isCloudRun && needAdd) {
        // md5哈希值，用于去重时用
        let md5 = vk.md5(
          JSON.stringify({
            message: err.message,
            url: originalParam.event.$url,
          })
        );
        serviceRes.md5 = md5;
        // 保存到数据库，也可以改成保存到redis等等
        await vk.baseDao.add({
          dbName: 'vk-error-log',
          dataJson: {
            request_id: requestId, // 请求id
            err, // 错误对象
            md5, // md5哈希值，用于去重时用
            user_id: data.uid,
            url: originalParam.event.$url, // 请求地址
            data: originalParam.event.data, // 请求参数
            status: 0, // 当前状态 0 待处理 1 已处理 2 不处理
          },
        });
      }

      // 如果这里执行了return serviceRes，那么不再执行后续的中间件
      // return serviceRes;
    },
  },
];
