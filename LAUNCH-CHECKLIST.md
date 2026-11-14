# Launch checklist

Things that automated tests could not verify. Tick each before going public.

## Legal and licensing

- [ ] **AGPL-3.0 background removal.** `@imgly/background-removal` is AGPL-3.0. Decide: publish Krea's source under the AGPL, buy IMG.LY's commercial license, or replace the engine (e.g. an Apache/MIT-licensed model on ONNX Runtime). Do not launch commercially without deciding.
- [ ] `heic-to` (libheif) is LGPL-3.0, served as a separate lazily loaded file. Confirm you are comfortable with its terms.
- [ ] Review the credits on `/about` against the final dependency list.

## PH Take-Home Pay rates (`src/config/ph-contributions.ts`)

These match published 2026 schedules from several payroll guides, but no agency page was read directly. Check each against the agency's own circular, then set `VERIFICATION_STATUS = "confirmed"` and update `LAST_UPDATED`:

- [ ] **SSS**: 15% total, employee 5% of the Monthly Salary Credit; MSC from ₱5,000 to ₱35,000 in ₱500 steps (bracket = salary ± ₱250); EC ₱10 below MSC ₱15,000, ₱30 from ₱15,000. Confirm no 2026 change.
- [ ] **PhilHealth**: 5% premium split equally; income floor ₱10,000, ceiling ₱100,000. Confirm still in force for 2026.
- [ ] **Pag-IBIG**: employee 2% (1% at ₱1,500 or less), computed on at most ₱10,000 a month (₱200 max).
- [ ] **BIR**: RR 11-2018 Annex E monthly and semi-monthly tables (₱20,833 / ₱10,417 thresholds). Especially check the semi-monthly fixed amounts (₱937.50, ₱4,270.70, ₱16,770.70, ₱91,770.70).
- [ ] Decide whether contributions should include regular allowances (currently basic salary only; stated on the page).

## Real devices

- [ ] Real iPhone (Safari): drop a HEIC photo, run Background Remover, ID Photo Maker, Compress PDF, Sign PDF with a finger, and "Save as PDF" from the resume and invoice editors. Tests used Playwright's WebKit on Windows, which is not real Safari.
- [ ] Real mid-range Android phone (Chrome): same flows, plus a 12 MP camera photo and a 30+ page PDF. Note any out-of-memory crash.
- [ ] Install as an app (Add to Home Screen) on both, then use it in airplane mode.
- [ ] "Make offline-ready" on a phone over mobile data: check the 75 MB download completes and the success message appears.
- [ ] Messenger and Facebook in-app browsers: confirm file picking works, and see what "Save as PDF" does (print may be blocked there).

## Real content

- [ ] Real portraits (different skin tones, hair, glasses, busy backgrounds) through Background Remover and ID Photo Maker. Check edges and that faces are not cropped badly.
- [ ] Print a 2x2 sheet at a photo shop at 100% scale and measure it.
- [ ] Real scanned documents (phone photos of forms, receipts) through OCR in English and Filipino.
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
