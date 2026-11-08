import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanupHome,cleanupSitemap,pausedPage,pausedTools} from '../scripts/cloudflare-only-cleanup.mjs';

test('pauses 20 known unavailable server and AI tools',()=>{
  assert.equal(pausedTools.length,20);
  assert.equal(new Set(pausedTools).size,pausedTools.length);
});
test('homepage removes only paused cards and AI section',()=>{
  const html=`<html><body><a href="#ai-tools">AI</a><section id="tools"><a class="tool-card" href="/tools/merge-pdf">Merge</a><a class="tool-card" data-requires-server="1" href="/tools/protect-pdf">Protect</a><a class="tool-card" href="/tools/word-to-pdf">Word</a></section><section class="section" id="v17-new-tools">QR</section><section class="section ai-section" id="ai-tools"><a href="/tools/ask-pdf-ai">Ask</a></section><div>43+5</div></body></html>`;
  const out=cleanupHome(html);
  assert.match(out,/tools\/merge-pdf/);
  assert.match(out,/id="v17-new-tools"/);
  assert.doesNotMatch(out,/tools\/protect-pdf|tools\/word-to-pdf|tools\/ask-pdf-ai|id="ai-tools"|#ai-tools|43\+5/);
});
test('sitemap removes paused tools but keeps local tools',()=>{
 const xml='<urlset><url><loc>https://getdocmivo.com/tools/protect-pdf</loc></url><url><loc>https://getdocmivo.com/tools/merge-pdf</loc></url><url><loc>https://getdocmivo.com/</loc></url></urlset>';
 const out=cleanupSitemap(xml);assert.doesNotMatch(out,/protect-pdf/);assert.match(out,/merge-pdf/);assert.match(out,/getdocmivo.com\//);
});
test('paused pages do not accept uploads and are not indexed',()=>{
 const html=pausedPage('ask-pdf-ai');assert.match(html,/noindex,follow/);assert.doesNotMatch(html,/type="file"|<form/);assert.match(html,/\/tools\/merge-pdf/);
});
test('unsupported slug cannot be paused by mistake',()=>assert.throws(()=>pausedPage('merge-pdf')));

test('remove AI nav aliases including /#ai-tools',()=>{
 const h='<a href="/#ai-tools">AI</a><a href="#ai-tools">AI 2</a><section id="v17-new-tools">tools</section><section id="ai-tools">AI stuff</section>';
 assert.doesNotMatch(cleanupHome(h),/#ai-tools/);
});
