<template>
	<view class="page">


		<view v-if="records.length">
			<view v-for="record in records" :key="record._id" class="history-card">
				<view class="history-title">{{ record.title }}</view>
				<view class="history-meta">{{ record.scene || '日常' }} · {{ formatTime(record.created_at) }}</view>
				<view class="history-reason">{{ record.reason }}</view>
				<view class="badge-row">
					<view v-if="record.is_favorite" class="badge">已收藏</view>
					<view v-if="record.worn_date" class="badge">已穿 {{ record.worn_date }}</view>
					<view v-if="record.feedback === 'disliked'" class="badge muted">不喜欢</view>
				</view>
			</view>
		</view>

		<view v-else class="empty">
			<view class="empty-title">暂无历史</view>
			<button class="primary-button" type="primary" @click="goOutfit">去生成搭配</button>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				records: [],
			};
		},
		onShow() {
			vk = uni.vk;
			this.loadHistory();
		},
		methods: {
			/**
			 * 读取穿搭历史。
			 * 历史和反馈是后续 Memory 更新的数据来源，但当前只做普通列表展示。
			 */
			async loadHistory() {
				try {
					const res = await this.callOutfitApi('client/wardrobe/outfit.list');
					this.records = res.rows || [];
				} catch (err) {
					console.error('读取穿搭历史失败', err);
					uni.showToast({
						title: '读取失败',
						icon: 'none',
					});
				}
			},
			formatTime(timestamp) {
				if (!timestamp) return '';
				const date = new Date(timestamp);
				return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
			},
			pad(value) {
				return value < 10 ? `0${value}` : `${value}`;
			},
			goOutfit() {
				uni.navigateTo({
					url: '/pages/wardrobe/outfit',
				});
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


	.history-card,
	.empty {
		margin-bottom: 20rpx;
		padding: 30rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.history-title {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		line-height: 1.35;
	}

	.history-meta {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.4;
	}

	.history-reason {
		margin-top: 14rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.badge-row {
		display: flex;
		flex-wrap: wrap;
		margin-top: 16rpx;
	}

	.badge {
		margin-right: 10rpx;
		margin-bottom: 10rpx;
		padding: 8rpx 12rpx;
		border-radius: 999rpx;
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-size: 22rpx;
		line-height: 1.2;
	}

	.badge.muted {
		background: #f7eee4;
		color: var(--wardrobe-muted);
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