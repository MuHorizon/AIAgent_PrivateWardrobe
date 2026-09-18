'use strict';

const http = require('http');
const https = require('https');
const OpenAI = require('openai');
const db = uniCloud.database();

/**
 * AI Agent 学习注释：衣物识别 / 多模态输入
 * ------------------------------------------------------------
 * 这个文件对应你笔记里的“多模态、图片处理、Context、结构化输出、Tool”。
 *
 * 1. 多模态
 *    clothes.analyze 把用户上传的衣服图片作为 input_image 传给视觉模型。
 *    模型同时看到图片 + 文本 prompt，所以这是“图片 + 文字”的多模态调用。
 *
 * 2. 结构化输出
 *    prompt 明确要求模型只返回 JSON，例如 category、color、style_tags。
 *    这样前端可以直接展示“识别结果卡片”，后端也能保存成数据库字段。
 *
 * 3. Tool / 数据库
 *    clothes.save 是“把识别结果放入衣橱”的工具。
 *    保存后的 clothes 表会成为后续 outfit.generate 的 search_closet 数据源。
 *
 * 4. Agent 可观测性
 *    ai_tasks 记录每次图片识别的 prompt、模型输出、错误原因。
 *    新手调试 Agent 时，不能只看前端结果，要能追踪模型到底看到了什么、回了什么。
 *
 * 5. 降级策略
 *    识别失败时返回 buildEmptyAnalysis()，允许用户先把图片放入衣橱，后续再补全信息。
 *    这符合产品目标：尽量少让用户手填，不因为 AI 一次失败就阻断流程。
 */
const cloudObject = {
	isCloudObject: true,

	/**
	 * 查询当前用户的衣柜衣物。
	 * @url client/wardrobe/clothes.list
	 * Agent 视角：这是 search_closet 工具的第一版云端实现，后续穿搭推荐会从这里拿到真实单品。
	 */
	list: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			category = ''
		} = data;
		let whereJson = {
			user_id: uid,
			status: 'active'
		};

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (category && category !== '全部') whereJson.category = category;

		const queryRes = await db.collection('clothes').where(whereJson)
			.orderBy('created_at', 'desc').limit(100).get();
		res.rows = queryRes.data || [];
		return res;
	},

	/**
	 * 识别衣物图片。
	 * @url client/wardrobe/clothes.analyze
	 * Agent 概念：图片本身不能直接用于数据库检索，所以这里把多模态输入转换成结构化字段。
	 *
	 * AI Agent 学习注释：为什么要把图片转成字段？
	 * 大模型可以看懂图片，但数据库和推荐算法不能直接“理解一张图”。
	 * 所以这里把图片变成 category/type/color/style_tags 等结构化信息。
	 * 后续搭配 Agent 才能按“上衣、白色、简约、适合上班”这些字段检索衣柜。
	 */
	analyze: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			image_url = '', image_file_id = ''
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		image_url = safeString(image_url);
		if (!image_url) return {
			code: -1,
			msg: '缺少衣物图片地址'
		};

		const taskId = await createAnalyzeTask({
			uid,
			imageUrl: image_url,
			imageFileId: image_file_id
		});

		try {
			const model = process.env.ARK_VISION_MODEL || '';
			if (!process.env.ARK_API_KEY) throw new Error('缺少环境变量 ARK_API_KEY');
			if (!model) throw new Error('缺少环境变量 ARK_VISION_MODEL');

			// AI Agent 学习注释：Prompt / Context
			// 这段 prompt 就是视觉识别 Agent 的 system 规则：
			// - 告诉模型身份：专业衣柜图片识别助手
			// - 限制输出格式：只返回 JSON
			// - 限制枚举值：category/style_tags/season_tags 只能从指定范围选择
			// 这样做可以减少模型自由发挥，方便后端解析和保存。
			const prompt = [
				'你是一个专业的衣柜图片识别助手。',
				'请分析图片中最主要的一件衣物或配饰，并返回结构化信息。',
				'只返回 JSON，不要 Markdown，不要解释文字。',
				'如果无法完全确定，请根据图片特征给出最可能结果。',
				'字段要求：',
				'category：衣物分类，只能选择：上衣、下装、外套、鞋、包、配饰。',
				'type：衣物具体类型，例如：T恤、衬衫、针织衫、卫衣、牛仔裤、运动鞋等。',
				'color：主要颜色。',
				'material：材质推测，例如：棉、羊毛、牛仔、皮革、涤纶等。',
				'fit：版型，只能选择：修身、标准、宽松、短款、长款。',
				'style_tags：风格标签数组，最多3个，只能选择：简约、休闲、日系、欧美、商务、街头、运动、复古。',
				'season_tags：季节标签数组，最多2个，只能选择：春、夏、秋、冬。',
				'scene_tags：适用场景数组，最多3个，只能选择：上班、约会、旅行、聚会、运动、日常、海边。',
				'ai_description：一句话描述识别依据。',
				'返回格式示例：',
				'{"category":"上衣","type":"针织衫","color":"白色","material":"棉","fit":"标准","style_tags":["简约","休闲"],"season_tags":["春","秋"],"scene_tags":["日常","约会"],"ai_description":"白色针织上衣，整体设计简洁，适合日常穿搭。"}'
			].join('\n');

			await updateAnalyzeTaskRunning({
				taskId,
				prompt,
				payload: {
					model,
					image_url
				}
			});

			const client = new OpenAI({
				apiKey: process.env.ARK_API_KEY,
				baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
				timeout: 60000,
				maxRetries: 0,
			});

			// AI Agent 学习注释：多模态输入
			// input_image 是图片，input_text 是识别规则。
			// 模型同时读取两种信息后返回结构化 JSON。
			const payload = {
				model,
				input: [{
					role: 'user',
					content: [{
							type: 'input_image',
							image_url: image_url
						},
						{
							type: 'input_text',
							text: prompt
						},
					]
				}]
			};

			const response = await client.responses.create(payload, {
				timeout: 60000,
				maxRetries: 0
			});
			const outputText = typeof response.output_text === 'string' ?
				response.output_text.trim() :
				(response.output || []).map(item => (item.content || []).map(part => part.text || '').join(
					'\n')).join('\n').trim();

			await updateAnalyzeTaskModelOutput({
				taskId,
				outputText,
				rawResponse: response
			});
			// AI Agent 学习注释：模型输出不能直接信任。
			// parseJsonOutput 负责解析 JSON，normalizeClothingAnalysis 负责补默认值、限制数组长度、清洗字段。
			const analysis = normalizeClothingAnalysis(parseJsonOutput(outputText));
			await updateAnalyzeTaskSuccess({
				taskId,
				analysis
			});

			res.analysis = analysis;
			res.ai_task_id = taskId;
			res.source = 'doubao_vision';
		} catch (err) {
			console.error('豆包衣物图片识别失败', err);
			await updateAnalyzeTaskFail({
				taskId,
				err
			});
			res.analysis = buildEmptyAnalysis();
			res.ai_task_id = taskId;
			res.source = 'manual_fallback';
			res.ai_error = normalizeAnalyzeError(err);
		}

		return res;
	},

	/**
	 * 查询单件衣物详情。
	 * @url client/wardrobe/clothes.detail
	 */
	detail: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			_id
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (!_id) return {
			code: -1,
			msg: '缺少衣物ID'
		};

		const queryRes = await db.collection('clothes').where({
			_id,
			user_id: uid,
			status: 'active'
		}).limit(1).get();
		res.clothing = queryRes.data && queryRes.data[0] ? queryRes.data[0] : null;
		return res;
	},

	/**
	 * 保存衣物。
	 * @url client/wardrobe/clothes.save
	 *
	 * AI Agent 学习注释：Function Tool
	 * 这是“放入衣橱”工具。模型只负责识别建议，真正写数据库必须由后端工具完成。
	 * 这样可以做权限校验、字段清洗、默认值兜底，避免模型直接改数据造成风险。
	 */
	save: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			clothing = {}
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};

		const now = Date.now();
		const dataJson = buildClothingData(uid, clothing, now);
		if (!dataJson.image_url) {
			return {
				code: -1,
				msg: '请先添加衣物图片'
			};
		}

		const addRes = await db.collection('clothes').add({
			...dataJson,
			created_at: now
		});
		res.clothing = {
			...dataJson,
			_id: addRes.id,
			id: addRes.id,
			created_at: now
		};
		return res;
	},

	/**
	 * 软删除衣物。
	 * @url client/wardrobe/clothes.remove
	 */
	remove: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			_id
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (!_id) return {
			code: -1,
			msg: '缺少衣物ID'
		};

		const updateRes = await db.collection('clothes').where({
				_id,
				user_id: uid
			})
			.update({
				status: 'inactive',
				updated_at: Date.now()
			});
		res.updated = updateRes.updated || 0;
		return res;
	},

	/**
	 * 编辑衣物信息。
	 * @url client/wardrobe/clothes.update
	 * Agent 设计点：AI 识别可能不准，用户需修正分类、颜色、标签。
	 * 编辑后的数据直接影响 search_closet 的检索结果和穿搭推荐质量。
	 */
	update: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			_id,
			clothing = {}
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (!_id) return {
			code: -1,
			msg: '缺少衣物ID'
		};

		const patch = {
			updated_at: Date.now()
		};
		const scalarFields = ['name', 'category', 'type', 'color', 'material', 'fit', 'ai_description',
			'status'
		];
		const arrayFields = ['style_tags', 'season_tags', 'scene_tags'];

		for (let i = 0; i < scalarFields.length; i++) {
			const key = scalarFields[i];
			if (clothing[key] !== undefined && clothing[key] !== null) {
				patch[key] = safeString(clothing[key]);
			}
		}
		for (let i = 0; i < arrayFields.length; i++) {
			const key = arrayFields[i];
			if (clothing[key] !== undefined && clothing[key] !== null) {
				patch[key] = safeStringList(clothing[key]);
			}
		}

		const updateRes = await db.collection('clothes').where({
			_id,
			user_id: uid
		}).update(patch);
		res.updated = updateRes.updated || 0;
		return res;
	},

	/**
	 * 批量管理衣物（删除/改分类/改季节）。
	 * @url client/wardrobe/clothes.batchAction
	 * Agent 设计点：批量操作提高管理效率，所有操作限制在当前用户范围内。
	 */
	batchAction: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			ids = [], action = 'remove', patch = {}
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (!ids.length) return {
			code: -1,
			msg: '请选择要操作的衣物'
		};

		const now = Date.now();
		let updateData = {
			updated_at: now
		};
		let affected = 0;

		if (action === 'remove') {
			updateData.status = 'inactive';
		} else if (action === 'update') {
			const allowed = ['category', 'season_tags', 'style_tags', 'scene_tags', 'status'];
			for (let i = 0; i < allowed.length; i++) {
				if (patch[allowed[i]] !== undefined) {
					updateData[allowed[i]] = Array.isArray(patch[allowed[i]]) ?
						safeStringList(patch[allowed[i]]) :
						safeString(patch[allowed[i]]);
				}
			}
		} else {
			return {
				code: -1,
				msg: '不支持的操作'
			};
		}

		for (let i = 0; i < ids.length; i++) {
			try {
				const r = await db.collection('clothes').where({
					_id: ids[i],
					user_id: uid
				}).update(updateData);
				if (r.updated) affected++;
			} catch (err) {
				console.error('批量操作失败', ids[i], err);
			}
		}

		res.affected = affected;
		res.total = ids.length;
		return res;
	},

	/**
	 * 搜索衣柜衣物（按关键词/颜色/季节/风格）。
	 * @url client/wardrobe/clothes.search
	 * Agent 设计点：当衣柜超过几十件时需要关键词搜索，后续可扩展为向量搜索实现语义匹配。
	 */
	search: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			keyword = '', color = '', season = '', style = '', category = ''
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};

		const queryRes = await db.collection('clothes').where({
				user_id: uid,
				status: 'active'
			})
			.orderBy('created_at', 'desc').limit(200).get();

		let clothes = queryRes.data || [];
		const kw = safeString(keyword).toLowerCase();

		if (kw) {
			clothes = clothes.filter((item) => {
				const txt = [item.name, item.type, item.color, item.material, item.ai_description]
					.filter(Boolean).join(' ').toLowerCase();
				return txt.indexOf(kw) > -1;
			});
		}
		if (safeString(color)) clothes = clothes.filter((c) => c.color === safeString(color));
		if (safeString(season)) clothes = clothes.filter((c) => (c.season_tags || []).indexOf(safeString(
			season)) > -1);
		if (safeString(style)) clothes = clothes.filter((c) => (c.style_tags || []).indexOf(safeString(style)) >
			-1);
		if (safeString(category) && category !== '全部') clothes = clothes.filter((c) => c.category ===
			safeString(category));

		res.rows = clothes.slice(0, 60);
		res.total = clothes.length;
		return res;
	},

	/**
	 * 记录穿着频次。
	 * @url client/wardrobe/clothes.wearLog
	 * Agent 设计点：穿着频次信号用于推荐排序——常穿单品权重提升，长期未穿触发闲置提醒。
	 */
	wearLog: async function(data = {}) {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		let {
			_id
		} = data;

		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};
		if (!_id) return {
			code: -1,
			msg: '缺少衣物ID'
		};

		const now = Date.now();
		const queryRes = await db.collection('clothes').where({
			_id,
			user_id: uid
		}).limit(1).get();
		const item = queryRes.data && queryRes.data[0];
		if (!item) return {
			code: -1,
			msg: '衣物不存在'
		};

		const count = (item.wear_count || 0) + 1;
		const history = Array.isArray(item.wear_history) ? item.wear_history : [];

		await db.collection('clothes').where({
			_id,
			user_id: uid
		}).update({
			wear_count: count,
			wear_history: [...history.slice(-50), now],
			last_worn_at: now,
			updated_at: now,
		});

		res.wear_count = count;
		res.last_worn_at = now;
		return res;
	},

	/**
	 * 闲置衣物提醒。
	 * @url client/wardrobe/clothes.idleReminder
	 * Agent 设计点：超过 30 天未穿的单品视为闲置，帮助用户发现被遗忘的好衣服。
	 */
	idleReminder: async function() {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};

		const queryRes = await db.collection('clothes').where({
			user_id: uid,
			status: 'active'
		}).limit(200).get();
		const clothes = queryRes.data || [];
		const now = Date.now();
		const IDLE = 30 * 24 * 60 * 60 * 1000;

		const idleItems = clothes.filter((item) => {
			const last = item.last_worn_at || item.created_at || 0;
			return now - last > IDLE;
		});

		const oftenWorn = clothes.filter((item) => (item.wear_count || 0) >= 3)
			.sort((a, b) => (b.wear_count || 0) - (a.wear_count || 0)).slice(0, 10);

		res.idle = idleItems.slice(0, 20).map(toClothingCard);
		res.idle_count = idleItems.length;
		res.often_worn = oftenWorn.map(toClothingCard);
		res.total_active = clothes.length;
		return res;
	},

	/**
	 * 检测重复衣物。
	 * @url client/wardrobe/clothes.duplicateCheck
	 * Agent 设计点：基于颜色+分类+类型检测疑似重复，用户确认后可合并，避免衣柜数据冗余。
	 */
	duplicateCheck: async function() {
		let res = {
			code: 0,
			msg: ''
		};
		let {
			uid
		} = this.getClientInfo();
		if (!uid) return {
			code: -1,
			msg: '用户未登录'
		};

		const queryRes = await db.collection('clothes').where({
			user_id: uid,
			status: 'active'
		}).limit(200).get();
		const clothes = queryRes.data || [];
		const groups = {};
		const duplicates = [];

		for (let i = 0; i < clothes.length; i++) {
			const item = clothes[i];
			const key = `${item.color || ''}|${item.category || ''}|${item.type || ''}`.toLowerCase();
			if (!groups[key]) groups[key] = [];
			groups[key].push(item);
		}

		Object.keys(groups).forEach((key) => {
			if (groups[key].length > 1) {
				duplicates.push({
					key,
					count: groups[key].length,
					items: groups[key].map(toClothingCard)
				});
			}
		});

		res.duplicates = duplicates.slice(0, 10);
		res.total_groups = duplicates.length;
		return res;
	},
};

module.exports = cloudObject;

function toClothingCard(item) {
	return {
		_id: item._id,
		name: item.name || buildClothingName(item.color, item.type, item.category),
		image_url: item.image_url,
		category: item.category,
		color: item.color
	};
}

function normalizeAnalyzeError(err) {
	const message = (err && (err.message || err.msg || err.errMsg)) || '图片识别失败';
	if (message.indexOf('timeout') > -1 || message.indexOf('Response timeout') > -1) {
		return '视觉模型响应超时。通常是视觉接入点较慢、图片地址拉取慢，或当前接入点不适合图片理解';
	}
	return message;
}

function parseJsonOutput(outputText) {
	const text = safeString(outputText);
	if (!text) throw new Error('豆包返回为空');
	try {
		return JSON.parse(stripJsonFence(text));
	} catch (err) {
		const jsonText = extractFirstJsonObject(text);
		if (!jsonText) throw new Error('豆包返回不是 JSON');
		return JSON.parse(jsonText);
	}
}

function normalizeClothingAnalysis(parsed = {}) {
	const analysis = {
		category: pickAllowed(safeString(parsed.category), ['上衣', '下装', '外套', '鞋', '包', '配饰']),
		type: safeString(parsed.type),
		color: safeString(parsed.color),
		material: safeString(parsed.material),
		fit: pickAllowed(safeString(parsed.fit), ['修身', '标准', '宽松', '短款', '长款']),
		style_tags: safeStringList(parsed.style_tags).filter((item) => ['简约', '休闲', '日系', '欧美', '商务', '街头', '运动',
			'复古'
		].indexOf(item) > -1).slice(0, 3),
		season_tags: safeStringList(parsed.season_tags).filter((item) => ['春', '夏', '秋', '冬'].indexOf(item) > -1)
			.slice(0, 2),
		scene_tags: safeStringList(parsed.scene_tags).filter((item) => ['上班', '约会', '旅行', '聚会', '运动', '日常', '海边']
			.indexOf(item) > -1).slice(0, 3),
		ai_description: safeString(parsed.ai_description),
	};
	if (!analysis.category) analysis.category = '上衣';
	if (!analysis.fit) analysis.fit = '标准';
	return analysis;
}

function buildEmptyAnalysis() {
	return {
		category: '',
		type: '',
		color: '',
		material: '',
		fit: '',
		style_tags: [],
		season_tags: [],
		scene_tags: [],
		ai_description: ''
	};
}

async function createAnalyzeTask({
	uid,
	imageUrl,
	imageFileId
}) {
	const now = Date.now();
	try {
		const addRes = await db.collection('ai_tasks').add({
			user_id: uid,
			task_type: 'clothing_image_analyze',
			provider: 'doubao',
			model: process.env.ARK_VISION_MODEL || process.env.ARK_TEXT_MODEL || '',
			input: {
				image_url: imageUrl,
				image_file_id: safeString(imageFileId)
			},
			output: {},
			status: 'created',
			error_message: '',
			fallback_reason: '',
			created_at: now,
			updated_at: now,
		});
		return addRes.id;
	} catch (err) {
		console.error('AI 图片识别任务创建失败，继续执行识别', err);
		return '';
	}
}

async function updateAnalyzeTaskRunning({
	taskId,
	prompt,
	payload
}) {
	if (!taskId) return;
	try {
		await db.collection('ai_tasks').doc(taskId).update({
			status: 'running',
			prompt: {
				instructions: prompt,
				payload
			},
			updated_at: Date.now(),
		});
	} catch (err) {
		console.error('AI 图片识别运行状态记录失败', err);
	}
}

async function updateAnalyzeTaskModelOutput({
	taskId,
	outputText,
	rawResponse
}) {
	if (!taskId) return;
	try {
		await db.collection('ai_tasks').doc(taskId).update({
			output: {
				raw_text: truncateText(outputText, 4000),
				raw_response: rawResponse
			},
			updated_at: Date.now(),
		});
	} catch (err) {
		console.error('AI 图片识别原始输出记录失败', err);
	}
}

async function updateAnalyzeTaskSuccess({
	taskId,
	analysis
}) {
	if (!taskId) return;
	try {
		const output = await getAiTaskOutput(taskId);
		await db.collection('ai_tasks').doc(taskId).update({
			status: 'success',
			output: {
				...output,
				analysis
			},
			updated_at: Date.now(),
		});
	} catch (err) {
		console.error('AI 图片识别成功状态记录失败', err);
	}
}

async function updateAnalyzeTaskFail({
	taskId,
	err
}) {
	if (!taskId) return;
	try {
		await db.collection('ai_tasks').doc(taskId).update({
			status: 'failed',
			error_message: (err && err.message) || '图片识别失败',
			fallback_reason: 'manual_input',
			updated_at: Date.now(),
		});
	} catch (recordErr) {
		console.error('AI 图片识别失败状态记录失败', recordErr);
	}
}

async function getAiTaskOutput(taskId) {
	const queryRes = await db.collection('ai_tasks').doc(taskId).get();
	const row = queryRes.data && queryRes.data[0] ? queryRes.data[0] : {};
	return row.output && typeof row.output === 'object' ? row.output : {};
}

function buildClothingData(uid, clothing, now) {
	const category = safeString(clothing.category) || '待识别';
	const type = safeString(clothing.type);
	const color = safeString(clothing.color) || '待识别';
	return {
		user_id: uid,
		name: safeString(clothing.name) || buildClothingName(color, type, category),
		category,
		type,
		color,
		material: safeString(clothing.material),
		fit: safeString(clothing.fit),
		style_tags: safeStringList(clothing.style_tags),
		season_tags: safeStringList(clothing.season_tags),
		scene_tags: safeStringList(clothing.scene_tags),
		image_url: safeString(clothing.image_url),
		image_file_id: safeString(clothing.image_file_id),
		image_cloud_path: safeString(clothing.image_cloud_path),
		image_provider: safeString(clothing.image_provider),
		ai_description: safeString(clothing.ai_description),
		ai_task_id: safeString(clothing.ai_task_id),
		status: 'active',
		updated_at: now,
	};
}

function buildClothingName(color, type, category) {
	if (color === '待识别' && category === '待识别' && !type) return '待识别衣物';
	const itemType = type || category || '衣物';
	return color ? `${color}${itemType}` : itemType;
}

function safeString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function safeStringList(value) {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => safeString(item)).filter(Boolean))];
}

function pickAllowed(value, allowedValues) {
	return allowedValues.indexOf(value) > -1 ? value : '';
}

function stripJsonFence(text) {
	return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

function extractFirstJsonObject(text) {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return '';
	return text.slice(start, end + 1);
}

function truncateText(text, maxLength) {
	const value = safeString(text);
	return value.length > maxLength ? value.slice(0, maxLength) : value;
}
