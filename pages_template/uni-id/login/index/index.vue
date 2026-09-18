<template>
  <view class="app login">
    <!-- 页面内容开始 -->
    <view class="content">
      <!-- 头部logo -->
      <view class="header"><image class="logo" :src="logoImage"></image></view>
      <!-- 主体表单 -->
      <view class="form-view">
        <view class="form-item form-border">
          <!-- 文本框 -->
          <input class="form-input" v-model="form1.username" type="text" :maxlength="50" placeholder="用户名/手机号" placeholder-style="'color':'#8e8e8e'" />
        </view>
        <view class="form-item form-border">
          <!-- 文本框 -->
          <input class="form-input" v-model="form1.password" type="password" placeholder="密码" placeholder-style="'color':'#8e8e8e'" />
        </view>
      </view>
      <view class="login-btn">
        <button class="btn success circle" hover-class="hover" @click="login" :plain="false" type="success" shape="circle" :hair-line="false">登 录</button>
      </view>
      <!-- 其他登录 -->
      <view class="login-icon-view">
        <!-- #ifdef MP-WEIXIN -->
        <view class="login-icon-item">
          <u-icon name="weixin-fill" @click="login_weixin" size="80" color="#19be6b"></u-icon>
        </view>
        <!-- #endif -->
        <!-- #ifdef APP-PLUS -->
        <view class="login-icon-item">
          <u-icon name="weixin-fill" @click="login_weixin" size="80" color="#19be6b"></u-icon>
        </view>
        <!-- #endif -->
      </view>

      <!-- 底部信息 -->
      <view class="footer">
        <navigator url="../forget/forget" open-type="navigate">找回密码</navigator>
        <text class="center-line">|</text>
        <navigator url="../register/register" open-type="navigate">注册账号</navigator>
      </view>
    </view>

    <!-- 页面内容结束 -->
  </view>
</template>

<script>
  let vk = uni.vk;
  export default {
    data() {
      // 页面数据变量
      return {
        // init请求返回的数据
        data: {},
        // 表单请求数据
        form1: {
          agreement: true,
          username: 'admin',
          password: '123456',
        },
        scrollTop: 0,
        logoImage: '/static/logo.png',
      };
    },
    onPageScroll(e) {
      this.scrollTop = e.scrollTop;
    },
    // 监听 - 页面每次【加载时】执行(如：前进)
    onLoad(options) {
      vk = uni.vk;
      this.options = options;
      this.init(options);
    },
    // 监听 - 页面【首次渲染完成时】执行。注意如果渲染速度快，会在页面进入动画完成前触发
    onReady() {},
    // 监听 - 页面每次【显示时】执行(如：前进和返回) (页面每次出现在屏幕上都触发，包括从下级页面点返回露出当前页面)
    onShow() {
      // #ifdef MP-WEIXIN
      uni.hideHomeButton();
      // #endif
    },
    // 监听 - 页面每次【隐藏时】执行(如：返回)
    onHide() {},
    // 监听 - 页面下拉刷新
    onPullDownRefresh() {
      setTimeout(() => {
        uni.stopPullDownRefresh();
      }, 1000);
    },
    // 监听 - 点击右上角转发时
    onShareAppMessage(options) {},
    // 函数
    methods: {
      // 页面数据初始化函数
      init(options = {}) {
        console.log('init: ', options);
      },
      pageTo(path) {
        vk.navigateTo(path);
      },
      // 账号密码登录
      login() {
        const { agreement, username, password } = this.form1;
        if (!agreement) {
          vk.toast('请阅读并同意用户服务及隐私协议', 'none');
          return;
        }
        if (username.length < 4) {
          vk.toast('账号至少4位数', 'none');
          return;
        }
        if (!vk.pubfn.test(password, 'pwd')) {
          vk.toast('密码以字母开头，长度在6~18之间，只能包含字母、数字和下划线', 'none');
          return;
        }
        // 登录操作
        let form1 = this.form1;
        vk.userCenter.login({
          data: form1,
          //loading:false,
          success: (data) => {
            console.log('data', data);
            vk.toast('登录成功');
            setTimeout(() => {
              // 跳转到首页,或页面返回
              this.login_success(data);
            }, 1000);
          },
        });
      },
      login_success(data) {
        // 检查是否有指定跳转的页面

        // 兼容uniIdRedirectUrl
        if (this.options.uniIdRedirectUrl) {
          let uniIdRedirectUrl = decodeURIComponent(this.options.uniIdRedirectUrl);
          if (uniIdRedirectUrl) {
            vk.navigate.setOriginalPage(null);
            vk.redirectTo(uniIdRedirectUrl);
            return;
          }
        }
        if (vk.navigate.getOriginalPage()) {
          vk.navigate.originalTo();
          return false;
        }
        // 跳转到首页,或页面返回
        let pages = getCurrentPages();
        if (pages.length > 1 && pages[pages.length - 2] && pages[pages.length - 2].route && pages[pages.length - 2].route.indexOf('login/index') == -1) {
          const eventChannel = this.getOpenerEventChannel();
          eventChannel.emit('loginSuccess', {});
          vk.navigateBack();
        } else {
          // 进入首页
          vk.navigateToHome();
        }
      },
      // 第三方登录 - 微信
      login_weixin() {
        vk.userCenter.loginByWeixin({
          success: (data) => {
            vk.toast('登录成功');
            setTimeout(() => {
              // 跳转到首页,或页面返回
              this.login_success(data);
            }, 1000);
          },
        });
      },
    },
    // 计算属性
    computed: {},
  };
</script>
<style lang="scss" scoped>
  @import url('../css/main.css');
</style>
