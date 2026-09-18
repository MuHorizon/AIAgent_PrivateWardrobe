<template>
	<view class="page">


		<view class="section">
			<view class="section-label">AI 学习</view>
			<view class="setting-row">
				<view class="setting-left">
					<view class="setting-title">长期记忆学习</view>
					<view class="setting-desc">允许 AI 根据你的收藏、穿过和不喜欢的搭配持续优化推荐。</view>
				</view>
				<switch :checked="settings.memory_learning_enabled" @change="toggleMemory" color="#d56f50" />
			</view>
		</view>

		<view class="section">
			<view class="section-label">通知偏好</view>
			<view class="setting-row">
				<view class="setting-left">
					<view class="setting-title">每日穿搭提醒</view>
					<view class="setting-desc">每天早上根据天气和衣柜推荐今日搭配。</view>
				</view>
				<switch :checked="settings.daily_reminder_enabled" @change="toggleDailyReminder" color="#d56f50" />
			</view>
			<view class="setting-row">
				<view class="setting-left">
					<view class="setting-title">价格变动提醒</view>
					<view class="setting-desc">追踪收藏商品价格变化时发送通知。</view>
				</view>
				<switch :checked="settings.price_alert_enabled" @change="togglePriceAlert" color="#d56f50" />
			</view>
		</view>

		<view class="section">
			<view class="section-label">隐私</view>
			<view class="setting-row">
				<view class="setting-left">
					<view class="setting-title">隐私图片模式</view>
					<view class="setting-desc">开启后试穿图和衣柜图片仅本人可见，不参与模型训练。</view>
				</view>
				<switch :checked="settings.private_image_mode" @change="togglePrivateImage" color="#d56f50" />
			</view>
		</view>

		<view v-if="showDebugEntry" class="section">
			<view class="section-label">调试入口</view>
			<view class="setting-row" @click="goAiDebug">
				<view class="setting-left">
					<view class="setting-title">AI 调试</view>
					<view class="setting-desc">查看 AI 配置状态、最近任务日志和模型输出。</view>
				</view>
				<view class="arrow">›</view>
			</view>
		</view>

		<button class="save-btn" :loading="saving" @click="saveAll">保存设置</button>
	</view>
</template>

<script>
	import config from '@/app.config.js';

	let vk = uni.vk;

	export default {
		data() {
			return {
				settings: {
					memory_learning_enabled: true,
					daily_reminder_enabled: true,
					price_alert_enabled: true,
					private_image_mode: false,
				},
				saving: false,
			};
		},
		computed: {
			showDebugEntry() {
				return Boolean(config.debug);
			},
		},
		onLoad() {
			vk = uni.vk;
			this.loadSettings();
		},
		methods: {
			/**
			 * 读取用户设置。
			 * Agent 设计点：
			 * 设置页不仅是 UI 开关。通知、隐私、数据使用授权决定 Agent 能否主动提醒、
			 * 是否能使用历史反馈做长期记忆。
			 */
			async loadSettings() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/commerce.settings',
						data: {},
						loading: false,
					});
					if (res.settings) this.settings = {
						...this.settings,
						...res.settings
					};
				} catch (err) {
					console.error('读取设置失败', err);
				}
			},

			toggleMemory(e) {
				this.settings.memory_learning_enabled = e.detail.value;
			},
			toggleDailyReminder(e) {
				this.settings.daily_reminder_enabled = e.detail.value;
			},
			togglePriceAlert(e) {
				this.settings.price_alert_enabled = e.detail.value;
			},
			togglePrivateImage(e) {
				this.settings.private_image_mode = e.detail.value;
			},

			/**
			 * 保存设置。
			 * Agent 设计点：
			 * memory_learning_enabled 关闭时，推荐 Agent 不应继续把反馈压缩进偏好字段。
			 * 但仍可保留历史穿搭记录作为浏览用途。
			 */
			async saveAll() {
				if (this.saving) return;
				this.saving = true;

				try {
					await vk.callFunction({
						url: 'client/wardrobe/commerce.saveSettings',
						data: {
							settings: this.settings
						},
						loading: false,
					});
					uni.showToast({
						title: '设置已保存',
						icon: 'success'
					});
				} catch (err) {
					console.error('保存设置失败', err);
					uni.showToast({
						title: '保存失败',
						icon: 'none'
					});
				} finally {
					this.saving = false;
				}
			},

			goAiDebug() {
				uni.navigateTo({
					url: '/pages/wardrobe/ai-debug'
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

	.section {
		margin-bottom: 8rpx;
		padding: 10rpx 28rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.section-label {
		padding: 16rpx 0 10rpx;
		color: var(--wardrobe-plum);
		font-size: 25rpx;
		font-weight: 600;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22rpx 0;
		border-bottom: 1rpx solid var(--wardrobe-border);
	}

	.setting-row:last-child {
		border-bottom: 0;
	}

	.setting-left {
		min-width: 0;
		flex: 1;
		padding-right: 24rpx;
	}

	.setting-title {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		font-weight: 600;
		line-height: 1.35;
	}

	.setting-desc {
		margin-top: 6rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
		line-height: 1.45;
	}

	.arrow {
		color: var(--wardrobe-muted);
		font-size: 40rpx;
	}

	.save-btn {
		margin-top: 40rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		box-shadow: 0 18rpx 36rpx rgba(101, 73, 50, 0.16);
	}
</style>