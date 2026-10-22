'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('assets/js/workspace-v5-model-assurance.js', 'utf8');
const css = fs.readFileSync('assets/css/workspace.css', 'utf8');

assert.ok(html.includes('workspace-v5-model-assurance.js?v=20261019-v53') &&
          html.includes('workspace.css?v=20261022-unified-v2'),
  'FuelCell workspace must load the model assurance disclosure script and current workspace stylesheet');
assert.doesNotThrow(() => new Function(script),
  'model assurance disclosure must be valid JavaScript');
for (const token of [
  'MODEL SCOPE / 工程模型适用范围',
  'Tafel 活化项',
  '欧姆内阻项',
  '经验指数浓差项',
  '完整 Amphlett 实现',
  '极限电流密度',
  '反应物传质状态',
  '台架数据标定',
  '独立验证',
  '随机数演示'
]) {
  assert.ok(script.includes(token), 'model assurance must disclose: ' + token);
}
for (const page of ['dashboard', 'sim', 'calc', 'monitor', 'model']) {
  assert.ok(script.includes('"' + page + '"'), 'disclosure must appear in the ' + page + ' workspace');
}
for (const selector of [
  '.w5-model-assurance',
  '.w5-model-assurance__heading',
  '.w5-model-assurance__body',
  '.w5-model-assurance__tags',
  '.w5-model-assurance__secondary'
]) {
  assert.ok(css.includes(selector), 'V5 stylesheet must style the model assurance panel: ' + selector);
}
console.log('FuelCell model-scope disclosure checks passed.');
