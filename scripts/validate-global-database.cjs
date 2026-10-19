'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const referenceData = fs.readFileSync('assets/js/reference-data.js', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const css = fs.readFileSync('assets/css/product-system.css', 'utf8');

const blockStart = referenceData.indexOf('const GLOBAL_DB = [');
const blockEnd = referenceData.indexOf('\n];', blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'global stack dataset must exist');
const block = referenceData.slice(blockStart, blockEnd);
const records = block.match(/^\s*\{\s*n:/gm) || [];
assert.equal(records.length, 12, 'the current global stack dataset should retain all 12 entries');

assert.ok(referenceData.includes('lack per-field public source records') ||
  referenceData.includes('per-field public source records'),
  'reference-data file must disclose missing field-level public source records');
assert.ok(app.includes("evidenceStatus:'source-pending'") &&
  app.includes("evidenceLabel:'来源待核验'"),
  'all mapped global database entries must carry an explicit pending-source status');
assert.ok(app.includes("desc:'机型参数整理稿 · 来源未逐条核验"),
  'global database category description must not claim verified measured comparison');
assert.ok(app.includes("it.evidenceStatus === 'source-pending'") &&
  app.includes('source-provenance-warning'),
  'library cards must visibly show the pending-source warning');
assert.ok(css.includes('.source-provenance-warning{'),
  'the provenance warning must have a visible style');
assert.ok(!app.includes("desc:'国际主流电堆实测参数对标'"),
  'unverified records must not be described as measured benchmark data');

console.log('Global stack database provenance checks passed.');
