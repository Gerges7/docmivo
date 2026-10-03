# DocMivo Roadmap

## Live target after V5 — 43 browser tools
- Merge, Split, Compress, Rotate, Delete, Extract, Reorder
- PDF → JPG / PNG / WebP
- Images → PDF
- Watermark, Page Numbers, Bates Numbering, Headers & Footers
- Extract Text, OCR
- PDF Info, Remove Metadata, Edit Metadata
- Text → PDF
- Sign PDF, Add Text, Add Image
- Crop PDF, Resize PDF, Add Margins, Grayscale PDF, Flatten PDF
- Reverse Pages, Duplicate Pages, Mix PDFs
- N-up PDF, Booklet PDF, Remove Blank Pages
- Compare PDFs
- Inspect PDF Forms, Fill PDF Forms
- PDF → PowerPoint
- Word → PDF
- Excel → PDF
- HTML → PDF
- Markdown → PDF

## Next — high-fidelity conversion / WASM or backend
- PDF → Word with layout reconstruction
- PDF → Excel with table detection
- PowerPoint → PDF
- PDF/A conversion + validation
- Protect PDF (AES password encryption)
- Unlock PDF with user-supplied password
- Repair damaged PDF structures
- OCR → searchable PDF with text layer
- Scan to PDF with mobile camera workflow
- Extract embedded images
- Destructive redaction
- Advanced batch queue

## AI productivity
- Ask PDF / summarize PDF
- Translate PDF text
- Explain document sections
- Smart table extraction
- Automatic document classification
- PII detection and redaction suggestions
- OCR language auto-detection
- AI filename / title suggestions

## Platform / growth
- English UI + hreflang
- PWA offline mode for local tools
- Processing history stored locally
- Favorites / recent tools
- More SEO guide content
- GA4 event dashboards
- Search Console indexing tracker
- AdSense review + Google CMP


## V6 trust / SEO completed
- Expanded trust and legal pages
- Full Article schema fields + brand/OG assets
- Consent revocation link integration for Google CMP
- Expanded guide content and metadata

## Next high-value tools
- Protect / Unlock PDF
- Searchable OCR PDF
- PDF → Word / Excel high-fidelity pipelines
- PowerPoint → PDF
- PDF/A validation/conversion
- Repair PDF
- True destructive redaction
- Batch processing


## V7 shipped
- File-picker UX fixed across upload tools
- Word-to-PDF blank-output rendering path fixed and validated before download
- Homepage tool popularity ordering + common-tool badges
- Navbar/hero CTA cleanup


## V11 — DocMivo AI Beta (implemented)
- Ask PDF
- Summarize PDF
- Translate PDF content
- Extract tables to JSON / CSV
- AI OCR cleanup
- Python Vercel backend with `GEMINI_API_KEY` kept server-side
- Explicit AI privacy consent and beta noindex

## Next AI iterations
- Searchable OCR PDF with text layer
- AI redaction suggestions
- Research paper assistant
- Invoice / receipt extractor
- CV analyzer
- Contract key-clause extractor
- Per-user / per-IP durable rate limiting
- Large-file upload path without the 4.5 MB Function body bottleneck
