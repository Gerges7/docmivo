import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  strictSplitRanges, parsePageOrder, hardenEngine,
  OLD_SPLIT, NEW_SPLIT, OLD_ORDER, NEW_ORDER
} from '../scripts/pdf-page-hardening.mjs';

test('Split PDF: groups 1;2-17 kept separate and complete', () => {
  assert.deepEqual(strictSplitRanges('1;2-17'), ['1','2-17']);
  assert.deepEqual(strictSplitRanges(' 1-2 ; 4,5 ; 16-17 '), ['1-2','4,5','16-17']);
});
test('Split PDF: rejects double delimiters, trailing separators and all-empty', () => {
  for (const bad of ['1-2;;4-5', '1-2;', ';1-2', ';', ';;', '1-2;  ;4']) {
    assert.throws(() => strictSplitRanges(bad), /نطاق/);
  }
});
test('Split PDF: rejects too many output groups', () => {
  assert.throws(() => strictSplitRanges(Array(501).fill('1').join(';')), /كبير/);
});
test('Reorder PDF: exact permutation succeeds with 0-based page IDs', () => {
  assert.deepEqual(parsePageOrder('3, 1,2',3), [2,0,1]);
  assert.deepEqual(parsePageOrder('1',1),[0]);
});
test('Reorder PDF: duplicates rejected even when unique count is correct', () => {
  for (const bad of ['1,1,2,3', '1,1,2', '2,2,1']) {
    assert.throws(() => parsePageOrder(bad,3), /مرة واحدة|مكررة/);
  }
});
test('Reorder PDF: missing, out-of-range, decimals, and range notation rejected', () => {
  for (const bad of ['1,2','1,2,4','1,0,3','1,2,2.5','1-3','1,a,3','1,,3','']) {
    assert.throws(() => parsePageOrder(bad,3));
  }
});
test('Build patch modifies both call sites and injects actual executable helpers', () => {
  const baseline = `function parsePages(expr,total){return [];}\nconst split=${JSON.stringify('x')}; ${OLD_SPLIT}\n const src=await loadPdf(file),${OLD_ORDER}throw new Error('missing');`;
  const result = hardenEngine(baseline);
  assert.ok(result.includes(NEW_SPLIT));
  assert.ok(result.includes(NEW_ORDER));
  assert.equal(result.includes(OLD_SPLIT),false);
  const helperText=result.slice(0, result.indexOf('function parsePages('));
  const pure=vm.runInNewContext(helperText+'\n({strictSplitRanges,parsePageOrder})');
  assert.deepEqual([...pure.strictSplitRanges('1;2-17')],['1','2-17']);
  assert.deepEqual([...pure.parsePageOrder('3,1,2',3)],[2,0,1]);
  assert.throws(() => pure.parsePageOrder('1,1,2,3',3));
});
test('Build patch fails closed if source changed rather than silently skipping', () => {
  assert.throws(() => hardenEngine('function parsePages(expr,total){}'), /cannot safely patch/);
});
