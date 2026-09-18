# AI 私人衣橱 Agent

这是一个基于 uni-app、vk-unicloud-router、uniCloud 的微信小程序项目，用来做个人 AI 穿搭助手。

用户可以上传自己的衣服，系统会调用 AI 识别衣物信息，并结合个人画像、场景需求、历史记录等数据生成穿搭建议。

## 主要功能

- 微信小程序登录和用户资料管理
- 用户穿衣画像维护
- 衣物图片上传
- AI 衣物识别和结构化保存
- 我的衣柜分类管理
- AI 穿搭对话
- 穿搭方案生成、保存和历史记录
- 收藏衣物和穿搭方案
- 价格搜索、价格追踪
- AI 调试页面，方便排查模型调用问题

## 技术栈

- uni-app
- Vue
- vk-unicloud-router
- uniCloud 阿里云空间
- uni-id 用户体系
- 云数据库
- 火山方舟 / 豆包大模型接口
- 微信小程序相关能力

## 本地运行

这个项目主要通过 HBuilderX 运行。

1. 用 HBuilderX 打开项目根目录。
2. 关联自己的 uniCloud 服务空间。
3. 配置本地密钥文件，参考下面的“本地密钥和占位符”。
4. 运行到微信开发者工具或 H5。
5. 云函数需要先安装依赖并上传/运行云函数：

```bash
cd uniCloud-alipay/cloudfunctions/router
npm install
```

项目根目录的 `package.json` 不是常规 Vite/webpack 前端项目脚本，目前没有 `npm run dev` 这类启动命令。

## 本地密钥和占位符

真实密钥只放在本地文件里，不提交到远程仓库。仓库里只提交 `.example` 示例文件。

本地运行时使用真实文件：

```text
manifest.json
uniCloud-alipay/cloudfunctions/router/.env
uniCloud-alipay/database/uni-id-users.init_data.json
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-pay/config.js
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/vk-unicloud/index.js
```

远程仓库提交占位符模板：

```text
manifest.example.json
uniCloud-alipay/cloudfunctions/router/.env.example
uniCloud-alipay/database/uni-id-users.init_data.example.json
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.example.json
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-pay/config.example.js
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/vk-unicloud/index.example.js
```

如果别人重新拉取项目，需要复制模板文件并填入自己的真实值，例如：

```bash
cp manifest.example.json manifest.json
cp uniCloud-alipay/cloudfunctions/router/.env.example uniCloud-alipay/cloudfunctions/router/.env
cp uniCloud-alipay/database/uni-id-users.init_data.example.json uniCloud-alipay/database/uni-id-users.init_data.json
cp uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.example.json uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json
cp uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-pay/config.example.js uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-pay/config.js
cp uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/vk-unicloud/index.example.js uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/vk-unicloud/index.js
```

注意：这不是“上传时自动替换真实值”，而是“真实文件不提交，提交的是 example 占位符文件”。

## 不能提交到远程仓库的内容

以下内容已经通过 `.gitignore` 忽略：

- `.env` 和 `.env.*`
- 微信、支付宝支付证书文件：`.pem`、`.key`、`.crt`、`.p12`、`.pfx`
- `node_modules`
- `unpackage`
- HBuilderX 本地配置目录
- `uni-id/config.json`
- `uni-pay/config.js`
- `vk-unicloud/index.js`
- `manifest.json`
- 初始化用户数据文件

如果这些文件已经被 Git 跟踪过，需要取消跟踪：

```bash
git rm --cached 文件路径
```

这个命令只会从 Git 索引里移除文件，不会删除本地真实文件。

## AI 配置

AI 调用使用云函数环境变量配置。参考：

```text
uniCloud-alipay/cloudfunctions/router/.env.example
docs/DOUBAO_AI_SETUP.md
```

常用变量：

```env
ARK_API_KEY=your_volcengine_ark_api_key
ARK_TEXT_MODEL=your_ark_text_model_id_or_endpoint_id
ARK_VISION_MODEL=your_ark_vision_model_id_or_endpoint_id
```

## 相关文档

- `docs/AI_PRIVATE_WARDROBE_PROJECT.md`：项目规划和 Agent 业务拆解
- `docs/DOUBAO_AI_SETUP.md`：豆包 / 火山方舟模型配置说明

## 安全提醒

如果真实密钥已经提交或发送给别人，应立即去对应平台重置密钥。

尤其是：

- 微信小程序 `appsecret`
- 火山方舟 API Key
- 支付宝 / 微信支付私钥和证书
- uni-id 的 `passwordSecret`、`tokenSecret`
