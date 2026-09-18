'use strict';
module.exports = {
  /**
   * 获取扩展存储上传参数
   * @url user/pub/getUploadFileOptionsForExtStorage 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------

    let {
      cloudPath, // 文件路径
      domain, // 域名
      provider,
    } = data;
    if (!cloudPath) {
      return { code: -1, msg: 'cloudPath不能为空' };
    }
    // 可以在此先判断下此路径是否允许上传等逻辑
    let dirname = 'public';
    if (cloudPath.indexOf(`${dirname}/`) !== 0) {
      return { code: -1, msg: `仅能上传到${dirname}目录` };
    }
    // 如果 uniCloud.getExtStorageManager 是undefined，说明没有安装扩展库，需要提示用户安装扩展库
    if (typeof uniCloud.getExtStorageManager === 'undefined') {
      return { code: -1, msg: '请右键云函数-管理依赖-添加扩展库uni-cloud-ext-storage（需要HBX版本>=3.99）添加后需重启项目' };
    }
    // 获取扩展存储的配置
    let extStorageConfig = vk.pubfn.copyObject(vk.getConfig('vk.service.cloudStorage.extStorage'));
    if (provider) extStorageConfig.provider = provider;
    if (domain) extStorageConfig.domain = domain;
    if (!extStorageConfig.domain) {
      const pageTisp = '扩展存储的domain不能为空，请配置前端 app.config.js 内的 service.cloudStorage.extStorage.domain';
      const cloudTisp = '或 配置云端 uni-config-center/vk-unicloud/index.js 内的 vk.service.cloudStorage.extStorage.domain';
      console.error(`${pageTisp} ${cloudTisp}`);
      return { code: -1, msg: 'domain不能为空' };
    }

    // extStorageConfig 去除所有空值
    let realityExtStorageConfig = {};
    for (const key in extStorageConfig) {
      if (extStorageConfig.hasOwnProperty(key) && vk.pubfn.isNotNull(extStorageConfig[key])) {
        realityExtStorageConfig[key] = extStorageConfig[key];
      }
    }

    // 然后获取 extStorageManager 对象实例
    const extStorageManager = uniCloud.getExtStorageManager(realityExtStorageConfig);
    // 最后调用 extStorageManager.getUploadFileOptions
    let uploadFileOptionsRes = extStorageManager.getUploadFileOptions({
      cloudPath,
      allowUpdate: false, // 是否允许覆盖更新，如果返回前端，建议设置false，代表仅新增，不可覆盖
    });
    // 如果配置了自定义上传地址，则使用自定义上传地址，否则使用默认上传地址 https://upload.qiniup.com
    const uploadEndpoint = vk.getConfig('vk.service.cloudStorage.extStorage.endpoint.upload');
    if (uploadEndpoint) {
      uploadFileOptionsRes.uploadFileOptions.url = uploadEndpoint;
    }
    // 业务逻辑结束-----------------------------------------------------------
    return {
      ...uploadFileOptionsRes,
      code: 0,
    };
  },
};
