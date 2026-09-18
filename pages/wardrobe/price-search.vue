<template>
	<view class="page">


		<view class="search-box">
			<input class="input" v-model="query" placeholder="例如 白色宽松短袖 T 恤" confirm-type="search"
				@confirm="searchPrice" />
			<button class="search-button" :loading="loading" :disabled="loading" @click="searchPrice">搜索</button>
		</view>

		<view v-if="configNeeded" class="notice">
			<text>比价服务暂不可用，请稍后再试。</text>
			<text class="notice-hint">你仍然可以先收藏衣物，稍后再回来查看相似商品。</text>
		</view>

		<view class="result-list">
			<view v-for="item in rows" :key="item.url || item.title" class="result-card" @click="goDetail(item)">
				<image v-if="item.image_url" class="product-image" :src="item.image_url" mode="aspectFill"></image>
				<view v-else class="product-image-empty"></view>
				<view class="product-info">
					<view class="product-title">{{ item.title }}</view>
					<view class="product-meta">{{ item.platform || '未知平台' }} · {{ item.price || '暂无价格' }}</view>
					<view v-if="item.summary" class="product-summary">{{ item.summary }}</view>
					<view class="product-actions">
						<view class="action-chip" @click.stop="favoriteProduct(item)">
							{{ isFavorited(item) ? '已收藏' : '收藏' }}
						</view>
						<view class="action-chip" @click.stop="quickTrack(item)">追踪价格</view>
					</view>
				</view>
			</view>
		</view>

		<!-- 最近搜索和追踪 -->
		<view class="section-title">价格追踪列表</view>
		<view v-if="trackList.length">
			<view v-for="record in trackList" :key="record._id" class="track-card" @click="goDetail(record)">
				<view class="track-title">{{ record.title || '未命名商品' }}</view>
				<view class="track-meta">
					目标价 ¥{{ record.target_price || '-' }} · {{ record.platform || '未知平台' }}
				</view>
			</view>
		</view>
		<view v-else class="empty-text">暂无价格追踪，搜索商品后可设置目标价。</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				query: '',
				loading: false,
				rows: [],
				configNeeded: false,
				favorites: [],
				trackList: [],
			};
		},
		onLoad(options = {}) {
			vk = uni.vk;
			if (options.query) this.query = decodeURIComponent(options.query);
		},
		onShow() {
			this.loadCommerceData();
		},
		methods: {
			/**
			 * 读取收藏和追踪数据。
			 * Agent 设计点：
			 * 收藏和追踪是用户的商业意图台账。每次进入比价页时刷新，
			 * 让搜索结果的"已收藏/追踪"状态保持正确。
			 */
			async loadCommerceData() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/commerce.favorites',
						data: {},
						loading: false,
					});
					this.favorites = (res.products || []).filter((p) => p.status === 'active');
					const trackRes = await vk.callFunction({
						url: 'client/wardrobe/commerce.priceTracks',
						data: {},
						loading: false,
					});
					this.trackList = trackRes.rows || [];
				} catch (err) {
					/* 非关键数据，静默失败 */
				}
			},

			/**
			 * 搜索相似单品价格。
			 * Agent 设计点：
			 * 比价是外部工具调用，用户只看到搜索结果。
			 * 服务端负责调用外部搜索服务、归一化字段和隐藏密钥。
			 */
			async searchPrice() {
				if (!this.query.trim()) {
					uni.showToast({
						title: '请输入关键词',
						icon: 'none'
					});
					return;
				}

				this.loading = true;
				this.configNeeded = false;

				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/priceSearch.search',
						data: {
							query: this.query.trim()
						},
						loading: false,
					});
					this.rows = res.rows || [];
					this.configNeeded = Boolean(res.config_needed);
					if (!this.rows.length) {
						uni.showToast({
							title: res.msg || '暂无结果',
							icon: 'none'
						});
					}
				} catch (err) {
					console.error('全网比价失败', err);
					uni.showToast({
						title: '搜索失败',
						icon: 'none'
					});
				} finally {
					this.loading = false;
				}
			},

			/**
			 * 收藏/取消收藏商品。
			 * Agent 设计点：
			 * 收藏代表"可能购买/想比较"的商业意图，后续用于价格提醒和搭配补齐。
			 */
			async favoriteProduct(item) {
				try {
					const already = this.isFavorited(item);
					await vk.callFunction({
						url: 'client/wardrobe/commerce.favoriteProduct',
						data: {
							product: {
								...item,
								product_key: item.url || item.title,
							},
							status: already ? 'inactive' : 'active',
						},
						loading: false,
					});
					this.loadCommerceData();
					uni.showToast({
						title: already ? '已取消收藏' : '已收藏',
						icon: 'none'
					});
				} catch (err) {
					console.error('收藏操作失败', err);
				}
			},

			/**
			 * 快速设置价格追踪。
			 * Agent 设计点：
			 * 快速追踪不给目标价，先把商品加入追踪列表；
			 * 用户可在详情页设置具体目标价格。
			 */
			async quickTrack(item) {
				try {
					await vk.callFunction({
						url: 'client/wardrobe/commerce.trackPrice',
						data: {
							product: item,
							target_price: ''
						},
						loading: false,
					});
					this.loadCommerceData();
					uni.showToast({
						title: '已加入追踪',
						icon: 'success'
					});
				} catch (err) {
					console.error('设置追踪失败', err);
				}
			},

			isFavorited(item) {
				const key = item.url || item.title;
				return this.favorites.some((f) => f.product_key === key || f.url === key);
			},

			/**
			 * 跳转商品详情页。
			 * Agent 设计点：
			 * 商品详情页提供完整的购买、收藏、追踪和相似商品展示，
			 * 是商业闭环的核心落地页。
			 */
			goDetail(item) {
				const encoded = encodeURIComponent(JSON.stringify(item));
				uni.navigateTo({
					url: `/pages/wardrobe/price-detail?fallback=${encoded}`
				});
			},
		},
	};
</script>

<style lang="scss" scoped>
	.page {
		min-height: 100vh;
		box-sizing: border-box;
		padding: 40rpx 28rpx 80rpx;
		background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
	}



	.search-box {
		display: flex;
		margin-top: 28rpx;
	}

	.input {
		height: 82rpx;
		flex: 1;
		box-sizing: border-box;
		padding: 0 24rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-text);
		font-size: 27rpx;
	}

	.search-button {
		width: 150rpx;
		height: 82rpx;
		margin: 0 0 0 16rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		box-shadow: 0 14rpx 28rpx rgba(101, 73, 50, 0.16);
		font-size: 27rpx;
		line-height: 82rpx;
	}

	.notice {
		margin-top: 22rpx;
		padding: 22rpx;
		border-radius: 14rpx;
		background: #fff3e8;
		color: #8b6728;
		font-size: 25rpx;
		line-height: 1.5;
	}

	.notice-hint {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #a68d6d;
	}

	.result-card {
		display: flex;
		margin-top: 22rpx;
		padding: 22rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 22rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.product-image {
		width: 150rpx;
		height: 150rpx;
		flex: 0 0 150rpx;
		border-radius: 14rpx;
		background: #f1e4d6;
	}

	.product-image-empty {
		width: 150rpx;
		height: 150rpx;
		flex: 0 0 150rpx;
		border-radius: 14rpx;
		background: #f1e4d6;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.product-info {
		min-width: 0;
		flex: 1;
		margin-left: 20rpx;
	}

	.product-title {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		font-weight: 700;
		line-height: 1.4;
	}

	.product-meta,
	.product-summary {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.45;
	}

	.product-actions {
		display: flex;
		margin-top: 14rpx;
		gap: 12rpx;
	}

	.action-chip {
		padding: 8rpx 14rpx;
		border-radius: 999rpx;
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-size: 22rpx;
	}

	.section-title {
		margin: 40rpx 0 18rpx;
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 800;
	}

	.track-card {
		margin-bottom: 16rpx;
		padding: 22rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 20rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.track-title {
		color: var(--wardrobe-text);
		font-size: 27rpx;
		font-weight: 600;
	}

	.track-meta {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
	}

	.empty-text {
		margin-top: 20rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		text-align: center;
	}
</style>