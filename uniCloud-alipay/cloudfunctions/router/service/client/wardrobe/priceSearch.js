'use strict';

const cloudObject = {
  isCloudObject: true,

  /**
   * 全网比价搜索。
   * @url client/wardrobe/priceSearch.search
   * Agent 设计点：
   * 比价属于外部工具调用，不应该让前端直接访问搜索 MCP 或暴露 MCP Key。
   * 小程序只提交用户要找的单品关键词，云函数在服务端调用 SEARCH_MCP_API_URL，再把结果整理给前端。
   */
  search: async function (data = {}) {
    let { uid } = this.getClientInfo();
    let { vk } = this.getUtil();
    let { query = '', clothing = {} } = data;

    if (!uid) {
      return { code: -1, msg: '用户未登录' };
    }

    const searchQuery = buildSearchQuery({
      query,
      clothing,
    });

    if (!searchQuery) {
      return { code: -1, msg: '请输入要比价的衣物关键词' };
    }

    const searchRes = await callSearchMcp({
      vk,
      query: searchQuery,
    });

    return {
      code: searchRes.configNeeded ? -1 : 0,
      msg: searchRes.configNeeded ? '搜索 MCP 服务未配置' : '',
      query: searchQuery,
      rows: searchRes.rows,
      config_needed: searchRes.configNeeded,
    };
  },
};

module.exports = cloudObject;

async function callSearchMcp({ vk, query }) {
  const url = process.env.SEARCH_MCP_API_URL || '';
  const apiKey = process.env.SEARCH_MCP_API_KEY || '';

  if (!url || !apiKey) {
    return {
      configNeeded: true,
      rows: [],
    };
  }

  const response = await vk.request({
    url,
    method: 'POST',
    timeout: Number(process.env.SEARCH_MCP_TIMEOUT) || 30000,
    header: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    data: {
      query,
      vertical: 'shopping',
      limit: 10,
    },
    dataType: 'json',
  });

  return {
    configNeeded: false,
    rows: normalizeSearchRows(response),
  };
}

function normalizeSearchRows(response = {}) {
  const rows = response.results || response.rows || response.items || [];

  if (!Array.isArray(rows)) return [];

  return rows.slice(0, 10).map((item) => {
    const title = safeString(item.title || item.name);
    const url = safeString(item.url || item.link);
    return {
      product_key: url || title,
      title,
      price: safeString(item.price || item.price_text),
      platform: safeString(item.platform || item.source || item.site_name),
      image_url: safeString(item.image_url || item.thumbnail),
      url,
      summary: safeString(item.summary || item.description),
    };
  });
}

function buildSearchQuery({ query, clothing }) {
  const text = safeString(query);
  if (text) return text;

  const parts = [
    safeString(clothing.color),
    safeString(clothing.material),
    safeString(clothing.type),
    safeString(clothing.category),
  ].filter(Boolean);

  return parts.join(' ');
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
