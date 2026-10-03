# DocMivo

Production static site for https://getdocmivo.com.

## V6 status
- 43 browser-based PDF tools
- 16 expanded Arabic guides
- GA4: G-DH1KMJYRZV
- AdSense publisher: ca-pub-1551519098591089
- Root ads.txt enabled
- Google CMP privacy settings/revocation link integration
- Organization / WebApplication / FAQ / Breadcrumb / Article structured data
- OG image + brand logo assets
- Expanded About, Contact, Privacy, Terms and Cookies pages

## Important product constraints
Some browser conversions are approximate. Always review generated files before professional, legal, financial, archival or print use.


## V7 UX + conversion fixes
- Fixed the visible Choose Files button on every upload tool.
- Reworked browser HTML/DOCX -> PDF rendering to avoid blank PDFs and validate the generated PDF before download.
- Replaced weak Start now / Try Merge CTAs with Search and Compress actions.
- Reordered homepage tools by common prominence across major PDF suites; future GA4 usage data should refine the order.

## V8 hotfix
- Quick-search positioning now scrolls the search field directly below the sticky navbar and focuses it.
- File chooser controls use native `<label for="fileInput">` activation plus a direct JS fallback instead of relying on event bubbling.
- Word → PDF uses a new two-stage renderer: visual DOCX rendering first, then a text/paragraph fallback if the visual canvas is blank, followed by a first-page blank-output check before download.


## V9 hotfix
- Quick Search is now a modal instead of scroll/hash navigation.
- Word to PDF now parses DOCX XML directly and renders text/paragraphs to PDF canvases; no html2canvas/Mammoth rendering path is used for this tool.
