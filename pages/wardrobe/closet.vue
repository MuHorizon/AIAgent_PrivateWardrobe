<template>
	<view class="page">
		<view class="header">

			<button class="add-button" @click="goUpload">添加</button>
		</view>

		<!-- 搜索栏 -->
		<view class="search-box">
			<input class="search-input" v-model="searchKeyword" placeholder="搜索颜色、类型、材质..." confirm-type="search"
				@confirm="doSearch" />
			<button v-if="searchKeyword" class="clear-btn" @click="clearSearch">✕</button>
		</view>

		<scroll-view class="category-scroll" scroll-x>
			<view class="category-row">
				<view v-for="category in categoryOptions" :key="category" class="category-tab"
					:class="{ active: activeCategory === category }" @click="changeCategory(category)">
					{{ category }}
				</view>
			</view>
		</scroll-view>

		<!-- 管理工具栏 -->
		<view class="toolbar">
			<view class="toolbar-left">
				<text class="count-text">共 {{ filteredClothes.length }} 件</text>
				<text v-if="idleCount > 0" class="idle-hint" @click="checkIdle">{{ idleCount }} 件闲置</text>
			</view>
			<view class="toolbar-right">
				<view class="tool-btn" @click="checkDuplicates">查重复</view>
				<view class="tool-btn" @click="toggleBatchMode">{{ batchMode ? '取消' : '批量管理' }}</view>
			</view>
		</view>

		<!-- 批量操作栏 -->
		<view v-if="batchMode && selectedIds.length" class="batch-bar">
			<text>已选 {{ selectedIds.length }} 件</text>
			<button class="batch-del-btn" @click="batchRemove">批量删除</button>
		</view>

		<view v-if="filteredClothes.length" class="closet-list">
			<view v-for="item in filteredClothes" :key="getClothKey(item)" class="cloth-card"
				:class="{ selected: batchMode && selectedIds.indexOf(getClothKey(item)) > -1 }"
				@click="handleCardClick(item)">
				<view v-if="batchMode" class="check-box">
					<view class="check-icon" :class="{ checked: selectedIds.indexOf(getClothKey(item)) > -1 }">✓</view>
				</view>
				<image class="cloth-image" :src="item.image_url" mode="aspectFill"></image>
				<view class="cloth-info">
					<view class="cloth-name">{{ getClothName(item) }}</view>
					<view class="cloth-meta">{{ item.color }} · {{ item.category }}</view>
					<view class="tag-list">
						<view v-for="tag in getVisibleTags(item)" :key="tag" class="tag">{{ tag }}</view>
						<view v-if="!getVisibleTags(item).length" class="tag muted">暂无标签</view>
					</view>
				</view>
			</view>
		</view>

		<view v-else class="empty">
			<view class="empty-title">还没有衣物</view>
			<view class="empty-desc">先上传一件衣服，慢慢搭出属于你的电子衣橱。</view>
			<button class="upload-button" type="primary" @click="goUpload">上传新衣服</button>
		</view>
	</view>
</template>

<script>
	let vk = uni.vk;
	const STORAGE_KEY = 'ai_private_wardrobe_clothing_drafts';

	export default {
		data() {
			return {
				activeCategory: '全部',
				categoryOptions: ['全部', '上衣', '下装', '外套', '鞋', '包', '配饰'],
				clothes: [],
				loading: false,
				searchKeyword: '',
				batchMode: false,
				selectedIds: [],
				idleCount: 0,
			};
		},
		computed: {
			filteredClothes() {
				if (this.activeCategory === '全部') return this.clothes;

				return this.clothes.filter((item) => item.category === this.activeCategory);
			},
		},
		onLoad() {
			vk = uni.vk;
		},
		onShow() {
			this.loadClothes();
		},
		methods: {
			/**
			 * 读取衣柜数据。
			 * 这一步对应 search_closet 工具：优先读取云端 clothes 表，保证 Agent 使用的是当前登录用户的私有衣柜；
			 * 如果云端暂时不可用，再使用本地缓存兜底，便于开发阶段继续验证前端流程。
			 */
			async loadClothes() {
				this.loading = true;

				try {
					const res = await this.callClothesApi('client/wardrobe/clothes.list');
					this.clothes = res.rows || [];
					uni.setStorageSync(STORAGE_KEY, this.clothes);
				} catch (err) {
					console.error('读取云端衣柜失败，使用本地缓存兜底', err);
					this.loadLocalClothes();
				} finally {
					this.loading = false;
				}
			},
			/**
			 * 读取本地衣柜备份。
			 * 本地缓存不是正式衣柜，只作为云端读取失败时的开发兜底。
			 */
			loadLocalClothes() {
				const drafts = uni.getStorageSync(STORAGE_KEY) || [];
				this.clothes = drafts.filter((item) => item && item.image_url);
			},
			/**
			 * 切换衣物分类。
			 * 分类筛选对应 Agent 查询衣柜时的第一层约束，例如生成搭配时需要分别寻找上衣、下装和鞋。
			 */
			changeCategory(category) {
				this.activeCategory = category;
			},
			/**
			 * 生成衣物展示名称。
			 * 后续 AI 识别完成后，type 会更稳定；当前用“颜色 + 类型/分类”先形成可读的单品名称。
			 */
			getClothName(item) {
				const type = item.type || item.category || '衣物';
				return item.color ? `${item.color}${type}` : type;
			},
			/**
			 * 生成衣物列表 key。
			 * 云端 clothes 表返回 _id，本地备份可能只有 id；统一取 key 可以保证衣柜列表稳定刷新。
			 */
			getClothKey(item) {
				return item._id || item.id || item.created_at;
			},
			/**
			 * 提取卡片上展示的标签。
			 * 风格、季节、场景标签是 Agent 推荐排序的核心信号，这里先让用户能看到哪些标签已进入衣柜数据。
			 */
			getVisibleTags(item) {
				return [
					...(item.style_tags || []),
					...(item.season_tags || []),
					...(item.scene_tags || []),
				].slice(0, 4);
			},
			/**
			 * 跳转到上传页。
			 * 衣柜为空时，引导用户继续补充 Agent 可查询的数据源。
			 */
			goUpload() {
				uni.navigateTo({
					url: '/pages/wardrobe/upload',
				});
			},
			/**
			 * 跳转到衣物详情。
			 * 详情页用于检查单件衣服的完整结构化字段，避免 Agent 后续推荐时只看到列表上的少量摘要信息。
			 */
			goDetail(item) {
				const clothingId = item._id || item.id || '';
				const encodedFallback = encodeURIComponent(JSON.stringify(item));

				uni.navigateTo({
					url: `/pages/wardrobe/detail?id=${clothingId}&fallback=${encodedFallback}`,
				});
			},
			/**
			 * 调用衣柜相关云函数。
			 * clothes.list 是 search_closet 工具，后续穿搭 Agent 会复用同一类查询能力。
			 */
			callClothesApi(url, data = {}) {
				return vk.callFunction({
					url,
					data,
					loading: false
				});
			},

			/**
			 * 搜索衣物。
			 * Agent 设计点：当衣柜件数多时用关键词+筛选条件快速定位单品。
			 */
			async doSearch() {
				if (!this.searchKeyword.trim()) {
					this.loadClothes();
					return;
				}
				this.loading = true;
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/clothes.search',
						data: {
							keyword: this.searchKeyword.trim(),
							category: this.activeCategory !== '全部' ? this.activeCategory : ''
						},
						loading: false,
					});
					this.clothes = res.rows || [];
				} catch (err) {
					console.error('搜索失败', err);
				} finally {
					this.loading = false;
				}
			},

			clearSearch() {
				this.searchKeyword = '';
				this.loadClothes();
			},

			/**
			 * 切换批量管理模式。
			 * Agent 设计点：批量操作提高管理效率，支持批量删除、批量改分类。
			 */
			toggleBatchMode() {
				this.batchMode = !this.batchMode;
				this.selectedIds = [];
			},

			handleCardClick(item) {
				if (this.batchMode) {
					const key = this.getClothKey(item);
					const idx = this.selectedIds.indexOf(key);
					if (idx > -1) this.selectedIds.splice(idx, 1);
					else this.selectedIds.push(key);
				} else {
					this.goDetail(item);
				}
			},

			/**
			 * 批量删除。
			 * Agent 设计点：软删除把批量选中的衣物标记为 inactive，不影响历史推荐记录。
			 */
			async batchRemove() {
				if (!this.selectedIds.length) return;
				uni.showModal({
					title: '批量删除',
					content: `确定删除 ${this.selectedIds.length} 件衣物？删除后这些衣物不再参与推荐。`,
					confirmText: '删除',
					confirmColor: '#d93026',
					success: async (res) => {
						if (!res.confirm) return;
						try {
							await vk.callFunction({
								url: 'client/wardrobe/clothes.batchAction',
								data: {
									ids: this.selectedIds,
									action: 'remove'
								},
								loading: true,
							});
							this.selectedIds = [];
							this.batchMode = false;
							this.loadClothes();
							uni.showToast({
								title: '已删除',
								icon: 'success'
							});
						} catch (err) {
							console.error('批量删除失败', err);
						}
					},
				});
			},

			/**
			 * 检测闲置衣物。
			 * Agent 设计点：超过 30 天未穿的单品提醒用户，帮助发现被遗忘的好衣服。
			 */
			async checkIdle() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/clothes.idleReminder',
						data: {},
						loading: true,
					});
					this.idleCount = res.idle_count || 0;
					const idleIds = (res.idle || []).map((i) => i._id);
					if (idleIds.length) {
						uni.showModal({
							title: `闲置提醒（${idleIds.length} 件）`,
							content: `有 ${idleIds.length} 件衣物超过 30 天未穿，建议重新搭配或清理。`,
							confirmText: '查看',
							success: (r) => {
								if (r.confirm) this.loadClothes();
							},
						});
					} else {
						uni.showToast({
							title: '没有闲置衣物',
							icon: 'none'
						});
					}
				} catch (err) {
					console.error('闲置检测失败', err);
				}
			},

			/**
			 * 检测重复衣物。
			 * Agent 设计点：颜色+分类+类型相同的衣物可能是重复上传，帮助清理衣柜冗余。
			 */
			async checkDuplicates() {
				try {
					const res = await vk.callFunction({
						url: 'client/wardrobe/clothes.duplicateCheck',
						data: {},
						loading: true,
					});
					const dupes = res.duplicates || [];
					if (dupes.length) {
						uni.showModal({
							title: `重复检测（${dupes.length} 组）`,
							content: `发现 ${dupes.length} 组疑似重复衣物，建议确认后合并或删除。`,
							confirmText: '知道了',
							success: () => {},
						});
					} else {
						uni.showToast({
							title: '没有重复衣物',
							icon: 'none'
						});
					}
				} catch (err) {
					console.error('重复检测失败', err);
				}
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

	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 26rpx;
	}



	.add-button {
		width: 128rpx;
		height: 64rpx;
		margin: 4rpx 0 0 20rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-size: 25rpx;
		font-weight: 700;
		line-height: 64rpx;
	}

	.category-scroll {
		width: 100%;
		margin-bottom: 24rpx;
		white-space: nowrap;
	}

	.category-row {
		display: inline-flex;
		padding-bottom: 4rpx;
	}

	.category-tab {
		min-width: 104rpx;
		box-sizing: border-box;
		margin-right: 14rpx;
		padding: 16rpx 24rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface);
		color: #8f7c70;
		font-size: 25rpx;
		line-height: 1.2;
		text-align: center;
	}

	.category-tab.active {
		border-color: var(--wardrobe-primary);
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
		color: #fff;
		font-weight: 600;
	}

	.closet-list {
		display: flex;
		flex-direction: column;
	}

	.cloth-card {
		display: flex;
		min-height: 188rpx;
		box-sizing: border-box;
		margin-bottom: 22rpx;
		padding: 20rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 24rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
	}

	.cloth-image {
		width: 148rpx;
		height: 148rpx;
		flex: 0 0 148rpx;
		border-radius: 20rpx;
		background: #f1e4d6;
	}

	.cloth-info {
		min-width: 0;
		flex: 1;
		margin-left: 22rpx;
	}

	.cloth-name {
		color: var(--wardrobe-text);
		font-size: 30rpx;
		font-weight: 700;
		line-height: 1.35;
	}

	.cloth-meta {
		margin-top: 8rpx;
		color: var(--wardrobe-muted);
		font-size: 24rpx;
		line-height: 1.4;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		margin-top: 14rpx;
	}

	.tag {
		margin-right: 10rpx;
		margin-bottom: 10rpx;
		padding: 8rpx 12rpx;
		border-radius: 999rpx;
		background: #fff3e8;
		color: var(--wardrobe-primary-deep);
		font-size: 22rpx;
		line-height: 1.2;
	}

	.tag.muted {
		background: #f7eee4;
		color: var(--wardrobe-muted);
	}

	.empty {
		box-sizing: border-box;
		margin-top: 80rpx;
		padding: 48rpx 32rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 28rpx;
		background: var(--wardrobe-surface);
		box-shadow: var(--wardrobe-shadow);
		text-align: center;
	}

	.empty-title {
		color: var(--wardrobe-text);
		font-size: 32rpx;
		font-weight: 700;
		line-height: 1.4;
	}

	.empty-desc {
		margin-top: 12rpx;
		color: var(--wardrobe-muted);
		font-size: 25rpx;
		line-height: 1.5;
	}

	.upload-button {
		margin-top: 30rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
	}

	/* 搜索栏 */
	.search-box {
		display: flex;
		align-items: center;
		margin-bottom: 18rpx;
		padding: 0 24rpx;
		height: 72rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface-solid);
	}

	.search-input {
		flex: 1;
		height: 72rpx;
		color: var(--wardrobe-text);
		font-size: 26rpx;
	}

	.clear-btn {
		width: 48rpx;
		height: 48rpx;
		border-radius: 50%;
		background: #e8ddd0;
		color: #8f7c70;
		font-size: 24rpx;
		line-height: 48rpx;
		text-align: center;
	}

	/* 工具栏 */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 18rpx;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 16rpx;
	}

	.count-text {
		color: var(--wardrobe-muted);
		font-size: 24rpx;
	}

	.idle-hint {
		padding: 6rpx 12rpx;
		border-radius: 999rpx;
		background: #fff3e0;
		color: #e65100;
		font-size: 22rpx;
	}

	.toolbar-right {
		display: flex;
		gap: 12rpx;
	}

	.tool-btn {
		padding: 10rpx 18rpx;
		border: 1rpx solid var(--wardrobe-border);
		border-radius: 999rpx;
		background: var(--wardrobe-surface-solid);
		color: var(--wardrobe-text);
		font-size: 23rpx;
	}

	/* 批量操作 */
	.batch-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 18rpx;
		padding: 16rpx 22rpx;
		border-radius: 14rpx;
		background: #fff3e8;
		color: var(--wardrobe-text);
		font-size: 25rpx;
	}

	.batch-del-btn {
		height: 56rpx;
		padding: 0 20rpx;
		border-radius: 999rpx;
		background: #d93026;
		color: #fff;
		font-size: 23rpx;
		line-height: 56rpx;
	}

	/* 批量选择 */
	.cloth-card.selected {
		border-color: var(--wardrobe-primary);
		background: linear-gradient(135deg, #fff3e8, #fff8ef);
	}

	.check-box {
		margin-right: 16rpx;
		display: flex;
		align-items: center;
	}

	.check-icon {
		width: 40rpx;
		height: 40rpx;
		border: 2rpx solid var(--wardrobe-border);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: transparent;
		font-size: 22rpx;
	}

	.check-icon.checked {
		border-color: var(--wardrobe-primary);
		background: var(--wardrobe-primary);
		color: #fff;
	}
</style>