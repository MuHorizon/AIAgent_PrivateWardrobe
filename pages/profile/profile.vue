<template>
	<view class="page">
		<view class="account-card">
			<view class="avatar-placeholder">我</view>
			<view class="account-copy">
				<view class="account-name">我的私人衣橱</view>
				<view class="account-desc">{{ profileSummary }}</view>
			</view>
		</view>

		<view class="menu-section">
			<view v-for="entry in menuEntries" :key="entry.key" class="menu-row" @click="handleMenu(entry)">
				<view>
					<view class="menu-title">{{ entry.title }}</view>
					<view class="menu-desc">{{ entry.desc }}</view>
				</view>

			</view>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;
	const STORAGE_KEY = 'ai_private_wardrobe_user_profile';

	export default {
		data() {
			return {
				menuEntries: [{
						key: 'profile',
						title: '穿衣画像',
						desc: '完善身高、体型、风格和颜色偏好，AI 搭配更合身。',
						pageUrl: '/pages/wardrobe/profile-edit',
					},
					{
						key: 'history',
						title: '穿搭历史',
						desc: '回看生成过、穿过和不喜欢的搭配。',
						pageUrl: '/pages/wardrobe/outfit-history',
					},
					{
						key: 'favorite',
						title: '收藏',
						desc: '保存值得复穿的搭配方案。',
						pageUrl: '/pages/wardrobe/favorites',
					},
					{
						key: 'member',
						title: '会员',
						desc: '管理试穿次数、衣柜容量和高级能力。',
						pageUrl: '/pages/wardrobe/member',
					},
					{
						key: 'settings',
						title: '设置',
						desc: '账号、安全和通知偏好。',
						pageUrl: '/pages/wardrobe/settings',
					},
				],
				profile: {
					gender: '',
					preferred_styles: [],
				},
			};
		},
		computed: {
			profileSummary() {
				const styles = this.profile.preferred_styles || [];
				if (!styles.length) return '完善偏好后，AI 会更懂你的日常穿搭。';
				return `偏好 ${styles.slice(0, 3).join('、')}`;
			},
		},
		onLoad() {
			vk = uni.vk;
		},
		onShow() {
			this.loadProfileSummary();
		},
		methods: {
			/**
			 * 读取画像摘要用于展示在账户卡片下方。
			 * Agent 设计点：只加载必要字段，完整编辑在 profile-edit 页面。
			 */
			async loadProfileSummary() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/profile.get',
						data: {},
						loading: false,
					});
					if (res.profile) {
						this.profile = res.profile;
						uni.setStorageSync(STORAGE_KEY, res.profile);
						return;
					}
				} catch (err) {
					console.error('读取画像摘要失败', err);
				}

				const local = uni.getStorageSync(STORAGE_KEY);
				if (local) this.profile = local;
			},

			handleMenu(entry) {
				if (entry.pageUrl) {
					uni.navigateTo({
						url: entry.pageUrl
					});
					return;
				}
				uni.showToast({
					title: '入口未配置',
					icon: 'none'
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


	.account-card {
		display: flex;
		align-items: center;
		margin-bottom: 24rpx;
		padding: 30rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.avatar-placeholder {
		display: flex;
		width: 96rpx;
		height: 96rpx;
		flex: 0 0 96rpx;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: #f1e4d6;
		color: var(--wardrobe-text);
		font-size: 34rpx;
		font-weight: 800;
	}

	.account-copy {
		min-width: 0;
		flex: 1;
		margin-left: 22rpx;
	}

	.account-name {
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 780;
		line-height: 1.35;
	}

	.account-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.45;
	}

	.menu-section {
		padding: 8rpx 28rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.menu-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24rpx 0;
		border-bottom: 1rpx solid var(--wardrobe-border);
	}

	.menu-row:last-child {
		border-bottom: 0;
	}

	.menu-title {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		font-weight: 720;
		line-height: 1.35;
	}

	.menu-desc {
		margin-top: 6rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
		line-height: 1.4;
	}
</style>