<template>
  <view class="error-page">
    <view class="error-content">
      <view class="status-code">404</view>
      <view class="title">页面走丢了...</view>
      <view class="desc">你访问的页面不存在或已被移除</view>
      <image class="empty-image" src="./static/404.png" mode="aspectFit"></image>
      <button class="home-btn" hover-class="home-btn-hover" @click="backHome">返回首页</button>
    </view>
  </view>
</template>

<script>
  let vk = uni.vk;
  export default {
    data() {
      return {};
    },
    onLoad(options = {}) {
      vk = uni.vk;
      this.options = options;
    },
    methods: {
      backHome() {
        vk.navigateToHome();
      },
    },
  };
</script>

<style lang="scss" scoped>
  .error-page {
    --error-bg: #ffffff;
    --error-text-color: #566079;
    --error-shadow-color: rgba(67, 75, 99, 0.16);
    --error-btn-color: #496dff;

    min-height: calc(100vh - var(--window-bottom) - var(--window-top));
    padding-top: calc(var(--status-bar-height) + 66px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 26px);
    box-sizing: border-box;
    background: var(--error-bg);
  }

  .error-content {
    display: flex;
    align-items: center;
    flex-direction: column;
    min-height: calc(100vh - var(--status-bar-height) - 89px);
    padding: 0 28px;
    box-sizing: border-box;
  }

  .status-code {
    height: 71px;
    line-height: 71px;
    color: var(--error-text-color);
    font-size: 70px;
    font-weight: 500;
    letter-spacing: 9px;
    text-align: center;
    text-indent: 9px;
    text-shadow: 0 5px 11px var(--error-shadow-color);
  }

  .title {
    margin-top: 17px;
    color: var(--error-text-color);
    font-size: 23px;
    line-height: 33px;
    letter-spacing: 5px;
    text-align: center;
  }

  .desc {
    margin-top: 9px;
    color: var(--error-text-color);
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 4px;
    text-align: center;
  }

  .empty-image {
    width: 310px;
    height: 310px;
    margin-top: 20px;
  }

  .home-btn {
    width: 216px;
    height: 40px;
    margin-top: 29px;
    padding: 0;
    border: 0;
    border-radius: 20px;
    background: var(--error-btn-color);
    box-shadow: 0 6px 12px var(--error-shadow-color);
    color: var(--error-bg);
    font-size: 16px;
    font-weight: 500;
    line-height: 40px;
    letter-spacing: 5px;
    text-align: center;
    text-indent: 5px;
  }

  .home-btn::after {
    border: 0;
  }

  .home-btn-hover {
    opacity: 0.9;
  }
</style>
