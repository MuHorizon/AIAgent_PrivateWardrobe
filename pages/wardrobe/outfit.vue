<template>
	<view class="page">


		<view class="context-panel">
			<view class="panel-title">今日准备</view>
			<view class="context-row">
				<view class="context-label">穿衣画像</view>
				<view class="context-value">{{ profileStatusText }}</view>
			</view>
			<view class="context-row">
				<view class="context-label">衣柜单品</view>
				<view class="context-value">{{ clothes.length }} 件</view>
			</view>
			<view class="context-row">
				<view class="context-label">今日天气</view>
				<view class="context-value">{{ weatherText }}</view>
			</view>
		</view>

		<view class="quick-panel">
			<view class="panel-title">今天怎么安排？</view>
			<view class="scene-grid">
				<view v-for="scene in sceneCards" :key="scene.key" class="scene-card"
					:class="{ active: request.scene === scene.key }" @click="selectScene(scene)">
					<view class="scene-title">{{ scene.title }}</view>
					<view class="scene-desc">{{ scene.desc }}</view>
				</view>
			</view>
		</view>

		<view class="form-panel">
			<view class="field">
				<view class="label">还有特别要求吗？</view>
				<textarea class="textarea" v-model="request.text" placeholder="可不填。例如：想显高一点，方便走路，不要太正式"
					placeholder-class="placeholder" />
			</view>
		</view>

		<view class="action-row">
			<button class="secondary-button" @click="goHistory">穿搭历史</button>
			<button class="primary-button" type="primary" :loading="generating" :disabled="generating"
				@click="generateOutfit">
				生成搭配
			</button>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;
	const STORAGE_KEY = 'ai_private_wardrobe_outfit_request';
	const RESULT_STORAGE_KEY = 'ai_private_wardrobe_latest_outfits';

	export default {
		data() {
			return {
				sceneOptions: ['日常', '上班', '约会', '旅行', '聚会', '运动', '海边'],
				sceneCards: [{
						key: '日常',
						title: '今日推荐',
						desc: '按衣柜和偏好来'
					},
					{
						key: '上班',
						title: '上班通勤',
						desc: '利落、不费力'
					},
					{
						key: '约会',
						title: '约会见面',
						desc: '更有氛围感'
					},
					{
						key: '旅行',
						title: '旅行出门',
						desc: '轻便、好走'
					},
					{
						key: '聚会',
						title: '朋友聚会',
						desc: '有亮点但自然'
					},
					{
						key: '运动',
						title: '运动休闲',
						desc: '舒适、方便动'
					},
				],
				profile: null,
				clothes: [],
				weather: {},
				generating: false,
				request: {
					scene: '日常',
					weather: '',
					temperature: '',
					text: '',
				},
			};
		},
		computed: {
			profileStatusText() {
				if (!this.profile) return '未读取';
				const preferredStyles = this.profile.preferred_styles || [];
				return this.profile.gender || preferredStyles.length ? '已准备' : '信息较少';
			},
			weatherText() {
				if (this.weather.text) return this.weather.text;
				if (this.request.weather || this.request.temperature) {
					return [this.request.weather, this.request.temperature ? `${this.request.temperature}°` : ''].filter(
						Boolean).join(' ');
				}
				return '自动读取中';
			},
		},
		onLoad() {
			vk = uni.vk;
			this.loadOutfitContext();
			this.loadLocalRequest();
		},
		methods: {
			/**
			 * 读取搭配所需上下文。
			 * 这一步是 Agent Context 构建：把用户画像 Memory 和 search_closet 的衣柜结果放到同一次推荐任务前。
			 */
			async loadOutfitContext() {
				try {
					const profileRes = await this.callWardrobeApi('client/wardrobe/profile.get');
					this.profile = profileRes.profile || null;
				} catch (err) {
					console.error('读取穿衣画像失败', err);
				}

				try {
					const clothesRes = await this.callWardrobeApi('client/wardrobe/clothes.list');
					this.clothes = clothesRes.rows || [];
				} catch (err) {
					console.error('读取衣柜数据失败', err);
				}

				this.loadWeatherContext();
			},
			async loadWeatherContext() {
				try {
					const location = await this.getClientLocation();
					const res = await this.callWardrobeApi('client/wardrobe/home.overview', {
						location,
					});
					this.applyWeather(res.weather || {});
				} catch (err) {
					console.error('读取天气失败', err);
				}
			},
			getClientLocation() {
				return new Promise((resolve) => {
					uni.getLocation({
						type: 'gcj02',
						success: (res) => {
							resolve({
								latitude: res.latitude,
								longitude: res.longitude,
							});
						},
						fail: () => {
							resolve({});
						},
					});
				});
			},
			applyWeather(weather = {}) {
				this.weather = weather;
				this.request.weather = weather.weather || weather.text || this.request.weather || '';
				this.request.temperature = weather.temperature || this.request.temperature || '';
			},
			/**
			 * 读取本地搭配需求草稿。
			 * 用户自然语言需求是本次 Agent 任务的临时 Context，不属于长期 Memory，先只保存最近一次输入。
			 */
			loadLocalRequest() {
				const savedRequest = uni.getStorageSync(STORAGE_KEY);
				if (!savedRequest) return;

				this.request = {
					...this.request,
					...savedRequest,
					scene: savedRequest.scene || this.request.scene || '日常',
				};
			},
			selectScene(scene) {
				this.request.scene = scene.key;
			},
			/**
			 * 保存本次搭配需求。
			 * 需求是本次推荐任务的输入，会被规则生成和后续 AI Agent 生成共同复用。
			 */
			saveOutfitRequest() {
				if (!this.validateRequest()) return;

				const requestToSave = this.buildRequestPayload();

				uni.setStorageSync(STORAGE_KEY, requestToSave);
				this.request = requestToSave;

				uni.showToast({
					title: '需求已保存',
					icon: 'success',
				});
			},
			/**
			 * 生成穿搭方案。
			 * 当前后端会优先调用豆包文本 Agent；如果模型不可用或结构化输出校验失败，会自动回退到规则版。
			 */
			async generateOutfit() {
				if (!this.validateRequest()) return;
				if (this.generating) return;

				this.generating = true;

				const requestToSave = this.buildRequestPayload();
				uni.setStorageSync(STORAGE_KEY, requestToSave);

				try {
					const res = await this.callWardrobeApi('client/wardrobe/outfit.generate', {
						request: requestToSave,
					});
					const records = res.records || [];

					if (!records.length) {
						uni.showToast({
							title: '暂无可用搭配',
							icon: 'none',
						});
						return;
					}

					uni.setStorageSync(RESULT_STORAGE_KEY, {
						records,
						source: res.source || '',
						ai_error: res.ai_error || '',
						// ai_task_id 是本次 Agent 调用的追踪 ID。
						// 它把前端结果和云端 ai_tasks 日志关联起来，方便后续排查模型输出、Prompt 和兜底原因。
						ai_task_id: res.ai_task_id || '',
					});
					uni.navigateTo({
						url: '/pages/wardrobe/outfit-result',
					});
				} catch (err) {
					console.error('生成穿搭失败', err);
					uni.showToast({
						title: '生成失败，请重试',
						icon: 'none',
					});
				} finally {
					this.generating = false;
				}
			},
			/**
			 * 构建推荐请求参数。
			 * 这里把表单输入整理成稳定结构，后续无论规则引擎还是 AI Agent 都使用同一份任务输入。
			 */
			buildRequestPayload() {
				const scene = this.request.scene || '日常';
				return {
					...this.request,
					scene,
					text: this.request.text || this.getDefaultRequestText(scene),
					temperature: Number(this.request.temperature) || '',
					clothes_count: this.clothes.length,
					saved_at: Date.now(),
				};
			},
			/**
			 * 跳转穿搭历史。
			 * 历史记录用于承接收藏、穿着和不喜欢反馈，是后续偏好记忆的原始材料。
			 */
			goHistory() {
				uni.navigateTo({
					url: '/pages/wardrobe/outfit-history',
				});
			},
			/**
			 * 校验搭配条件。
			 * 页面默认会生成日常穿搭，用户不需要额外填写需求。
			 */
			validateRequest() {
				if (!this.clothes.length) {
					uni.showToast({
						title: '请先添加衣物',
						icon: 'none',
					});
					return false;
				}

				return true;
			},
			getDefaultRequestText(scene) {
				const sceneTextMap = {
					日常: '根据今天的衣柜状态和我的偏好，推荐一套不费力的日常穿搭。',
					上班: '今天上班通勤，想要利落舒服。',
					约会: '今天约会见面，想要自然但有氛围感。',
					旅行: '今天旅行出门，想要轻便好走。',
					聚会: '今天朋友聚会，想要有一点亮点。',
					运动: '今天运动休闲，想要舒服方便活动。',
					海边: '今天去海边，想要清爽轻便。',
				};
				return sceneTextMap[scene] || sceneTextMap['日常'];
			},
			/**
			 * 调用衣柜业务云函数。
			 * profile.get 提供长期 Memory，clothes.list 提供私有工具数据源，二者共同构成穿搭 Agent 的输入。
			 */
			callWardrobeApi(url, data = {}) {
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



	.context-panel,
	.quick-panel,
	.form-panel {
		margin-bottom: 24rpx;
		padding: 30rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.panel-title {
		margin-bottom: 18rpx;
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		line-height: 1.4;
	}

	.context-row {
		display: flex;
		padding: 14rpx 0;
	}

	.context-label {
		width: 150rpx;
		flex: 0 0 150rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.context-value {
		min-width: 0;
		flex: 1;
		color: var(--wardrobe-text);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.scene-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16rpx;
	}

	.scene-card {
		min-height: 126rpx;
		box-sizing: border-box;
		padding: 22rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 20rpx;
		background: var(--wardrobe-surface-solid);
	}

	.scene-card.active {
		border-color: var(--wardrobe-primary);
		background: #fff3e8;
	}

	.scene-title {
		color: var(--wardrobe-text);
		font-size: 28rpx;
		font-weight: 700;
		line-height: 1.35;
	}

	.scene-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 23rpx;
		line-height: 1.35;
	}

	.scene-card.active .scene-title,
	.scene-card.active .scene-desc {
		color: var(--wardrobe-primary-deep);
	}

	.field {
		margin-bottom: 24rpx;
	}

	.field:last-child {
		margin-bottom: 0;
	}

	.field-grid {
		display: flex;
	}

	.compact {
		flex: 1;
		min-width: 0;
	}

	.compact+.compact {
		margin-left: 20rpx;
	}

	.label {
		margin-bottom: 12rpx;
		color: var(--wardrobe-plum);
		font-size: 27rpx;
		font-weight: 600;
		line-height: 1.4;
	}

	.picker-value,
	.input,
	.textarea {
		width: 100%;
		box-sizing: border-box;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 18rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-text);
		font-size: 27rpx;
	}

	.picker-value,
	.input {
		height: 82rpx;
		padding: 0 22rpx;
		line-height: 82rpx;
	}

	.textarea {
		height: 180rpx;
		padding: 20rpx 22rpx;
		line-height: 1.45;
	}

	.placeholder {
		color: #b8a79b;
	}

	.primary-button {
		flex: 1;
		margin: 0;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		box-shadow: 0 18rpx 36rpx rgba(101, 73, 50, 0.16);
	}

	.action-row {
		display: flex;
		margin-top: 30rpx;
	}

	.secondary-button {
		flex: 1;
		margin: 0 20rpx 0 0;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-primary-deep);
	}
</style>