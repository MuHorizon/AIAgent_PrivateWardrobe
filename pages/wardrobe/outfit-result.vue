<template>
  <view class="page">
    <view class="header">
      <view class="title">搭配结果</view>
      <view class="subtitle">{{ sourceText }}</view>
    </view>

    <view v-if="records.length">
      <view v-for="record in records" :key="record._id || record.id" class="result-card">
        <view class="card-head">
          <view>
            <view class="result-title">{{ record.title }}</view>
            <view class="result-meta">{{ record.weather || record.scene }} · {{ record.score }}分</view>
          </view>
        </view>

        <scroll-view class="item-scroll" scroll-x>
          <view class="item-row">
            <view v-for="item in record.outfit_items" :key="item._id" class="item-card">
              <image class="item-image" :src="item.image_url" mode="aspectFill"></image>
              <view class="item-name">{{ item.name }}</view>
            </view>
          </view>
        </scroll-view>

        <view class="reason">{{ record.reason }}</view>
        <view v-if="record.focus_item" class="explain-row">重点：{{ record.focus_item }}</view>
        <view v-if="record.weather_tip" class="explain-row">天气：{{ record.weather_tip }}</view>
        <view v-if="record.swap_tip" class="explain-row">替换：{{ record.swap_tip }}</view>

        <view class="action-row">
          <button class="mini-button" @click="sendFeedback(record, 'liked')">收藏</button>
          <button class="mini-button" @click="sendFeedback(record, 'worn')">今天穿</button>
          <button class="mini-button danger" @click="sendFeedback(record, 'disliked')">不喜欢</button>
        </view>
      </view>
    </view>

    <view v-else class="empty">
      <view class="empty-title">暂无结果</view>
      <button class="primary-button" type="primary" @click="goOutfit">重新生成</button>
    </view>
  </view>
</template>

<script>
  let vk = uni.vk;
  const RESULT_STORAGE_KEY = 'ai_private_wardrobe_latest_outfits';

  export default {
    data() {
      return {
        records: [],
        source: '',
        aiError: '',
        aiTaskId: '',
      };
    },
    computed: {
      sourceText() {
        if (this.source === 'doubao') return '根据你的画像和衣柜，为今天挑出的搭配方案。';
        if (this.source === 'rule_fallback') return '先为你生成一版可参考的搭配，之后可以继续优化。';
        return '根据你的画像和衣柜生成。';
      },
    },
    onLoad() {
      vk = uni.vk;
      const result = uni.getStorageSync(RESULT_STORAGE_KEY) || {};
      if (Array.isArray(result)) {
        this.records = result;
        return;
      }

      this.records = result.records || [];
      this.source = result.source || '';
      this.aiError = result.ai_error || '';
      this.aiTaskId = result.ai_task_id || '';
    },
    methods: {
      /**
       * 保存用户对穿搭的显式反馈。
       * 这里先写入 outfit_records；后续接 AI Memory 时，再把这些反馈转成长期偏好。
       */
      async sendFeedback(record, feedback) {
        const recordId = record._id || record.id;
        const data = {
          _id: recordId,
          feedback,
        };

        if (feedback === 'liked') data.is_favorite = true;
        if (feedback === 'worn') data.worn_date = this.getToday();

        try {
          await this.callOutfitApi('client/wardrobe/outfit.feedback', data);
          this.updateLocalRecord(recordId, data);
          uni.showToast({
            title: '已记录',
            icon: 'success',
          });
        } catch (err) {
          console.error('保存穿搭反馈失败', err);
          uni.showToast({
            title: '反馈失败',
            icon: 'none',
          });
        }
      },
      /**
       * 更新结果页本地状态。
       * 让用户点击反馈后立即看到状态变化，不必等待重新拉取历史列表。
       */
      updateLocalRecord(recordId, data) {
        this.records = this.records.map((record) => {
          const currentId = record._id || record.id;
          return currentId === recordId ? { ...record, ...data } : record;
        });
        uni.setStorageSync(RESULT_STORAGE_KEY, {
          records: this.records,
          source: this.source,
          ai_error: this.aiError,
          // 保留 Agent 追踪 ID，避免用户反馈后覆盖本地结果缓存时丢失排查线索。
          ai_task_id: this.aiTaskId,
        });
      },
      /**
       * 获取今天日期。
       * “今天穿”反馈会记录 worn_date，后续可用于穿搭历史和偏好复盘。
       */
      getToday() {
        const date = new Date();
        const month = this.pad(date.getMonth() + 1);
        const day = this.pad(date.getDate());
        return `${date.getFullYear()}-${month}-${day}`;
      },
      pad(value) {
        return value < 10 ? `0${value}` : `${value}`;
      },
      goOutfit() {
        uni.navigateBack();
      },
      callOutfitApi(url, data = {}) {
        return vk.callFunction({
          url,
          data,
          loading: false,
        });
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

  .result-card,
  .empty {
    margin-bottom: 24rpx;
    padding: 30rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 24rpx;
    background: var(--wardrobe-surface);
    box-shadow: var(--wardrobe-shadow);
  }

  .card-head {
    display: flex;
    justify-content: space-between;
  }

  .result-title {
    color: var(--wardrobe-text);
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.35;
  }

  .result-meta {
    margin-top: 8rpx;
    color: var(--wardrobe-muted);
    font-size: 24rpx;
    line-height: 1.4;
  }

  .item-scroll {
    width: 100%;
    margin-top: 22rpx;
    white-space: nowrap;
  }

  .item-row {
    display: inline-flex;
  }

  .item-card {
    width: 154rpx;
    margin-right: 16rpx;
  }

  .item-image {
    width: 154rpx;
    height: 154rpx;
    border-radius: 18rpx;
    background: #f1e4d6;
  }

  .item-name {
    margin-top: 8rpx;
    color: var(--wardrobe-plum);
    font-size: 22rpx;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reason {
    margin-top: 20rpx;
    color: var(--wardrobe-muted);
    font-size: 25rpx;
    line-height: 1.5;
  }

  .explain-row {
    margin-top: 10rpx;
    color: var(--wardrobe-muted);
    font-size: 24rpx;
    line-height: 1.5;
  }

  .action-row {
    display: flex;
    margin-top: 22rpx;
  }

  .mini-button {
    flex: 1;
    margin: 0 12rpx 0 0;
    border-radius: 999rpx;
    background: #fff3e8;
    color: var(--wardrobe-primary-deep);
    font-size: 24rpx;
  }

  .mini-button.danger {
    margin-right: 0;
    background: #fff3e8;
    color: var(--wardrobe-danger);
  }

  .empty {
    text-align: center;
  }

  .empty-title {
    margin-bottom: 24rpx;
    color: var(--wardrobe-text);
    font-size: 30rpx;
    font-weight: 700;
  }

  .primary-button {
    border-radius: 999rpx;
    background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
  }
</style>
