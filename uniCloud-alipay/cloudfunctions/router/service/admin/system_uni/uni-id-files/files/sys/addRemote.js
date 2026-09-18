'use strict';
module.exports = {
  /**
   * 添加远程文件
   * @url admin/system_uni/uni-id-files/files/sys/addRemote 前端调用的url参数地址
   * data 请求参数
   * @param {String} params1  参数1
   */
  main: async (event) => {
    let { data = {}, userInfo, util, filterResponse, originalParam } = event;
    let { customUtil, uniID, config, pubFun, vk, db, _, $ } = util;
    let { uid } = data;
    let res = { code: 0, msg: '' };
    // 业务逻辑开始-----------------------------------------------------------
    let { url, name, description, clone_image, category_id, width, height, orientation, duration, type } = data;

    // 参数非空检测
    let nullKey = vk.pubfn.isNullOneByObject({ url, type });
    if (nullKey) return { code: -1, msg: '参数 ' + nullKey + ' 不能为空' };

    if (vk.pubfn.isNull(name)) name = url;
    let file_id;
    let provider = 'other';
    let size;
    let imageBuffer = await vk.request({
      url: url,
      method: 'GET',
      dataType: 'default',
    });
    size = imageBuffer.length;
    // 判断是否需要克隆图片
    if (clone_image) {
      let random = vk.pubfn.random(6, 'abcdefghijklmnopqrstuvwxyz0123456789');
      // 上传到云端
      let uploadFileRes = await vk.uploadFile({
        cloudPath: `remote/${uid}/${random}-${name}`,
        fileContent: imageBuffer,
      });
      // 得到云端返回参数
      file_id = uploadFileRes.fileID;
      provider = uploadFileRes.provider;
      url = uploadFileRes.fileURL;
    }
    if (!file_id) file_id = url;
    let dataJson = {
      user_id: uid,
      sort: 0,
      status: 0,
      type,
      url,
      display_name: name,
      original_name: name,
      description,
      size,
      file_id,
      provider,
      width,
      height,
      orientation,
      duration,
    };
    if (vk.pubfn.isNotNull(category_id)) {
      dataJson['category_id'] = category_id;
    } else {
      dataJson['category_id'] = 'null'; // 这里设置为字符串null是为了索引生效
    }
    await vk.baseDao.add({
      dbName: 'vk-files',
      dataJson,
    });
    // 业务逻辑结束-----------------------------------------------------------
    return res;
  },
};
