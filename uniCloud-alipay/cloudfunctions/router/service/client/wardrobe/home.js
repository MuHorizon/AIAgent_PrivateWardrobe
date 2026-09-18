'use strict';

const db = uniCloud.database();

const cloudObject = {
  isCloudObject: true,

  /**
   * 首页真实数据汇总。
   * @url client/wardrobe/home.overview
   * Agent 设计点：
   * 首页不能展示写死样例，否则用户会误以为 Agent 已经理解了衣柜和天气。
   * 这个接口把当前用户的衣柜、最近穿搭、最近添加、会员权益和天气状态整理成一个 Context 快照。
   * 后续首页"今天这样穿"只消费这份快照，不直接在页面里拼静态演示数据。
   */
  overview: async function (data = {}) {
    console.log('[home] ====== overview 开始 ======');

    let clientInfo = this.getClientInfo();
    console.log('[home] getClientInfo() 完整返回:', JSON.stringify(clientInfo, null, 2));

    let { uid } = clientInfo;
    let { vk } = this.getUtil();
    let { city = '', location = {} } = data;

    console.log('[home] uid:', uid);
    console.log('[home] 前端传入 city:', city || '(未传)');
    console.log('[home] 前端传入 location:', JSON.stringify(location || {}));
    console.log('[home] CLIENTIP 字段值:', JSON.stringify(clientInfo.CLIENTIP));
    console.log('[home] clientInfo 所有 key:', Object.keys(clientInfo));

    if (!uid) {
      console.log('[home] 未登录，返回错误');
      return { code: -1, msg: '用户未登录' };
    }

    // Agent 设计点：
    // 天气是穿搭推荐的核心上下文。城市来源优先级：
    // 1. 前端传入的城市（用户手动选择）
    // 2. 客户端 IP 解析出的城市（自动定位，无需用户授权）
    // 3. 兜底 '北京市'（保证页面不报错）
    console.log('[home] 开始 resolveCity...');
    const resolvedCity = await resolveCity({
      vk,
      clientIP: clientInfo.CLIENTIP || '',
      userInput: safeString(city),
      location,
    });
    console.log('[home] resolveCity 结果:', resolvedCity);

    console.log('[home] 开始读取衣柜数据...');
    const clothes = await getActiveClothes(uid);
    console.log('[home] 衣柜衣物数量:', clothes.length);

    console.log('[home] 开始读取穿搭记录...');
    const outfits = await getRecentOutfits(uid);
    console.log('[home] 穿搭记录数量:', outfits.length);

    console.log('[home] 开始读取会员信息...');
    const member = await getMemberSummary(uid);
    console.log('[home] 会员信息:', JSON.stringify(member));

    console.log('[home] 开始获取天气，城市:', resolvedCity);
    const weather = await getWeatherSnapshot({ vk, city: resolvedCity });
    console.log('[home] 天气结果:', JSON.stringify(weather));

    const latestOutfit = pickTodayOutfit(outfits);

    const result = {
      code: 0,
      msg: '',
      weather,
      hero: buildHero({ weather, latestOutfit, clothesCount: clothes.length }),
      closet_stats: buildClosetStats(clothes),
      recent_clothes: clothes.slice(0, 8).map(toClothingCard),
      inspirations: outfits.slice(0, 6).map(toInspirationCard),
      member,
    };

    console.log('[home] ====== overview 完成 ======');
    return result;
  },
};

module.exports = cloudObject;

async function getActiveClothes(uid) {
  const queryRes = await db
    .collection('clothes')
    .where({ user_id: uid, status: 'active' })
    .orderBy('created_at', 'desc')
    .limit(200)
    .get();
  return queryRes.data || [];
}

async function getRecentOutfits(uid) {
  const queryRes = await db
    .collection('outfit_records')
    .where({ user_id: uid, status: 'active' })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();
  return queryRes.data || [];
}

async function getMemberSummary(uid) {
  const queryRes = await db
    .collection('user_profile')
    .where({ user_id: uid })
    .limit(1)
    .get();
  const profile = queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};
  const plan = profile.member_plan || 'free';
  const quota = Number(profile.tryon_quota_balance);

  return {
    plan,
    plan_text: plan === 'pro' ? '高级会员' : '免费版',
    tryon_quota_balance: Number.isFinite(quota) ? quota : 3,
    closet_limit: plan === 'pro' ? 1000 : 80,
    premium_enabled: plan === 'pro',
  };
}

/**
 * 获取天气信息 —— 和风天气 API v1。
 *
 * 流程：城市名 → GeoAPI /geo/v2/city/lookup 取经纬度
 *              → /weather/v1/current/{lat}/{lng} 实时天气
 *              → /weather/v1/daily/{lat}/{lng}?days=1 今日预报
 *
 * 环境变量：
 *   QWEATHER_API_HOST = 和风天气 API Host（控制台可查）
 *   QWEATHER_API_KEY  = 和风天气 API KEY
 *
 * 认证方式：Header X-QW-Api-Key（文档：API KEY → 请求标头）
 * 接口文档：https://dev.qweather.com
 */
async function getWeatherSnapshot({ vk, city }) {
  const host = process.env.QWEATHER_API_HOST || '';
  const apiKey = process.env.QWEATHER_API_KEY || '';

  console.log('[home][weather] 查询城市:', city);
  console.log('[home][weather] QWEATHER_API_HOST:', host || '(未配置)');
  console.log('[home][weather] QWEATHER_API_KEY:', apiKey ? '已配置' : '(未配置)');

  if (!host || !apiKey) {
    return {
      city, weather: '', temperature: '', low: '', high: '',
      config_needed: true, source: 'none',
      text: `${city} · 天气未配置`,
    };
  }

  const headers = { 'X-QW-Api-Key': apiKey };

  try {
    // Step 1：城市名 → 经纬度（GeoAPI /geo/v2/city/lookup）
  const geoHost = process.env.QWEATHER_GEO_API_HOST || host;
  const geoUrl = `https://${geoHost}/geo/v2/city/lookup`;
    console.log('[home][weather] GeoAPI 请求:', geoUrl, 'location:', city);

    const geoRes = await vk.request({
      url: geoUrl,
      method: 'GET',
      timeout: 5000,
      header: headers,
      data: { location: city },
      dataType: 'json',
    });

    console.log('[home][weather] GeoAPI 响应:', JSON.stringify(geoRes).slice(0, 400));

    if (geoRes.code !== '200' || !geoRes.location || !geoRes.location.length) {
      throw new Error('GeoAPI 未找到城市: ' + city + ' code:' + (geoRes.code || ''));
    }

    const loc = geoRes.location[0];
    const lat = loc.lat;
    const lon = loc.lon;
    console.log('[home][weather] 城市', city, '→ 坐标 lat:', lat, 'lon:', lon);

    // Step 2：并行请求 v1 实时天气 + v1 每日预报
    const currentUrl = `https://${host}/weather/v1/current/${lat}/${lon}`;
    const dailyUrl = `https://${host}/weather/v1/daily/${lat}/${lon}`;

    console.log('[home][weather] 并行请求 v1 current + daily...');

    const [currentRes, dailyRes] = await Promise.all([
      vk.request({
        url: currentUrl,
        method: 'GET',
        timeout: 8000,
        header: headers,
        data: {},
        dataType: 'json',
      }),
      vk.request({
        url: dailyUrl,
        method: 'GET',
        timeout: 8000,
        header: headers,
        data: { days: 1 },
        dataType: 'json',
      }),
    ]);

    console.log('[home][weather] current 响应:', JSON.stringify(currentRes).slice(0, 400));
    console.log('[home][weather] daily 响应:', JSON.stringify(dailyRes).slice(0, 400));

    // 解析 v1 响应
    const condition = currentRes.condition || {};
    const temperature = currentRes.temperature || {};
    const today = (dailyRes.days || [])[0] || {};
    const feelsLike = currentRes.feelsLike || {};
    const wind = currentRes.wind || {};
    const windDir = (wind.direction || {}).compass || '';

    const weather = safeString(condition.text);
    const temp = temperature.value != null ? String(Math.round(temperature.value)) : '';
    const low = today.temperatureMin ? String(Math.round(today.temperatureMin.value)) : '';
    const high = today.temperatureMax ? String(Math.round(today.temperatureMax.value)) : '';

    console.log('[home][weather] 结果:', { city, weather, temp, low, high });

    return {
      city,
      weather,
      temperature: temp,
      low,
      high,
      feelsLike: feelsLike.value != null ? String(Math.round(feelsLike.value)) : '',
      windDir,
      humidity: currentRes.humidity != null ? String(Math.round(currentRes.humidity * 100)) : '',
      config_needed: false,
      source: 'qweather',
      text: buildWeatherLine({ city, weather, temperature: temp, low, high }),
    };
  } catch (err) {
    console.error('[home][weather] 调用失败:', err.message || err);
    return {
      city,
      weather: '', temperature: '', low: '', high: '',
      config_needed: false, source: 'error',
      error_message: (err && (err.message || err.errMsg)) || '天气读取失败',
      text: `${city} · 天气读取失败`,
    };
  }
}

function buildWeatherLine(weather) {
  const parts = [weather.city, weather.weather].filter(Boolean);
  const temp = weather.temperature ? `${weather.temperature}°` : '';
  const range = weather.low || weather.high ? `${weather.high || '-'}° / ${weather.low || '-'}°` : '';
  return `${parts.join(' · ')}${temp || range ? ` · ${temp || range}` : ''}`;
}

function pickTodayOutfit(outfits) {
  return outfits.find((item) => item.worn_date) || outfits.find((item) => item.is_favorite) || outfits[0] || null;
}

function buildHero({ weather, latestOutfit, clothesCount }) {
  if (latestOutfit) {
    return {
      title: latestOutfit.title || '今天这样穿',
      desc: latestOutfit.reason || '根据你的衣柜和偏好生成一套今日搭配。',
      outfit_id: latestOutfit._id || '',
      weather_text: weather.text,
    };
  }
  return {
    title: clothesCount ? '生成今日搭配' : '先添加第一件衣服',
    desc: clothesCount ? '你的衣柜已经准备好，可以让 AI 从真实单品里挑一套。' : '上传衣服后，AI 才能基于真实衣柜推荐。',
    outfit_id: '',
    weather_text: weather.text,
  };
}

function buildClosetStats(clothes) {
  return [
    { label: '全部衣物', value: clothes.length },
    { label: '上衣', value: countByCategory(clothes, '上衣') },
    { label: '下装', value: countByCategory(clothes, '下装') },
    { label: '鞋包配饰', value: ['鞋', '包', '配饰'].reduce((sum, c) => sum + countByCategory(clothes, c), 0) },
  ];
}

function countByCategory(clothes, category) {
  return clothes.filter((item) => item.category === category).length;
}

function toClothingCard(item) {
  return {
    _id: item._id,
    name: item.name || buildClothingName(item),
    image_url: item.image_url,
    category: item.category,
    color: item.color,
  };
}

function toInspirationCard(record) {
  return {
    _id: record._id,
    title: record.title,
    badge: record.scene || '搭配',
    likes: record.is_favorite ? 1 : 0,
    reason: record.reason,
    outfit_items: record.outfit_items || [],
  };
}

function buildClothingName(item) {
  const type = item.type || item.category || '衣物';
  return item.color ? `${item.color}${type}` : type;
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 解析用户所在城市。
 *
 * 优先级：
 * 1. 用户手动选择的城市
 * 2. 通过客户端 IP 调用免费 IP 归属地 API（ip-api.com 免费版，45次/分钟）
 * 3. 兜底 '北京市'
 */
async function resolveCity({ vk, clientIP, userInput, location }) {
  console.log('[home][city] ====== resolveCity 开始 ======');
  console.log('[home][city] userInput:', userInput || '(空)');
  console.log('[home][city] location:', JSON.stringify(location || {}));
  console.log('[home][city] clientIP:', clientIP || '(空)');

  // 优先使用用户手动选择的城市
  if (userInput) {
    console.log('[home][city] 使用用户输入的城市:', userInput);
    return userInput;
  }

  const cityFromLocation = await tryQweatherLocation(vk, location);
  if (cityFromLocation) {
    console.log('[home][city] 使用客户端坐标解析城市:', cityFromLocation);
    return cityFromLocation;
  }

  // 没有 IP 时直接兜底
  if (!clientIP) {
    console.log('[home][city] CLIENTIP 为空，跳过 IP 解析，使用兜底城市');
    return '北京市';
  }

  // 过滤掉内网 IP 和无效 IP
  if (isPrivateIP(clientIP)) {
    console.log('[home][city] IP', clientIP, '是内网地址，跳过外部解析，使用兜底城市');
    return '北京市';
  }

  console.log('[home][city] 开始通过 IP 解析城市:', clientIP);

  // ipinfo.io 作为主方案（HTTPS，uniCloud 阿里云访问稳定，~800ms）
  const cityFromIpinfo = await tryIpinfoIo(vk, clientIP);
  if (cityFromIpinfo) {
    console.log('[home][city] ipinfo.io 低置信解析成功:', cityFromIpinfo);
    return cityFromIpinfo;
  }

  console.log('[home][city] IP 解析失败，使用兜底城市');
  return '北京市';
}

/**
 * 客户端坐标反查城市。
 *
 * 设计点：
 * IP 定位不准的根本原因是云函数环境可能只能看到 CDN、网关或运营商出口 IP。
 * 坐标由客户端授权获取，才是天气和穿搭推荐应优先使用的地理上下文。
 * 和风 GeoAPI 的 location 支持经纬度，格式使用 "经度,纬度"。
 */
async function tryQweatherLocation(vk, location = {}) {
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const host = process.env.QWEATHER_GEO_API_HOST || process.env.QWEATHER_API_HOST || '';
  const apiKey = process.env.QWEATHER_API_KEY || '';

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  if (!host || !apiKey) return '';

  try {
    const geoRes = await vk.request({
      url: `https://${host}/geo/v2/city/lookup`,
      method: 'GET',
      timeout: 5000,
      header: { 'X-QW-Api-Key': apiKey },
      data: {
        location: `${lon},${lat}`,
      },
      dataType: 'json',
    });

    if (geoRes.code !== '200' || !geoRes.location || !geoRes.location.length) return '';
    const loc = geoRes.location[0];
    return safeString(loc.name || loc.adm2 || loc.adm1);
  } catch (err) {
    console.error('[home][city] 坐标反查城市失败:', err.message || err);
    return '';
  }
}

/**
 * IP 归属地解析：ipinfo.io（免费额度 50k/月，HTTPS，国内访问稳定）。
 */
async function tryIpinfoIo(vk, ip) {
  const url = `https://ipinfo.io/${ip}/json`;
  console.log('[home][city] 请求 URL:', url);

  try {
    const geoRes = await vk.request({
      url,
      method: 'GET',
      timeout: 3000,
      dataType: 'json',
    });

    console.log('[home][city] 响应:', JSON.stringify(geoRes));

    if (geoRes && geoRes.city) {
      // ipinfo.io 返回英文城市名，映射为中文（天气 API 一般两种都支持）
      const cnCity = EN_TO_CN_CITY[geoRes.city] || geoRes.city;
      console.log('[home][city] 解析到城市:', cnCity, '| 原文:', geoRes.city, '| 地区:', geoRes.region, '| 国家:', geoRes.country);
      return cnCity;
    }

    console.log('[home][city] 返回无 city 字段');
    return null;
  } catch (err) {
    console.error('[home][city] 请求失败:', err.message || err);
    console.error('[home][city] 错误详情:', JSON.stringify(err));
    return null;
  }
}

/**
 * ipinfo.io 返回的常见中国城市英文名 → 中文名映射。
 * 不在映射表中的城市直接使用英文名（大多数天气 API 兼容）。
 */
const EN_TO_CN_CITY = {
  'Beijing': '北京', 'Shanghai': '上海', 'Guangzhou': '广州', 'Shenzhen': '深圳',
  'Wuhan': '武汉', 'Hangzhou': '杭州', 'Chengdu': '成都', 'Nanjing': '南京',
  'Tianjin': '天津', 'Chongqing': '重庆', 'Xian': '西安', 'Suzhou': '苏州',
  'Changsha': '长沙', 'Zhengzhou': '郑州', 'Jinan': '济南', 'Qingdao': '青岛',
  'Dalian': '大连', 'Xiamen': '厦门', 'Fuzhou': '福州', 'Kunming': '昆明',
  'Hefei': '合肥', 'Shenyang': '沈阳', 'Harbin': '哈尔滨', 'Changchun': '长春',
  'Taiyuan': '太原', 'Nanning': '南宁', 'Guiyang': '贵阳', 'Lanzhou': '兰州',
  'Urumqi': '乌鲁木齐', 'Dongguan': '东莞', 'Foshan': '佛山', 'Zhuhai': '珠海',
  'Ningbo': '宁波', 'Wuxi': '无锡', 'Wenzhou': '温州', 'NanChang': '南昌',
  'Shijiazhuang': '石家庄', 'Huhehaote': '呼和浩特', 'Xining': '西宁', 'Yinchuan': '银川',
};

/**
 * 判断是否为内网 IP。
 */
function isPrivateIP(ip) {
  if (!ip) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x
  if (parts[0] === '10') return true;
  if (parts[0] === '127') return true;
  if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return true;
  if (parts[0] === '192' && parts[1] === '168') return true;
  return false;
}
