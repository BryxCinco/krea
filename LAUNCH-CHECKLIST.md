# Launch checklist

Things that automated tests could not verify. Tick each before going public.

## Legal and licensing

- [ ] **AGPL-3.0 background removal.** `@imgly/background-removal` is AGPL-3.0. Decide: publish Krea's source under the AGPL, buy IMG.LY's commercial license, or replace the engine (e.g. an Apache/MIT-licensed model on ONNX Runtime). Do not launch commercially without deciding.
- [ ] `heic-to` (libheif) is LGPL-3.0, served as a separate lazily loaded file. Confirm you are comfortable with its terms.
- [ ] Review the credits on `/about` against the final dependency list.
- [ ] **Mediabunny (MPL-2.0)** powers the Video tool. It is used unmodified; MPL needs its licence notice kept and its source available (it is on npm and GitHub). If you ever patch its files, publish the changed files.
- [ ] **EFF Large Wordlist (CC BY 3.0 US)** is attributed on `/about` with a licence link. Keep that paragraph.
- [ ] **ZXing-C++ (Apache-2.0)** ships inside `zxing_reader.wasm` (barcode scanning); SecLists (MIT) supplies the common-password list. Both are credited on `/about`.
- [ ] **ffmpeg.wasm was deliberately not used**: `@ffmpeg/core` is GPL-2.0-or-later. Do not add it without revisiting Krea's licence.
- [ ] **Video codecs**: H.264 and AAC are encoded by the browser's built-in encoder, not by code Krea ships. Confirm you are comfortable with that for a commercial launch.

## PH Pay Calculators rules (`src/config/ph-labor.ts`)

Copied from a PDF mirror of DOLE's 2023 *Handbook on Workers' Statutory Monetary Benefits*, not from dole.gov.ph. DOLE Labor Advisory No. 21, s. 2026 (13th month) was seen only in news reports. Check each against DOLE's own pages, then set `VERIFICATION_STATUS = "confirmed"` and update `LAST_UPDATED`:

- [ ] Day multipliers: rest day 130%, special day 130%, special day on rest day 150%, double special day 150% (195% on rest day), regular holiday 200% (260% on rest day), double holiday 300% (390% on rest day).
- [ ] Overtime: +25% of the hourly rate on ordinary days, +30% of that day's hourly rate otherwise. Night differential 10% (10 p.m. to 6 a.m.).
- [ ] 13th month: one-twelfth of basic salary earned in the year, paid on or before December 24, and the list of excluded pay items.
- [ ] Daily-rate factors 365 / 313 / 261, and the small-establishment exemptions listed in the assumptions.

## PH Take-Home Pay rates (`src/config/ph-contributions.ts`)

These match published 2026 schedules from several payroll guides, but no agency page was read directly. Check each against the agency's own circular, then set `VERIFICATION_STATUS = "confirmed"` and update `LAST_UPDATED`:

- [ ] **SSS**: 15% total, employee 5% of the Monthly Salary Credit; MSC from ₱5,000 to ₱35,000 in ₱500 steps (bracket = salary ± ₱250); EC ₱10 below MSC ₱15,000, ₱30 from ₱15,000. Confirm no 2026 change.
- [ ] **PhilHealth**: 5% premium split equally; income floor ₱10,000, ceiling ₱100,000. Confirm still in force for 2026.
- [ ] **Pag-IBIG**: employee 2% (1% at ₱1,500 or less), computed on at most ₱10,000 a month (₱200 max).
- [ ] **BIR**: RR 11-2018 Annex E monthly and semi-monthly tables (₱20,833 / ₱10,417 thresholds). Especially check the semi-monthly fixed amounts (₱937.50, ₱4,270.70, ₱16,770.70, ₱91,770.70).
- [ ] Decide whether contributions should include regular allowances (currently basic salary only; stated on the page).

## Real devices

- [ ] Real iPhone (Safari): drop a HEIC photo, run Background Remover, ID Photo Maker, Compress PDF, Sign PDF with a finger, "Save as PDF" from the resume editor, and Download PDF from the invoice editor. Tests used Playwright's WebKit on Windows, which is not real Safari.
- [ ] Real mid-range Android phone (Chrome): same flows, plus a 12 MP camera photo and a 30+ page PDF. Note any out-of-memory crash.
- [ ] Install as an app (Add to Home Screen) on both, then use it in airplane mode.
- [ ] "Make offline-ready" on a phone over mobile data: check the 80 MB download completes and the success message appears.
- [ ] Messenger and Facebook in-app browsers: confirm file picking works, and see what "Save as PDF" does (print may be blocked there).
- [ ] **Document Scanner** on a real phone: "Take a photo" should open the rear camera (it uses the file input's `capture` attribute, not a live camera view). Drag corners with a finger on receipts, forms and IDs on different backgrounds; save a 10-page PDF and watch for memory crashes.
- [ ] **Barcode & QR Scanner** live camera on a real phone, in good and dim light, with printed and on-screen codes.
- [ ] **Video Compressor** on a real iPhone (Safari 16.4+; check H.264 and AAC encode) and a mid-range Android: a 1-2 minute 1080p or 4K camera video at 720p, then a GIF. Note time, heat and any crash. Firefox for Android has no WebCodecs encoder: confirm the message appears.
- [ ] **Blur & Redact** on a phone with a tall portrait photo: boxes land where drawn.
- [ ] **Signature Maker**: draw with a finger and a stylus; saved signatures survive a reload, and "Delete all" removes them.

## Real content

- [ ] Real portraits (different skin tones, hair, glasses, busy backgrounds) through Background Remover and ID Photo Maker. Check edges and that faces are not cropped badly.
- [ ] Print a 2x2 sheet at a photo shop at 100% scale and measure it.
- [ ] Real scanned documents (phone photos of forms, receipts) through OCR in English and Filipino, and the same photos through Document Scanner (B&W) first.
- [ ] Real payslips through PH Pay Calculators: compare a known 13th month, holiday and overtime pay with what HR actually paid.
- [ ] Real loan offers (bank, Pag-IBIG, lending app) through the Loan tab: compare the monthly payment with the lender's disclosure statement.
- [ ] Real phone videos (portrait, HDR, variable frame rate, 4K) through the Video Compressor; check audio sync in the result.
- [ ] **Video Format Converter**: an iPhone MOV (H.264 and HEVC) to MP4 with Original quality (should copy, not re-encode), and an MP4 to WebM. Confirm the codec note matches the result.
- [ ] **Redact PDF** on a real document with a TIN or account number: after download, select all text and search in Acrobat or Chrome; nothing under the boxes may be found, and the marked pages must be images.
- [ ] **PDF Form Filler** on a real BIR, SSS or Pag-IBIG fillable form: values show in Acrobat, Chrome and Preview, with and without Lock answers.
- [ ] **CSV to PDF** with an Excel CSV saved on Windows (semicolons, Windows-1252 accents, peso amounts) and a Google Sheets export.
- [ ] **ZIP to PDF** with a phone's exported photo folder (HEIC is skipped, JPG/PNG kept) and a ZIP made on a Mac (__MACOSX ignored).
- [ ] **Final Pay Calculator**: check three real cases with HR (resigned mid-year, redundancy after several years, under one year) and confirm FINAL_PAY rules in `src/config/ph-labor.ts` against DOLE LA 06-2020; then set VERIFICATION_STATUS.
- [ ] **Audio Trimmer** on an iPhone voice memo (M4A), an Android recording and an MP3: Same as original must not re-encode; FLAC/ALAC in Safari and Firefox must show the cannot-decode message, not a broken file.
- [ ] **Loan & Amortization Calculator**: compare a real bank or Pag-IBIG disclosure statement (diminishing) and a lending app offer (add-on); the monthly payment should match within rounding, apart from fees. Check that the CSV opens in Excel and Google Sheets.
- [ ] **EXIF & Metadata Remover** with an iPhone HEIC photo that has location on (the report must show the original's GPS and camera) and a rotated JPG portrait (Keep photo upright on: upright and byte-identical pixels; off: sideways).
- [ ] **Invoice Generator Download PDF** with a real logo (PNG, JPG and WebP) and a 30-item invoice in PHP, USD and JPY: opens in Adobe Reader, Chrome and a phone viewer, text is selectable, totals match the preview, and an old saved draft (before currencies) still opens in PHP.
- [ ] **PDF to Word & Text** on a real contract, a two-column paper and a scanned PDF: the .docx opens in Word, Google Docs and WPS, headings and paragraphs look right, and the scan points to OCR.
- [ ] **Compare PDFs** with two versions of a real lease or contract (one re-wrapped): only real wording changes are listed, with the right pages.
- [ ] **Quotation & Receipt Maker**: a quotation and a receipt in PHP and USD with a logo, Download PDF and Print; switching Quotation to Receipt keeps the items; the Invoice Generator's saved data is untouched.
- [ ] **Freelancer Tax Calculator**: three real cases with an accountant (pure 8%, OSD, mixed income with 2307s), then confirm `src/config/ph-income-tax.ts` against BIR issuances and set VERIFICATION_STATUS.
- [ ] **Image Annotator** on a phone and a desktop: paste a screenshot, place every mark type, save PNG and JPG at full resolution, and check marks land where tapped.
- [ ] **Excel to PDF** with real workbooks from Excel, Google Sheets and WPS (dates, peso amounts, percentages, hidden sheets, a 2,000-row sheet).
- [ ] **HEIC Converter** with real iPhone photos on Chrome or Edge (heic-to) and Safari (native): PNG and JPG, a batch of 20, and Live Photo or burst HEICs.
- [ ] **SVG Converter** with SVGs exported from Figma, Illustrator, Inkscape and Canva (text, gradients, embedded images), at 4x and at 4,000 px wide.
- [ ] **Image to SVG** on a real logo (2-6 colours), a scanned signature (black and white) and a photo (should warn or be large); open the SVGs in Figma, Inkscape and Illustrator.
- [ ] **Conversion pages** (/convert/...): submit the sitemap in Search Console and check that each page is indexed under its own canonical URL.
- [ ] **Translation models release**: create the GitHub Release `translate-models-v1` and upload the 12 files listed in `TRANSLATE_FILES` (copy-assets.mjs). Without it the deployed build warns and the translator says the models are unavailable.
- [ ] **Tagalog-English Translator** on a mid-range Android phone and an iPhone: first download over mobile data, then offline; check memory with both directions loaded, and review sample translations with a native speaker.
- [ ] **Signature Extractor** with real phone photos (lamp light, shadow across the page, blue ballpen, lined paper); then place the saved signature in Sign PDF.
- [ ] **Extract Frames**: every 1 s over a 1-minute 1080p clip as JPG (ZIP of about 60 images), and three picked moments as PNG. Check the frames match the player at those times.
- [ ] Real PDFs from government portals and banks through Merge, Compress, Sign and Protect/Unlock; open the outputs in Adobe Reader, Chrome and a phone viewer.
- [ ] Open a protected PDF made by Krea in Adobe Reader and confirm the password and print/copy restrictions behave.

## Domain and SEO

- [ ] Set `NEXT_PUBLIC_SITE_URL` to the final domain in Vercel and redeploy.
- [ ] Check `https://<domain>/sitemap.xml` and `/robots.txt` show the real domain.
- [ ] Submit the sitemap in Google Search Console; run a few tool pages through the Rich Results Test.
- [ ] Share a tool link in Messenger or Facebook and check the preview image.
- [ ] Unknown `/tools/<slug>` URLs return HTTP 200 with `noindex` (Next.js partial prerendering streams before the 404 is known). Other unknown URLs return 404. Accept this, or add a small `proxy.ts` that 404s unknown tool slugs.

## Privacy page

- [ ] Read `/privacy` end to end and confirm every statement is still true for the deployed site (hosting logs, no analytics).
- [ ] If you add analytics later, update `/privacy` first and keep it free of file names and content.

## Final pass

- [ ] Run Lighthouse on the deployed URL (scores were measured on localhost).
- [ ] Test Wipe session, theme switching and the Command Palette on the live site.
