'use strict';
module.exports = {
  /**
   * 获取用户小程序绑定的手机号
   * 微信小程序API更新了，现在只需传code可以代替encryptedData和iv
   * @url user/pub/getPhoneNumber 前端调用的url参数地址
   * data 请求参数
   * @param {String} code 通过 getphonenumber 事件获取到的code（code和encryptedData+iv二选一）
   * @param {String} encryptedData（code和encryptedData+iv二选一）
   * @param {String} iv（code和encryptedData+iv二选一）
   * @param {String} encryptedKey code2SessionWeixin 接口返回的encryptedKey
   */
  main: async (event) => {
    let { data = {}, userInfo, util, originalParam } = event;
    let { customUtil, config, pubFun, vk, db, _ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { platform } = data;
    if (!platform) platform = vk.pubfn.getPlatformForUniId(originalParam.context);
    if (platform === 'mp-weixin') {
      res = await vk.openapi.weixin.decrypt.getPhoneNumber(data);
    } else if (platform === 'mp-toutiao') {
      res = await vk.openapi.douyin.decrypt.getPhoneNumber(data);
    } else if (platform === 'mp-harmony') {
      res = await vk.openapi.huawei.decrypt.getPhoneNumber(data);
    } else {
      res = { code: -1, msg: `暂不支持平台 ${platform}` };
    }
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
