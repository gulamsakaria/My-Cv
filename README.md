# Evidence portfolio – Gulam Sakaria

A fast, static, mobile-first evidence portfolio for the **National Volunteer Award 2026 (VSO Bangladesh)**.
Plain HTML, CSS and JavaScript. No build step, no login, no tracking. Everything on the page is drawn from **one file: `site/content/site.json`**.

**English** · [বাংলা ↓](#বাংলা)

```
site/                  <- the ONLY folder you publish
  index.html  css/  js/
  content/site.json          all text, numbers, links, captions
  content/site.schema.json   schema (VS Code autocompletes + checks site.json)
  assets/photos/             your photos
  assets/posters/            cartoon thumbnails, post screenshots, flyers
  assets/cartoons/           optional local cartoon clips (.mp4 / .webm)
  assets/docs/               permission letter, organisation letters, certificates
scripts/               blur_faces.py · optimize_images.py · validate.py · set_site_url.py
examples/              site.examples.json (example entries; NOT published)
originals/             created by the scripts; git-ignored; NEVER publish
```

## Rules the site follows
* Nothing is invented. If something is missing in `site.json`, **nothing is shown** (add `?dev=1` to the address to see dashed "Add photo" boxes and a list of problems).
* Only you are named. No one else's name, phone, e-mail or address. References are **not** published.
* `<meta name="robots" content="noindex">` plus `X-Robots-Tag` headers: link-only access, not for search engines.

## ⚠️ Safeguarding – read before adding any photo
1. **No identifiable faces of anyone under 18** (school students, children). Blur first:
   ```bash
   pip install "opencv-python-headless<5" numpy pillow
   python3 scripts/blur_faces.py originals/incoming -o originals/blurred
   ```
   Automatic detection **misses faces** (small, turned away, shadowed, covered). **Open every output and look at it.** If one is missed, add `--region x,y,w,h` or `--sensitive`, or don't use the photo. Use `--preview` to see what it found.
2. Every image in `site.json` must say `"people_under_18": true/false`. If `true`, it must also say `"faces_blurred": true` – otherwise **the site refuses to show it**.
3. **Documents must be redacted** (names, phone numbers, addresses, signatures of other people) *before* upload, then set `"redacted": true`; otherwise the document stays hidden. A PDF must be blacked-out and flattened in the file itself.
4. Captions describe the **activity**, not individuals. Outcomes stay anonymous.
5. Keep originals **outside `site/`** (the scripts move them to `originals/`, which git ignores). Photos carry GPS location in their metadata; `optimize_images.py` strips it.

## Add your work
1. Put raw photos in `originals/incoming/`. Blur faces (above), check by eye.
2. Copy the checked images to `site/assets/photos/` (thumbnails/posters → `assets/posters/`, letters → `assets/docs/`).
3. Convert them (WebP, max 1600 px, 640 px thumbnail, metadata removed, originals moved out):
   ```bash
   python3 scripts/optimize_images.py
   ```
   It prints a JSON snippet to paste into `site.json`.
4. Edit `site/content/site.json`. Copy entries from `examples/site.examples.json`; every field is described in `site.schema.json`.
5. Check, then look at it locally:
   ```bash
   python3 scripts/validate.py
   cd site && python3 -m http.server 8000      # open http://localhost:8000/?dev=1
   ```
   (Opening `index.html` by double-click does not work; the browser blocks loading the JSON from a file.)

Where each thing goes in `site.json`:

| You want to add | Put it in | Needs |
|---|---|---|
| Cartoon (thumbnail + Facebook link, optional clip) | `cartoons.items[]` | `poster`, `facebook_url`, optional `video` |
| Photo | `gallery[]` | `src`, `alt`, `caption`, `people_under_18` (+ `faces_blurred`) |
| Facebook / LinkedIn post | `posts[]` | `url`, `title`, `views`, `reactions`, `comments` |
| Document | `documents[]` | `title`, `file`, `redacted: true` |
| Photo for an activity | `activities[n].photo` | like a gallery photo |
| School permission letter link | `school.permission_document` | the `id` of the document |
| Your portrait | `profile.portrait` | like a gallery photo |
| Link to the VDF Facebook page | `cartoons.page_url` | a URL |
| Number of students who answered the survey | `school.survey.respondents` | a number |
| Bangla text | any field ending `_bn` | optional |

Minimal photo entry:
```json
{ "src": "assets/photos/agroecology-01.webp", "thumb": "assets/photos/agroecology-01.thumb.webp",
  "alt": "Participants listening to a talk on AI in agriculture",
  "caption": "Agroecology workshop, Fulbaria", "caption_bn": "বাংলা ক্যাপশন",
  "people_under_18": false }
```
Minimal post entry:
```json
{ "platform": "Facebook", "source": "VDF Mymensingh", "title": "What the post is about",
  "url": "https://www.facebook.com/...", "views": 0, "reactions": 0, "comments": 0 }
```
(Replace the `0`s with the real numbers; zero values are not displayed.)

Keep the stats in `stats.items` consistent with your evidence: the validator prints the totals of the posts you list so you can compare them with the headline numbers.

## Publish (the `site` folder is the whole website)
* **Netlify (easiest):** app.netlify.com → *Add new site* → *Deploy manually* → drag the **`site`** folder in. `_headers` adds the no-index header.
* **Vercel:** `cd site && npx vercel --prod` (or import the repo and set *Root Directory* = `site`).
* **GitHub Pages:** push to `main`, then *Settings → Pages → Source: GitHub Actions*. `.github/workflows/pages.yml` publishes `site/`. (If the repository is public, so is everything in it – keep `originals/` out; it is git-ignored.)
* **Your own subdomain:** upload the *contents* of `site/` to the host's web folder (or point a `CNAME` such as `portfolio.yourdomain` to Netlify/Vercel/Pages and add the domain there).

After you know the public link, once:
```bash
python3 scripts/set_site_url.py https://your-address.example/
```
This adds the canonical link and the WhatsApp/Facebook/LinkedIn preview image (`assets/og.png`). Upload again.

## Scripts
| Script | Purpose |
|---|---|
| `scripts/blur_faces.py` | OpenCV (4.x) face blur. Needs a human check afterwards. |
| `scripts/optimize_images.py` | JPG/PNG → WebP ≤1600 px (docs ≤2000 px) + thumbnail, strips metadata, moves originals out |
| `scripts/validate.py` | Checks `site.json`: files exist, alt text, minors/blur flags, redaction, links, stray e-mails/phones |
| `scripts/set_site_url.py` | Adds absolute URL + preview image tags |

Accessibility: keyboard-operable gallery viewer (←/→/Esc), skip link, alt text, light and dark themes, respects *reduce motion*.

---

## বাংলা

এটি জাতীয় স্বেচ্ছাসেবক পুরস্কার ২০২৬-এর জন্য একটি স্থির (static) প্রমাণ-পোর্টফোলিও ওয়েবসাইট। কোনো লগইন বা বিল্ড লাগে না। সব তথ্য আসে **একটি ফাইল থেকে: `site/content/site.json`**।

**নিয়ম**
* যা নেই তা দেখানো হয় না। কিছু যোগ হয়েছে কিনা দেখতে ঠিকানার শেষে `?dev=1` যোগ করুন।
* শুধু আপনার নাম থাকবে। অন্য কারও নাম, ফোন, ইমেইল, ঠিকানা নয়। রেফারেন্স এখানে প্রকাশ হবে না।

**⚠️ শিশু-সুরক্ষা (ছবি দেওয়ার আগে অবশ্যই পড়ুন)**
1. ১৮ বছরের কম বয়সীদের (স্কুলের শিক্ষার্থী, শিশু) মুখ চেনা যায় এমন ছবি **কখনো** দেবেন না। আগে `scripts/blur_faces.py` দিয়ে মুখ ঝাপসা করুন।
2. স্বয়ংক্রিয় ঝাপসা করা সব মুখ ধরতে পারে না। **প্রতিটি ছবি নিজের চোখে দেখে নিন।** একটি মুখও চেনা গেলে সেই ছবি দেবেন না।
3. প্রতিটি ছবিতে `"people_under_18": true` বা `false` লিখতে হবে। `true` হলে `"faces_blurred": true`-ও লিখতে হবে, নইলে ছবিটি সাইটে দেখানোই হবে না।
4. চিঠি/সনদ আপলোডের আগে অন্যদের নাম, ফোন, ঠিকানা, সই ঢেকে দিন, তারপর `"redacted": true` লিখুন।
5. মূল (original) ছবি `site/` ফোল্ডারের বাইরে রাখুন (`originals/`)। ক্যাপশনে কাজের বিবরণ লিখুন, ব্যক্তির নয়।

**নিজের কাজ যোগ করার ধাপ**
1. কাঁচা ছবি `originals/incoming/`-এ রাখুন → মুখ ঝাপসা করুন → দেখে নিন।
2. ঠিক থাকা ছবি `site/assets/photos/`-এ কপি করুন (পোস্টার/থাম্বনেইল → `assets/posters/`, চিঠি/সনদ → `assets/docs/`)।
3. চালান: `python3 scripts/optimize_images.py` (WebP হবে, লোকেশন তথ্য মুছবে, মূল ছবি সরে যাবে)। এটি `site.json`-এ বসানোর জন্য একটি অংশ ছাপে।
4. `site/content/site.json` সম্পাদনা করুন। উদাহরণ আছে `examples/site.examples.json`-এ। বাংলা লেখার জন্য `_bn` শেষে থাকা ঘর ব্যবহার করুন।
5. পরীক্ষা: `python3 scripts/validate.py`, তারপর `cd site && python3 -m http.server 8000` চালিয়ে ব্রাউজারে `http://localhost:8000/?dev=1` খুলুন।

**প্রকাশ করা** (শুধু `site` ফোল্ডারটাই পুরো ওয়েবসাইট)
* **Netlify:** *Deploy manually* → `site` ফোল্ডারটি টেনে ছেড়ে দিন।
* **Vercel / GitHub Pages / নিজের সাবডোমেইন:** উপরের ইংরেজি অংশ দেখুন।
* লিংক পাওয়ার পর একবার: `python3 scripts/set_site_url.py https://আপনার-ঠিকানা/` চালিয়ে আবার আপলোড করুন (WhatsApp/Facebook-এ প্রিভিউ ছবির জন্য)।
