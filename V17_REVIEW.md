# DocMivo V17 — Review checklist (NOT deployed)

## Scope included

- QR Code Suite **phase 1**: one tool page with URL/text/Wi-Fi/vCard payloads, PNG/SVG export, correction level and contrast guard. No tracking redirect or QR analytics service.
- Image Tools **phase 1**: image resize (aspect-ratio lock) and image compress/re-encode (JPEG/PNG/WebP, byte-size comparison). Browser processing only, with input size / pixel limits.
- Existing PDF engine: reject wrong file types dropped into the browser (native `accept` does not filter drag & drop); show honest output size feedback after `compress-pdf` including warning that it rasterizes searchable text.
- Generic how-to copy replaced for merge/compress/Word; no invented test metrics or fabricated success claims.
- Homepage integration and two original guides.
- New pages intentionally have `noindex,follow`, no AdSense scripts, and are absent from sitemap until real-device QA passes.

## Why the AdSense issue is NOT automatically solved

A policy rejection for low-value content cannot be attributed to one code defect without reviewing the actual published property and Search Console. V17 is a quality improvement, not a guarantee of AdSense approval. Do not request a new AdSense review solely after merging this patch.

## Automatic checks

```shell
node --test tests/v17-core.test.cjs
python -m unittest discover -s tests -p "test_v17_site.py"
node --check assets/js/tool-engine.v14.js
node --check assets/js/v17-qr.js
node --check assets/js/v17-image.js
```

The tests cover URL scheme rejection, escaping of Wi-Fi/vCard data, input length bounds, QR contrast, image dimension math, homepage links, and noindex/sitemap guardrails. Automated tests do not validate actual PDF conversion quality, camera QR scanning, canvas output on different devices, or server availability.

## Manual browser QA — required BEFORE merge

1. QR: generate a URL QR, scan with Android and iPhone; export PNG 512/1024 and SVG; check result content and the margin.
2. Wi-Fi: generate an open network QR and WPA network QR, including `;`, `:` and `\\` in network/password; test it against a dedicated guest network, not production Wi-Fi.
3. vCard: scan name/phone/email and a name containing punctuation; confirm no unrequested fields added.
4. QR: verify blank/invalid URLs and high-contrast errors; verify all download buttons remain disabled after input changes.
5. Images: process JPEG, PNG with transparency, WebP, malformed file, 20MB+ file, and image larger than 32M pixels; ensure clear errors and preserved originals.
6. Images: resize 4000x3000 to 1200x900, verify aspect lock, compare output dimensions and metadata; JPEG should have white background when source is transparent.
7. Image compression: confirm actual output size display, including cases where it grows; verify WebP support fallback errors.
8. Regression: merge PDF, compress PDF, Word to PDF on both local fallback and configured server (if available). Confirm correct file-type validation for both chooser and drag & drop, including mixed-validity batches.
9. Accessibility: keyboard-only form flow, focus and status announcements, mobile widths 320px/375px, dark/light system settings.
10. Indexing: before release, confirm new pages are noindex, absent from sitemap, and do not contain ad scripts; after manual QA and content review, *separately* decide which pages merit indexing.
11. Deployment: check Vercel preview only, never production or `main`, and validate server-side AI endpoints weren't changed.

## Future incremental issues (not implemented in this PR)

- Browser-safe QR logo insertion with scan verification and SVG export handling.
- Crop, watermark, background removal and batch image resizing.
- Deeper end-to-end Playwright tests with fixtures and screenshot/performance baselines.
- Better PDF compression that preserves searchable text where possible.
- Analytics-driven prioritization and Google Search Console audit for indexability, canonicalization, and actual impressions.

## Risks and limitations

- QR generation uses the pinned third-party CDN library `qrcode@1.5.4`, requires an initial online download, and runs entirely in the browser. For stronger supply-chain and offline assurances, vendor or bundle the MIT dependency following a licensing/security review.
- Canvas processing can drop EXIF and other image metadata; don't promise perfect metadata removal, and keep the source.
- The `compress-pdf` pipeline rasterizes pages. This patch does not replace that algorithm; it makes the limitation/result size explicit. This matters for signed/searchable PDFs.
- Tests were run on a V17 overlay and integration fixture. Production deployment and browser-device QA must still be performed by a reviewer with access to the repository/preview.
