<template>
	<view class="page">


		<!-- 当前会员状态卡片 -->
		<view class="status-card" :class="member.plan">
			<view class="plan-badge">{{ member.plan_text }}</view>
			<view class="quota-grid">
				<view class="quota-item">
					<view class="quota-num">{{ member.tryon_quota_balance }}</view>
					<view class="quota-label">剩余试穿次数</view>
				</view>
				<view class="quota-item">
					<view class="quota-num">{{ member.closet_limit }}</view>
					<view class="quota-label">衣柜容量上限</view>
				</view>
				<view class="quota-item">
					<view class="quota-num">{{ member.price_tracking_limit }}</view>
					<view class="quota-label">价格追踪上限</view>
				</view>
			</view>
			<view v-if="member.expires_at" class="expire-line">会员有效期至 {{ formatDate(member.expires_at) }}</view>
		</view>

		<!-- 方案对比 -->
		<view class="section-title">方案对比</view>
		<view class="plan-list">
			<view v-for="plan in plans" :key="plan.key" class="plan-card"
				:class="{ current: plan.key === member.plan }">
				<view class="plan-header">
					<view class="plan-name">{{ plan.title }}</view>
					<view class="plan-price">{{ plan.price }}</view>
				</view>
				<view v-for="feat in plan.features" :key="feat" class="plan-feat">✓ {{ feat }}</view>
				<button v-if="plan.key !== member.plan && plan.key === 'pro'" class="activate-btn" :loading="activating"
					@click="activatePro">
					开通高级会员
				</button>
				<view v-else-if="plan.key === member.plan" class="current-tag">当前方案</view>
			</view>
		</view>

		<!-- 使用记录 -->
		<view class="section-title">试穿使用记录</view>
		<view v-if="tryonHistory.length">
			<view v-for="record in tryonHistory" :key="record._id" class="history-row">
				<view class="history-left">
					<view class="history-title">试穿记录</view>
					<view class="history-time">{{ formatDate(record.created_at) }}</view>
				</view>
				<view class="history-status" :class="record.status">
					{{ record.status === 'success' ? '已完成' : record.status === 'config_needed' ? '待配置' : '失败' }}
				</view>
			</view>
		</view>
		<view v-else class="empty-text">暂无试穿记录</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				member: {
					plan: 'free',
					plan_text: '免费版',
					tryon_quota_balance: 3,
					closet_limit: 80,
					price_tracking_limit: 5,
					premium_enabled: false,
					expires_at: '',
					hd_tryon_enabled: false
				},
				plans: [{
						key: 'free',
						title: '免费版',
						price: '免费',
						features: ['80 件衣柜容量', '基础 AI 搭配', '每月 3 次试穿', '5 个价格追踪']
					},
					{
						key: 'pro',
						title: '高级会员',
						price: '¥ 待定/月',
						features: ['1000 件衣柜容量', '高级 AI 搭配', '更多试穿额度', '100 个价格追踪', '高清试穿图']
					},
				],
				tryonHistory: [],
				activating: false,
			};
		},
		onShow() {
			vk = uni.vk;
			this.loadMember();
			this.loadTryonHistory();
		},
		methods: {
			/**
			 * 读取会员权益。
			 * Agent 设计点：
			 * 试穿、高清图、更多衣柜容量都是成本型 AI 能力，必须有权益和额度边界。
			 * 不接支付时先用 commerce.activatePlan 做开发期权益模拟。
			 */
			async loadMember() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/commerce.member',
						data: {},
						loading: false,
					});
					if (res.member) this.member = {
						...this.member,
						...res.member
					};
					if (res.plans) this.plans = res.plans;
				} catch (err) {
					console.error('读取会员信息失败', err);
				}
			},

			/**
			 * 读取试穿历史用于额度台账。
			 * Agent 设计点：
			 * 每次试穿消耗一次额度，用户需要看到使用记录才能理解额度去向。
			 */
			async loadTryonHistory() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/tryon.list',
						data: {},
						loading: false,
					});
					this.tryonHistory = (res.rows || []).slice(0, 20);
				} catch (err) {
					console.error('读取试穿历史失败', err);
				}
			},

			/**
			 * 开发期开通高级会员。
			 * Agent 设计点：
			 * 正式商业项目应由支付回调发放权益；当前保留服务端入口方便测试试穿额度扣减。
			 */
			async activatePro() {
				if (this.activating) return;
				this.activating = true;

				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/commerce.activatePlan',
						data: {
							plan: 'pro'
						},
						loading: false,
					});
					if (res.member) this.member = {
						...this.member,
						...res.member
					};
					uni.showToast({
						title: '已开通高级会员（开发模式）',
						icon: 'success'
					});
				} catch (err) {
					console.error('开通会员失败', err);
					uni.showToast({
						title: '开通失败',
						icon: 'none'
					});
				} finally {
					this.activating = false;
				}
			},

			formatDate(timestamp) {
				if (!timestamp) return '';
				const d = new Date(timestamp);
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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


	.status-card {
		margin-bottom: 32rpx;
		padding: 32rpx;
		border-radius: 24rpx;
		border: 1rpx solid var(--wardrobe-border);
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.status-card.pro {
		border-color: #d4a85c;
		background: linear-gradient(135deg, #fffdf5, #fff8e8);
	}

	.plan-badge {
		display: inline-block;
		padding: 8rpx 18rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-size: 24rpx;
		font-weight: 700;
	}

	.status-card.pro .plan-badge {
		background: linear-gradient(135deg, #d4a85c, #b8860b);
	}

	.quota-grid {
		display: flex;
		margin-top: 24rpx;
	}

	.quota-item {
		flex: 1;
		text-align: center;
	}

	.quota-num {
		color: var(--wardrobe-text);
		font-size: 48rpx;
		font-weight: 800;
		line-height: 1.2;
	}

	.quota-label {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
	}

	.expire-line {
		margin-top: 18rpx;
		padding-top: 16rpx;
		border-top: 1rpx solid var(--wardrobe-border);
		color: var(--wardrobe-muted);
		font-size: 24rpx;
	}

	.section-title {
		margin: 32rpx 0 18rpx;
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 800;
	}

	.plan-list {
		display: flex;
		gap: 18rpx;
	}

	.plan-card {
		flex: 1;
		padding: 28rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.plan-card.current {
		border-color: var(--wardrobe-primary);
	}

	.plan-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 16rpx;
	}

	.plan-name {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
	}

	.plan-price {
		color: var(--wardrobe-primary-deep);
		font-size: 26rpx;
		font-weight: 600;
	}

	.plan-feat {
		margin-top: 10rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
		line-height: 1.5;
	}

	.activate-btn {
		margin-top: 20rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, #d4a85c, #b8860b);
		color: #fff;
		font-size: 25rpx;
	}

	.current-tag {
		margin-top: 20rpx;
		padding: 14rpx;
		border-radius: 999rpx;
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-size: 23rpx;
		text-align: center;
	}

	.history-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22rpx 0;
		border-bottom: 1rpx solid var(--wardrobe-border);
	}

	.history-title {
		color: var(--wardrobe-text);
		font-size: 27rpx;
	}

	.history-time {
		margin-top: 6rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
	}

	.history-status {
		padding: 8rpx 14rpx;
		border-radius: 999rpx;
		font-size: 22rpx;
	}

	.history-status.success {
		background: #e8f5e9;
		color: #2e7d32;
	}

	.history-status.config_needed {
		background: #fff3e0;
		color: #e65100;
	}

	.history-status.failed {
		background: #fce4ec;
		color: #c62828;
	}

	.empty-text {
		margin-top: 20rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		text-align: center;
	}
</style>