<template>
	<view class="page">


		<view class="upload-panel" @click="chooseClothingImage">
			<image v-if="draft.image_url" class="preview" :src="draft.image_url" mode="aspectFill"></image>
			<view v-else class="empty">
				<view class="empty-icon">+</view>
				<view class="empty-title">选择衣服照片</view>
				<view class="empty-desc">支持拍照或从相册选择</view>
			</view>
		</view>

		<view v-if="draft.image_url" class="result-panel">
			<view class="result-head">
				<view>
					<view class="panel-title">{{ resultTitle }}</view>
					<view class="result-desc">{{ resultDesc }}</view>
				</view>
				<view class="status-pill" :class="{ loading: analyzing, warning: recognizeFailed }">
					{{ statusText }}
				</view>
			</view>

			<view v-if="hasAnalysis" class="summary-card">
				<view class="summary-name">{{ recognizedName }}</view>
				<view class="summary-meta">{{ recognizedMeta }}</view>
				<view v-if="draft.ai_description" class="summary-desc">{{ draft.ai_description }}</view>
				<view class="tag-list compact-tags">
					<view v-for="tag in visibleTags" :key="tag" class="tag active">{{ tag }}</view>
				</view>
			</view>

			<view v-else class="summary-card muted">
				<view class="summary-name">先放入衣橱也可以</view>
				<view class="summary-meta">稍后可以在衣物详情里补充分类、颜色和标签。</view>
			</view>

			<view class="edit-toggle" @click="showEditor = !showEditor">
				{{ showEditor ? '收起修改' : '识别不准？手动修改' }} <text>›</text>
			</view>
		</view>

		<view v-if="draft.image_url && showEditor" class="draft-panel">
			<view class="panel-title">修改识别结果</view>
			<view class="field">
				<view class="label">衣物分类</view>
				<picker :range="categoryOptions" :value="categoryIndex" @change="handleCategoryChange">
					<view class="picker-value">{{ draft.category || '暂不选择' }}</view>
				</picker>
			</view>

			<view class="field">
				<view class="label">衣物类型</view>
				<input class="input" v-model="draft.type" placeholder="例如 短袖T恤、牛仔裤、运动鞋"
					placeholder-class="placeholder" />
			</view>

			<view class="field-grid">
				<view class="field compact">
					<view class="label">颜色</view>
					<input class="input" v-model="draft.color" placeholder="例如 白色" placeholder-class="placeholder" />
				</view>
				<view class="field compact">
					<view class="label">材质</view>
					<input class="input" v-model="draft.material" placeholder="例如 棉" placeholder-class="placeholder" />
				</view>
			</view>

			<view class="field">
				<view class="label">版型</view>
				<picker :range="fitOptions" :value="fitIndex" @change="handleFitChange">
					<view class="picker-value">{{ draft.fit || '请选择' }}</view>
				</picker>
			</view>

			<view class="tag-block">
				<view class="label">风格标签</view>
				<view class="tag-list">
					<view v-for="style in styleOptions" :key="style" class="tag"
						:class="{ active: draft.style_tags.includes(style) }"
						@click="toggleDraftTag('style_tags', style)">
						{{ style }}
					</view>
				</view>
			</view>

			<view class="tag-block">
				<view class="label">季节标签</view>
				<view class="tag-list">
					<view v-for="season in seasonOptions" :key="season" class="tag"
						:class="{ active: draft.season_tags.includes(season) }"
						@click="toggleDraftTag('season_tags', season)">
						{{ season }}
					</view>
				</view>
			</view>

			<view class="tag-block">
				<view class="label">场景标签</view>
				<view class="tag-list">
					<view v-for="scene in sceneOptions" :key="scene" class="tag"
						:class="{ active: draft.scene_tags.includes(scene) }"
						@click="toggleDraftTag('scene_tags', scene)">
						{{ scene }}
					</view>
				</view>
			</view>
		</view>

		<view v-if="draft.image_url" class="action-row">
			<button class="secondary-button" @click="chooseClothingImage">重新选择</button>
			<button v-if="recognizeFailed" class="secondary-button" :loading="analyzing" :disabled="analyzing || saving"
				@click="analyzeClothing">
				重新识别
			</button>
			<button class="primary-button" type="primary" :loading="saving" :disabled="saving || analyzing"
				@click="saveClothing">
				放入衣橱
			</button>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;
	const STORAGE_KEY = 'ai_private_wardrobe_clothing_drafts';

	export default {
		data() {
			return {
				categoryOptions: ['上衣', '下装', '外套', '鞋', '包', '配饰'],
				fitOptions: ['修身', '标准', '宽松', '短款', '长款'],
				styleOptions: ['简约', '休闲', '日系', '欧美', '商务', '街头', '运动', '复古'],
				seasonOptions: ['春', '夏', '秋', '冬'],
				sceneOptions: ['上班', '约会', '旅行', '聚会', '运动', '日常', '海边'],
				analyzing: false,
				saving: false,
				showEditor: false,
				// 衣服图片是 Vision Agent 的原始输入。
				// 这里的结构化字段模拟 analyze_clothing_image 工具的输出，先让衣柜数据格式稳定下来。
				draft: {
					image_url: '',
					image_file_id: '',
					image_cloud_path: '',
					image_provider: '',
					category: '',
					type: '',
					color: '',
					material: '',
					fit: '',
					style_tags: [],
					season_tags: [],
					scene_tags: [],
					source_type: '',
					status: '',
					ai_task_id: '',
					created_at: 0,
					created_text: '',
				},
			};
		},
		computed: {
			categoryIndex() {
				return Math.max(this.categoryOptions.indexOf(this.draft.category), 0);
			},
			fitIndex() {
				return Math.max(this.fitOptions.indexOf(this.draft.fit), 0);
			},
			hasAnalysis() {
				return Boolean(this.draft.category || this.draft.type || this.draft.color || this.draft.material || this
					.visibleTags.length);
			},
			recognizeFailed() {
				return this.draft.status === 'recognize_failed';
			},
			resultTitle() {
				if (this.analyzing) return '正在识别这件衣服';
				if (this.recognizeFailed) return '这次没识别准';
				if (this.hasAnalysis) return '识别结果';
				return '照片已准备好';
			},
			resultDesc() {
				if (this.analyzing) return '通常几秒内完成，你不需要先填写信息。';
				if (this.recognizeFailed) return '可以重新识别，也可以先放入衣橱，之后再补充。';
				if (this.hasAnalysis) return '看起来不准的地方可以点下面修改。';
				return 'AI 会自动尝试识别，也可以直接放入衣橱。';
			},
			statusText() {
				if (this.analyzing) return '识别中';
				if (this.recognizeFailed) return '待完善';
				if (this.hasAnalysis) return '已识别';
				return '待识别';
			},
			recognizedName() {
				const type = this.draft.type || this.draft.category || '衣物';
				return this.draft.color ? `${this.draft.color}${type}` : type;
			},
			recognizedMeta() {
				return [this.draft.category, this.draft.material, this.draft.fit].filter(Boolean).join(' · ') ||
					'可稍后补充更多信息';
			},
			visibleTags() {
				return [
					...(this.draft.style_tags || []),
					...(this.draft.season_tags || []),
					...(this.draft.scene_tags || []),
				].slice(0, 6);
			},
		},
		onLoad() {
			vk = uni.vk;
		},
		methods: {
			/**
			 * 选择衣服图片。
			 * 这一步收集 Agent 的多模态输入：用户给的不是文字需求，而是一张衣物图片；
			 * 图片本身暂时只作为本地临时路径，下一步接云存储后才会变成可长期访问的 fileID 或 URL。
			 *
			 * AI Agent 学习注释：少填表单的产品化入口
			 * 用户只需要选一张衣服照片，前端马上调用 analyzeClothing({ silent: true })。
			 * 这样“AI 先识别，用户只确认/修改”成为默认流程，而不是让用户先手填分类、颜色、材质。
			 */
			chooseClothingImage() {
				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					sourceType: ['album', 'camera'],
					success: (res) => {
						const imageUrl = res.tempFilePaths && res.tempFilePaths[0];
						if (!imageUrl) return;

						this.createDraftFromImage(imageUrl);
						this.analyzeClothing({
							silent: true
						});
					},
					fail: (err) => {
						console.error('选择衣服图片失败', err);
					},
				});
			},
			/**
			 * 根据图片生成待识别草稿。
			 * 这个草稿是 Vision 工具调用前的任务输入，后续会补充 category、color、style_tags 等结构化字段。
			 *
			 * AI Agent 学习注释：前端临时 Context
			 * draft 是“还没入库的衣服上下文”，包含本地图片路径、识别状态、AI 建议字段。
			 * 它不是长期 Memory，只有用户点击“放入衣橱”后才会变成 clothes 表里的可检索单品。
			 */
			createDraftFromImage(imageUrl) {
				const now = Date.now();

				this.draft = {
					image_url: imageUrl,
					image_file_id: '',
					image_cloud_path: '',
					image_provider: '',
					category: '',
					type: '',
					color: '',
					material: '',
					fit: '',
					style_tags: [],
					season_tags: [],
					scene_tags: [],
					source_type: '本地临时图片',
					status: '等待 AI 识别',
					ai_task_id: '',
					created_at: now,
					created_text: this.formatTime(now),
				};
				this.showEditor = false;
			},
			/**
			 * 更新衣物分类。
			 * 分类是衣柜检索的一级索引，后续 Agent 生成搭配时会先按上衣、下装、鞋包等角色组合单品。
			 */
			handleCategoryChange(event) {
				this.draft.category = this.categoryOptions[event.detail.value];
			},
			/**
			 * 更新版型字段。
			 * 版型会进入推荐理由，例如“宽松更适合高温通勤”或“短款外套更适合显高搭配”。
			 */
			handleFitChange(event) {
				this.draft.fit = this.fitOptions[event.detail.value];
			},
			/**
			 * 切换衣物标签。
			 * 标签是 Agent 查询衣柜时的重要过滤和排序信号；同一件衣服可以同时适合多个季节、风格和场景。
			 */
			toggleDraftTag(field, value) {
				const currentValues = this.draft[field];
				const valueIndex = currentValues.indexOf(value);

				if (valueIndex > -1) {
					currentValues.splice(valueIndex, 1);
					return;
				}

				currentValues.push(value);
			},
			/**
			 * 保存衣物草稿。
			 * 这里调用 client/wardrobe/clothes.save，把结构化衣物写入 clothes 表；
			 * 保存前会先上传图片到云存储，确保 Agent 后续识别和推荐拿到的是长期可访问的图片。
			 *
			 * AI Agent 学习注释：从临时 Context 到长期工具数据源
			 * 点击“放入衣橱”后，草稿会保存到 clothes 表。
			 * clothes 表之后会被 outfit.generate 当作 search_closet 工具的数据源。
			 */
			async saveClothing() {
				if (!this.validateDraft()) return;
				if (this.saving) return;

				this.saving = true;

				try {
					const clothing = await this.buildCloudClothingDraft();
					const res = await this.callClothesApi('client/wardrobe/clothes.save', {
						clothing,
					});
					const savedClothing = res.clothing || {
						...clothing,
						id: `draft_${clothing.created_at}`,
					};

					this.saveLocalDraft(savedClothing);
					this.draft = {
						...this.draft,
						...savedClothing,
						image_file_id: savedClothing.image_file_id || '',
						image_cloud_path: savedClothing.image_cloud_path || '',
						image_provider: savedClothing.image_provider || '',
						source_type: '云端图片',
						status: '已加入衣柜',
					};

					uni.showToast({
						title: '已放入衣橱',
						icon: 'success',
					});
				} catch (err) {
					console.error('保存衣物草稿失败', err);
					uni.showToast({
						title: '保存失败，请重试',
						icon: 'none',
					});
				} finally {
					this.saving = false;
				}
			},
			/**
			 * 调用豆包视觉模型识别衣物。
			 * Agent 设计点：
			 * 这一步是多模态输入处理：图片不能直接用于稳定检索，所以先通过 Vision Agent 抽取分类、颜色、
			 * 风格、季节、场景等标签。识别结果只是“建议值”，最终仍由用户确认后再保存进衣柜 Memory。
			 *
			 * AI Agent 学习注释：多模态 + 结构化输出
			 * 后端返回的是结构化 JSON，前端把它合并到 draft。
			 * 如果识别失败，也允许用户先入库，缺失字段显示“待识别/待完善”，不阻断主流程。
			 */
			async analyzeClothing(options = {}) {
				if (!this.draft.image_url) {
					uni.showToast({
						title: '请先选择图片',
						icon: 'none',
					});
					return;
				}
				if (this.analyzing) return;

				this.analyzing = true;

				try {
					const cloudDraft = await this.buildCloudClothingDraft();
					this.draft = {
						...this.draft,
						...cloudDraft,
						status: 'recognizing',
					};

					const res = await this.callClothesApi('client/wardrobe/clothes.analyze', {
						image_url: this.draft.image_url,
						image_file_id: this.draft.image_file_id,
					});
					const analysis = res.analysis || {};

					this.draft = {
						...this.draft,
						...analysis,
						ai_task_id: res.ai_task_id || '',
						status: res.source === 'doubao_vision' ? 'recognized' : 'recognize_failed',
					};

					if (!options.silent) {
						uni.showToast({
							title: res.source === 'doubao_vision' ? '识别完成' : '可稍后完善',
							icon: 'none',
						});
					}
				} catch (err) {
					console.error('AI 识别衣物失败', err);
					this.draft.status = 'recognize_failed';
					if (!options.silent) {
						uni.showToast({
							title: '可稍后完善',
							icon: 'none',
						});
					}
				} finally {
					this.analyzing = false;
				}
			},
			/**
			 * 构建可保存到云端的衣物草稿。
			 * Agent 的衣柜数据需要长期可访问的图片，不能依赖小程序临时路径；
			 * 因此保存 clothes 记录前先上传图片，把本地多模态输入变成云端文件引用。
			 */
			async buildCloudClothingDraft() {
				if (this.draft.image_file_id && this.draft.image_url) {
					return this.draft;
				}

				const uploadRes = await this.uploadClothingImage(this.draft.image_url);

				return {
					...this.draft,
					image_url: uploadRes.url || uploadRes.fileURL || this.draft.image_url,
					image_file_id: uploadRes.fileID || '',
					image_cloud_path: uploadRes.cloudPath || '',
					image_provider: uploadRes.provider || 'unicloud',
					source_type: '云端图片',
				};
			},
			/**
			 * 上传衣物图片到云存储。
			 * 这是后续 analyze_clothing_image 工具的前置步骤：Vision 模型和云端任务都需要稳定可访问的图片地址。
			 */
			uploadClothingImage(filePath) {
				return vk.uploadFile({
					filePath,
					provider: 'unicloud',
					cloudDirectory: 'wardrobe/clothes',
					needSave: false,
					errorToast: true,
				});
			},
			/**
			 * 同步本地衣物备份。
			 * 本地缓存不是正式衣柜，只作为云端调试或网络失败时的兜底数据源。
			 */
			saveLocalDraft(clothing) {
				const localId = clothing.id || clothing._id || `draft_${clothing.created_at}`;

				const drafts = uni.getStorageSync(STORAGE_KEY) || [];
				const nextDrafts = drafts.filter((item) => item.id !== localId && item._id !== localId);

				nextDrafts.unshift({
					...clothing,
					id: localId,
				});
				uni.setStorageSync(STORAGE_KEY, nextDrafts);
			},
			/**
			 * 校验衣物草稿。
			 * Agent 后续不能只拿到一张图片就稳定推荐，至少需要分类和颜色这样的基础结构化字段。
			 */
			validateDraft() {
				if (!this.draft.image_url) {
					uni.showToast({
						title: '请先选择图片',
						icon: 'none',
					});
					return false;
				}

				return true;
			},
			/**
			 * 格式化草稿创建时间。
			 * Agent 任务后续需要记录 created_at，方便排查一次图片识别或穿搭生成来自哪次用户操作。
			 */
			formatTime(timestamp) {
				const date = new Date(timestamp);
				const year = date.getFullYear();
				const month = this.padTime(date.getMonth() + 1);
				const day = this.padTime(date.getDate());
				const hour = this.padTime(date.getHours());
				const minute = this.padTime(date.getMinutes());

				return `${year}-${month}-${day} ${hour}:${minute}`;
			},
			/**
			 * 补齐时间数字。
			 * 统一的时间文本能让草稿、识别任务、历史记录在页面上保持一致。
			 */
			padTime(value) {
				return value < 10 ? `0${value}` : `${value}`;
			},
			/**
			 * 调用衣柜相关云函数。
			 * clothes.save 是 create_clothing_record 工具，负责把单件衣物加入 Agent 可查询的私有衣柜。
			 */
			callClothesApi(url, data = {}) {
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



	.upload-panel {
		width: 100%;
		height: 520rpx;
		overflow: hidden;
		border: 2rpx dashed #eecbd5;
		border-radius: 30rpx;
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 239, 238, 0.78));
		box-shadow: var(--wardrobe-shadow);
	}

	.preview {
		width: 100%;
		height: 100%;
		background: #f1e4d6;
	}

	.empty {
		display: flex;
		height: 100%;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		color: var(--wardrobe-muted);
	}

	.empty-icon {
		display: flex;
		width: 96rpx;
		height: 96rpx;
		align-items: center;
		justify-content: center;
		border: 2rpx dashed var(--wardrobe-primary);
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.72);
		color: var(--wardrobe-primary-deep);
		font-size: 52rpx;
		line-height: 1;
	}

	.empty-title {
		margin-top: 24rpx;
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 600;
		line-height: 1.4;
	}

	.empty-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.4;
	}

	.result-panel,
	.draft-panel {
		margin-top: 24rpx;
		padding: 30rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.result-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18rpx;
	}

	.panel-title {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		line-height: 1.4;
	}

	.result-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.45;
	}

	.status-pill {
		flex: 0 0 auto;
		padding: 8rpx 16rpx;
		border-radius: 999rpx;
		background: #e8f5e9;
		color: #2e7d32;
		font-size: 22rpx;
		font-weight: 600;
		line-height: 1.2;
	}

	.status-pill.loading {
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
	}

	.status-pill.warning {
		background: #fff5d8;
		color: #9a6a12;
	}

	.summary-card {
		margin-top: 24rpx;
		padding: 24rpx;
		border-radius: 20rpx;
		background: var(--wardrobe-surface-solid);
	}

	.summary-card.muted {
		background: #fff8ef;
	}

	.summary-name {
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 750;
		line-height: 1.35;
	}

	.summary-meta,
	.summary-desc {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.45;
	}

	.compact-tags {
		margin-top: 18rpx;
	}

	.edit-toggle {
		margin-top: 22rpx;
		color: var(--wardrobe-primary-deep);
		font-size: 25rpx;
		font-weight: 600;
		line-height: 1.4;
	}

	.edit-toggle text {
		margin-left: 6rpx;
	}

	.field,
	.tag-block {
		margin-bottom: 24rpx;
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
	.input {
		width: 100%;
		height: 82rpx;
		box-sizing: border-box;
		padding: 0 22rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 18rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-text);
		font-size: 27rpx;
		line-height: 82rpx;
	}

	.placeholder {
		color: #b8a79b;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
	}

	.tag {
		min-width: 120rpx;
		box-sizing: border-box;
		margin-right: 16rpx;
		margin-bottom: 16rpx;
		padding: 16rpx 20rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.2;
		text-align: center;
	}

	.tag.active {
		border-color: var(--wardrobe-primary);
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-weight: 600;
	}

	.draft-row {
		display: flex;
		align-items: flex-start;
		padding: 14rpx 0;
	}

	.row-label {
		width: 150rpx;
		flex: 0 0 150rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.row-value {
		min-width: 0;
		flex: 1;
		color: var(--wardrobe-text);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.action-row {
		display: flex;
		margin-top: 28rpx;
	}

	.secondary-button,
	.primary-button {
		flex: 1;
		margin: 0;
		border-radius: 999rpx;
		font-size: 28rpx;
	}

	.secondary-button {
		margin-right: 20rpx;
		border: 1rpx solid var(--wardrobe-border);
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-primary-deep);
	}

	.primary-button {
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		box-shadow: 0 18rpx 36rpx rgba(101, 73, 50, 0.16);
	}
</style>