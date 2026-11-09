/**
 * DocMivo V18.2: strict handling of Split and Reorder PDF page selection.
 * Runs last in the Cloudflare build, modifies only the generated browser engine,
 * and fails loudly if the source layout changes unexpectedly.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function strictSplitRanges(expression) {
  const tokens = String(expression ?? '').split(';').map(x => x.trim());
  if (tokens.some(x => !x)) {
    throw new Error('نطاق التقسيم غير صحيح: لا تترك جزءًا فارغًا بين الفواصل المنقوطة (;).');
  }
  if (tokens.length > 500) {
    throw new Error('عدد مجموعات التقسيم كبير جدًا. قسّم المستند على دفعات.');
  }
  return tokens;
}

export function parsePageOrder(expression, total) {
  if (!Number.isSafeInteger(total) || total < 1) {
    throw new Error('عدد الصفحات غير صالح.');
  }
  const source = String(expression ?? '').trim();
  if (!/^\d+(?:\s*,\s*\d+)*$/.test(source)) {
    throw new Error('اكتب ترتيب الصفحات بأرقام مفصولة بفواصل، مثل 3,1,2.');
  }
  const pages = source.split(',').map(x => Number(x.trim()));
  if (pages.length !== total) {
    throw new Error('يجب إدخال كل صفحة مرة واحدة بالضبط.');
  }
  if (pages.some(x => !Number.isSafeInteger(x) || x < 1 || x > total)) {
    throw new Error('ترتيب الصفحات يحتوي رقمًا خارج مدى الملف.');
  }
  if (new Set(pages).size !== total) {
    throw new Error('ترتيب الصفحات يحتوي أرقامًا مكررة.');
  }
  return pages.map(x => x - 1);
}

function replaceExactOnce(source, oldText, newText, label) {
  const matches = source.split(oldText).length - 1;
  if (matches !== 1) throw new Error(`DocMivo V18.2 cannot safely patch ${label}: ${matches} matches`);
  return source.replace(oldText, newText);
}

export const OLD_SPLIT = "ranges=expr?expr.split(';').map(x=>x.trim()).filter(Boolean):Array.from({length:total},(_,i)=>String(i+1)),zip=new JSZip();";
export const NEW_SPLIT = "ranges=expr?strictSplitRanges(expr):Array.from({length:total},(_,i)=>String(i+1)),zip=new JSZip();";
export const OLD_ORDER = "idx=parsePages($('#pageOrder').value,src.getPageCount());if(idx.length!==src.getPageCount())";
export const NEW_ORDER = "idx=parsePageOrder($('#pageOrder').value,src.getPageCount());if(idx.length!==src.getPageCount())";

export function hardenEngine(source) {
  let s = replaceExactOnce(source, OLD_SPLIT, NEW_SPLIT, 'Split PDF empty ranges');
  s = replaceExactOnce(s, OLD_ORDER, NEW_ORDER, 'Reorder PDF duplicate pages');
  const anchor = 'function parsePages(expr,total){';
  if (!s.includes(anchor)) throw new Error('DocMivo V18.2 cannot find parsePages anchor');
  if (s.includes('function strictSplitRanges(') || s.includes('function parsePageOrder(')) {
    throw new Error('DocMivo V18.2 helpers already inserted; check build order');
  }
  const helpers = `${strictSplitRanges.toString()}\n${parsePageOrder.toString()}\n`;
  return s.replace(anchor, helpers + anchor);
}

export function hardenPublicEngine(dist) {
  const file = path.join(dist, 'assets/js/tool-engine.v14.js');
  if (!fs.existsSync(file)) throw new Error('DocMivo V18.2: build output missing; run base build first');
  const code = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, hardenEngine(code));
  console.log('DocMivo V18.2: Split rejects empty segments; Reorder rejects duplicate/missing page IDs.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  hardenPublicEngine(path.resolve(scriptDir, '../dist'));
}
