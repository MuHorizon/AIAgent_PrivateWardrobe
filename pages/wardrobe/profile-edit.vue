<template>
	<view class="page">



		<!-- 问题 1：性别（必填） -->
		<view class="card">
			<view class="q-header">
				<view class="q-num">1</view>
				<view class="q-title">你的性别</view>
				<view class="q-required">必填</view>
			</view>
			<view class="q-desc">男装和女装的推荐逻辑差异较大，这是 AI 搭配的基础约束。</view>
			<view class="option-row">
				<view v-for="opt in genderOptions" :key="opt" class="option-btn"
					:class="{ active: profile.gender === opt }" @click="profile.gender = opt">
					{{ opt }}
				</view>
			</view>
		</view>

		<!-- 问题 2：身高（建议） -->
		<view class="card">
			<view class="q-header">
				<view class="q-num">2</view>
				<view class="q-title">你的身高</view>
				<view class="q-suggest">建议</view>
			</view>
			<view class="q-desc">影响裤长推荐、版型建议和上下身比例搭配。不确定可以跳过。</view>
			<view class="height-row">
				<input class="height-input" type="number" v-model="profile.height" placeholder="例如 168"
					placeholder-class="placeholder" />
				<text class="unit">cm</text>
			</view>
		</view>

		<!-- 问题 3：AI 服务偏好（可选多选） -->
		<view class="card">
			<view class="q-header">
				<view class="q-num">3</view>
				<view class="q-title">你希望 AI 怎么帮助你？</view>
				<view class="q-optional">可选</view>
			</view>
			<view class="q-desc">可多选，AI 会根据你的选择调整主动推送的内容。</view>
			<view class="option-grid">
				<view v-for="opt in serviceOptions" :key="opt.key" class="service-card"
					:class="{ active: profile.service_preferences.includes(opt.key) }" @click="toggleService(opt.key)">
					<view class="service-icon">{{ opt.icon }}</view>
					<view class="service-title">{{ opt.title }}</view>
					<view class="service-desc">{{ opt.desc }}</view>
				</view>
			</view>
		</view>

		<button class="save-button" type="primary" :loading="saving" :disabled="saving" @click="saveProfile">
			保存画像
		</button>

		<!-- 跳转隐式画像 -->
		<view class="implicit-link" @click="goImplicitProfile">
			查看 AI 从你的穿搭中学会了什么 <text>›</text>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				genderOptions: ['女', '男'],
				serviceOptions: [{
						key: 'daily_outfit',
						icon: '👔',
						title: '每日搭配',
						desc: '根据天气和场景每日推荐穿搭'
					},
					{
						key: 'wardrobe_manage',
						icon: '📦',
						title: '管理衣橱',
						desc: '发现闲置衣物，优化衣柜结构'
					},
					{
						key: 'style_upgrade',
						icon: '✨',
						title: '提升风格',
						desc: '尝试新搭配，突破固有穿搭习惯'
					},
				],
				saving: false,
				profile: {
					gender: '',
					height: '',
					service_preferences: [],
				},
			};
		},
		onLoad() {
			vk = uni.vk;
			this.loadProfile();
		},
		methods: {
			/**
			 * 读取当前显式画像。
			 * Agent 设计点：只加载用户主动填写的 3 个字段，隐式画像由 aiProfile.get 单独加载。
			 */
			async loadProfile() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/profile.get',
						data: {},
						loading: false,
					});
					if (res.profile) {
						this.profile.gender = res.profile.gender || '';
						this.profile.height = res.profile.height || '';
						this.profile.service_preferences = res.profile.service_preferences || [];
					}
				} catch (err) {
					console.error('读取画像失败', err);
				}
			},

			toggleService(key) {
				const idx = this.profile.service_preferences.indexOf(key);
				if (idx > -1) this.profile.service_preferences.splice(idx, 1);
				else this.profile.service_preferences.push(key);
			},

			async saveProfile() {
				if (!this.profile.gender) {
					uni.showToast({
						title: '请选择性别',
						icon: 'none'
					});
					return;
				}
				if (this.saving) return;
				this.saving = true;

				try {
					await vk.callFunction({
						url: 'client/wardrobe/profile.save',
						data: {
							profile: this.profile
						},
						loading: false,
					});
					uni.showToast({
						title: '画像已保存',
						icon: 'success'
					});
				} catch (err) {
					console.error('保存画像失败', err);
					uni.showToast({
						title: '保存失败，请重试',
						icon: 'none'
					});
				} finally {
					this.saving = false;
				}
			},

			goImplicitProfile() {
				uni.navigateTo({
					url: '/pages/wardrobe/implicit-profile'
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

	.card {
		margin-bottom: 24rpx;
		padding: 30rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.q-header {
		display: flex;
		align-items: center;
		margin-bottom: 10rpx;
	}

	.q-num {
		width: 44rpx;
		height: 44rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-size: 24rpx;
		font-weight: 700;
		text-align: center;
		line-height: 44rpx;
		margin-right: 14rpx;
		flex-shrink: 0;
	}

	.q-title {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		flex: 1;
	}

	.q-required {
		font-size: 22rpx;
		padding: 4rpx 10rpx;
		border-radius: 999rpx;
		background: #fce4ec;
		color: #c62828;
	}

	.q-suggest {
		font-size: 22rpx;
		padding: 4rpx 10rpx;
		border-radius: 999rpx;
		background: #e8f5e9;
		color: #2e7d32;
	}

	.q-optional {
		font-size: 22rpx;
		padding: 4rpx 10rpx;
		border-radius: 999rpx;
		background: #f5f5f5;
		color: #9e9e9e;
	}

	.q-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
		margin-bottom: 18rpx;
	}

	.option-row {
		display: flex;
		gap: 16rpx;
	}

	.option-btn {
		flex: 1;
		height: 80rpx;
		border: 2rpx solid var(--wardrobe-border);
		border-radius: 20rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 600;
		text-align: center;
		line-height: 80rpx;
	}

	.option-btn.active {
		border-color: var(--wardrobe-primary);
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
	}

	.height-row {
		display: flex;
		align-items: center;
	}

	.height-input {
		width: 200rpx;
		height: 80rpx;
		padding: 0 24rpx;
		border: 2rpx solid var(--wardrobe-border);
		border-radius: 20rpx;
		background: var(--wardrobe-surface-solid);
		font-size: 30rpx;
		font-weight: 600;
		text-align: center;
	}

	.unit {
		margin-left: 14rpx;
		color: var(--wardrobe-muted);
		font-size: 28rpx;
	}

	.placeholder {
		color: #b8a79b;
		font-weight: 400;
	}

	.option-grid {
		display: flex;
		flex-direction: column;
		gap: 14rpx;
	}

	.service-card {
		padding: 22rpx;
		border: 2rpx solid var(--wardrobe-border);
		border-radius: 18rpx;
		background: var(--wardrobe-surface-solid);
		display: flex;
		align-items: center;
	}

	.service-card.active {
		border-color: var(--wardrobe-primary);
		background: #fff3e8;
	}

	.service-icon {
		font-size: 40rpx;
		margin-right: 18rpx;
	}

	.service-title {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		font-weight: 600;
	}

	.service-desc {
		color: var(--wardrobe-muted);
		font-size: 23rpx;
		margin-top: 4rpx;
		flex: 1;
	}

	.save-button {
		margin-top: 30rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		box-shadow: 0 18rpx 36rpx rgba(101, 73, 50, 0.16);
	}

	.implicit-link {
		margin-top: 30rpx;
		text-align: center;
		color: var(--wardrobe-primary-deep);
		font-size: 26rpx;
	}
</style>