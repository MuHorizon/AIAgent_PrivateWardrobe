<script>
  import config from '@/app.config.js';
  import { version } from './package.json';
  export default {
    methods: {},
    // 监听 - 页面404
    onPageNotFound: function (e) {
      uni.redirectTo({
        url: config.error.url,
      });
    },
    onLaunch: async function (options) {
      // 接收页面token参数，用于实现自动登录
      uni.vk.handleAutoLoginToken(options);
      // 注意：config.debug 在正式环境时，值为false，故此{}内的代码只有开发环境才会执行
      if (config.debug) {
        // #ifndef APP
        console.log(
          `%c vk-client %c v${version} `,
          'background:#35495e ; padding: 1px; border-radius: 3px 0 0 3px;  color: #fff',
          'background:#007aff ;padding: 1px; border-radius: 0 3px 3px 0;  color: #fff; font-weight: bold;'
        );
        // #endif
        console.log('App Launch');
      }
      // 注意：以下代码正式和开发环境都会执行
      // #ifdef MP
      uni.vk.updateManager.updateReady(); // 此代码可以让小程序自动检测最新版本
      // #endif
	  
      let appid = getAppid();
      uni.vk.vuex.set('$app.appid', appid); // 小程序appid

      // 当token有效期大于1天时，做用户每日登录统计时就会有问题，因为用户可能好几天只需要登录一次，但此用户可能每天都在线，导致每日登录用户数量不准确，因此可以在此执行 vk.userCenter.loginByToken()
      // 作用：调用此接口后，会使用当前token进行登录（token需在有效期内），并获得新的token，同时增加登录日志，方便做每日登录统计。（此接口一天内重复调用多次时，只有每日的第一次调用生效）
      // 如果需要，可以打开下面一行的注释代码即可
      // vk.userCenter.loginByToken();
    },
    onShow: function () {
      if (config.debug) console.log('App Show');
      // #ifdef MP-WEIXIN
      // 检测如果当前是体验版，但没有点HBX的【发行】菜单发布，则提示开发者请点【发行】按钮
      try {
        const nodeEnv = process.env.NODE_ENV;
        console.log('当前运行模式: ', nodeEnv);
        const info = uni.getAccountInfoSync();
        if (info.miniProgram.envVersion === 'trial' && nodeEnv !== 'production') {
          // 如果不想要alert弹窗提示，可以将vk.alert改成console.log
          uni.vk.alert(
            '检测到您当前发布的【体验版】是通过【运行】按钮打包发布的，请重新点击HBX上方菜单的【发行】按钮进行打包发布小程序（如果确定是【发行】按钮打包的，请删除手机上的体验版小程序并重新扫码进入）',
            '重要提示',
            '好的'
          );
        }
      } catch (err) {}
      // #endif
    },
    onHide: function () {
      if (config.debug) console.log('App Hide');
    },
  };

  function getAppid() {
    // #ifdef MP-WEIXIN
    return uni.getAccountInfoSync().miniProgram.appId;
    // #endif

    return 'YOUR_WEIXIN_APPID';
  }
</script>

<style lang="scss">
  /**
	 * 每个页面公共css
	 * 特别注意，如果启动时报scss相关的错误，请卸载你的scss插件，重新安装
	 * Vue3安装地址：https://ext.dcloud.net.cn/plugin?id=5701
	 * Vue2安装地址：https://ext.dcloud.net.cn/plugin?id=2046
	 */
  // @import "./uni_modules/vk-uview-ui/index.scss";
  @import './common/css/app.scss';
</style>
