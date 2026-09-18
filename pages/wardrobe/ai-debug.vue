<template>
  <view class="page">
    <view class="header">
      <view class="title">AI 调试</view>
      <view class="subtitle">查看配置状态、最近任务和兜底原因。</view>
    </view>

    <view class="panel">
      <view class="panel-head">
        <view class="panel-title">运行配置</view>
        <button class="mini-button" :loading="pingLoading" @click="pingTextModel">测试文本模型</button>
      </view>
      <view class="row">
        <view class="label">API Key</view>
        <view class="value">{{ status.api_key_ready ? '已配置' : '未配置' }}</view>
      </view>
      <view class="row">
        <view class="label">文本模型</view>
        <view class="value">{{ status.text_model || '-' }}</view>
      </view>
      <view class="row">
        <view class="label">视觉模型</view>
        <view class="value">{{ status.vision_model || '-' }}</view>
      </view>
      <view class="row">
        <view class="label">接口地址</view>
        <view class="value">{{ status.base_url || '-' }}</view>
      </view>
      <view class="row">
        <view class="label">模拟试穿</view>
        <view class="value">{{ status.tryon_ready ? '已配置' : '未配置' }}</view>
      </view>
      <view class="row">
        <view class="label">搜索 MCP</view>
        <view class="value">{{ status.search_mcp_ready ? '已配置' : '未配置' }}</view>
      </view>
      <view v-if="pingResult.msg || pingResult.output" class="ping-result" :class="{ danger: !pingResult.ok }">
        {{ pingResult.ok ? '测试成功：' + (pingResult.output || 'OK') : '测试失败：' + pingResult.msg }}
      </view>
    </view>

    <view class="panel">
      <view class="panel-head">
        <view class="panel-title">最近任务</view>
        <button class="mini-button" :loading="loading" @click="loadDebugData">刷新</button>
      </view>

      <view v-if="tasks.length">
        <view v-for="task in tasks" :key="task._id" class="task-card">
          <view class="task-title">{{ task.task_type }}</view>
          <view class="task-meta">{{ task.status }} · {{ task.model }}</view>
          <view v-if="task.fallback_reason" class="task-note">兜底：{{ task.fallback_reason }}</view>
          <view v-if="task.error_message" class="task-note danger">错误：{{ task.error_message }}</view>
        </view>
      </view>

      <view v-else class="empty">暂无 AI 任务</view>
    </view>
  </view>
</template>

<script>
  let vk = uni.vk;

  export default {
    data() {
      return {
        loading: false,
        pingLoading: false,
        status: {},
        tasks: [],
        pingResult: {},
      };
    },
    onLoad() {
      vk = uni.vk;
      this.loadDebugData();
    },
    methods: {
      /**
       * 读取 AI 调试信息。
       * Agent 设计点：
       * 调试入口不是给普通推荐流程用的，而是用于观察 Agent 的运行状态：
       * 配置是否完整、模型调用有没有失败、失败后为什么进入规则兜底。
       */
      async loadDebugData() {
        if (this.loading) return;
        this.loading = true;

        try {
          const statusRes = await this.callDebugApi('client/wardrobe/debug.status');
          const tasksRes = await this.callDebugApi('client/wardrobe/debug.tasks', {
            limit: 20,
          });

          this.status = statusRes || {};
          this.tasks = tasksRes.rows || [];
        } catch (err) {
          console.error('读取 AI 调试信息失败', err);
          uni.showToast({
            title: '读取失败',
            icon: 'none',
          });
        } finally {
          this.loading = false;
        }
      },
      /**
       * 调用 AI 调试云函数。
       * API Key 不会从这里返回；前端只看到布尔配置状态，避免调试页面泄露密钥。
       */
      callDebugApi(url, data = {}) {
        return vk.callFunction({
          url,
          data,
          loading: false,
        });
      },
      /**
       * 发起一次真实豆包文本模型请求。
       * 这一步能确认账号是否已开通当前 ARK_TEXT_MODEL，而不只是确认 API Key 是否存在。
       */
      async pingTextModel() {
        if (this.pingLoading) return;
        this.pingLoading = true;
        this.pingResult = {};

        try {
          const res = await this.callDebugApi('client/wardrobe/debug.pingText');
          this.pingResult = res || {};
          uni.showToast({
            title: res && res.ok ? '测试成功' : '测试失败',
            icon: 'none',
          });
        } catch (err) {
          console.error('测试文本模型失败', err);
          this.pingResult = {
            ok: false,
            msg: err && (err.message || err.msg || err.errMsg) ? err.message || err.msg || err.errMsg : '测试失败',
          };
        } finally {
          this.pingLoading = false;
        }
      },
    },
  };
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 48rpx 32rpx 80rpx;
    background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
  }

  .header {
    margin-bottom: 28rpx;
  }

  .title {
    color: var(--wardrobe-text);
    font-size: 46rpx;
    font-weight: 800;
    line-height: 1.3;
  }

  .subtitle {
    margin-top: 12rpx;
    color: var(--wardrobe-muted);
    font-size: 26rpx;
    line-height: 1.5;
  }

  .panel {
    margin-bottom: 24rpx;
    padding: 30rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 24rpx;
    background: var(--wardrobe-surface);
    box-shadow: var(--wardrobe-shadow);
  }

  .panel-head,
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title {
    color: var(--wardrobe-text);
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.4;
  }

  .row {
    padding-top: 18rpx;
  }

  .label,
  .task-meta,
  .task-note,
  .empty {
    color: var(--wardrobe-muted);
    font-size: 25rpx;
    line-height: 1.5;
  }

  .value {
    max-width: 430rpx;
    color: var(--wardrobe-text);
    font-size: 25rpx;
    line-height: 1.5;
    text-align: right;
    word-break: break-all;
  }

  .mini-button {
    margin: 0;
    padding: 0 24rpx;
    border-radius: 999rpx;
    background: #fff3e8;
    color: var(--wardrobe-primary-deep);
    font-size: 24rpx;
  }

  .task-card {
    margin-top: 18rpx;
    padding: 22rpx;
    border: 1rpx solid #f0dfda;
    border-radius: 18rpx;
    background: var(--wardrobe-surface-solid);
  }

  .task-title {
    color: var(--wardrobe-text);
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.4;
  }

  .task-note {
    margin-top: 8rpx;
  }

  .ping-result {
    margin-top: 18rpx;
    color: var(--wardrobe-primary-deep);
    font-size: 25rpx;
    line-height: 1.5;
    word-break: break-all;
  }

  .danger {
    color: #b44747;
  }
</style>
