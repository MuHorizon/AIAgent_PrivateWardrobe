// 引入自定义公共函数
import myPubFunction from '@/common/function/myPubFunction.js';
export default {
  // 如果设置为false，则开发模式下也不会打印云函数请求日志
  debug: process.env.NODE_ENV !== 'production',
  // 主云函数名称
  functionName: 'router',
  // 登录页面路径
  login: {
    url: '/pages_template/uni-id/login/index/index',
  },
  // 首页页面路径
  index: {
    url: '/pages/index/index',
  },
  // 404 Not Found 错误页面路径
  error: {
    url: '/pages/error/404',
  },
  // 账户注销页面
  closeAccount: {
    url: '/pages_template/uni-id/closeAccount/closeAccount',
  },
  // 前端默认时区（中国为8）
  targetTimezone: 8,
  // 日志风格（注意：只在开发调试模式下生效，正式发布后不会打印日志）
  logger: {
    mode: 0, // 0 正常（默认展开） 1 简洁（默认折叠）
    colorArr: ['#0095f8', '#67C23A'],
  },
  /**
   * app主题颜色
   * vk.getVuex('$app.color.main')
   * vk.getVuex('$app.color.secondary')
   */
  color: {
    main: '#ff4444',
    secondary: '#555555',
  },
  // 需要检查是否登录的页面列表
  checkTokenPages: {
    /**
     * 如果 mode = 0 则代表自动检测
     * 如果 mode = 1 则代表list内的页面需要登录，不在list内的页面不需要登录
     * 如果 mode = 2 则代表list内的页面不需要登录，不在list内的页面需要登录
     * 注意1: list内是通配符表达式，非正则表达式
     * 注意2: 需要使用 vk.navigateTo 代替 uni.navigateTo 进行页面跳转才会生效
     * 注意3: 想要让 tabbar 页面必须登录才能访问，则需要手动在页面的onLoad里加 vk.pubfn.checkLogin();
     * 在无需登录的页面上执行kh或sys函数，也会自动判断是否登录，未登录会自动跳登录页面，登录成功后会自动返回本来要跳转的页面。
     */
    mode: 2,
    list: ['/pages_template/*', '/pages/login/*', '/pages/index/*', '/pages/error/*'],
  },
  // 需要检查是否可以分享的页面列表(仅小程序有效)
  checkSharePages: {
    /**
     * 如果 mode = 0 则不做处理
     * 如果 mode = 1 则代表list内的页面可以被分享，不在list内的页面不可以被分享
     * 如果 mode = 2 则代表list内的页面不可以被分享，不在list内的页面可以被分享
     * 注意: list内是通配符表达式，非正则表达式
     */
    mode: 0,
    menus: ['shareAppMessage'], // ['shareAppMessage', 'shareTimeline'], // menus内的数组可多选，shareAppMessage 转发给朋友，shareTimeline 分享到朋友圈，需要mode为1或2才会生效
    list: ['/pages/index/*', '/pages/goods/*', '/pages_template/*'],
  },
  // 需要检查是否哪些请求需要加密通信
  checkEncryptRequest: {
    /**
     * 如果 mode = 0 则不做处理
     * 如果 mode = 1 则代表list内的云函数或云对象需要加密通信，不在list内的不需要加密通信
     * 注意1: list内是正则表达式，非通配符表达式
     * 注意2: 建议与 router/middleware/modules/encryptFilter.js 内的regExp保持一致
     */
    mode: 1,
    list: [
      '^template/encrypt/(.*)', // 表示以 template/encrypt/ 开头的云函数或云对象需要加密通信
    ],
  },
  // 静态文件的资源URL地址
  staticUrl: {
    // Logo
    logo: '/static/logo.png',
  },
  // 自定义公共函数，myPubFunction内的函数可通过vk.myfn.xxx() 调用
  myfn: myPubFunction,
  // 第三方服务配置
  service: {
    // 云储存相关配置
    cloudStorage: {
      /**
       * vk.uploadFile 接口默认使用哪个存储
       * unicloud 空间内置存储（默认）
       * extStorage 扩展存储
       * aliyun 阿里云oss
       */
      defaultProvider: 'unicloud',
      // 空间内置存储
      unicloud: {
        // 暂无配置项
      },
      // 扩展存储配置
      extStorage: {
        provider: 'qiniu', // qiniu: 扩展存储-七牛云
        // 根目录名称（如果改了这里的dirname，则云函数user/pub/getUploadFileOptionsForExtStorage内判断的目录权限也要改，否则无法上传）
        dirname: 'public',
        // 用于鉴权的云函数地址（一般不需要改这个参数）
        authAction: 'user/pub/getUploadFileOptionsForExtStorage',
        // 自定义域名，如：cdn.example.com（填你在扩展存储绑定的域名，若云端已设置 uni-config-center/vk-unicloud/index.js 内的 vk.service.cloudStorage.extStorage.domain 则此处可不填）
        domain: '',
        // 上传时，是否按用户id进行分组储存
        groupUserId: true,
      },
      // 阿里云oss
      // 密钥和签名信息（由于签名的获取比较麻烦,建议初学者使用上传到unicloud或extStorage的方案，上传到阿里云OSS是给有特殊需求的用户使用）
      // 相关文档 : https://help.aliyun.com/document_detail/31925.html?spm=a2c4g.11186623.6.1757.b7987d9czoFCVu
      aliyun: {
        // 密钥和签名信息
        uploadData: {
          OSSAccessKeyId: '',
          policy: '',
          signature: '',
        },
        // oss上传地址
        action: 'https://xxx.oss-cn-hangzhou.aliyuncs.com',
        // 根目录名称
        dirname: 'public',
        // oss外网访问地址，也可以是阿里云cdn地址
        host: 'https://xxx.xxx.com',
        // 上传时，是否按用户id进行分组储存
        groupUserId: true,
      },
    },
  },
  // 全局异常码，可以自定义提示结果
  globalErrorCode: {
    // 阿里云10秒非正常超时，其实请求还在执行（且一般已经成功了，但前端接受不到成功结果）
    'cloudfunction-unusual-timeout': '请求超时，但请求还在执行，请重新进入页面。',
    // 请求超时（真正的请求超时）
    'cloudfunction-timeout': '请求超时，请重试！',
    // 不在预期内的异常（如数据库异常、云函数编译异常等）
    'cloudfunction-system-error': '网络开小差了！',
    // 云函数达到并发限制
    'cloudfunction-reaches-burst-limit': '系统繁忙，请稍后再试。',
    // APP未授权网络访问时的异常提示
    'cloudfunction-network-unauthorized': '需要进行网络请求许可，若您已授权，请点击确定',
  },
  // 自定义拦截器
  interceptor: {
    // login(obj) {
    // 	let { vk, params, res } = obj;
    // 	//console.log("params:",params);
    // 	//console.log("res:",res);
    // 	if (!params.noAlert) {
    // 		vk.alert(res.msg);
    // 	}
    // 	console.log("跳自己的登录页面");
    // 	// 上方代码可自己修改，写成你自己的逻辑处理。
    // },
    // fail(obj) {
    // 	let { vk, params, res } = obj;
    // 	//console.log("params:",params);
    // 	//console.log("res:",res);
    // 	return false; // 返回false则取消框架内置fail的逻辑，返回true则会继续执行框架内置fail的逻辑
    // 	// 上方代码可自己修改，写成你自己的逻辑处理。
    // }
    // navigateTo(obj) {
    // 	let { pagePath } = obj;
    // 	console.log("pagePath:", pagePath);
    // 	return false; // 返回false则取消跳转，返回true则继续跳转
    // 	// 上方代码可自己修改，写成你自己的逻辑处理。
    // },
  },
};
