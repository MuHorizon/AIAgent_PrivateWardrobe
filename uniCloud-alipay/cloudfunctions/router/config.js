loadLocalEnv();

const requireFn = function (path) {
  return require(path);
};
const initConfig = {
  baseDir: __dirname, // 云函数根目录地址
  requireFn,
};
module.exports = initConfig;

function loadLocalEnv() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');

  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.indexOf('#') === 0) continue;

    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    value = value.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}
