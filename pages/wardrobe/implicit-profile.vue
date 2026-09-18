<template>
	<view class="page">


		<!-- 加载中 -->
		<view v-if="loading" class="loading">正在分析你的穿搭行为...</view>

		<!-- 空状态 -->
		<view v-else-if="isEmpty" class="empty-card">
			<view class="empty-title">还不够了解你</view>
			<view class="empty-desc">
				上传几件衣服、生成几套搭配、收藏喜欢的穿搭，AI 就能开始学习你的偏好。
			</view>
			<button class="analyze-btn" :loading="analyzing" @click="triggerAnalyze">立即分析</button>
		</view>

		<!-- 画像卡片 -->
		<view v-else>
			<view class="source-bar">
				<text>基于 {{ sourceSummary }} 个数据点分析</text>
				<text class="refresh-link" @click="triggerAnalyze">重新分析</text>
			</view>

			<view v-for="dim in displayDimensions" :key="dim.key" class="dim-card">
				<view class="dim-header">
					<view class="dim-label">{{ dim.label }}</view>
					<view class="confidence-bar">
						<view class="confidence-fill" :class="dim.confidenceClass"
							:style="{ width: dim.confidencePercent + '%' }"></view>
					</view>
					<view class="confidence-text">{{ dim.confidenceText }}</view>
				</view>
				<view class="dim-value">{{ dim.displayValue }}</view>
				<view class="dim-source">{{ dim.source }}</view>
			</view>

			<view class="footer-note">
				AI 会随着你的穿搭行为持续学习，画像每周自动更新。你也可以主动触发重新分析。
			</view>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;

	export default {
		data() {
			return {
				loading: true,
				analyzing: false,
				profile: null,
				explicit: {},
			};
		},
		computed: {
			isEmpty() {
				if (!this.profile) return true;
				const dims = Object.values(this.profile);
				return dims.every((d) => !d || !d.value || (Array.isArray(d.value) && !d.value.length) || d.confidence <
					0.2);
			},
			sourceSummary() {
				if (!this.profile || !this.profile.last_analyzed_at) return '0';
				const ds = this.profile.data_source_counts || {};
				return ds.total_data_points || '0';
			},
			displayDimensions() {
				if (!this.profile) return [];
				const map = [{
						key: 'style',
						label: '穿搭风格',
						source: '衣柜风格标签统计'
					},
					{
						key: 'color_preference',
						label: '颜色偏好',
						source: '衣柜颜色分布 + 收藏搭配'
					},
					{
						key: 'color_avoid',
						label: '规避颜色',
						source: '被拒绝搭配中的颜色'
					},
					{
						key: 'fit_preference',
						label: '版型偏好',
						source: '衣柜版型占比'
					},
					{
						key: 'material_preference',
						label: '材质偏好',
						source: '衣柜材质分布'
					},
					{
						key: 'formality_level',
						label: '正式度',
						source: '风格分布 + 对话推断'
					},
					{
						key: 'comfort_priority',
						label: '舒适优先',
						source: '材质分布 + 对话推断'
					},
					{
						key: 'body_concerns',
						label: '身材关注',
						source: '对话中提取（"显高""遮肉"等）'
					},
					{
						key: 'style_avoid',
						label: '规避风格',
						source: '被拒绝搭配中的风格标签'
					},
					{
						key: 'category_bias',
						label: '品类偏好',
						source: '衣柜品类分布'
					},
					{
						key: 'category_avoid',
						label: '规避品类',
						source: '被拒绝搭配中的品类'
					},
					{
						key: 'price_tier',
						label: '消费区间',
						source: '比价/追踪数据推断'
					},
					{
						key: 'temperature_sensitivity',
						label: '温度敏感',
						source: '材质偏好 + 对话推断'
					},
					{
						key: 'summary',
						label: '一句话总结',
						source: 'AI 综合分析'
					},
				];
				return map
					.filter((m) => {
						const dim = this.profile[m.key];
						return dim && dim.confidence >= 0.2;
					})
					.map((m) => {
						const dim = this.profile[m.key];
						return {
							...m,
							displayValue: this.formatDimValue(dim.value),
							confidence: dim.confidence,
							confidencePercent: Math.round(dim.confidence * 100),
							confidenceClass: dim.confidence >= 0.8 ? 'high' : dim.confidence >= 0.5 ? 'mid' : 'low',
							confidenceText: dim.confidence >= 0.8 ? '高可信' : dim.confidence >= 0.5 ? '参考中' : '低可信',
						};
					});
			},
		},
		onLoad() {
			vk = uni.vk;
			this.loadProfile();
		},
		methods: {
			/**
			 * 读取隐式画像。
			 * Agent 设计点：隐式画像由 aiProfile.analyze 生成，带置信度展示。
			 */
			async loadProfile() {
				this.loading = true;
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/aiProfile.get',
						data: {},
						loading: false,
					});
					this.profile = res.implicit_profile || null;
					this.explicit = res.explicit || {};
				} catch (err) {
					console.error('读取隐式画像失败', err);
				} finally {
					this.loading = false;
				}
			},

			/**
			 * 触发 AI 重新分析。
			 * Agent 设计点：通常画像会定期自动更新，但用户也可以主动触发。
			 */
			async triggerAnalyze() {
				if (this.analyzing) return;
				this.analyzing = true;
				uni.showLoading({
					title: 'AI 分析中...'
				});

				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/aiProfile.analyze',
						data: {},
						loading: false,
					});
					if (res.profile) {
						this.profile = res.profile;
						uni.showToast({
							title: '分析完成',
							icon: 'success'
						});
					} else {
						uni.showToast({
							title: res.msg || '暂无足够数据',
							icon: 'none'
						});
					}
				} catch (err) {
					console.error('AI 分析失败', err);
					uni.showToast({
						title: '分析失败',
						icon: 'none'
					});
				} finally {
					this.analyzing = false;
					uni.hideLoading();
				}
			},

			formatDimValue(value) {
				if (!value) return '暂无数据';
				if (typeof value === 'string') return value;
				if (Array.isArray(value)) return value.join('、') || '暂无数据';
				if (typeof value === 'object') {
					const entries = Object.entries(value);
					if (!entries.length) return '暂无数据';
					return entries.sort((a, b) => b[1] - a[1]).map(([k, v]) =>
						`${k}(${Math.round((typeof v === 'number' ? v : 0) * 100)}%)`).join(' · ');
				}
				return String(value);
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



	.loading {
		text-align: center;
		color: var(--wardrobe-muted);
		font-size: 27rpx;
		margin-top: 120rpx;
	}

	.empty-card {
		margin-top: 80rpx;
		padding: 48rpx 32rpx;
		text-align: center;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 28rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.empty-title {
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 700;
	}

	.empty-desc {
		margin-top: 16rpx;
		color: var(--wardrobe-muted);
		font-size: 26rpx;
		line-height: 1.5;
	}

	.analyze-btn {
		margin-top: 28rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
	}

	.source-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20rpx;
		padding: 16rpx 22rpx;
		border-radius: 14rpx;
		background: #f5f0eb;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
	}

	.refresh-link {
		color: var(--wardrobe-primary-deep);
		font-weight: 600;
	}

	.dim-card {
		margin-bottom: 18rpx;
		padding: 26rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 20rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.dim-header {
		display: flex;
		align-items: center;
		margin-bottom: 12rpx;
	}

	.dim-label {
		width: 140rpx;
		flex-shrink: 0;
		color: var(--wardrobe-text);
		font-size: 27rpx;
		font-weight: 700;
	}

	.confidence-bar {
		flex: 1;
		height: 8rpx;
		border-radius: 4rpx;
		background: #e8e0d8;
		margin: 0 14rpx;
		overflow: hidden;
	}

	.confidence-fill {
		height: 8rpx;
		border-radius: 4rpx;
	}

	.confidence-fill.high {
		background: #4caf50;
	}

	.confidence-fill.mid {
		background: #ff9800;
	}

	.confidence-fill.low {
		background: #bdbdbd;
	}

	.confidence-text {
		width: 80rpx;
		flex-shrink: 0;
		font-size: 22rpx;
		color: var(--wardrobe-muted);
		text-align: right;
	}

	.dim-value {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		line-height: 1.5;
		padding-left: 140rpx;
	}

	.dim-source {
		margin-top: 8rpx;
		color: #baaa9a;
		font-size: 22rpx;
		padding-left: 140rpx;
	}

	.footer-note {
		margin-top: 32rpx;
		padding: 24rpx;
		border-radius: 16rpx;
		background: #faf6f0;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.6;
		text-align: center;
	}
</style>