<template>
  <view class="account-close-page">
    <!-- 头部状态卡片 -->
    <view class="status-card">
      <view class="status-header">
        <view class="status-icon" :class="statusClass">
          <text class="icon">{{ statusIcon }}</text>
        </view>
        <view class="status-info">
          <text class="status-title">{{ statusTitle }}</text>
          <text class="status-desc">{{ statusDesc }}</text>
        </view>
      </view>

      <!-- 倒计时显示 -->
      <view v-if="isInCoolingPeriod" class="countdown-section">
        <view class="countdown-label">冷静期剩余时间</view>
        <view class="countdown-display">
          <text class="countdown-time">{{ formattedDuration }}</text>
        </view>
        <view class="progress-bar" :style="{ '--progress-width': progressWidth + '%' }">
          <view class="progress-fill"></view>
        </view>
      </view>
    </view>

    <!-- 操作按钮区域 -->
    <view class="action-section" v-if="isLoad">
      <!-- 申请注销按钮 -->
      <button
        v-if="!isInCoolingPeriod && !isAccountClosed"
        class="action-btn warn-btn"
        :class="{ disabled: loading.close }"
        :loading="loading.close"
        :disabled="loading.close"
        @click="applyCloseAccount"
      >
        <text class="btn-text">申请注销账号</text>
      </button>

      <!-- 恢复账号按钮 -->
      <button v-if="isInCoolingPeriod" class="action-btn success-btn" :class="{ disabled: loading.open }" :loading="loading.open" :disabled="loading.open" @click="openAccount">
        <text class="btn-text">恢复账号</text>
      </button>

      <!-- 确认注销按钮 -->
      <button
        v-if="isInCoolingPeriod"
        class="action-btn outline-warn-btn"
        :loading="loading.confirm"
        :class="{ disabled: loading.open || loading.confirm || duration > 0 }"
        :disabled="loading.open || loading.confirm || duration > 0"
        @click="confirmCloseAccount"
      >
        <text class="btn-text">确认注销</text>
      </button>
    </view>

    <!-- 温馨提示 -->
    <view class="tips-section">
      <view class="tips-header">
        <text class="tips-icon">💡</text>
        <text class="tips-title">重要提示</text>
      </view>
      <view class="tips-content">
        <text class="tips-item">注销申请提交后有7天冷静期</text>
        <text class="tips-item">冷静期内可以随时恢复账号</text>
        <text class="tips-item">冷静期结束后需要确认才能完成注销</text>
        <text class="tips-item">账号确认注销后将无法恢复，请谨慎操作</text>
      </view>
    </view>

    <!-- 确认注销弹窗 -->
    <view v-if="showConfirmModal" class="modal-overlay" @click="closeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-header">
          <text class="modal-title">确认注销账号</text>
          <text class="modal-close" @click="closeModal">×</text>
        </view>
        <view class="modal-body">
          <text class="modal-warning">此操作不可逆，请确认您真的要注销账号</text>
          <view class="input-section">
            <text class="input-label">请输入"确认注销"以继续：</text>
            <input class="confirm-input" v-model="confirmText" placeholder="请输入：确认注销" placeholder-class="input-placeholder-class" />
          </view>
        </view>
        <view class="modal-footer">
          <button class="modal-btn cancel-btn" @click="closeModal">取消</button>
          <button class="modal-btn danger-btn" @click="handleConfirmClose" :loading="loading.confirm" :disabled="loading.confirm || confirmText.trim() !== '确认注销'">
            确认注销
          </button>
        </view>
      </view>
    </view>

    <!-- 注销成功页面 -->
    <view v-if="showSuccessPage" class="success-overlay">
      <view class="success-content">
        <view class="success-icon">
          <text class="icon">✓</text>
        </view>
        <view class="success-title">账号注销成功</view>
        <view class="success-desc">
          <text class="desc-text">您的账号已成功注销</text>
          <text class="desc-text">感谢您的使用，期待再次为您服务</text>
        </view>
        <view class="success-actions">
          <button class="action-btn success-btn" @click="goToLogin">
            <text class="btn-text">返回登录页面</text>
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
  let vk = uni.vk;
  export default {
    data() {
      return {
        isLoad: false,
        loading: {
          status: false,
          close: false,
          open: false,
          confirm: false,
        },
        isLogin: null,
        confirmed: false, // 是否已确认过注销账号
        duration: 0, // 冷静期剩余时间（毫秒）
        accountStatus: 0, // 账号状态：0-正常，4-冷静期，5-已注销
        showConfirmModal: false, // 是否显示确认弹窗
        confirmText: '', // 确认输入文本
        countdownTimer: null, // 倒计时定时器
        totalCoolingTime: 7 * 24 * 60 * 60 * 1000, // 总冷静期时间（7天）
        showSuccessPage: false, // 是否显示注销成功页面
      };
    },
    onLoad(options) {
      vk = uni.vk;
      this.init();
    },
    onUnload() {
      // 页面卸载时清除定时器
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }
    },
    methods: {
      init() {
        if (!vk.checkToken()) {
          vk.navigateToLogin();
          return;
        }
        this.isLogin = true;
        this.getCoolingStatus();
      },
      // 获取注销冷静期状态
      getCoolingStatus(obj = {}) {
        vk.userCenter.getCoolingStatus({
          loading: { that: this, name: 'loading.status' },
          success: (data) => {
            if (!this.isLoad) this.isLoad = true;
            if (data.close_account) {
              this.confirmed = data.close_account.confirmed;
            }
            this.accountStatus = data.status || 0;
            if (data.status === 4) {
              this.duration = data.duration || 0; // 注销冷静期剩余时间，单位毫秒
              this.startCountdown();
            }
          },
          complete: (res) => {
            if (typeof obj.complete === 'function') obj.complete(res);
          },
        });
      },

      // 开始倒计时
      startCountdown() {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
        }

        this.countdownTimer = setInterval(() => {
          if (this.duration > 0) {
            this.duration -= 1000; // 每秒减1秒
          } else {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
          }
        }, 1000);
      },

      // 申请注销账号
      applyCloseAccount() {
        uni.showModal({
          title: '申请注销账号',
          content: '确定要申请注销账号吗？提交后将进入7天冷静期。',
          confirmText: '申请注销',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.closeAccount();
            }
          },
        });
      },

      // 注销账号
      closeAccount() {
        this.loading.close = true;
        vk.userCenter.closeAccount({
          loading: false,
          success: (data) => {
            this.getCoolingStatus({
              complete: (res) => {
                this.loading.close = false;
              },
            });
          },
          fail: (err) => {
            vk.alert(err.msg || '注销失败');
            this.loading.close = false;
          },
        });
      },

      // 恢复账号
      openAccount() {
        uni.showModal({
          title: '恢复账号',
          content: '确定要恢复账号吗？账号将恢复正常使用状态',
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.openAccount();
            }
          },
        });
      },

      // 执行恢复账号
      openAccount() {
        this.loading.open = true;
        vk.userCenter.openAccount({
          loading: false,
          success: (data) => {
            if (this.countdownTimer) {
              clearInterval(this.countdownTimer);
              this.countdownTimer = null;
            }
            this.getCoolingStatus({
              complete: (res) => {
                this.loading.open = false;
              },
            });
          },
          fail: (err) => {
            vk.alert(err.msg || '恢复失败');
            this.loading.open = false;
          },
        });
      },

      // 确认注销账号
      confirmCloseAccount() {
        if (!this.canConfirmClose) {
          vk.toast('冷静期尚未结束');
          return;
        }
        this.showConfirmModal = true;
      },

      // 关闭确认弹窗
      closeModal() {
        this.showConfirmModal = false;
        this.confirmText = '';
      },

      // 处理确认注销
      handleConfirmClose() {
        if (this.confirmText.trim() !== '确认注销') {
          vk.toast('请输入"确认注销"');
          return;
        }
        this.loading.confirm = true;
        vk.userCenter.closeAccount({
          loading: false,
          success: (data) => {
            this.closeModal();
            vk.toast(data.msg);
            // 显示注销成功页面
            this.showSuccessPage = true;
          },
          fail: (err) => {
            vk.alert(err.msg || '注销失败');
            this.loading.confirm = false;
          },
        });
      },

      // 返回登录页面
      goToLogin() {
        vk.navigateToLogin({
          mode: 'reLaunch',
        });
      },
    },
    computed: {
      // 是否在冷静期
      isInCoolingPeriod() {
        return this.accountStatus === 4 && !this.confirmed;
      },
      // 账号是否已注销
      isAccountClosed() {
        return this.accountStatus === 4 && this.confirmed;
      },
      // 是否可以确认注销（冷静期结束）
      canConfirmClose() {
        return this.isInCoolingPeriod && this.duration <= 0;
      },
      // 状态图标
      statusIcon() {
        if (this.isAccountClosed) return '❌';
        if (this.isInCoolingPeriod) return '⏰';
        return '✓';
      },
      // 状态样式类
      statusClass() {
        if (this.isAccountClosed) return 'status-closed';
        if (this.isInCoolingPeriod) return 'status-cooling';
        return 'status-normal';
      },
      // 状态标题
      statusTitle() {
        if (!this.isLoad) return '加载中...';
        if (this.isAccountClosed) return '账号已注销';
        if (this.isInCoolingPeriod) return '账号注销冷静期';
        return '账号状态正常';
      },
      // 状态描述
      statusDesc() {
        if (!this.isLoad) return '';
        if (this.isAccountClosed) return '您的账号已被注销，无法恢复';
        if (this.isInCoolingPeriod) return '您的账号正在冷静期中，可以随时恢复';
        return '您的账号运行正常';
      },
      // 格式化的倒计时时间
      formattedDuration() {
        if (this.duration <= 0) return '冷静期已结束';

        const days = Math.floor(this.duration / (24 * 60 * 60 * 1000));
        const hours = Math.floor((this.duration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((this.duration % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((this.duration % (60 * 1000)) / 1000);

        if (days > 0) {
          return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
        } else if (hours > 0) {
          return `${hours}小时 ${minutes}分钟 ${seconds}秒`;
        } else if (minutes > 0) {
          return `${minutes}分钟 ${seconds}秒`;
        } else {
          return `${seconds} 秒`;
        }
      },
      // 进度条宽度
      progressWidth() {
        if (this.duration <= 0) return 100;
        return ((this.totalCoolingTime - this.duration) / this.totalCoolingTime) * 100;
      },
    },
  };
</script>

<style lang="scss" scoped>
  .account-close-page {
    min-height: calc(100vh - var(--window-bottom) - var(--window-top));
    background-color: #f4f5f7;
    background-image: linear-gradient(180deg, #f0f2f6 0%, #f7f8fa 100%);
    padding: 24px 20px;
    box-sizing: border-box;
  }

  /* 状态卡片样式 */
  .status-card {
    background: #ffffff;
    border-radius: 20px;
    padding: 28px 24px;
    margin-bottom: 24px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.02);
    position: relative;
    overflow: hidden;
    animation: fadeInDown 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .status-header {
    display: flex;
    align-items: center;
    margin-bottom: 24px;
  }

  .status-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

    &.status-normal {
      background: linear-gradient(135deg, #e8fdf5 0%, #c1f6e2 100%);
      color: #00c68e;
      box-shadow: 0 6px 16px rgba(0, 198, 142, 0.2);
    }

    &.status-cooling {
      background: linear-gradient(135deg, #fff4e5 0%, #ffe1bc 100%);
      color: #ff8c00;
      box-shadow: 0 6px 16px rgba(255, 140, 0, 0.2);
    }

    &.status-closed {
      background: linear-gradient(135deg, #ffebec 0%, #ffd1d4 100%);
      color: #ff4d4f;
      box-shadow: 0 6px 16px rgba(255, 77, 79, 0.2);
    }

    .icon {
      font-size: 28px;
    }
  }

  .status-info {
    flex: 1;
  }

  .status-title {
    font-size: 20px;
    font-weight: 600;
    color: #1d2129;
    display: block;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
  }

  .status-desc {
    font-size: 14px;
    color: #86909c;
    line-height: 1.5;
  }

  /* 倒计时样式 */
  .countdown-section {
    background: #fdfafa;
    border-radius: 16px;
    padding: 20px;
    border: 1px solid rgba(255, 140, 0, 0.1);
  }

  .countdown-label {
    font-size: 13px;
    color: #ff8c00;
    margin-bottom: 12px;
    font-weight: 500;
  }

  .countdown-display {
    margin-bottom: 16px;
  }

  .countdown-time {
    font-size: 20px;
    font-weight: 700;
    color: #ff8c00;
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
  }

  .progress-bar {
    height: 8px;
    background: rgba(255, 140, 0, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #ffb259, #ff8c00);
    border-radius: 4px;
    width: var(--progress-width, 0%);
    transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* 操作按钮区域 */
  .action-section {
    margin-bottom: 30px;
    padding: 0 4px;
  }

  .action-btn {
    width: 100%;
    height: 56px;
    border-radius: 28px;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    font-size: 17px;
    font-weight: 600;
    transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    letter-spacing: 0.5px;

    &:not(:disabled):active {
      transform: scale(0.96);
    }

    &::after {
      border: none;
    }
  }

  .warn-btn {
    background: linear-gradient(135deg, #ff6b6b, #ff3b3b);
    color: #ffffff;
    box-shadow: 0 8px 20px rgba(255, 59, 59, 0.25);

    .disabled {
      background: #e5e6eb;
      color: #b5b7c0;
      box-shadow: none;
    }
  }

  .success-btn {
    background: #19be6b;
    color: #ffffff;
    box-shadow: 0 8px 20px rgba(0, 179, 131, 0.25);

    .disabled {
      background: #e5e6eb;
      color: #b5b7c0;
      box-shadow: none;
    }
  }

  .outline-warn-btn {
    background: #ffffff;
    color: #ff3b3b;
    border: 1.5px solid #ff3b3b;
    box-shadow: 0 4px 12px rgba(255, 59, 59, 0.08);

    .disabled {
      border: 1.5px solid #b5b7c0;
      border-color: #e5e6eb;
      color: #b5b7c0;
      box-shadow: none;
    }
  }

  .btn-text {
    font-size: 17px;
    color: inherit;
  }

  /* 温馨提示区域 */
  .tips-section {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(12px);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid #ffffff;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.02);
    animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;
  }

  .tips-header {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }

  .tips-icon {
    font-size: 18px;
    margin-right: 8px;
  }

  .tips-title {
    font-size: 16px;
    font-weight: 600;
    color: #1d2129;
  }

  .tips-content {
    .tips-item {
      display: block;
      font-size: 14px;
      color: #4e5969;
      line-height: 1.8;
      margin-bottom: 10px;
      position: relative;
      padding-left: 14px;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 9px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #c9cdd4;
      }

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  /* 弹窗样式 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease;
  }

  .modal-content {
    background: #ffffff;
    border-radius: 24px;
    width: 85%;
    max-width: 340px;
    overflow: hidden;
    animation: popIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 24px 16px;
  }

  .modal-title {
    font-size: 19px;
    font-weight: 600;
    color: #1d2129;
  }

  .modal-close {
    font-size: 24px;
    color: #86909c;
    cursor: pointer;
    line-height: 1;
    transition: color 0.2s ease;
    padding: 4px;

    &:hover {
      color: #1d2129;
    }
  }

  .modal-body {
    padding: 0 24px 24px;
  }

  .modal-warning {
    font-size: 14px;
    color: #ff4d4f;
    margin-bottom: 24px;
    line-height: 1.6;
    display: block;
    background: #fff0f0;
    padding: 14px 16px;
    border-radius: 12px;
  }

  .input-section {
    .input-label {
      display: block;
      font-size: 15px;
      color: #1d2129;
      margin-bottom: 12px;
      font-weight: 500;
    }

    .confirm-input {
      width: 100%;
      height: 52px;
      background: #f7f8fa;
      border: 1.5px solid transparent;
      border-radius: 12px;
      padding: 0 16px;
      font-size: 16px;
      color: #1d2129;
      box-sizing: border-box;
      transition: all 0.3s ease;

      &:focus {
        background: #ffffff;
        border-color: #ff4d4f;
        box-shadow: 0 0 0 4px rgba(255, 77, 79, 0.1);
        outline: none;
      }
    }

    .input-placeholder-class {
      color: #c9cdd4;
    }
  }

  .modal-footer {
    display: flex;
    padding: 16px 24px 24px;
    gap: 16px;
  }

  .modal-btn {
    flex: 1;
    height: 50px;
    line-height: 50px;
    border-radius: 25px;
    border: none;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.2s ease;
    padding: 0;
    margin: 0;

    &::after {
      border: none;
    }

    &:not(:disabled):active {
      transform: scale(0.96);
    }
  }

  .cancel-btn {
    background: #f2f3f5;
    color: #4e5969;
  }

  .danger-btn {
    background: linear-gradient(135deg, #ff6b6b, #ff3b3b);
    color: #ffffff;
    box-shadow: 0 6px 16px rgba(255, 59, 59, 0.2);

    &:disabled {
      background: #e5e6eb;
      color: #b5b7c0;
      box-shadow: none;
    }
  }

  /* 动画效果 */
  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* 注销成功页面样式 */
  .success-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.4s ease;
  }

  .success-content {
    width: 100%;
    padding: 40px 30px;
    text-align: center;

    .success-icon {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e8fdf5 0%, #c1f6e2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 36px;
      animation: popIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
      box-shadow: 0 12px 32px rgba(0, 198, 142, 0.15);

      .icon {
        font-size: 40px;
        color: #00c68e;
      }
    }

    .success-title {
      font-size: 26px;
      font-weight: 700;
      color: #1d2129;
      margin-bottom: 16px;
      animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;
    }

    .success-desc {
      margin-bottom: 56px;
      animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s both;

      .desc-text {
        display: block;
        font-size: 16px;
        color: #86909c;
        line-height: 1.6;
      }
    }

    .success-actions {
      animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s both;
    }
  }

  /* 响应式适配 */
  @media screen and (max-width: 375px) {
    .account-close-page {
      padding: 16px;
    }

    .status-card {
      padding: 20px;
    }

    .status-icon {
      width: 52px;
      height: 52px;
      margin-right: 16px;

      .icon {
        font-size: 24px;
      }
    }

    .status-title {
      font-size: 18px;
    }

    .action-btn {
      height: 52px;
      font-size: 16px;
    }

    .success-content {
      padding: 20px;
    }

    .success-icon {
      width: 76px;
      height: 76px;

      .icon {
        font-size: 32px;
      }
    }

    .success-title {
      font-size: 24px;
    }

    .tips-section {
      padding: 20px;
    }
  }
</style>
