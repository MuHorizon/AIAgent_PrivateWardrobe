<template>
  <view class="page">
    <image v-if="product.image_url" class="hero-img" :src="product.image_url" mode="aspectFill"></image>
    <view v-else class="img-empty">暂无商品图</view>

    <view class="info-panel">
      <view class="product-title">{{ product.title || '未命名商品' }}</view>
      <view class="price-line">
        <text class="price">{{ product.price || '暂无价格' }}</text>
        <text class="platform">{{ product.platform || '未知平台' }}</text>
      </view>
      <view v-if="product.summary" class="summary">{{ product.summary }}</view>
    </view>

    <view class="action-panel">
      <view class="action-row">
        <button class="buy-btn" @click="openProductUrl">去购买</button>
        <button class="fav-btn" :class="{ active: isFavorited }" @click="toggleFavorite">
          {{ isFavorited ? '已收藏' : '收藏' }}
        </button>
      </view>
      <view class="track-section">
        <view class="track-title">价格追踪</view>
        <view class="track-row">
          <input class="track-input" v-model="targetPrice" type="digit" placeholder="输入目标价格" />
          <button class="track-btn" :loading="tracking" @click="trackPrice">设置追踪</button>
        </view>
        <view v-if="trackRecords.length" class="track-list">
          <view v-for="record in trackRecords" :key="record._id" class="track-item">
            <text>目标价 ¥{{ record.target_price || '-' }}</text>
            <text class="track-date">{{ formatDate(record.created_at) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 相似商品 （来自搜索MCP） -->
    <view class="section-title">相似商品</view>
    <view v-if="similarItems.length">
      <view v-for="item in similarItems" :key="item.url || item.title" class="similar-card" @click="openUrl(item.url)">
        <image v-if="item.image_url" class="similar-img" :src="item.image_url" mode="aspectFill"></image>
        <view class="similar-info">
          <view class="similar-title">{{ item.title }}</view>
          <view class="similar-price">{{ item.price || '暂无价格' }} · {{ item.platform || '未知' }}</view>
        </view>
        <view class="similar-arrow">›</view>
      </view>
    </view>
    <view v-else class="empty">暂无相似商品，可去比价页重新搜索。</view>
  </view>
</template>

<script>
let vk = uni.vk;

export default {
  data() {
    return {
      product: {},
      isFavorited: false,
      targetPrice: '',
      tracking: false,
      trackRecords: [],
      similarItems: [],
    };
  },
  onLoad(options = {}) {
    vk = uni.vk;
    this.applyFallback(options.fallback);
    // 如果有商品信息则搜索相似商品
    if (this.product.title || this.product.query) {
      this.searchSimilar();
    }
    if (this.product._id || this.product.product_key) {
      this.loadTrackRecords();
    }
  },
  methods: {
    /**
     * 应用列表页传入的兜底数据。
     * Agent 设计点：
     * 商品详情支持从收藏、搜索、比价等多个入口进入，每个入口传入的商品字段可能不同。
     * fallback 机制保证页面在云端详情接口完善之前先有可展示内容。
     */
    applyFallback(fallback) {
      if (!fallback) return;
      try {
        this.product = JSON.parse(decodeURIComponent(fallback));
      } catch (err) {
        console.error('解析商品兜底数据失败', err);
      }
    },

    /**
     * 搜索相似商品。
     * Agent 设计点：
     * 比价属于外部工具调用。用户看到单品后自动搜索相似商品，帮助发现更优价格或替代品。
     * 结果来自搜索 MCP，由云函数隐藏密钥和归一化。
     */
    async searchSimilar() {
      const query = this.product.query || this.product.title || '';
      if (!query) return;

      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/priceSearch.search',
          data: { query, clothing: this.product },
          loading: false,
        });
        this.similarItems = (res.rows || []).slice(0, 6);
      } catch (err) {
        console.error('搜索相似商品失败', err);
      }
    },

    /**
     * 收藏/取消收藏商品。
     * Agent 设计点：
     * 商品收藏代表"可能购买/想比较"的商业意图，后续用于价格提醒、搭配补齐和带货转化。
     */
    async toggleFavorite() {
      try {
        await vk.callFunction({
          url: 'client/wardrobe/commerce.favoriteProduct',
          data: { product: this.product, status: this.isFavorited ? 'inactive' : 'active' },
          loading: false,
        });
        this.isFavorited = !this.isFavorited;
        uni.showToast({ title: this.isFavorited ? '已收藏' : '已取消', icon: 'none' });
      } catch (err) {
        console.error('收藏操作失败', err);
      }
    },

    /**
     * 设置价格追踪。
     * Agent 设计点：
     * 价格追踪把"一次搜索"变成"持续商业机会"。记录目标价格后，
     * 后续定时任务可对比当前价格并在降价时通知用户。
     */
    async trackPrice() {
      if (!this.targetPrice || this.tracking) return;
      this.tracking = true;

      try {
        await vk.callFunction({
          url: 'client/wardrobe/commerce.trackPrice',
          data: {
            product: this.product,
            target_price: this.targetPrice,
          },
          loading: false,
        });
        uni.showToast({ title: '价格追踪已设置', icon: 'success' });
        this.targetPrice = '';
        this.loadTrackRecords();
      } catch (err) {
        console.error('设置价格追踪失败', err);
        uni.showToast({ title: '设置失败', icon: 'none' });
      } finally {
        this.tracking = false;
      }
    },

    /**
     * 读取价格追踪记录。
     * Agent 设计点：
     * 追踪记录是用户的商业意图台账，显示用户对哪些商品设置了目标价。
     */
    async loadTrackRecords() {
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/commerce.priceTracks',
          data: {
            product_key: this.product.product_key,
            url: this.product.url,
          },
          loading: false,
        });
        this.trackRecords = res.rows || [];

        const favoriteRes = await vk.callFunction({
          url: 'client/wardrobe/commerce.favorites',
          data: {},
          loading: false,
        });
        const products = favoriteRes.products || [];
        this.isFavorited = products.some((p) => p.product_key === this.product.product_key || p.url === this.product.url);
      } catch (err) {
        console.error('读取追踪记录失败', err);
      }
    },

    openProductUrl() {
      const url = this.product.url;
      if (!url) { uni.showToast({ title: '暂无购买链接', icon: 'none' }); return; }
      // #ifdef H5
      window.open(url, '_blank');
      // #endif
      // #ifdef MP-WEIXIN
      uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '链接已复制', icon: 'none' }) });
      // #endif
    },

    openUrl(url) {
      if (!url) return;
      // #ifdef H5
      window.open(url, '_blank');
      // #endif
      // #ifdef MP-WEIXIN
      uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '链接已复制', icon: 'none' }) });
      // #endif
    },

    formatDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
  },
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh; box-sizing: border-box; padding: 32rpx 32rpx 80rpx;
  background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
}
.hero-img { width: 100%; height: 500rpx; border-radius: 28rpx; background: #f1e4d6; }
.img-empty {
  display: flex; width: 100%; height: 300rpx; align-items: center; justify-content: center;
  border-radius: 28rpx; background: #f1e4d6; color: var(--wardrobe-muted); font-size: 26rpx;
}

.info-panel, .action-panel {
  margin-top: 24rpx; padding: 30rpx; border: 1rpx solid var(--wardrobe-border);
  border-radius: 24rpx; background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow);
}
.product-title { color: var(--wardrobe-text); font-size: 34rpx; font-weight: 700; line-height: 1.4; }
.price-line { display: flex; align-items: baseline; margin-top: 14rpx; }
.price { color: #d56f50; font-size: 38rpx; font-weight: 800; }
.platform { margin-left: 16rpx; color: var(--wardrobe-muted); font-size: 24rpx; }
.summary { margin-top: 16rpx; color: var(--wardrobe-muted); font-size: 26rpx; line-height: 1.5; }

.action-row { display: flex; gap: 16rpx; }
.buy-btn, .fav-btn {
  flex: 1; height: 80rpx; border-radius: 999rpx; font-size: 27rpx; line-height: 80rpx;
}
.buy-btn {
  background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
  color: #fff; box-shadow: 0 14rpx 28rpx rgba(101, 73, 50, 0.16);
}
.fav-btn { border: 1rpx solid var(--wardrobe-border); background: var(--wardrobe-surface-solid); color: var(--wardrobe-text); }
.fav-btn.active { border-color: #d56f50; background: #fff3e8; color: #d56f50; }

.track-section { margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid var(--wardrobe-border); }
.track-title { color: var(--wardrobe-text); font-size: 28rpx; font-weight: 600; margin-bottom: 14rpx; }
.track-row { display: flex; gap: 12rpx; }
.track-input {
  flex: 1; height: 72rpx; padding: 0 20rpx; border: 1rpx solid var(--wardrobe-border);
  border-radius: 999rpx; background: var(--wardrobe-surface-solid); font-size: 26rpx;
}
.track-btn {
  width: 180rpx; height: 72rpx; border-radius: 999rpx;
  background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
  color: #fff; font-size: 24rpx; line-height: 72rpx;
}
.track-list { margin-top: 16rpx; }
.track-item { display: flex; justify-content: space-between; padding: 12rpx 0; color: var(--wardrobe-muted); font-size: 24rpx; }
.track-date { color: #9c8c82; }

.section-title { margin: 32rpx 0 18rpx; color: var(--wardrobe-text); font-size: 32rpx; font-weight: 800; }
.similar-card {
  display: flex; align-items: center; margin-bottom: 16rpx; padding: 20rpx;
  border: 1rpx solid var(--wardrobe-border); border-radius: 20rpx;
  background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow);
}
.similar-img { width: 120rpx; height: 120rpx; flex: 0 0 120rpx; border-radius: 14rpx; background: #f1e4d6; }
.similar-info { flex: 1; min-width: 0; margin-left: 18rpx; }
.similar-title { color: var(--wardrobe-text); font-size: 27rpx; font-weight: 600; line-height: 1.35; }
.similar-price { margin-top: 6rpx; color: var(--wardrobe-muted); font-size: 23rpx; }
.similar-arrow { color: var(--wardrobe-muted); font-size: 36rpx; margin-left: 12rpx; }
.empty { color: var(--wardrobe-muted); font-size: 25rpx; text-align: center; margin-top: 40rpx; }
</style>
