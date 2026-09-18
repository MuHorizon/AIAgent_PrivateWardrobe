<template>
  <view class="page">
    <image v-if="clothing.image_url" class="hero-image" :src="clothing.image_url" mode="aspectFill"></image>
    <view v-else class="image-empty">暂无图片</view>

    <view class="info-panel">
      <view class="cloth-name">{{ getClothName(clothing) }}</view>
      <view class="cloth-meta">{{ displayValue(clothing.category) }} · {{ displayValue(clothing.color) }}</view>

      <view class="field-list">
        <view class="field-row">
          <view class="field-label">类型</view>
          <view class="field-value">{{ displayValue(clothing.type) }}</view>
        </view>
        <view class="field-row">
          <view class="field-label">材质</view>
          <view class="field-value">{{ displayValue(clothing.material) }}</view>
        </view>
        <view class="field-row">
          <view class="field-label">版型</view>
          <view class="field-value">{{ displayValue(clothing.fit) }}</view>
        </view>
      </view>
    </view>

    <view class="tag-panel">
      <view class="panel-title">推荐标签</view>
      <view class="tag-group">
        <view v-for="tag in getAllTags(clothing)" :key="tag" class="tag">{{ tag }}</view>
        <view v-if="!getAllTags(clothing).length" class="tag muted">暂无标签</view>
      </view>
    </view>

    <!-- 穿着记录 -->
    <view class="tag-panel">
      <view class="panel-title">穿着记录</view>
      <view class="wear-info">
        <text>已穿 {{ clothing.wear_count || 0 }} 次</text>
        <text v-if="clothing.last_worn_at"> · 上次 {{ formatDate(clothing.last_worn_at) }}</text>
      </view>
      <button class="wear-btn" @click="logWear">今天穿了这件</button>
    </view>

    <view class="edit-entry" @click="editing = !editing">
      {{ editing ? '收起修改' : '修改识别结果' }} <text>›</text>
    </view>

    <view v-if="editing" class="tag-panel">
      <view class="panel-title">修改识别结果</view>
      <view class="edit-field">
        <view class="edit-label">名称</view>
        <input class="edit-input" v-model="editForm.name" placeholder="衣物名称" />
      </view>
      <view class="edit-field">
        <view class="edit-label">分类</view>
        <picker :range="categoryOptions" :value="categoryIndex" @change="onCategoryChange">
          <view class="edit-picker">{{ editForm.category || '选择分类' }}</view>
        </picker>
      </view>
      <view class="edit-field">
        <view class="edit-label">颜色</view>
        <input class="edit-input" v-model="editForm.color" placeholder="颜色" />
      </view>
      <view class="edit-field">
        <view class="edit-label">材质</view>
        <input class="edit-input" v-model="editForm.material" placeholder="材质" />
      </view>
      <view class="edit-field">
        <view class="edit-label">版型</view>
        <picker :range="fitOptions" :value="fitIndex" @change="onFitChange">
          <view class="edit-picker">{{ editForm.fit || '选择版型' }}</view>
        </picker>
      </view>
      <button class="save-edit-btn" :loading="savingEdit" @click="saveEdit">保存修改</button>
    </view>

    <button class="price-button" @click="goPriceSearch">查相似价格</button>
    <button class="delete-button" :loading="removing" :disabled="removing" @click="confirmRemoveClothing">
      删除衣物
    </button>
  </view>
</template>

<script>
  let vk = uni.vk;
  const STORAGE_KEY = 'ai_private_wardrobe_clothing_drafts';

  export default {
    data() {
      return {
        clothingId: '',
        clothing: {},
        editing: false,
        removing: false,
        savingEdit: false,
        editForm: { name: '', category: '', color: '', material: '', fit: '' },
        categoryOptions: ['上衣', '下装', '外套', '鞋', '包', '配饰'],
        fitOptions: ['修身', '标准', '宽松', '短款', '长款'],
      };
    },
    onLoad(options = {}) {
      vk = uni.vk;
      this.clothingId = options.id || '';
      this.applyFallback(options.fallback);
      this.loadClothingDetail();
    },
    computed: {
      categoryIndex() { return Math.max(this.categoryOptions.indexOf(this.editForm.category), 0); },
      fitIndex() { return Math.max(this.fitOptions.indexOf(this.editForm.fit), 0); },
    },
    methods: {
      /**
       * 读取衣物详情。
       * 这一步对应 search_closet 的单品详情查询，确保 Agent 看到的不是列表摘要，而是一件衣物的完整上下文。
       */
      async loadClothingDetail() {
        if (!this.clothingId) return;

        try {
          const res = await this.callClothesApi('client/wardrobe/clothes.detail', {
            _id: this.clothingId,
          });
          if (res.clothing) {
            this.clothing = res.clothing;
            this.syncEditForm();
          }
        } catch (err) {
          console.error('读取衣物详情失败，使用列表传入数据兜底', err);
        }
      },
      /**
       * 应用列表页传入的兜底数据。
       * 云端详情读取失败时，仍能展示列表已有字段，方便开发阶段检查衣柜数据流。
       */
      applyFallback(fallback) {
        if (!fallback) return;
        try {
          this.clothing = JSON.parse(decodeURIComponent(fallback));
          this.syncEditForm();
        } catch (err) {
          console.error('解析衣物兜底数据失败', err);
        }
      },
      /**
       * 生成衣物展示名称。
       * 名称是 Agent 推荐解释里最常被引用的单品标识，优先使用云端 name，缺失时用颜色和类型兜底。
       */
      getClothName(item = {}) {
        if (item.name) return item.name;

        const type = item.type || item.category || '衣物';
        if (item.color && item.color !== '待识别') return `${item.color}${type}`;
        return type === '待识别' ? '待识别衣物' : type;
      },
      displayValue(value) {
        return value && value !== '待识别' ? value : '待识别';
      },
      /**
       * 汇总所有推荐标签。
       * 风格、季节、场景标签共同决定这件衣服在推荐时被检索和排序的机会。
       */
      getAllTags(item = {}) {
        return [
          ...(item.style_tags || []),
          ...(item.season_tags || []),
          ...(item.scene_tags || []),
        ];
      },
      /**
       * 跳转全网比价。
       * Agent 设计点：
       * 这里把已识别的衣物结构化字段转成搜索关键词，再交给服务端搜索 MCP 适配器。
       */
      goPriceSearch() {
        const query = [
          this.clothing.color,
          this.clothing.material,
          this.clothing.type,
          this.clothing.category,
        ].filter(Boolean).join(' ');

        uni.navigateTo({
          url: `/pages/wardrobe/price-search?query=${encodeURIComponent(query)}`,
        });
      },
      /**
       * 确认删除衣物。
       * 删除会影响 Agent 后续 search_closet 的结果，因此这里先让用户明确确认，避免误删可推荐单品。
       */
      confirmRemoveClothing() {
        uni.showModal({
          title: '删除衣物',
          content: '删除后这件衣服将不再参与后续穿搭推荐。',
          confirmText: '删除',
          confirmColor: '#d93026',
          success: (res) => {
            if (res.confirm) {
              this.removeClothing();
            }
          },
        });
      },
      /**
       * 删除衣物。
       * 云端采用软删除，状态改为 inactive；这样历史推荐和调试记录仍能追溯到原始单品。
       */
      async removeClothing() {
        if (!this.clothingId || this.removing) return;

        this.removing = true;

        try {
          await this.callClothesApi('client/wardrobe/clothes.remove', {
            _id: this.clothingId,
          });
          this.removeLocalClothing();

          uni.showToast({
            title: '已删除',
            icon: 'success',
          });

          setTimeout(() => {
            uni.navigateBack();
          }, 500);
        } catch (err) {
          console.error('删除衣物失败', err);
          uni.showToast({
            title: '删除失败，请重试',
            icon: 'none',
          });
        } finally {
          this.removing = false;
        }
      },
      /**
       * 清理本地衣柜备份。
       * 本地缓存只是云端衣柜的兜底数据；删除云端记录后同步移除，避免下次离线兜底又显示已删除单品。
       */
      removeLocalClothing() {
        const clothes = uni.getStorageSync(STORAGE_KEY) || [];
        const nextClothes = clothes.filter((item) => {
          const itemId = item._id || item.id;
          return itemId !== this.clothingId;
        });

        uni.setStorageSync(STORAGE_KEY, nextClothes);
      },
      /**
       * 调用衣柜相关云函数。
       */
      callClothesApi(url, data = {}) {
        return vk.callFunction({ url, data, loading: false });
      },

      /**
       * 加载衣物详情后同步编辑表单。
       * Agent 设计点：编辑模式让用户可以修正 AI 识别不准确的字段。
       */
      syncEditForm() {
        this.editForm = {
          name: this.clothing.name || '',
          category: this.clothing.category || '',
          color: this.clothing.color || '',
          material: this.clothing.material || '',
          fit: this.clothing.fit || '',
        };
      },

      onCategoryChange(e) { this.editForm.category = this.categoryOptions[e.detail.value]; },
      onFitChange(e) { this.editForm.fit = this.fitOptions[e.detail.value]; },

      /**
       * 保存编辑。
       * Agent 设计点：编辑后的字段直接影响 search_closet 检索结果和穿搭推荐质量。
       */
      async saveEdit() {
        if (this.savingEdit) return;
        this.savingEdit = true;
        try {
          await this.callClothesApi('client/wardrobe/clothes.update', {
            _id: this.clothingId,
            clothing: this.editForm,
          });
          this.clothing = { ...this.clothing, ...this.editForm };
          this.editing = false;
          uni.showToast({ title: '已保存', icon: 'success' });
        } catch (err) {
          console.error('保存编辑失败', err);
          uni.showToast({ title: '保存失败', icon: 'none' });
        } finally { this.savingEdit = false; }
      },

      /**
       * 记录穿着。
       * Agent 设计点：穿着频次是推荐排序的重要信号——常穿单品权重提升。
       */
      async logWear() {
        try {
          const res = await vk.callFunction({
            url: 'client/wardrobe/clothes.wearLog',
            data: { _id: this.clothingId },
            loading: false,
          });
          this.clothing.wear_count = res.wear_count || (this.clothing.wear_count || 0) + 1;
          this.clothing.last_worn_at = res.last_worn_at || Date.now();
          uni.showToast({ title: `已记录（${this.clothing.wear_count} 次）`, icon: 'success' });
        } catch (err) {
          console.error('记录穿着失败', err);
        }
      },

      formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
  };
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 32rpx 32rpx 80rpx;
    background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
  }

  .hero-image {
    width: 100%;
    height: 560rpx;
    border-radius: 30rpx;
    background: #f1e4d6;
    box-shadow: var(--wardrobe-shadow-strong);
  }

  .image-empty {
    display: flex;
    width: 100%;
    height: 360rpx;
    align-items: center;
    justify-content: center;
    border-radius: 30rpx;
    background: #f1e4d6;
    color: var(--wardrobe-muted);
    font-size: 26rpx;
  }

  .info-panel,
  .tag-panel {
    margin-top: 24rpx;
    padding: 30rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 24rpx;
    background: var(--wardrobe-surface);
    box-shadow: var(--wardrobe-shadow);
  }

  .cloth-name {
    color: var(--wardrobe-text);
    font-size: 36rpx;
    font-weight: 700;
    line-height: 1.35;
  }

  .cloth-meta {
    margin-top: 10rpx;
    color: var(--wardrobe-muted);
    font-size: 25rpx;
    line-height: 1.4;
  }

  .field-list {
    margin-top: 20rpx;
  }

  .field-row {
    display: flex;
    padding: 16rpx 0;
    border-top: 1rpx solid var(--wardrobe-border);
  }

  .field-label {
    width: 150rpx;
    flex: 0 0 150rpx;
    color: var(--wardrobe-muted);
    font-size: 25rpx;
    line-height: 1.45;
  }

  .field-value {
    min-width: 0;
    flex: 1;
    color: var(--wardrobe-text);
    font-size: 25rpx;
    line-height: 1.45;
  }

  .panel-title {
    margin-bottom: 18rpx;
    color: var(--wardrobe-text);
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.4;
  }

  .tag-group {
    display: flex;
    flex-wrap: wrap;
  }

  .tag {
    margin-right: 12rpx;
    margin-bottom: 12rpx;
    padding: 10rpx 14rpx;
    border-radius: 999rpx;
    background: #fff3e8;
    color: var(--wardrobe-primary-deep);
    font-size: 24rpx;
    line-height: 1.2;
  }

  .tag.muted {
    background: #f7eee4;
    color: var(--wardrobe-muted);
  }

  .price-button,
  .delete-button {
    margin-top: 32rpx;
    border-radius: 999rpx;
  }

  .price-button {
    background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
    color: #ffffff;
  }

  .delete-button {
    margin-top: 18rpx;
    border: 1rpx solid #f0c9c5;
    background: var(--wardrobe-surface-solid);
    color: var(--wardrobe-danger);
  }

  /* 穿着记录 */
  .wear-info { margin-top: 10rpx; color: var(--wardrobe-muted); font-size: 25rpx; }
  .wear-btn { margin-top: 18rpx; height: 64rpx; border-radius: 999rpx; background: #fff3e8; color: var(--wardrobe-primary-deep); font-size: 24rpx; line-height: 64rpx; }

  .edit-entry {
    margin-top: 24rpx;
    padding: 24rpx 30rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 24rpx;
    background: var(--wardrobe-surface);
    box-shadow: var(--wardrobe-shadow);
    color: var(--wardrobe-primary-deep);
    font-size: 26rpx;
    font-weight: 600;
    line-height: 1.4;
  }

  .edit-entry text {
    margin-left: 6rpx;
  }

  /* 编辑模式 */
  .edit-field { display: flex; align-items: center; margin-top: 16rpx; padding: 12rpx 0; border-bottom: 1rpx solid var(--wardrobe-border); }
  .edit-label { width: 100rpx; flex: 0 0 100rpx; color: var(--wardrobe-muted); font-size: 25rpx; }
  .edit-input { flex: 1; height: 56rpx; padding: 0 12rpx; border: 1rpx solid var(--wardrobe-border); border-radius: 12rpx; background: var(--wardrobe-surface-solid); font-size: 25rpx; }
  .edit-picker { flex: 1; height: 56rpx; padding: 0 12rpx; line-height: 56rpx; color: var(--wardrobe-text); font-size: 25rpx; }
  .save-edit-btn { margin-top: 20rpx; height: 66rpx; border-radius: 999rpx; background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep)); color: #fff; font-size: 25rpx; line-height: 66rpx; }
</style>
