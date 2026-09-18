// 加载定时任务 - 请勿改动此文件-----------------------------------
const fs = require('fs');
const path = require('path');
const moduleObj = {};

// 自动扫描当前目录下的所有 js 文件（排除 index.js）
const files = fs.readdirSync(__dirname);
files.forEach((file) => {
  if (file !== 'index.js' && file.endsWith('.js')) {
    const moduleName = path.basename(file, '.js');
    moduleObj[moduleName] = require(`./${file}`);
  }
});

module.exports = moduleObj;
// 加载定时任务 - 请勿改动此文件-----------------------------------
