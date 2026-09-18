/**
 * 登录注册执行之前的拦截器
 * loginRules是需要拦截的登录和注册方式，若 enable 为 false 则代表此方式被禁用，如果某个登录方式未在下面的规则中，也代表允许
 */
const loginRules = [
  { type: 'loginBySms', url: 'user/pub/loginBySms', enable: true, title: '手机短信登录' },
  { type: 'loginByWeixinPhoneNumber', url: 'user/pub/loginByWeixinPhoneNumber', enable: true, title: '微信手机号一键登录' },
  { type: 'loginByUniverify', url: 'user/pub/loginByUniverify', enable: true, title: '本机号码一键登录' },
  { type: 'loginByWeixin', url: 'user/pub/loginByWeixin', enable: true, title: '微信登录' },
  { type: 'loginByDouyin', url: 'user/pub/loginByDouyin', enable: true, title: '抖音登录' },
  { type: 'loginByDouyinPhoneNumber', url: 'user/pub/loginByDouyinPhoneNumber', enable: true, title: '抖音手机号一键登录' },
  { type: 'loginByQQ', url: 'user/pub/loginByQQ', enable: true, title: 'QQ登录' },
  { type: 'loginByAlipay', url: 'user/pub/loginByAlipay', enable: true, title: '支付宝登录' },
  { type: 'loginByHuawei', url: 'user/pub/loginByHuawei', enable: true, title: '华为登录' },
  { type: 'loginByHuaweiPhoneNumber', url: 'user/pub/loginByHuaweiPhoneNumber', enable: true, title: '华为手机号一键登录' },
  { type: 'login', url: 'user/pub/login', enable: true, title: '密码登录' },
  { type: 'loginByEmail', url: 'user/pub/loginByEmail', enable: true, title: '邮箱登录' },
  { type: 'register', url: 'user/pub/register', enable: true, title: '账户密码注册' },
  { type: 'closeAccount', url: 'user/kh/closeAccount', enable: true, title: '账户注销' },
  { type: 'openAccount', url: 'user/kh/openAccount', enable: true, title: '账户恢复' },
];

const regExp = loginRules.map((item, index) => {
  return `^${item.url}$`;
});

module.exports = [
  {
    id: 'loginFilter',
    regExp: regExp,
    description: '登录注册执行之前的拦截器',
    index: 310, // 此处必须>300 因为检测用户是否登录的过滤器的index是200（sys是300，因此为了能通用，建议填大于300的值）（越小越先执行）
    enable: true, // 通过设置enable=false可以关闭该中间件
    mode: 'onActionExecuting', // 可选 onActionExecuting onActionExecuted
    main: async function (event) {
      let { data = {}, url, util } = event;
      let { vk } = util;

      let findItem = loginRules.find((item) => item.url === url);
      if (findItem && !findItem.enable) {
        return {
          code: -1,
          msg: `未开启【${findItem.title}】功能`,
        };
      }
      return {
        code: 0,
        msg: '',
      };
    },
  },
];
