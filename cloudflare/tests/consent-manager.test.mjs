import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('consent and ad runtime scripts parse and keep third-party tags behind the feature and consent gates',()=>{
  const consent=read('assets/js/consent-manager.js');
  const ads=read('assets/js/monetization.js');
  const scope=read('cloudflare/scripts/adsense-page-scope.mjs');
  assert.doesNotThrow(()=>new vm.Script(consent));
  assert.doesNotThrow(()=>new vm.Script(ads));
  assert.match(consent,/docmivo:consent:v1/);
  assert.match(consent,/globalPrivacyControl/);
  assert.match(consent,/doNotTrack/);
  assert.match(consent,/shouldPrompt/);
  assert.match(consent,/Privacy choices/);
  assert.match(consent,/data-consent-reject/);
  assert.match(ads,/data-ads-enabled/);
  assert.match(ads,/consentGranted/);
  assert.match(ads,/api\/monetization\/config/);
  assert.match(ads,/hasTcfConsent/);
  assert.match(ads,/data-ads-requires-tcf/);
  assert.match(ads,/IntersectionObserver/);
  assert.match(ads,/rootMargin:'300px 0px'/);
  assert.match(scope,/analytics_storage:"denied"/);
  assert.match(scope,/ad_storage:"denied"/);
  assert.match(scope,/send_page_view:false/);
});

test('private monetization dashboard JavaScript parses and does not store the admin token persistently',()=>{
  const html=read('cloudflare/cloudflare-overrides/admin/monetization/index.html');
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
  assert.match(html,/id="admin-token" type="password"/);
  assert.match(html,/api\/monetization\/admin\/config/);
  assert.match(html,/api\/monetization\/reports/);
  assert.doesNotMatch(html,/localStorage\.setItem\([^)]*admin-token/i);
  const script=html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(script,'Admin script is missing');
  assert.doesNotThrow(()=>new vm.Script(script[1]));
});
