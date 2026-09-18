<template>
	<view class="page">


		<view class="tab-row">
			<view v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: activeTab === tab.key }"
				@click="activeTab = tab.key">
				{{ tab.label }}
			</view>
		</view>

		<!-- 收藏的穿搭 -->
		<view v-if="activeTab === 'outfits'">
			<view v-if="outfits.length">
				<view v-for="record in outfits" :key="record._id" class="card" @click="goOutfitDetail(record)">
					<view class="card-title">{{ record.title }}</view>
					<view class="card-meta">{{ record.scene || '日常' }} · {{ record.weather || '未记录天气' }}</view>
					<view class="card-reason">{{ record.reason }}</view>
					<view v-if="record.outfit_items && record.outfit_items.length" class="item-row">
						<view v-for="item in record.outfit_items" :key="item._id" class="item-chip">{{ item.name }}
						</view>
					</view>
					<view class="card-footer">
						<view class="score">匹配 {{ record.score || '-' }} 分</view>
						<view class="unfavorite-btn" @click.stop="unfavoriteOutfit(record)">取消收藏</view>
					</view>
				</view>
			</view>
			<view v-else class="empty">还没有收藏穿搭，去生成一套搭配试试。</view>
		</view>

		<!-- 收藏的商品 -->
		<view v-if="activeTab === 'products'">
			<view v-if="products.length">
				<view v-for="product in products" :key="product._id" class="card" @click="goProductDetail(product)">
					<image v-if="product.image_url" class="product-img" :src="product.image_url" mode="aspectFill">
					</image>
					<view class="card-title">{{ product.title || '未命名商品' }}</view>
					<view class="card-meta">{{ product.platform || '未知平台' }} · {{ product.price || '暂无价格' }}</view>
					<view v-if="product.summary" class="card-reason">{{ product.summary }}</view>
					<view class="card-footer">
						<view v-if="product.url" class="buy-link" @click.stop="openProductUrl(product.url)">去购买</view>
						<view class="unfavorite-btn" @click.stop="unfavoriteProduct(product)">取消收藏</view>
					</view>
				</view>
			</view>
			<view v-else class="empty">还没有收藏商品，去比价页搜一搜。</view>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				activeTab: 'outfits',
				tabs: [{
						key: 'outfits',
						label: '穿搭'
					},
					{
						key: 'products',
						label: '商品'
					},
				],
				outfits: [],
				products: [],
				loading: false,
			};
		},
		onShow() {
			vk = uni.vk;
			this.loadFavorites();
		},
		methods: {
			/**
			 * 读取收藏内容。
			 * Agent 设计点：
			 * 收藏是用户显式正反馈。穿搭收藏会进入推荐 Memory，商品收藏会进入购物意图 Memory。
			 * 这里把两类收藏分 tab 展示，方便用户管理品味资产。
			 */
			async loadFavorites() {
				if (this.loading) return;
				this.loading = true;

				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/commerce.favorites',
						data: {},
						loading: false,
					});
					this.outfits = res.outfits || [];
					this.products = res.products || [];
				} catch (err) {
					console.error('读取收藏失败', err);
					uni.showToast({
						title: '读取失败',
						icon: 'none'
					});
				} finally {
					this.loading = false;
				}
			},

			/**
			 * 取消收藏穿搭。
			 * Agent 设计点：
			 * 取消收藏是负反馈信号，应从推荐 Memory 中降低该搭配中单品和风格的权重。
			 */
			async unfavoriteOutfit(record) {
				try {
					await vk.callFunction({
						url: 'client/wardrobe/outfit.feedback',
						data: {
							_id: record._id,
							is_favorite: false
						},
						loading: false,
					});
					this.outfits = this.outfits.filter((item) => item._id !== record._id);
					uni.showToast({
						title: '已取消收藏',
						icon: 'none'
					});
				} catch (err) {
					console.error('取消收藏失败', err);
				}
			},

			/**
			 * 取消收藏商品。
			 * Agent 设计点：
			 * 商品取消收藏意味着购买意图减弱，应从价格提醒和搭配补齐推荐中移除该商品。
			 */
			async unfavoriteProduct(product) {
				try {
					await vk.callFunction({
						url: 'client/wardrobe/commerce.favoriteProduct',
						data: {
							product,
							status: 'inactive'
						},
						loading: false,
					});
					this.products = this.products.filter((item) => item._id !== product._id);
					uni.showToast({
						title: '已取消收藏',
						icon: 'none'
					});
				} catch (err) {
					console.error('取消收藏失败', err);
				}
			},

			goOutfitDetail(record) {
				uni.navigateTo({
					url: `/pages/wardrobe/outfit-result?id=${record._id}`
				});
			},

			goProductDetail(product) {
				const encoded = encodeURIComponent(JSON.stringify(product));
				uni.navigateTo({
					url: `/pages/wardrobe/price-detail?fallback=${encoded}`
				});
			},

			openProductUrl(url) {
				// #ifdef H5
				window.open(url, '_blank');
				// #endif
				// #ifdef MP-WEIXIN
				uni.setClipboardData({
					data: url,
					success: () => {
						uni.showToast({
							title: '链接已复制',
							icon: 'none'
						});
					}
				});
				// #endif
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



	.tab-row {
		display: flex;
		margin-bottom: 24rpx;
	}

	.tab {
		min-width: 140rpx;
		padding: 18rpx 28rpx;
		margin-right: 16rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface);
		color: #8f7c70;
		font-size: 26rpx;
		text-align: center;
	}

	.tab.active {
		border-color: var(--wardrobe-primary);
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-weight: 600;
	}

	.card {
		margin-bottom: 20rpx;
		padding: 28rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.card-title {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		line-height: 1.35;
	}

	.card-meta {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.4;
	}

	.card-reason {
		margin-top: 12rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.product-img {
		width: 100%;
		height: 320rpx;
		border-radius: 16rpx;
		background: #f1e4d6;
		margin-bottom: 16rpx;
	}

	.item-row {
		display: flex;
		flex-wrap: wrap;
		margin-top: 14rpx;
	}

	.item-chip {
		margin-right: 10rpx;
		margin-bottom: 10rpx;
		padding: 8rpx 12rpx;
		border-radius: 999rpx;
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-size: 22rpx;
		line-height: 1.2;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 18rpx;
		padding-top: 16rpx;
		border-top: 1rpx solid var(--wardrobe-border);
	}

	.score {
		color: var(--wardrobe-primary-deep);
		font-size: 24rpx;
		font-weight: 600;
	}

	.buy-link {
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-size: 23rpx;
	}

	.unfavorite-btn {
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		background: #f7eee4;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
	}

	.empty {
		margin-top: 60rpx;
		text-align: center;
		color: var(--wardrobe-muted);
		font-size: 27rpx;
	}
</style>