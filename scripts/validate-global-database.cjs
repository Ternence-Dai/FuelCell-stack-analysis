'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const referenceData = fs.readFileSync('assets/js/reference-data.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const css = fs.readFileSync('assets/css/workspace.css', 'utf8');

const blockStart = referenceData.indexOf('const GLOBAL_DB = [');
const blockEnd = referenceData.indexOf('\n];', blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'manufacturer source-backed dataset must exist');
const block = referenceData.slice(blockStart, blockEnd);
const records = block.match(/^\s*\{\s*n:/gm) || [];
assert.equal(records.length, 4, 'only the four manufacturer records with verified public product specifications should be listed');

assert.equal((block.match(/sourceUrl:/g) || []).length, 4,
  'each manufacturer product entry must have its own source URL');
assert.equal((block.match(/sourceLabel:/g) || []).length, 4,
  'each manufacturer product entry must identify the source document');
assert.equal((block.match(/productScope:/g) || []).length, 4,
  'each entry must identify whether it is a stack, system or fuel-cell module');
for (const source of [
  'https://www.toyota.com/content/dam/toyota/brochures/pdf/2023/mirai_ebrochure.pdf',
  'https://www.hyundai.news/newsroom/dam/eu/press-kits/20180709_nexo/hyundai_nexo_technical_specifications.pdf',
  'https://www.hyundai.com/worldwide/en/newsroom/detail/',
  'https://www.ballard.com/fcmove/'
]) assert.ok(block.includes(source), 'manufacturer source is missing: ' + source);

assert.ok(app.includes("t:'制造商公开规格'") &&
  app.includes("evidenceStatus:'source-verified'") &&
  app.includes('sourceUrl:g.sourceUrl'),
  'reference library entries must expose manufacturer verification status and source links');
assert.ok(app.includes('fc-reference-card') &&
  app.includes('g.productScope') &&
  app.includes('g.sourceUrl'),
  'engineering dashboard must render source-backed cards with product-boundary labels');
assert.ok(app.includes('已核验台架实测记录</small><b>未接入</b>') &&
  app.includes('外部数据库同步</small><b>未配置</b>'),
  'data status must not invent live bench records or external database synchronization');

for (const fabricated of ['42,847','18,210','21,936','2,701','2026-09-30 08:14','5.40']) {
  assert.ok(!app.includes(fabricated), 'fabricated global-data totals or unverified benchmark callout remains: ' + fabricated);
}
assert.ok(css.includes('.fc-reference-card{') &&
  css.includes('.fc-reference-metrics{') &&
  css.includes('.fc-reference-disclaimer{'),
  'manufacturer reference section must have its own structured workspace presentation');
assert.ok(!app.includes('source-pending') &&
  !app.includes("desc:'机型参数整理稿 · 来源未逐条核验"),
  'removed pending-source global placeholders must not remain in active UI code');

console.log('Global stack database provenance checks passed.');
