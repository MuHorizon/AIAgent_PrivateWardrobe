<template>
  <view class="page">
    <view class="top-bar">
      <view>
        <view class="greeting">{{ greetingText }}，今天这样穿</view>
        <view class="date-line">{{ dateCityText }}</view>
      </view>
      <view class="top-dot"></view>
    </view>

    <view class="weather-card">
      <view class="weather-icon">{{ weatherIcon }}</view>
      <view class="weather-main">
        <view class="weather-title">{{ weatherSummary }}</view>
        <view class="weather-sub">{{ weatherFeelText }}</view>
      </view>
      <view class="comfort-pill">{{ comfortTag }}</view>
    </view>

    <view class="daily-card">
      <view class="daily-head">
        <view class="daily-title">今日推荐穿搭</view>
        <view class="daily-tag">{{ dailyScene }}</view>
      </view>

      <view class="daily-items">
        <view v-for="item in dailyItems" :key="item._id || item.name" class="daily-item" @click="goClothingDetail(item)">
          <image v-if="item.image_url" class="daily-img" :src="item.image_url" mode="aspectFill"></image>
          <view v-else class="daily-img empty-img">{{ item.category || '单品' }}</view>
          <view class="daily-name">{{ item.name || item.category || '衣物' }}</view>
        </view>
      </view>

      <scroll-view v-if="dailyItems.length" class="chip-scroll" scroll-x>
        <view class="chip-row">
          <view v-for="item in dailyItems" :key="(item._id || item.name) + '_chip'" class="item-chip">
            <image v-if="item.image_url" class="chip-img" :src="item.image_url" mode="aspectFill"></image>
            <text>{{ item.name || item.category || '衣物' }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="reason-line">
        <text>搭配理由：</text>{{ dailyReason }}
      </view>

      <view class="daily-actions">
        <button class="outline-btn" @click="switchDailyOutfit">换一套</button>
        <button class="solid-btn" type="primary" @click="wearTodayOutfit">就穿这套</button>
      </view>
    </view>

    <view class="quick-grid">
      <view v-for="entry in quickEntries" :key="entry.key" class="quick-card" @click="goPage(entry.pageUrl)">
        <view class="quick-icon" :class="entry.tone">{{ entry.icon }}</view>
        <view class="quick-title">{{ entry.title }}</view>
        <view class="quick-desc">{{ entry.desc }}</view>
      </view>
    </view>

    <button v-if="authState === 'failed'" class="retry" type="primary" @click="initAuth">重新登录</button>
  </view>
</template>

<script>
  let vk = uni.vk;

  export default {
    data() {
      return {
        authState: 'checking',
        userInfo: {},
        checking: false,
        loadingHome: false,
        weather: {},
        hero: {
          title: '今天这样穿',
          desc: '登录后会根据你的衣柜、天气和偏好生成今日建议。',
          outfit_id: '',
        },
        quickEntries: [
          {
            key: 'tryon',
            title: 'AI试穿',
            desc: '虚拟试穿上身效果',
            icon: '衣',
            tone: 'coral',
            pageUrl: '/pages/wardrobe/tryon',
          },
          {
            key: 'upload',
            title: '添加衣服',
            desc: '拍照识别并入衣柜',
            icon: '柜',
            tone: 'sage',
            pageUrl: '/pages/wardrobe/upload',
          },
          {
            key: 'chat',
            title: '问 AI 搭配',
            desc: '说场景，AI来搭配',
            icon: '问',
            tone: 'taupe',
            pageUrl: '/pages/wardrobe/chat',
          },
        ],
        inspirationItems: [],
        dailyOutfitIndex: 0,
        closetStats: [
          { label: '全部衣物', value: 0 },
          { label: '上衣', value: 0 },
          { label: '下装', value: 0 },
          { label: '鞋包配饰', value: 0 },
        ],
        recentItems: [],
      };
    },
	    computed: {
      greetingText() {
        const hour = new Date().getHours();
        if (hour < 6) return '夜深了';
        if (hour < 12) return '上午好';
        if (hour < 18) return '下午好';
        return '晚上好';
      },
      dateCityText() {
        const date = new Date();
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const city = this.weather.city || this.extractCityFromWeatherText() || '';
        return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}${city ? ` · ${city}` : ''}`;
      },
      weatherIcon() {
        const text = `${this.weather.weather || ''}${this.weather.text || ''}`;
        if (text.indexOf('雨') > -1) return '☔';
        if (text.indexOf('雪') > -1) return '❄';
        if (text.indexOf('晴') > -1) return '☀';
        if (text.indexOf('阴') > -1 || text.indexOf('云') > -1) return '☁';
        return '☼';
      },
      weatherSummary() {
        const temp = this.weather.temperature ? `${this.weather.temperature}°C` : this.weatherTemperatureText || '--';
        const weather = this.weather.weather || this.extractWeatherCondition() || '天气';
        return `${temp} ${weather}`;
      },
      weatherFeelText() {
        const feel = this.weather.feels_like || this.weather.feelsLike || '';
        const city = this.weather.city || this.extractCityFromWeatherText();
        const parts = [];
        if (feel) parts.push(`体感${feel}°C`);
        if (city) parts.push(city);
        return parts.join(' · ') || '根据天气为你调整搭配';
      },
      comfortTag() {
        const temp = Number(this.weather.temperature);
        if (!Number.isFinite(temp)) return this.weather.config_needed ? '天气待更新' : '舒适温度';
        const text = `${this.weather.weather || ''}${this.weather.text || ''}`;
        if (temp >= 26 && text.indexOf('晴') > -1) return '需要防晒';
        if (temp >= 30) return '偏热';
        if (temp <= 12) return '注意保暖';
        if (temp >= 24) return '舒适温度';
        return '适合叠穿';
      },
      weatherText() {
        return this.weather.text || '天气未读取';
      },
      weatherTemperatureText() {
        if (this.weather.temperature) return `${this.weather.temperature}°`;
        if (this.weather.high || this.weather.low) return `${this.weather.high || '-'}° / ${this.weather.low || '-'}°`;
        return this.weather.config_needed ? '待配置' : '';
      },
      currentDailyOutfit() {
        if (!this.inspirationItems.length) return null;
        return this.inspirationItems[this.dailyOutfitIndex % this.inspirationItems.length] || null;
      },
      dailyItems() {
        const outfitItems = this.currentDailyOutfit && this.currentDailyOutfit.outfit_items;
        if (Array.isArray(outfitItems) && outfitItems.length) return outfitItems.slice(0, 4).map((item) => this.normalizeDailyItem(item));
        return this.recentItems.slice(0, 4).map((item) => this.normalizeDailyItem(item));
      },
      dailyScene() {
        return (this.currentDailyOutfit && this.currentDailyOutfit.badge) || '日常通勤';
      },
      dailyReason() {
        if (this.currentDailyOutfit && this.currentDailyOutfit.reason) return this.currentDailyOutfit.reason;
        if (this.dailyItems.length) return '先用最近加入衣橱的单品组成今日候选，生成后会给出更完整的搭配理由。';
        return '添加几件衣服后，AI 会根据天气、场景和你的衣橱生成今日推荐。';
      },
    },
    onLoad(options = {}) {
      vk = uni.vk;
      this.options = options;
      this.initAuth();
    },
    methods: {
      async initAuth() {
        if (this.checking) return;
        this.checking = true;

        try {
          if (vk.checkToken()) {
            this.authState = 'checking';
            await this.checkCloudToken();
            return;
          }

          await this.loginByWeixin();
        } catch (err) {
          console.error('首页登录初始化失败', err);
          this.authState = 'failed';
        } finally {
          this.checking = false;
        }
      },
      checkCloudToken() {
        return new Promise((resolve, reject) => {
          vk.userCenter.checkToken({
            loading: false,
            success: (res) => {
              this.setLoginState(res);
              resolve(res);
            },
            fail: async (err) => {
              vk.deleteToken();
              try {
                const res = await this.loginByWeixin();
                resolve(res);
              } catch (loginErr) {
                reject(loginErr || err);
              }
            },
          });
        });
      },
      loginByWeixin() {
        this.authState = 'logging';

        return new Promise((resolve, reject) => {
          // #ifdef MP-WEIXIN
          vk.userCenter.loginByWeixin({
            loading: false,
            success: (res) => {
              this.setLoginState(res);
              resolve(res);
            },
            fail: (err) => {
              reject(err);
            },
          });
          // #endif

          // #ifndef MP-WEIXIN
          reject(new Error('当前自动登录只支持微信小程序'));
          // #endif
        });
      },
      setLoginState(res = {}) {
        const userInfo = res.userInfo || {};
        this.userInfo = userInfo;
        vk.setVuex('$user.userInfo', userInfo);
        vk.setVuex('$user.permission', res.permission || []);
        this.authState = 'ready';
        this.loadHomeOverview();
      },
      /**
       * 读取首页真实业务数据。
       * Agent 设计点：
       * 首页是用户进入产品后的第一份上下文摘要，必须来自当前用户真实衣柜、穿搭历史和天气配置状态。
       * 页面不再写死“北京晴 22 度”和 128 件衣服，避免 Agent 产品看起来像演示假数据。
       */
      async loadHomeOverview() {
        if (this.loadingHome) return;
        this.loadingHome = true;

        try {
          const location = await this.getClientLocation();
          const res = await vk.callFunction({
            url: 'client/wardrobe/home.overview',
            data: {
              // 定位优先走客户端授权坐标。IP 在云函数/代理场景下经常是出口 IP，只能作为最后兜底。
              location,
            },
            loading: false,
          });
          this.weather = res.weather || {};
          this.hero = res.hero || this.hero;
          this.closetStats = res.closet_stats || this.closetStats;
          this.recentItems = res.recent_clothes || [];
          this.inspirationItems = res.inspirations && res.inspirations.length ? res.inspirations : [];
        } catch (err) {
          console.error('读取首页真实数据失败', err);
        } finally {
          this.loadingHome = false;
        }
      },
      /**
       * 获取客户端真实坐标。
       * Agent 设计点：
       * 天气是穿搭推荐的重要上下文，但云函数里拿到的 IP 往往是代理/出口 IP，省份和城市不可靠。
       * 所以这里优先让客户端拿授权定位；用户拒绝时返回空对象，由服务端再降级到手动城市或默认城市。
       */
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
      goPage(pageUrl) {
        const tabPages = ['/pages/index/index', '/pages/wardrobe/closet', '/pages/wardrobe/chat', '/pages/profile/profile'];
        if (tabPages.includes(pageUrl)) {
          uni.switchTab({ url: pageUrl });
          return;
        }

        uni.navigateTo({ url: pageUrl });
      },
	      goClothingDetail(item) {
        const clothingId = item._id || item.id || '';
        if (!clothingId) return;
        const encodedFallback = encodeURIComponent(JSON.stringify(item));
	        uni.navigateTo({
	          url: `/pages/wardrobe/detail?id=${clothingId}&fallback=${encodedFallback}`,
	        });
	      },
      normalizeDailyItem(item = {}) {
        return {
          ...item,
          name: item.name || this.buildClothName(item),
        };
      },
      buildClothName(item = {}) {
        const type = item.type || item.category || '衣物';
        return item.color ? `${item.color}${type}` : type;
      },
      extractCityFromWeatherText() {
        const text = this.weather.text || '';
        const first = text.split('·')[0];
        return first ? first.trim() : '';
      },
      extractWeatherCondition() {
        const text = this.weather.text || '';
        const parts = text.split('·').map((part) => part.trim()).filter(Boolean);
        return parts.length > 1 ? parts[1] : '';
      },
      switchDailyOutfit() {
        if (this.inspirationItems.length > 1) {
          this.dailyOutfitIndex = (this.dailyOutfitIndex + 1) % this.inspirationItems.length;
          return;
        }
        this.goPage('/pages/wardrobe/outfit');
      },
      async wearTodayOutfit() {
        const outfit = this.currentDailyOutfit;
        if (!outfit || !outfit._id) {
          this.goPage('/pages/wardrobe/outfit');
          return;
        }
        try {
          await vk.callFunction({
            url: 'client/wardrobe/outfit.feedback',
            data: { _id: outfit._id, feedback: 'worn', worn_date: this.getToday() },
            loading: false,
          });
          uni.showToast({ title: '已记录今天穿这套', icon: 'success' });
        } catch (err) {
          console.error('记录今日穿搭失败', err);
          uni.showToast({ title: '记录失败，请重试', icon: 'none' });
        }
      },
      getToday() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      },
	    },
	  };
</script>

<style lang="scss" scoped>
	  .page {
	    min-height: 100vh;
	    box-sizing: border-box;
	    padding: 44rpx 28rpx 120rpx;
	    background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
	  }

  .top-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18rpx 10rpx 8rpx;
  }

  .greeting {
    color: #2f2a28;
    font-size: 44rpx;
    font-weight: 820;
    line-height: 1.25;
  }

  .date-line {
    margin-top: 14rpx;
    color: #8f8882;
    font-size: 26rpx;
    line-height: 1.4;
  }

  .top-dot {
    width: 58rpx;
    height: 58rpx;
    margin-top: 10rpx;
    border: 22rpx solid #eeeaf2;
    border-radius: 50%;
    background: #25c22f;
    box-sizing: content-box;
  }

  .weather-card,
  .daily-card,
  .quick-card {
    border: 1rpx solid #f2e5d9;
    background: rgba(255, 253, 248, 0.96);
    box-shadow: 0 16rpx 42rpx rgba(101, 73, 50, 0.08);
  }

  .weather-card {
    display: flex;
    align-items: center;
    margin-top: 28rpx;
    padding: 26rpx 28rpx;
    border-radius: 24rpx;
  }

  .weather-icon {
    display: flex;
    width: 76rpx;
    height: 76rpx;
    align-items: center;
    justify-content: center;
    flex: 0 0 76rpx;
    border-radius: 50%;
    background: #ffc747;
    font-size: 34rpx;
  }

  .weather-main {
    min-width: 0;
    flex: 1;
    margin-left: 22rpx;
  }

  .weather-title {
    color: #2f2a28;
    font-size: 34rpx;
    font-weight: 800;
    line-height: 1.25;
  }

  .weather-sub {
    margin-top: 8rpx;
    color: #8f8882;
    font-size: 25rpx;
    line-height: 1.35;
  }

  .comfort-pill {
    flex: 0 0 auto;
    padding: 12rpx 22rpx;
    border-radius: 999rpx;
    background: #fff0eb;
    color: #c17860;
    font-size: 24rpx;
    font-weight: 700;
  }

  .daily-card {
    margin-top: 28rpx;
    padding: 30rpx;
    border-radius: 28rpx;
  }

  .daily-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .daily-title {
    color: #2f2a28;
    font-size: 34rpx;
    font-weight: 820;
    line-height: 1.35;
  }

  .daily-tag {
    padding: 10rpx 20rpx;
    border-radius: 999rpx;
    background: #f1edf8;
    color: #735ea0;
    font-size: 24rpx;
    font-weight: 700;
  }

  .daily-items {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18rpx;
    margin-top: 28rpx;
  }

  .daily-item {
    min-width: 0;
  }

  .daily-img {
    width: 100%;
    height: 190rpx;
    border-radius: 20rpx;
    background: #f1e4d6;
  }

  .daily-img.empty-img {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9a8b84;
    font-size: 24rpx;
  }

  .daily-name {
    margin-top: 12rpx;
    color: #8a807a;
    font-size: 24rpx;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .chip-scroll {
    width: 100%;
    margin-top: 24rpx;
    white-space: nowrap;
  }

  .chip-row {
    display: inline-flex;
  }

  .item-chip {
    display: inline-flex;
    align-items: center;
    max-width: 240rpx;
    margin-right: 14rpx;
    padding: 10rpx 18rpx 10rpx 10rpx;
    border-radius: 999rpx;
    background: #f8f6f2;
    color: #8a807a;
    font-size: 24rpx;
  }

  .chip-img {
    width: 42rpx;
    height: 42rpx;
    flex: 0 0 42rpx;
    margin-right: 10rpx;
    border-radius: 50%;
    background: #f1e4d6;
  }

  .item-chip text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reason-line {
    margin-top: 20rpx;
    color: #8a807a;
    font-size: 26rpx;
    line-height: 1.65;
  }

  .reason-line text {
    color: #765ea3;
    font-weight: 760;
  }

  .daily-actions {
    display: flex;
    gap: 22rpx;
    margin-top: 28rpx;
  }

  .outline-btn,
  .solid-btn {
    flex: 1;
    height: 82rpx;
    margin: 0;
    border-radius: 16rpx;
    font-size: 28rpx;
    line-height: 82rpx;
  }

  .outline-btn {
    border: 1rpx solid #eee8e0;
    background: #fff;
    color: #2f2a28;
  }

  .solid-btn {
    background: #735ea0;
    color: #fff;
  }

	  .hero-card,
	  .inspiration-card,
	  .overview-card,
  .recent-card {
    border: 1rpx solid #f2e5d9;
    background: rgba(255, 253, 248, 0.96);
    box-shadow: 0 16rpx 42rpx rgba(101, 73, 50, 0.08);
  }

  .hero-card {
    position: relative;
    min-height: 330rpx;
    box-sizing: border-box;
    padding: 34rpx 32rpx;
    overflow: hidden;
    border-radius: 28rpx;
  }

  .hero-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 68% 44%, rgba(239, 210, 165, 0.32), rgba(239, 210, 165, 0) 190rpx),
      linear-gradient(90deg, rgba(255, 250, 243, 0.98) 0%, rgba(255, 250, 243, 0.9) 49%, rgba(229, 204, 174, 0.45) 100%);
  }

  .hero-copy,
  .hero-scene {
    position: relative;
    z-index: 1;
  }

  .hero-copy {
    width: 62%;
  }

  .weather-line {
    display: flex;
    align-items: center;
    color: #8f7c70;
    font-size: 24rpx;
    line-height: 1.4;
  }

  .location-icon {
    margin-right: 8rpx;
    color: #a68d7d;
    font-size: 26rpx;
  }

  .sun-icon {
    display: inline-flex;
    width: 42rpx;
    height: 42rpx;
    align-items: center;
    justify-content: center;
    margin: 0 10rpx 0 22rpx;
    border-radius: 50%;
    background: #fff0d6;
    color: #eea43d;
    font-size: 32rpx;
    line-height: 1;
  }

  .hero-title {
    margin-top: 28rpx;
    color: #4b3a32;
    font-size: 54rpx;
    font-weight: 820;
    line-height: 1.18;
  }

  .hero-desc {
    width: 390rpx;
    margin-top: 20rpx;
    color: #8a776d;
    font-size: 27rpx;
    line-height: 1.58;
  }

  .hero-button {
    display: inline-flex;
    height: 66rpx;
    align-items: center;
    margin-top: 28rpx;
    padding: 0 34rpx;
    border-radius: 999rpx;
    background: linear-gradient(135deg, #ed9b73, #d56f50);
    color: #fff;
    font-size: 27rpx;
    font-weight: 700;
    box-shadow: 0 14rpx 26rpx rgba(204, 100, 68, 0.2);
  }

  .hero-button text {
    margin-left: 14rpx;
    font-size: 34rpx;
    line-height: 1;
  }

  .hero-scene {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 330rpx;
    height: 330rpx;
  }

  .wall-frame {
    position: absolute;
    top: 0;
    left: 38rpx;
    width: 92rpx;
    height: 112rpx;
    border: 7rpx solid #c5a07f;
    background: linear-gradient(135deg, #ddc4a3 0 50%, #f4e8d8 50% 100%);
  }

  .plant {
    position: absolute;
    left: 34rpx;
    bottom: 30rpx;
    width: 132rpx;
    height: 154rpx;
  }

  .leaf,
  .leaf::before,
  .leaf::after {
    position: absolute;
    width: 16rpx;
    height: 34rpx;
    border-radius: 50%;
    background: #718260;
    content: '';
  }

  .leaf-a {
    left: 46rpx;
    top: 14rpx;
    transform: rotate(-25deg);
  }

  .leaf-b {
    left: 74rpx;
    top: 28rpx;
    transform: rotate(34deg);
  }

  .leaf-c {
    left: 58rpx;
    top: 58rpx;
    transform: rotate(-12deg);
  }

  .leaf::before {
    left: -24rpx;
    top: 28rpx;
    transform: rotate(-48deg);
  }

  .leaf::after {
    right: -24rpx;
    top: 38rpx;
    transform: rotate(48deg);
  }

  .pot {
    position: absolute;
    left: 38rpx;
    bottom: 0;
    width: 76rpx;
    height: 70rpx;
    border-radius: 8rpx 8rpx 18rpx 18rpx;
    background: #eee1d1;
    box-shadow: inset -10rpx 0 0 rgba(137, 102, 74, 0.1);
  }

  .rack {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 208rpx;
    height: 292rpx;
    border-left: 5rpx solid #a9774f;
    border-top: 5rpx solid #a9774f;
  }

  .rack-line {
    position: absolute;
    top: 28rpx;
    right: 0;
    width: 190rpx;
    height: 4rpx;
    background: #9c755b;
  }

  .cloth {
    position: absolute;
    top: 46rpx;
    width: 58rpx;
    height: 174rpx;
    border-radius: 26rpx 26rpx 12rpx 12rpx;
    box-shadow: inset -12rpx 0 0 rgba(74, 55, 38, 0.1);
  }

  .cloth::before {
    content: '';
    position: absolute;
    top: -22rpx;
    left: 18rpx;
    width: 24rpx;
    height: 24rpx;
    border: 4rpx solid #7c5f49;
    border-bottom: 0;
    border-radius: 50% 50% 0 0;
  }

  .cloth-cream {
    right: 126rpx;
    background: #f5dfc7;
  }

  .cloth-camel {
    right: 70rpx;
    background: #bd7046;
  }

  .cloth-sage {
    right: 18rpx;
    background: #686858;
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18rpx;
    margin-top: 22rpx;
  }

  .quick-card {
    min-height: 200rpx;
    box-sizing: border-box;
    padding: 26rpx 18rpx 22rpx;
    border-radius: 24rpx;
  }

  .quick-icon {
    display: flex;
    width: 76rpx;
    height: 76rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    font-size: 27rpx;
    font-weight: 800;
  }

  .quick-icon.coral {
    background: linear-gradient(135deg, #f5b08d, #e58163);
  }

  .quick-icon.sage {
    background: #8fa07d;
  }

  .quick-icon.taupe {
    background: #a58a7d;
  }

  .quick-title {
    margin-top: 24rpx;
    color: #45352f;
    font-size: 30rpx;
    font-weight: 780;
    line-height: 1.25;
  }

  .quick-desc {
    margin-top: 10rpx;
    color: #9a8b84;
    font-size: 23rpx;
    line-height: 1.35;
  }

  .section-head,
  .overview-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-head {
    margin-top: 32rpx;
  }

  .section-title {
    color: #44352f;
    font-size: 34rpx;
    font-weight: 820;
    line-height: 1.35;
  }

  .section-link {
    color: #a58f82;
    font-size: 25rpx;
    line-height: 1.4;
  }

  .section-link text,
  .chevron {
    font-size: 42rpx;
    line-height: 1;
  }

  .inspiration-scroll {
    width: 100%;
    margin-top: 18rpx;
    white-space: nowrap;
  }

  .inspiration-row {
    display: inline-flex;
    padding-bottom: 6rpx;
  }

  .inspiration-card {
    position: relative;
    width: 214rpx;
    height: 300rpx;
    box-sizing: border-box;
    margin-right: 18rpx;
    padding: 20rpx 16rpx;
    overflow: hidden;
    border-radius: 20rpx;
  }

  .badge {
    position: absolute;
    z-index: 2;
    left: 16rpx;
    top: 16rpx;
    padding: 8rpx 12rpx;
    border-radius: 10rpx;
    color: #fff;
    font-size: 22rpx;
    font-weight: 700;
  }

  .badge.commute {
    background: #d79b75;
  }

  .badge.weekend {
    background: #8b9b7b;
  }

  .badge.seaside {
    background: #79a6c9;
  }

  .outfit-art {
    position: relative;
    height: 190rpx;
    margin-top: 4rpx;
    border-radius: 16rpx;
    background: #fffaf3;
  }

  .jacket,
  .shirt,
  .pants,
  .bag,
  .shoes {
    position: absolute;
  }

  .jacket {
    left: 22rpx;
    top: 38rpx;
    width: 70rpx;
    height: 96rpx;
    border-radius: 14rpx 14rpx 8rpx 8rpx;
    background: #d9c7b3;
    box-shadow: inset -9rpx 0 0 rgba(89, 62, 44, 0.1);
  }

  .shirt {
    left: 86rpx;
    top: 34rpx;
    width: 62rpx;
    height: 82rpx;
    border-radius: 16rpx 16rpx 10rpx 10rpx;
    background: #fff;
    box-shadow: 0 6rpx 14rpx rgba(96, 67, 43, 0.08);
  }

  .pants {
    right: 22rpx;
    top: 70rpx;
    width: 52rpx;
    height: 104rpx;
    border-radius: 8rpx 8rpx 14rpx 14rpx;
    background: #8f7764;
  }

  .bag {
    left: 22rpx;
    bottom: 10rpx;
    width: 54rpx;
    height: 44rpx;
    border-radius: 10rpx;
    background: #a87958;
  }

  .bag::before {
    content: '';
    position: absolute;
    left: 15rpx;
    top: -14rpx;
    width: 24rpx;
    height: 20rpx;
    border: 4rpx solid #a87958;
    border-bottom: 0;
    border-radius: 50% 50% 0 0;
  }

  .shoes {
    right: 24rpx;
    bottom: 16rpx;
    width: 54rpx;
    height: 20rpx;
    border-radius: 999rpx;
    background: #ead5b6;
    box-shadow: 16rpx 8rpx 0 #ead5b6;
  }

  .outfit-art.weekend .jacket {
    background: #eadfca;
  }

  .outfit-art.weekend .pants {
    background: #7d9bb3;
  }

  .outfit-art.weekend .bag {
    background: #e7d1a8;
  }

  .outfit-art.weekend .bag::before {
    border-color: #e7d1a8;
  }

  .outfit-art.seaside .jacket {
    background: #fff;
  }

  .outfit-art.seaside .shirt {
    background: #9aa18d;
  }

  .outfit-art.seaside .pants {
    background: #d9c39e;
    border-radius: 50%;
  }

  .card-title {
    margin-top: 14rpx;
    color: #574940;
    font-size: 23rpx;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .like-line {
    position: absolute;
    right: 16rpx;
    bottom: 18rpx;
    color: #aa9a91;
    font-size: 22rpx;
  }

  .overview-card,
  .recent-card {
    margin-top: 24rpx;
    padding: 28rpx 24rpx;
    border-radius: 24rpx;
  }

  .chevron {
    color: #9c8c82;
  }

  .overview-body {
    display: flex;
    align-items: center;
    margin-top: 24rpx;
  }

  .closet-thumb {
    position: relative;
    width: 142rpx;
    height: 94rpx;
    flex: 0 0 142rpx;
    overflow: hidden;
    border-radius: 14rpx;
    background: #f1e4d6;
  }

  .closet-door {
    position: absolute;
    left: 12rpx;
    top: 12rpx;
    width: 36rpx;
    height: 72rpx;
    border-radius: 6rpx;
    background: #dfcbb8;
    box-shadow: 44rpx 0 0 #ead9c8;
  }

  .closet-rail {
    position: absolute;
    right: 14rpx;
    top: 20rpx;
    width: 52rpx;
    height: 4rpx;
    background: #9b7c62;
  }

  .mini-cloth {
    position: absolute;
    top: 28rpx;
    width: 24rpx;
    height: 46rpx;
    border-radius: 10rpx 10rpx 4rpx 4rpx;
  }

  .mini-cloth.one {
    right: 42rpx;
    background: #fffaf0;
  }

  .mini-cloth.two {
    right: 18rpx;
    background: #c58562;
  }

  .mini-plant {
    position: absolute;
    right: 2rpx;
    bottom: 4rpx;
    width: 18rpx;
    height: 38rpx;
    border-radius: 999rpx;
    background: #8b9b73;
  }

  .stat {
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .stat-num {
    color: #4b3a32;
    font-size: 40rpx;
    font-weight: 500;
    line-height: 1.2;
  }

  .stat-label {
    margin-top: 10rpx;
    color: #90837c;
    font-size: 23rpx;
    line-height: 1.35;
  }

  .recent-scroll {
    width: 100%;
    margin-top: 24rpx;
    white-space: nowrap;
  }

  .recent-row {
    display: inline-flex;
  }

  .recent-item {
    width: 112rpx;
    height: 112rpx;
    margin-right: 20rpx;
    overflow: hidden;
    border-radius: 16rpx;
    background: #fbf6f0;
  }

  .recent-image {
    width: 112rpx;
    height: 112rpx;
    border-radius: 16rpx;
    background: #f1e4d6;
  }

  .recent-art {
    position: relative;
    width: 112rpx;
    height: 112rpx;
    overflow: hidden;
    border-radius: 16rpx;
  }

  .recent-shape {
    position: absolute;
    left: 31rpx;
    top: 20rpx;
    width: 50rpx;
    height: 76rpx;
    border-radius: 16rpx 16rpx 8rpx 8rpx;
    background: #f3eadb;
  }

  .recent-art.denim .recent-shape {
    top: 14rpx;
    height: 88rpx;
    border-radius: 8rpx 8rpx 14rpx 14rpx;
    background: #7898b4;
  }

  .recent-art.coat .recent-shape {
    width: 62rpx;
    left: 25rpx;
    background: #dac7b5;
  }

  .recent-art.bag .recent-shape {
    top: 42rpx;
    height: 44rpx;
    border-radius: 12rpx;
    background: #e9c2b4;
  }

  .recent-art.bag .recent-shape::before {
    content: '';
    position: absolute;
    left: 14rpx;
    top: -20rpx;
    width: 22rpx;
    height: 24rpx;
    border: 4rpx solid #e9c2b4;
    border-bottom: 0;
    border-radius: 50% 50% 0 0;
  }

  .recent-art.flats .recent-shape {
    top: 48rpx;
    height: 22rpx;
    border-radius: 999rpx;
    background: #e7d5ba;
    box-shadow: 18rpx 14rpx 0 #e7d5ba;
  }

  .retry {
    margin-top: 40rpx;
    border-radius: 999rpx;
    background: linear-gradient(135deg, #ed9b73, #d56f50);
  }
</style>
