/**
 * 加密函数拦截器 - 前置
 * 作用：用于指定哪些函数必须加密请求
 * 文档地址：https://vkdoc.fsq.pub/client/pages/callFunction.html#encrypt-vk版双向加密通信
 */

module.exports = [
  {
    id: 'encryptFilter',
    // 正则匹配规则，满足以下规则的云函数会强制需要加密通信
    regExp: ['^template/encrypt/(.*)'],
    description: '加密函数拦截器',
    index: 10, // 此处建议填一个很小的值，建议小于100，这是为了让该过滤器最先执行（越小越先执行）
    mode: 'onActionExecuting', // 可选 onActionExecuting onActionExecuted
    enable: true, // 通过设置enable=false可以关闭该中间件
    main: async function (event) {
      // 这里是拦截规则，可以查数据库，最终code:0 代表通过，其他均为未通过，msg是被拦截的原因
      let { data = {}, util } = event;
      let { vk } = util;
      // 如果未使用加密通信，则拦截
      if (!event.encrypt) {
        return {
          code: 413,
          msg: '请求非法，请求参数未加密',
        };
      }
      return {
        code: 0,
        msg: 'ok',
      };
    },
  },
];
