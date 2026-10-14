# Adam & Elsa Wedding Invitation — Build Plan

## Event facts (confirmed)
- Couple: **Adam & Elsa**
- Date: **Saturday, 24 October 2026**
- Venue: **Golden Boutique Hotel, Jakarta**
- Akad Nikah: **12.30 WIB**
- Resepsi: **16.00 WIB**

## Assets we have (`/media`)
- `01_Banner.jpg` — couple in black, plain wall → cover / hero
- `02_ProfileAdam.jpg`, `02_ProfileElsa.jpg` — individual profile shots → "The Couple" section
- `04_Venue.png` — couple by window, pink dress → venue/location section
- `05_TimingAkadResepsi.jpg` — couple in willow garden → akad & resepsi timing section
- `06_FooterThankyou.jpg` — couple sitting, cozy shelf → closing/thank-you section
- 2x "PW Jakarta By Ohana Pictures" full photos → gallery / love-story filler

## Reference styles (from the 3 links you shared)
- **template-14g**: dark background theme, easy on the eyes on mobile, everything feels part of one continuous dark canvas (no jarring white section breaks)
- **template-8g**: light sprinkle of parallax decorative elements (florals/leaves drifting at different scroll speeds) — decorative, not overwhelming
- **template-5g**: parallax + color transitions that feel *seamless* — sections blend into each other via gradient/color instead of hard cuts

**Design direction:** single-page, mobile-first, dark elegant theme (deep charcoal/black base, warm gold or muted rose accent to match the couple's black-tie photos), soft floating parallax decorations (petals/leaves/light particles), sections blended via gradient transitions rather than hard borders.

**Update (Oct 2026):** the invitation page (after the 3D opening) now follows **template-11g** (hi.nstory.id/template-11g) instead: light theme, white + warm off-white (#f8f7f4) cards with a faint line-art sprig, charcoal (#383838) type, slate-blue (#9da8b7) accent rule, DM Serif Display headings, leaf-shaped photo frames, and soft white curves where full-bleed photos meet the page. The 3D opening keeps the dark night-and-gold look.

**Update (Oct 2026, later):** the invitation page is now a straight reproduction of the couple's live NgantenStory invitation, inv.nstory.id/adam-elsa (template-11): same sections, photos, line-art, layout (desktop side panel + 500px column), Divi spacing and fonts (free stand-ins for the three paid ones). With `?simple` there is no cover at all (the invitation opens straight away); otherwise the 3D opener is the cover. Details from the live invitation now used: Elsa's father Bapak Lim Han San, venue Golden Boutique Hotel Kemayoran (Jl. Angkasa No.1) with its Maps pin, Instagram links, the gift popup (BCA 8691241238 a.n. Elsa).

## Site structure (sections, top to bottom)
1. **Cover / Gate screen** — "You are invited" + guest name from URL query param (`?to=Nama`) + tap-to-open button (also unlocks background music, satisfies mobile autoplay restrictions)
2. **Opening quote** — Islamic verse (QS. Ar-Rum 21) or your preferred quote — *need your input, see Open Questions*
3. **The Couple** — Adam & Elsa photos + names + "son/daughter of ..." parents' names — *need parents' names*
4. **Our Story** (optional, light) — 2–3 short milestones using the extra Ohana Pictures photos
5. **Save the Date** — big date treatment (24.10.2026) + live countdown timer
6. **Akad & Resepsi** — two cards: Akad 12.30 WIB / Resepsi 16.00 WIB, both at Golden Boutique Hotel Jakarta, each with a "View on Google Maps" button
7. **RSVP** — name, attendance (yes/no), guest count, optional message → stored somewhere (see Open Questions)
8. **Digital Gift (Amplop Digital)** — bank transfer details / e-wallet QR — optional, only if you want it
9. **Wishes / Guestbook** — list of well-wishes, newest first
10. **Gallery** — remaining photos in a light grid/lightbox
11. **Closing / Thank You** — footer photo + closing note + credits
12. Persistent **music toggle button** (small floating control, muted by default until gate is opened)

## Tech approach
- **Plain HTML/CSS/JS**, no framework, no build step — fastest to iterate on, trivial to host anywhere (GitHub Pages, Netlify, Vercel static, or your own hosting), and keeps this "vibe coding" fast.
- CSS scroll-driven parallax (`transform: translateY()` tied to scroll position via a small IntersectionObserver/scroll-listener script) — matches the "perintilan parallax" you liked, kept lightweight for mobile performance.
- Fully responsive, mobile-first (most guests will open this on their phone).
- Images optimized/served as-is from `/media`, lazy-loaded below the fold.
- Countdown timer in vanilla JS.
- Guest-name-in-URL personalization via `URLSearchParams`.

## Decisions (confirmed)
1. **RSVP + Wishes storage**: Custom form styled to match the site, submitting to a **Google Apps Script Web App** endpoint that appends rows to a Google Sheet you own. I'll build the frontend form + `fetch()` POST, and hand you a ready-to-paste Apps Script (`gas/rsvp-endpoint.gs`) + setup steps, since the Script itself must be deployed from your own Google account.
2. **Digital gift**: Yes — BCA `8691241238` (a.n. TBD — confirm account holder name to display, or I'll leave that line generic).
3. **Hosting**: Target **GitHub Pages** first — 300 views is trivial for its free static hosting (well within limits), and it's zero-cost to wire up from this repo. Pure static HTML/CSS/JS also means if you change your mind and move to Hostinger later, it's a straight file copy — no lock-in either way.
4. **Names**: Adam & Elsa (confirmed).

## Remaining small placeholders (I'll fill sensible defaults, flag clearly in the code, and you swap them before launch)
- Parents' names under each profile — left as `[Nama Ayah] & [Nama Ibu]` placeholders
- Opening quote — defaulting to an Ar-Rum 21 style verse like the reference; swap easily in one spot in `index.html`
- Google Maps link — will search for "Golden Boutique Hotel Jakarta" and use the top match; confirm it's the right branch once built
- Background music — a royalty-free instrumental placeholder track; easy to swap the file later if you two pick a specific song
- Dress code note — left out by default; easy to add a line if wanted
- BCA account holder name — placeholder "a.n. Adam" until confirmed

## Build order
1. Scaffold `index.html`, `styles.css`, `script.js`, copy `/media` into project (e.g. `assets/`)
2. Build cover/gate + music toggle
3. Build couple + story + countdown sections
4. Build akad/resepsi + maps section
5. Build RSVP + wishes (once storage decision is made)
6. Build gallery + closing
7. Polish: parallax tuning, dark-mode color pass, mobile QA in the browser pane
8. Final pass: test on mobile viewport, check performance/image sizes, confirm guest-name query param works
