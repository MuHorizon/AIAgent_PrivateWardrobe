/**
 * 自定义过滤器 - 后置
 */

module.exports = [
  {
    id: 'xxxx2',
    regExp: '^xxx2/kh', // 正则匹配规则，这个是以^xxx2/kh/开头的云函数会被拦截
    description: '这里是你过滤器2号的描述',
    index: 310, // 此处必须>300 因为检测用户是否登录的过滤器的index是200（sys是300，因此为了能通用，建议填大于300的值）（越小越先执行）
    mode: 'onActionExecuted', // 可选 onActionExecuting onActionExecuted
    returnMode: 1, // 返回值模式 0：使用Object.assign合并 1：完全替换，默认为0
    enable: true, // 通过设置enable=false可以关闭该中间件
    main: async function (event, serviceRes) {
      let { data = {}, util } = event;
      let { vk } = util;
      serviceRes.msg = '被过滤器修改后的值';
      return serviceRes;
    },
  },
];
