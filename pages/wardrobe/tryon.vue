<template>
  <view class="page">
    <view class="header">
      <view class="title">AI 试穿</view>
      <view class="subtitle">一次试穿尽量生成整套效果。先上传本人照，再选上衣、下装、鞋包，缺的让 AI 补齐。</view>
    </view>

    <view class="quota-card" @click="goMember">
      <view>
        <view class="quota-title">{{ member.plan_text || '免费版' }}</view>
        <view class="quota-desc">剩余试穿 {{ member.tryon_quota_balance }} 次 · 点击管理权益</view>
      </view>
      <view class="quota-arrow">›</view>
    </view>

    <view class="step-card">
      <view class="section-head">
        <view>
          <view class="step-label">本人照片</view>
          <view class="section-desc">建议正面全身、光线清晰，生成效果更稳定。</view>
        </view>
        <view v-if="personImageUrl" class="change-link" @click.stop="choosePersonImage">更换</view>
      </view>
      <view class="photo-area" @click="personImageUrl ? null : choosePersonImage()">
        <image v-if="personImageUrl" class="person-img" :src="personImageUrl" mode="aspectFill"></image>
        <view v-else class="photo-empty">
          <view class="photo-text">上传全身照</view>
          <view class="photo-hint">正面、光线清晰、身体完整</view>
        </view>
      </view>
      <view v-if="savedPersonImageUrl && !personImageUrl" class="saved-photo-actions">
        <button class="saved-photo-btn primary" @click="useSavedPersonImage">使用上次全身照</button>
        <button class="saved-photo-btn" @click="choosePersonImage">重新上传</button>
      </view>
      <view v-if="bodyAnalysis" class="body-tags">
        <text v-for="tag in bodyTags" :key="tag" class="body-tag">{{ tag }}</text>
      </view>
    </view>

    <view class="step-card">
      <view class="section-head">
        <view>
          <view class="step-label">要试的整套搭配</view>
          <view class="section-desc">一次生成会消耗额度，建议把上衣、下装、鞋包一起试。</view>
        </view>
        <view class="change-link" @click="autoComplete">AI 补齐</view>
      </view>

      <view class="slot-list">
        <view v-for="slot in outfitSlots" :key="slot.key" class="slot-row">
          <view class="slot-left" @click="chooseSlotFromWardrobe(slot)">
            <image v-if="getSlotItem(slot)" class="slot-img" :src="getSlotItem(slot).image_url" mode="aspectFill"></image>
            <view v-else class="slot-empty">+</view>
            <view class="slot-copy">
              <view class="slot-title">{{ slot.label }}<text v-if="slot.optional" class="optional">可选</text></view>
              <view class="slot-desc">{{ getSlotItem(slot) ? getClothName(getSlotItem(slot)) : slot.hint }}</view>
            </view>
          </view>
          <view class="slot-actions">
            <view class="slot-action" @click="chooseSlotFromWardrobe(slot)">衣橱</view>
            <view class="slot-action" @click="uploadSlotImage(slot)">上传</view>
          </view>
        </view>
        <view v-if="needsCompleteOutfit" class="value-hint">
          为了更值，一次试穿建议生成整套效果。你可以让 AI 从衣橱里补齐缺的单品。
        </view>
      </view>
    </view>

    <view v-if="slotPickerVisible" class="step-card">
      <view class="section-head">
        <view>
          <view class="step-label">选择{{ currentSlotLabel }}</view>
          <view class="section-desc">从衣橱里选一件，或直接上传想试的商品图。</view>
        </view>
        <view class="change-link" @click="slotPickerVisible = false">收起</view>
      </view>

      <scroll-view class="category-scroll" scroll-x>
        <view class="category-row">
          <view
            v-for="cat in categoryOptions"
            :key="cat"
            class="category-chip"
            :class="{ active: activeCategory === cat }"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </view>
        </view>
      </scroll-view>

      <view class="clothes-grid">
        <view
          v-for="item in filteredWardrobe"
          :key="getKey(item)"
          class="cloth-item"
          :class="{ selected: isSelected(item) }"
          @click="selectClothForCurrentSlot(item)"
        >
          <image class="cloth-img" :src="item.image_url" mode="aspectFill"></image>
          <view class="cloth-name">{{ getClothName(item) }}</view>
          <view v-if="isSelected(item)" class="selected-mark">✓</view>
        </view>
      </view>
      <view v-if="!filteredWardrobe.length" class="empty-hint">衣橱暂无这类衣物，可以直接上传图片试穿。</view>
      <button class="upload-current-btn" :loading="analyzingUpload" @click="uploadCurrentSlotImage">上传{{ currentSlotLabel }}</button>
    </view>

    <view class="advanced-entry" @click="showAdvanced = !showAdvanced">
      {{ showAdvanced ? '收起更多方式' : '更多试穿方式' }} <text>›</text>
    </view>

    <view v-if="showAdvanced" class="step-card">
      <view class="step-label">买前试穿</view>
      <view class="section-desc">上传想买的衣服，AI 会分析适合度，并尽量从衣橱里补齐整套。</view>
      <view class="shopping-area">
        <view class="upload-slot large" @click="uploadProductImage">
          <image v-if="productImageUrl" class="uploaded-img" :src="productImageUrl" mode="aspectFill"></image>
          <view v-else class="upload-empty">
            <text class="upload-plus">+</text>
            <text class="upload-label">上传你想买的衣服图片</text>
            <text class="upload-hint">淘宝/京东截图或商品图</text>
          </view>
        </view>
        <button v-if="productImageUrl" class="analyze-btn" :loading="analyzingProduct" @click="analyzeShoppingItem">
          AI 分析这件衣服适合我吗
        </button>
      </view>
    </view>

    <!-- AI 帮搭结果（上衣/下衣模式） -->
    <view v-if="autoCompleteResult" class="result-card">
      <view class="result-title">AI 已补齐整套</view>
      <view class="complete-outfit">
        <view v-for="item in autoCompleteResult.outfit_items" :key="item._id || item.name" class="outfit-piece">
          <image v-if="item.image_url" class="piece-img" :src="item.image_url" mode="aspectFill"></image>
          <view v-else class="piece-placeholder">{{ item.category }}</view>
          <view class="piece-name">{{ item.name || item.category }}</view>
          <view class="piece-source">{{ item.source || '衣橱' }}</view>
        </view>
      </view>
      <view class="outfit-reason">{{ autoCompleteResult.reason }}</view>
    </view>

    <!-- 购物分析结果 -->
    <view v-if="shoppingResult" class="result-card">
      <view class="result-title">购物分析</view>
      <view class="score-big" :class="scoreClass">{{ shoppingResult.score }}分</view>
      <view class="score-verdict">{{ shoppingResult.verdict }}</view>
      <view class="analysis-detail">{{ shoppingResult.reason }}</view>
      <view v-if="shoppingResult.match_items && shoppingResult.match_items.length" class="match-section">
        <view class="match-title">可搭配的已有衣物</view>
        <view class="match-row">
          <view v-for="item in shoppingResult.match_items" :key="item._id" class="match-item">
            <image class="match-img" :src="item.image_url" mode="aspectFill"></image>
            <view class="match-name">{{ item.name }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 生成按钮 -->
    <button
      class="generate-btn"
      :loading="generating"
      :disabled="!canTakePrimaryAction"
      @click="handlePrimaryAction"
    >
      {{ generateButtonText }}
    </button>

    <view v-if="generating || currentTryonTaskId" class="tryon-tip">
      <view class="tryon-tip-title">AI 正在换装，预计 1-2 分钟生成</view>
      <view class="tryon-tip-desc">你可以先去看其他页面，稍后回到试穿历史刷新查看效果。</view>
    </view>

    <!-- 生成结果 -->
    <view v-if="resultImageUrl" class="result-panel">
      <image class="result-img" :src="resultImageUrl" mode="widthFix"></image>
      <view class="result-actions">
        <button class="action-btn" @click="saveResult">保存</button>
        <button class="action-btn" @click="retryGenerate">重试</button>
      </view>
    </view>

    <view class="history-card">
      <view class="history-head">
        <view class="history-title">试穿历史</view>
        <view class="refresh-link" @click="loadTryonHistory">刷新</view>
      </view>
      <view v-if="tryonHistory.length">
        <view v-for="record in tryonHistory" :key="record._id" class="history-row" @click="previewHistory(record)">
          <image v-if="record.result_image_url" class="history-img" :src="record.result_image_url" mode="aspectFill"></image>
          <view v-else class="history-img empty-img">{{ record.status === 'generating' ? '生成中' : '无图' }}</view>
          <view class="history-copy">
            <view class="history-status">{{ statusText(record.status) }}</view>
            <view class="history-time">{{ formatDate(record.created_at) }}</view>
            <view v-if="record.status === 'generating'" class="history-hint">预计 1-2 分钟完成，点击可继续刷新</view>
            <view v-if="record.error_message" class="history-error">{{ record.error_message }}</view>
          </view>
        </view>
      </view>
      <view v-else class="empty-history">暂无试穿历史</view>
    </view>
  </view>
</template>

<script>
let vk = uni.vk;

export default {
  data() {
    return {
      personImageUrl: '',
      personFileId: '',
      bodyAnalysis: null,

      // Main flow
      activeMode: 'full',
      showAdvanced: false,
      slotPickerVisible: false,
      currentSlotKey: '',
      outfitSlots: [
        { key: 'top', label: '上衣', category: '上衣', hint: '选择上衣或上传商品图' },
        { key: 'bottom', label: '下装', category: '下装', hint: '选择裤子或裙装' },
        { key: 'outer', label: '外套', category: '外套', hint: '需要外套时再选', optional: true },
        { key: 'shoes', label: '鞋', category: '鞋', hint: '选择一双鞋', optional: true },
        { key: 'accessory', label: '包/配饰', category: '包', altCategories: ['包', '配饰'], hint: '包和配饰可选', optional: true },
      ],
      clothingSource: 'wardrobe',
      activeCategory: '全部',
      categoryOptions: ['全部', '上衣', '下装', '外套', '鞋', '包', '配饰'],
      wardrobe: [],
      selectedClothes: [],
      savedPersonImageUrl: '',
      savedPersonFileId: '',
      savedBodyAnalysis: null,

      // Upload
      uploadedClothes: [],
      analyzingUpload: false,

      // Shopping
      productImageUrl: '',
      analyzingProduct: false,
      shoppingResult: null,

      // Auto complete
      autoCompleteResult: null,

      // Generate
      generating: false,
      currentTryonTaskId: '',
      tryonPollingText: '',
      tryonPollTimer: null,
      tryonPollStartedAt: 0,
      resultImageUrl: '',
      member: { plan_text: '免费版', tryon_quota_balance: 3 },
      tryonHistory: [],
    };
  },

  computed: {
    bodyTags() {
      if (!this.bodyAnalysis) return [];
      const tags = [];
      if (this.bodyAnalysis.body_type) tags.push(this.bodyAnalysis.body_type);
      if (this.bodyAnalysis.height_estimate) tags.push(this.bodyAnalysis.height_estimate);
      if (this.bodyAnalysis.style_impression) tags.push(this.bodyAnalysis.style_impression);
      return tags;
    },

	    filteredWardrobe() {
	      if (this.activeCategory === '全部') return this.wardrobe;
	      return this.wardrobe.filter((c) => c.category === this.activeCategory);
	    },

	    selectedOutfitItems() {
	      return this.collectAllClothes();
	    },

	    requiredSelectedCount() {
	      return this.outfitSlots.filter((slot) => !slot.optional && this.getSlotItem(slot)).length;
	    },

	    needsCompleteOutfit() {
	      return this.selectedOutfitItems.length > 0 && this.requiredSelectedCount < 2 && !this.autoCompleteResult;
	    },

	    canTakePrimaryAction() {
	      return Boolean(this.personImageUrl && (this.selectedOutfitItems.length || this.autoCompleteResult));
	    },

	    generateButtonText() {
	      if (this.generating) return this.tryonPollingText || 'AI 换装生成中...';
	      if (!this.personImageUrl) return '先上传本人照';
	      if (!this.selectedOutfitItems.length && !this.autoCompleteResult) return '选择要试的搭配';
	      if (!this.autoCompleteResult && this.requiredSelectedCount < 2) return 'AI 补齐整套';
	      return '生成整套试穿';
	    },

	    scoreClass() {
      if (!this.shoppingResult) return '';
      const s = Number(this.shoppingResult.score) || 0;
      if (s >= 80) return 'good';
      if (s >= 60) return 'ok';
	      return 'bad';
	    },

	    currentSlot() {
	      return this.outfitSlots.find((slot) => slot.key === this.currentSlotKey) || this.outfitSlots[0];
	    },

	    currentSlotLabel() {
	      return this.currentSlot ? this.currentSlot.label : '衣服';
	    },
	  },

  onLoad() {
    vk = uni.vk;
    this.loadWardrobe();
    this.loadMember();
    this.loadSavedPersonPhoto();
    this.loadTryonHistory();
  },

  onUnload() {
    this.clearTryonPollTimer();
  },

  methods: {
    /**
     * 读取会员额度。
     * Agent 设计点：
     * 试穿是高成本图像生成能力，生成前必须让用户知道剩余额度。
     * 额度来自服务端 user_profile，不能只在前端本地计数。
     */
    async loadMember() {
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/commerce.member',
          data: {},
          loading: false,
        });
        if (res.member) this.member = { ...this.member, ...res.member };
      } catch (err) { console.error('读取会员额度失败', err); }
    },

    /**
     * 读取试穿历史。
     * Agent 设计点：
     * 异步图像生成可能超过本页等待时间，历史列表允许用户稍后回来查看结果和失败原因。
     */
    async loadTryonHistory() {
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/tryon.list',
          data: {},
          loading: false,
        });
        this.tryonHistory = res.rows || [];
        if (!this.generating) this.refreshLatestGeneratingTryon();
      } catch (err) { console.error('读取试穿历史失败', err); }
    },

    async loadSavedPersonPhoto() {
      // AI Agent 学习注释：复用用户长期资料
      // 用户上传过一次全身照后，后端保存到 user_profile。
      // 下次进入试穿页先读取它，让用户可以直接“使用上次全身照”，减少重复输入。
      // 这属于长期用户 Context，不是聊天会话里的短期记忆。
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/profile.get',
          data: {},
          loading: false,
        });
        const profile = res.profile || {};
        this.savedPersonImageUrl = profile.tryon_person_image_url || '';
        this.savedPersonFileId = profile.tryon_person_file_id || '';
        this.savedBodyAnalysis = profile.tryon_body_analysis || null;
      } catch (err) {
        console.error('读取试穿资料照失败', err);
      }
    },

    useSavedPersonImage() {
      // AI Agent 学习注释：恢复长期 Context
      // 这里把 user_profile 里保存的人像照片和 body_analysis 恢复到当前试穿任务。
      // 后续 autoComplete / generateTryon 会把这些作为本轮试穿上下文使用。
      if (!this.savedPersonImageUrl) return;
      this.personImageUrl = this.savedPersonImageUrl;
      this.personFileId = this.savedPersonFileId || '';
      this.bodyAnalysis = this.savedBodyAnalysis || null;
    },

    /**
     * 刷新最近一条生成中的试穿任务。
     * Agent 设计点：
     * 火山异步任务可能在用户离开页面后完成；历史刷新需要主动用 task_id 对账一次，
     * 否则数据库会一直停留在 generating，用户看不到已生成结果。
     */
    async refreshLatestGeneratingTryon() {
      const record = (this.tryonHistory || []).find((item) => item.status === 'generating' && item.provider_task_id);
      if (!record) return;
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/tryon.checkResult',
          data: { task_id: record.provider_task_id },
          loading: false,
        });
        if (res.status === 'done' && res.result_image_url) {
          record.status = 'success';
          record.result_image_url = res.result_image_url;
          record.error_message = '';
        } else if (res.status === 'error' || res.status === 'expired' || res.status === 'not_found') {
          record.status = 'failed';
          record.error_message = res.error_message || '生成失败';
        }
      } catch (err) {
        console.error('刷新试穿任务失败', err);
      }
    },

    // ========== 本人照片 ==========
    choosePersonImage() {
      // AI Agent 学习注释：多模态输入采集
      // 用户上传的是本人全身照，属于图片上下文。
      // 上传成功后会调用 analyzeBody() 转成结构化 bodyAnalysis，再保存到 user_profile 供下次复用。
      uni.chooseImage({
        count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
        success: async (res) => {
          const fp = res.tempFilePaths && res.tempFilePaths[0];
          if (!fp) return;
          uni.showLoading({ title: '上传中' });
          try {
            const up = await vk.uploadFile({
              filePath: fp, provider: 'unicloud',
              cloudDirectory: 'wardrobe/tryon/person', needSave: false, errorToast: true,
            });
            this.personImageUrl = up.url || up.fileURL || fp;
            this.personFileId = up.fileID || '';
            await this.analyzeBody();
            this.savePersonPhoto();
          } catch (err) {
            uni.showToast({ title: '上传失败', icon: 'none' });
          } finally { uni.hideLoading(); }
        },
      });
    },

    /**
     * AI 分析人像。
     * Agent 设计点：用 Vision 模型识别人物身材比例、体型，后续搭配时参考。
     *
     * AI Agent 学习注释：图片转结构化 Context
     * 全身照本身不能直接给普通文本搭配逻辑使用。
     * 所以先让视觉模型输出 body_type / height_estimate / style_impression 等字段，
     * 再把这些字段传给试穿补齐和购物决策。
     */
    async analyzeBody() {
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/tryon.analyzeBody',
          data: { person_image_url: this.personImageUrl },
          loading: false,
        });
        this.bodyAnalysis = res.body || null;
        return this.bodyAnalysis;
      } catch (err) { console.error('人像分析失败', err); }
    },

    async savePersonPhoto() {
      // AI Agent 学习注释：长期记忆落库
      // 本人试穿照和 bodyAnalysis 存入 user_profile。
      // 这不是公开资料，只是当前用户自己的长期上下文，用来减少下次试穿步骤。
      if (!this.personImageUrl) return;
      try {
        await vk.callFunction({
          url: 'client/wardrobe/profile.save',
          data: {
            profile: {
              tryon_person_image_url: this.personImageUrl,
              tryon_person_file_id: this.personFileId,
              tryon_body_analysis: this.bodyAnalysis || null,
            },
          },
          loading: false,
        });
        this.savedPersonImageUrl = this.personImageUrl;
        this.savedPersonFileId = this.personFileId;
        this.savedBodyAnalysis = this.bodyAnalysis || null;
      } catch (err) {
        console.error('保存试穿资料照失败', err);
      }
    },

    // ========== 模式切换 ==========
	    switchMode(key) {
	      this.activeMode = key;
	      this.selectedClothes = [];
	      this.uploadedClothes = [];
	      this.autoCompleteResult = null;
	      this.shoppingResult = null;
	      this.resultImageUrl = '';
      this.productImageUrl = '';
    },

    // ========== 衣橱选择 ==========
    async loadWardrobe() {
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/clothes.list', data: {}, loading: false,
        });
        this.wardrobe = res.rows || [];
      } catch (err) { console.error('加载衣橱失败', err); }
    },

    getKey(item) { return item._id || item.id; },
	    getClothName(item) {
	      const t = item.type || item.category || '衣物';
	      return item.color ? `${item.color}${t}` : t;
	    },

	    getSlotCategories(slot) {
	      return [slot.category, ...(slot.altCategories || [])].filter(Boolean);
	    },

	    getSlotItem(slot) {
	      const categories = this.getSlotCategories(slot);
	      return this.selectedClothes.find((item) => categories.indexOf(item.category) > -1) ||
	        this.uploadedClothes.find((item) => item && item.slotKey === slot.key) ||
	        null;
	    },

	    chooseSlotFromWardrobe(slot) {
	      this.currentSlotKey = slot.key;
	      this.activeCategory = slot.category || '全部';
	      this.slotPickerVisible = true;
	    },

	    selectClothForCurrentSlot(item) {
	      const slot = this.currentSlot;
	      const categories = this.getSlotCategories(slot);
	      this.selectedClothes = this.selectedClothes.filter((cloth) => categories.indexOf(cloth.category) === -1);
	      this.uploadedClothes = this.uploadedClothes.filter((cloth) => cloth.slotKey !== slot.key);
	      this.selectedClothes.push(item);
	      this.autoCompleteResult = null;
	      this.slotPickerVisible = false;
	    },

	    isSelected(item) {
	      return this.selectedClothes.some((c) => this.getKey(c) === this.getKey(item));
	    },

    toggleCloth(item) {
      const idx = this.selectedClothes.findIndex((c) => this.getKey(c) === this.getKey(item));
      if (idx > -1) this.selectedClothes.splice(idx, 1);
      else this.selectedClothes.push(item);
	      this.autoCompleteResult = null;
	    },

	    uploadSlotImage(slot) {
	      this.currentSlotKey = slot.key;
	      this.uploadCurrentSlotImage();
	    },

	    uploadCurrentSlotImage() {
	      const slot = this.currentSlot;
	      this.uploadSlotImageBySlot(slot);
	    },

	    uploadSlotImageBySlot(slot) {
	      if (!slot) return;
	      uni.chooseImage({
	        count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
	        success: async (res) => {
	          const fp = res.tempFilePaths && res.tempFilePaths[0];
	          if (!fp) return;
	          uni.showLoading({ title: '上传中' });
	          try {
	            const up = await vk.uploadFile({
	              filePath: fp,
	              provider: 'unicloud',
	              cloudDirectory: 'wardrobe/tryon/clothes',
	              needSave: false,
	              errorToast: true,
	            });
	            const uploaded = {
	              image_url: up.url || up.fileURL || fp,
	              image_file_id: up.fileID || '',
	              category: slot.category,
	              name: slot.label,
	              source: 'upload',
	              slotKey: slot.key,
	              local: true,
	            };
	            this.selectedClothes = this.selectedClothes.filter((cloth) => this.getSlotCategories(slot).indexOf(cloth.category) === -1);
	            this.uploadedClothes = this.uploadedClothes.filter((cloth) => cloth.slotKey !== slot.key);
	            this.uploadedClothes.push(uploaded);
	            this.autoCompleteResult = null;
	            this.slotPickerVisible = false;
	            this.analyzeUploadedClothes();
	          } catch (err) {
	            console.error('上传试穿衣物失败', err);
	            uni.showToast({ title: '上传失败', icon: 'none' });
	          } finally {
	            uni.hideLoading();
	          }
	        },
	      });
	    },

    // ========== 上传图片 ==========
    uploadClothImage(idx) {
      uni.chooseImage({
        count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
        success: async (res) => {
          const fp = res.tempFilePaths && res.tempFilePaths[0];
          if (!fp) return;
          uni.showLoading({ title: '上传中' });
          try {
            const up = await vk.uploadFile({
              filePath: fp,
              provider: 'unicloud',
              cloudDirectory: 'wardrobe/tryon/clothes',
              needSave: false,
              errorToast: true,
            });
            const newArr = [...this.uploadedClothes];
            newArr[idx] = {
              image_url: up.url || up.fileURL || fp,
              image_file_id: up.fileID || '',
              local: true,
              slot: idx,
            };
            this.uploadedClothes = newArr;
          } catch (err) {
            console.error('上传试穿衣物失败', err);
            uni.showToast({ title: '上传失败', icon: 'none' });
          } finally {
            uni.hideLoading();
          }
        },
      });
    },

    removeUpload(idx) {
      const newArr = [...this.uploadedClothes];
      newArr[idx] = null;
      this.uploadedClothes = newArr;
    },

    /**
     * AI 识别上传的衣服图片。
     * Agent 设计点：复用 clothes.analyze 的 Vision 识别能力，
     * 把外部商品图片转成结构化字段，后续搭配推荐用。
     */
	    async analyzeUploadedClothes() {
	      this.analyzingUpload = true;
	      const toAnalyze = this.uploadedClothes.filter((c) => c && c.local);
	      try {
	        for (const cloth of toAnalyze) {
          const res = await vk.callFunction({
            url: 'client/wardrobe/clothes.analyze',
            data: { image_url: cloth.image_url, image_file_id: cloth.image_file_id || '' },
            loading: false,
	          });
	          if (res.analysis) {
	            this.uploadedClothes = this.uploadedClothes.map((item) => {
	              const sameSlot = cloth.slotKey && item.slotKey === cloth.slotKey;
	              const sameLegacySlot = cloth.slot !== undefined && item.slot === cloth.slot;
	              if (!sameSlot && !sameLegacySlot) return item;
	              return {
	                ...item,
	                ...res.analysis,
	                category: res.analysis.category || item.category,
	                image_url: cloth.image_url,
	                image_file_id: cloth.image_file_id || '',
	                source: 'upload',
	                local: false,
	              };
	            });
	          }
	        }
	        if (toAnalyze.length) uni.showToast({ title: '识别完成', icon: 'success' });
	      } catch (err) {
	        console.error('识别失败', err);
	        uni.showToast({ title: '已上传，可继续生成', icon: 'none' });
	      } finally { this.analyzingUpload = false; }
	    },

    // ========== 购物决策 ==========
    uploadProductImage() {
      uni.chooseImage({
        count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
        success: (res) => {
          const fp = res.tempFilePaths && res.tempFilePaths[0];
          if (!fp) return;
          uni.showLoading({ title: '上传中' });
          vk.uploadFile({
            filePath: fp, provider: 'unicloud',
            cloudDirectory: 'wardrobe/tryon/product', needSave: false,
            success: (up) => {
              this.productImageUrl = up.url || up.fileURL || fp;
              uni.hideLoading();
            },
            fail: () => { uni.hideLoading(); uni.showToast({ title: '上传失败', icon: 'none' }); },
          });
        },
      });
    },

    /**
     * 购物决策分析。
     * Agent 设计点：这是商业价值最高的功能。
     * AI 分析商品是否适合用户的身材、风格，以及能否和已有衣柜搭配。
     */
    async analyzeShoppingItem() {
      if (!this.productImageUrl) return;
      this.analyzingProduct = true;
      try {
        const res = await vk.callFunction({
          url: 'client/wardrobe/tryon.shoppingDecision',
          data: {
            product_image_url: this.productImageUrl,
            person_image_url: this.personImageUrl,
            body_analysis: this.bodyAnalysis,
          },
          loading: false,
        });
        this.shoppingResult = res.decision || null;
      } catch (err) {
        console.error('购物分析失败', err);
      } finally { this.analyzingProduct = false; }
    },

    // ========== 生成试穿 ==========
    /**
     * 生成试穿效果。
     * 火山引擎图片换装是异步接口：先提交任务拿到 task_id，
     * 然后轮询 checkResult 直到 status=done。
     *
     * AI Agent 学习注释：高成本工具调用
     * AI 试穿费用高、耗时长，所以生成前如果用户只选了很少单品，会先 autoComplete 补齐整套。
     * 这样一次试穿尽量看到上衣、下装、鞋、包/外套等完整效果，而不是浪费一次机会只试单件。
     */
	    async generateTryon() {
	      if (!this.personImageUrl || this.generating) return;

	      if (this.requiredSelectedCount < 2 && !this.autoCompleteResult) {
	        await this.autoComplete();
	        if (!this.autoCompleteResult) return;
	      }

      this.generating = true;
      let keepPolling = false;
      try {
        const allClothes = this.collectAllClothes();

        // 提交任务
        const submitRes = await vk.callFunction({
          url: 'client/wardrobe/tryon.generate',
          data: {
	            person_image_url: this.personImageUrl,
	            person_file_id: this.personFileId,
	            mode: 'full',
	            clothes: allClothes,
            auto_complete: this.autoCompleteResult,
            body_analysis: this.bodyAnalysis,
          },
          loading: false,
        });

        const taskId = submitRes.task_id || (submitRes.record && submitRes.record.provider_task_id) || '';
        if (!taskId) {
          uni.showToast({ title: submitRes.msg || '提交任务失败', icon: 'none' });
          this.generating = false;
          return;
        }

        // 按火山异步任务模型轮询结果。
        // 文档示例里生成耗时可能超过 60 秒，所以这里不再用固定 20 次短轮询直接判失败。
        keepPolling = true;
        uni.showToast({ title: '已提交，预计 1-2 分钟生成', icon: 'none' });
        this.startTryonPolling(taskId);
      } catch (err) {
        console.error('试穿生成失败', err);
        uni.showToast({ title: '生成失败', icon: 'none' });
      } finally {
        if (!keepPolling) {
          this.generating = false;
          uni.hideLoading();
        }
      }
    },

    /**
     * 轮询火山异步任务结果。
     * Agent 设计点：
     * AI 试穿不是同步 LLM 文本生成，而是成本型图像异步任务；提交成功只代表排队/受理成功。
     * 这里用 task_id 作为长期任务句柄，页面轮询只负责刷新状态，超过前台等待窗口也不把任务标记失败。
     */
    startTryonPolling(taskId) {
      if (!taskId) return;
      const maxWaitMs = 180000;
      const pollIntervalMs = 4000;
      this.clearTryonPollTimer();
      this.currentTryonTaskId = taskId;
      this.generating = true;
      this.tryonPollStartedAt = Date.now();
      this.tryonPollingText = 'AI 换装生成中...';
      uni.showLoading({ title: 'AI 换装生成中...' });

      const poll = async () => {
        const elapsed = Date.now() - this.tryonPollStartedAt;
        try {
          const checkRes = await vk.callFunction({
            url: 'client/wardrobe/tryon.checkResult',
            data: { task_id: taskId },
            loading: false,
          });

          if (checkRes.status === 'done') {
            this.finishTryonPolling();
            this.resultImageUrl = checkRes.result_image_url || '';
            this.loadMember();
            this.loadTryonHistory();
            uni.showToast({ title: '试穿完成', icon: 'success' });
            return;
          }

          if (checkRes.status === 'not_found' || checkRes.status === 'expired' || checkRes.status === 'error') {
            this.finishTryonPolling();
            uni.showToast({ title: checkRes.error_message || '生成失败', icon: 'none' });
            this.loadTryonHistory();
            return;
          }

          if (elapsed >= maxWaitMs) {
            this.finishTryonPolling();
            uni.showToast({ title: '已提交生成，稍后在试穿历史刷新', icon: 'none' });
            this.loadTryonHistory();
            return;
          }

          const seconds = Math.max(0, Math.ceil((maxWaitMs - elapsed) / 1000));
          this.tryonPollingText = `生成中，最多等待 ${seconds}s`;
          this.tryonPollTimer = setTimeout(poll, pollIntervalMs);
        } catch (err) {
          console.error('查询试穿结果失败', err);
          if (elapsed >= maxWaitMs) {
            this.finishTryonPolling();
            uni.showToast({ title: '查询超时，稍后在试穿历史刷新', icon: 'none' });
            return;
          }
          this.tryonPollTimer = setTimeout(poll, 4000);
        }
      };

      this.tryonPollTimer = setTimeout(poll, pollIntervalMs);
    },

    finishTryonPolling() {
      this.clearTryonPollTimer();
      this.generating = false;
      this.currentTryonTaskId = '';
      this.tryonPollingText = '';
      uni.hideLoading();
    },

    clearTryonPollTimer() {
      if (this.tryonPollTimer) {
        clearTimeout(this.tryonPollTimer);
        this.tryonPollTimer = null;
      }
    },

    /**
     * AI 自动补全搭配。
     * Agent 设计点：用户只选了上衣（或下装），AI 从衣柜中挑选匹配的下装+鞋。
     *
     * AI Agent 学习注释：Function Tool
     * 前端把用户已选单品 given_items、本人照片分析 body_analysis 发给后端。
     * 后端 tryon.autoComplete 再从 clothes 表里挑补齐单品。
     * 模型只负责“选择和解释”，真正的数据权限和 ID 校验在后端完成。
     */
	    async autoComplete() {
	      const userItems = this.collectAllClothes();
	      if (!userItems.length) {
	        uni.showToast({ title: '请先选择或上传一件衣服', icon: 'none' });
        return;
      }
      uni.showLoading({ title: 'AI 搭配中...' });
      try {
        const res = await vk.callFunction({
	          url: 'client/wardrobe/tryon.autoComplete',
	          data: {
	            mode: this.getAutoCompleteMode(userItems),
	            given_items: userItems,
            person_image_url: this.personImageUrl,
            body_analysis: this.bodyAnalysis,
          },
          loading: false,
        });
        this.autoCompleteResult = res.outfit || null;
        if (!this.autoCompleteResult) {
          uni.showToast({ title: '衣橱中暂无匹配单品', icon: 'none' });
        }
      } catch (err) {
        console.error('自动搭配失败', err);
	      } finally { uni.hideLoading(); }
	    },

	    getAutoCompleteMode(items = []) {
	      const hasTop = items.some((item) => item.category === '上衣' || item.category === '外套');
	      const hasBottom = items.some((item) => item.category === '下装');
	      if (hasTop && !hasBottom) return 'top';
	      if (hasBottom && !hasTop) return 'bottom';
	      return 'full';
	    },

	    handlePrimaryAction() {
	      if (!this.personImageUrl) {
	        uni.showToast({ title: '请先上传本人照', icon: 'none' });
	        return;
	      }
	      if (!this.selectedOutfitItems.length && !this.autoCompleteResult) {
	        uni.showToast({ title: '请先选择要试的搭配', icon: 'none' });
	        return;
	      }
		      if (!this.autoCompleteResult && this.requiredSelectedCount < 2) {
	        this.autoComplete();
	        return;
	      }
	      this.generateTryon();
	    },

	    collectAllClothes() {
	      const items = [...this.selectedClothes];
	      this.uploadedClothes.forEach((c) => {
	        if (c && c.image_url) items.push(c);
	      });
      if (this.activeMode === 'shopping' && this.productImageUrl) {
        const productInfo = (this.shoppingResult && this.shoppingResult.product_info) || {};
        items.push({
          _id: `shopping_${Date.now()}`,
          name: productInfo.type || '待购买单品',
          category: productInfo.category || '上衣',
          type: productInfo.type || '',
          color: productInfo.color || '',
          image_url: this.productImageUrl,
          style_tags: productInfo.style_tags || [],
          source: 'shopping',
        });
      }
      return items;
    },

    saveResult() {
      if (!this.resultImageUrl) return;
      // #ifdef MP-WEIXIN
      uni.saveImageToPhotosAlbum({
        filePath: this.resultImageUrl,
        success: () => uni.showToast({ title: '已保存', icon: 'success' }),
        fail: () => uni.showToast({ title: '请检查相册权限', icon: 'none' }),
      });
      // #endif
    },

    retryGenerate() { this.resultImageUrl = ''; this.generateTryon(); },

    previewHistory(record) {
      if (record.result_image_url) {
        this.resultImageUrl = record.result_image_url;
        this.currentTryonTaskId = '';
        return;
      }
      if (record.status === 'generating' && record.provider_task_id) {
        this.startTryonPolling(record.provider_task_id);
      }
    },

    statusText(status) {
      const map = { success: '已完成', generating: '生成中，可稍后查看', config_needed: '服务未配置', failed: '失败' };
      return map[status] || status || '未知状态';
    },

    formatDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    goMember() {
      uni.navigateTo({ url: '/pages/wardrobe/member' });
    },
  },
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; box-sizing: border-box; padding: 40rpx 28rpx 80rpx; background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%); }
.title { color: var(--wardrobe-text); font-size: 44rpx; font-weight: 800; }
.subtitle { margin-top: 10rpx; color: var(--wardrobe-muted); font-size: 26rpx; line-height: 1.5; }

.quota-card {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 24rpx; padding: 24rpx 28rpx; border: 1rpx solid var(--wardrobe-border);
  border-radius: 22rpx; background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow);
}
.quota-title { color: var(--wardrobe-text); font-size: 29rpx; font-weight: 700; }
.quota-desc { margin-top: 6rpx; color: var(--wardrobe-muted); font-size: 24rpx; }
.quota-arrow { color: var(--wardrobe-muted); font-size: 40rpx; }

	.step-card { margin-top: 28rpx; padding: 26rpx; border: 1rpx solid var(--wardrobe-border); border-radius: 24rpx; background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow); }
	.step-label { color: var(--wardrobe-text); font-size: 30rpx; font-weight: 750; line-height: 1.35; }
	.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; margin-bottom: 18rpx; }
	.section-desc { margin-top: 8rpx; color: var(--wardrobe-muted); font-size: 24rpx; line-height: 1.45; }
	.change-link { flex: 0 0 auto; color: var(--wardrobe-primary-deep); font-size: 24rpx; font-weight: 700; line-height: 1.5; }

/* Photo */
.photo-area { width: 100%; height: 500rpx; border-radius: 20rpx; overflow: hidden; background: #f7eadc; }
.person-img { width: 100%; height: 100%; }
.photo-empty { display: flex; height: 100%; flex-direction: column; align-items: center; justify-content: center; }
.photo-icon { font-size: 64rpx; margin-bottom: 14rpx; }
.photo-text { color: var(--wardrobe-text); font-size: 28rpx; font-weight: 600; }
.photo-hint { margin-top: 8rpx; color: var(--wardrobe-muted); font-size: 24rpx; }

.body-tags { display: flex; flex-wrap: wrap; margin-top: 14rpx; }
.body-tag { margin-right: 10rpx; margin-bottom: 8rpx; padding: 8rpx 14rpx; border-radius: 999rpx; background: #e8f5e9; color: #2e7d32; font-size: 22rpx; }
.saved-photo-actions { display: flex; gap: 14rpx; margin-top: 18rpx; }
.saved-photo-btn {
  flex: 1; height: 66rpx; border-radius: 999rpx; border: 1rpx solid var(--wardrobe-border);
  background: var(--wardrobe-surface-solid); color: var(--wardrobe-primary-deep);
  font-size: 25rpx; line-height: 66rpx;
}
.saved-photo-btn.primary {
  border-color: var(--wardrobe-primary); background: #fff3e8; font-weight: 700;
}

.slot-list { display: flex; flex-direction: column; gap: 16rpx; }
	.slot-row {
	  display: flex; align-items: center; justify-content: space-between;
	  padding: 18rpx; border: 1rpx solid var(--wardrobe-border); border-radius: 18rpx;
	  background: var(--wardrobe-surface-solid);
	}
	.slot-left { display: flex; align-items: center; min-width: 0; flex: 1; }
	.slot-img, .slot-empty {
	  width: 104rpx; height: 104rpx; flex: 0 0 104rpx; border-radius: 16rpx;
	  background: #f1e4d6;
	}
	.slot-empty {
	  display: flex; align-items: center; justify-content: center;
	  border: 2rpx dashed var(--wardrobe-border); color: var(--wardrobe-primary-deep);
	  font-size: 44rpx; line-height: 1;
	}
	.slot-copy { min-width: 0; flex: 1; margin-left: 18rpx; }
	.slot-title { color: var(--wardrobe-text); font-size: 27rpx; font-weight: 700; line-height: 1.35; }
	.optional { margin-left: 10rpx; color: var(--wardrobe-muted); font-size: 21rpx; font-weight: 400; }
	.slot-desc { margin-top: 6rpx; color: var(--wardrobe-muted); font-size: 23rpx; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.slot-actions { display: flex; flex-direction: column; gap: 10rpx; margin-left: 16rpx; }
	.slot-action {
	  min-width: 76rpx; padding: 8rpx 12rpx; border-radius: 999rpx;
	  background: #fff3e8; color: var(--wardrobe-primary-deep);
	  font-size: 22rpx; font-weight: 600; text-align: center;
	}
	.value-hint { padding: 18rpx 20rpx; border-radius: 16rpx; background: #fff7ed; color: #8b6728; font-size: 23rpx; line-height: 1.45; }
	.advanced-entry {
	  margin-top: 24rpx; padding: 22rpx 26rpx; border: 1rpx solid var(--wardrobe-border);
	  border-radius: 22rpx; background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow);
	  color: var(--wardrobe-primary-deep); font-size: 25rpx; font-weight: 700;
	}
	.upload-current-btn { margin-top: 18rpx; height: 66rpx; border-radius: 999rpx; background: #fff3e8; color: var(--wardrobe-primary-deep); font-size: 25rpx; line-height: 66rpx; }

/* Source tabs */
.source-tabs { display: flex; margin-bottom: 18rpx; }
.source-tab { flex: 1; height: 64rpx; text-align: center; line-height: 64rpx; border: 1rpx solid var(--wardrobe-border); font-size: 25rpx; color: var(--wardrobe-muted); }
.source-tab:first-child { border-radius: 999rpx 0 0 999rpx; }
.source-tab:last-child { border-radius: 0 999rpx 999rpx 0; }
.source-tab.active { background: var(--wardrobe-primary); border-color: var(--wardrobe-primary); color: #fff; }

/* Wardrobe grid */
.category-scroll { width: 100%; white-space: nowrap; margin-bottom: 18rpx; }
.category-row { display: inline-flex; }
.category-chip { min-width: 80rpx; padding: 10rpx 16rpx; margin-right: 12rpx; border: 1rpx solid var(--wardrobe-border); border-radius: 999rpx; font-size: 23rpx; color: var(--wardrobe-muted); text-align: center; }
.category-chip.active { border-color: var(--wardrobe-primary); background: var(--wardrobe-primary); color: #fff; }

.clothes-grid { display: flex; flex-wrap: wrap; }
.cloth-item { width: 150rpx; margin-right: 14rpx; margin-bottom: 14rpx; border: 2rpx solid transparent; border-radius: 14rpx; position: relative; overflow: hidden; }
.cloth-item.selected { border-color: var(--wardrobe-primary); }
.cloth-img { width: 150rpx; height: 150rpx; border-radius: 12rpx; background: #f1e4d6; }
.cloth-name { margin-top: 6rpx; font-size: 21rpx; color: var(--wardrobe-text); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selected-mark { position: absolute; top: 6rpx; right: 6rpx; width: 36rpx; height: 36rpx; border-radius: 50%; background: var(--wardrobe-primary); color: #fff; font-size: 20rpx; text-align: center; line-height: 36rpx; }
.empty-hint { text-align: center; color: var(--wardrobe-muted); font-size: 24rpx; padding: 30rpx 0; }

/* Upload */
.upload-grid { display: flex; flex-wrap: wrap; gap: 14rpx; }
.upload-slot { width: 150rpx; height: 150rpx; border: 2rpx dashed var(--wardrobe-border); border-radius: 14rpx; position: relative; overflow: hidden; }
.upload-slot.large { width: 100%; height: 360rpx; }
.uploaded-img { width: 100%; height: 100%; border-radius: 12rpx; }
.upload-empty { display: flex; height: 100%; flex-direction: column; align-items: center; justify-content: center; }
.upload-plus { font-size: 48rpx; color: var(--wardrobe-muted); }
.upload-label { font-size: 22rpx; color: var(--wardrobe-muted); margin-top: 4rpx; }
.upload-hint { font-size: 20rpx; color: #baaa9a; margin-top: 4rpx; }
.remove-upload { position: absolute; top: 4rpx; right: 4rpx; width: 36rpx; height: 36rpx; border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff; font-size: 20rpx; text-align: center; line-height: 36rpx; }
.analyze-row { margin-top: 18rpx; }
.analyze-btn { height: 66rpx; border-radius: 999rpx; background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep)); color: #fff; font-size: 25rpx; line-height: 66rpx; }

/* Results */
.result-card { margin-top: 24rpx; padding: 28rpx; border: 2rpx solid var(--wardrobe-primary); border-radius: 24rpx; background: #fffdf8; }
.result-title { color: var(--wardrobe-text); font-size: 28rpx; font-weight: 700; margin-bottom: 16rpx; }

.complete-outfit { display: flex; flex-wrap: wrap; gap: 14rpx; }
.outfit-piece { width: 130rpx; text-align: center; }
.piece-img { width: 130rpx; height: 130rpx; border-radius: 14rpx; background: #f1e4d6; }
.piece-placeholder { width: 130rpx; height: 130rpx; border-radius: 14rpx; background: #f1e4d6; display: flex; align-items: center; justify-content: center; color: var(--wardrobe-muted); font-size: 22rpx; }
.piece-name { margin-top: 6rpx; font-size: 21rpx; color: var(--wardrobe-text); }
.piece-source { font-size: 19rpx; color: var(--wardrobe-muted); }
.outfit-reason { margin-top: 16rpx; color: var(--wardrobe-muted); font-size: 25rpx; line-height: 1.5; }

.score-big { font-size: 72rpx; font-weight: 800; text-align: center; }
.score-big.good { color: #4caf50; }
.score-big.ok { color: #ff9800; }
.score-big.bad { color: #f44336; }
.score-verdict { text-align: center; color: var(--wardrobe-text); font-size: 28rpx; font-weight: 600; margin-top: 8rpx; }
.analysis-detail { margin-top: 14rpx; color: var(--wardrobe-muted); font-size: 25rpx; line-height: 1.5; }

.match-section { margin-top: 18rpx; padding-top: 16rpx; border-top: 1rpx solid var(--wardrobe-border); }
.match-title { color: var(--wardrobe-text); font-size: 26rpx; font-weight: 600; margin-bottom: 12rpx; }
.match-row { display: flex; flex-wrap: wrap; gap: 12rpx; }
.match-item { width: 110rpx; text-align: center; }
.match-img { width: 110rpx; height: 110rpx; border-radius: 12rpx; background: #f1e4d6; }
.match-name { margin-top: 4rpx; font-size: 20rpx; color: var(--wardrobe-muted); }

	.generate-btn { margin-top: 28rpx; border-radius: 999rpx; background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep)); color: #fff; font-size: 30rpx; font-weight: 700; box-shadow: 0 18rpx 36rpx rgba(101,73,50,0.16); }
	.generate-btn[disabled] { opacity: 0.55; }
.tryon-tip { margin-top: 18rpx; padding: 20rpx 22rpx; border: 1rpx solid #f0d8bd; border-radius: 18rpx; background: #fff7ed; }
.tryon-tip-title { color: var(--wardrobe-text); font-size: 26rpx; font-weight: 700; }
.tryon-tip-desc { margin-top: 6rpx; color: var(--wardrobe-muted); font-size: 23rpx; line-height: 1.45; }

.result-panel { margin-top: 24rpx; }
.result-img { width: 100%; border-radius: 20rpx; }
.result-actions { display: flex; gap: 14rpx; margin-top: 18rpx; }
.action-btn { flex: 1; height: 66rpx; border-radius: 999rpx; border: 1rpx solid var(--wardrobe-border); background: var(--wardrobe-surface-solid); color: var(--wardrobe-text); font-size: 25rpx; line-height: 66rpx; }

.history-card {
  margin-top: 28rpx; padding: 26rpx; border: 1rpx solid var(--wardrobe-border);
  border-radius: 24rpx; background: var(--wardrobe-surface); box-shadow: var(--wardrobe-shadow);
}
.history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.history-title { color: var(--wardrobe-text); font-size: 29rpx; font-weight: 700; }
.refresh-link { color: var(--wardrobe-primary-deep); font-size: 24rpx; }
.history-row { display: flex; align-items: center; padding: 16rpx 0; border-top: 1rpx solid var(--wardrobe-border); }
.history-img { width: 112rpx; height: 112rpx; flex: 0 0 112rpx; border-radius: 14rpx; background: #f1e4d6; }
.history-img.empty-img { display: flex; align-items: center; justify-content: center; color: var(--wardrobe-muted); font-size: 22rpx; }
.history-copy { min-width: 0; flex: 1; margin-left: 18rpx; }
.history-status { color: var(--wardrobe-text); font-size: 26rpx; font-weight: 600; }
.history-time { margin-top: 6rpx; color: var(--wardrobe-muted); font-size: 22rpx; }
.history-hint { margin-top: 6rpx; color: var(--wardrobe-primary-deep); font-size: 22rpx; line-height: 1.4; }
.history-error { margin-top: 6rpx; color: #c62828; font-size: 22rpx; line-height: 1.4; }
.empty-history { padding: 24rpx 0; color: var(--wardrobe-muted); font-size: 24rpx; text-align: center; }
</style>
