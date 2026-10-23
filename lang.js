// English for guests from Malaysia (and anyone who picks it); Indonesian for everyone else.
//
// Which one, in order:
//   ?lang=en / ?lang=id in the link, or the switch on the opening screen (both remembered)
//   Malaysia: the relay (multiplayer/) says which country the guest's IP is in (Cloudflare knows
//     it; no other site is asked), or the device keeps Malaysian time
//   otherwise Indonesian
// The country comes back after the page has started; if it changes the language and the guest
// hasn't touched anything yet, the page reloads in English. Otherwise it's used next visit.
//
// Text in index.html: data-en="..." on an element replaces its contents (HTML allowed: written by
// us); data-en-placeholder / data-en-aria-label replace those attributes. In the scripts,
// L('Indonesian', 'English') picks one. Loaded before every other script.
(function () {
  const KEY = 'ae-lang';            // a choice the guest made: 'en' | 'id'
  const COUNTRY = 'ae-country';     // where the relay last said the guest is
  const GEO_URL = 'https://adam-elsa-venue.adam-ramdhan71.workers.dev/geo'; // the relay (RELAY_URL in net3d.js)
  const MY_ZONES = ['Asia/Kuala_Lumpur', 'Asia/Kuching'];

  const get = (k) => { try { return localStorage.getItem(k); } catch (err) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (err) { /* private mode */ } };

  let asked = null;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'id') { asked = q; set(KEY, q); }
  } catch (err) { /* no URL */ }
  const chosen = asked || get(KEY);
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { /* old browser */ }
  const auto = (country) => (country === 'MY' || MY_ZONES.includes(zone) ? 'en' : 'id');
  const lang = chosen === 'en' || chosen === 'id' ? chosen : auto(get(COUNTRY));

  window.LANG = lang;
  window.L = (id, en) => (lang === 'en' && en != null ? en : id);

  // ---- the page's own text
  if (lang === 'en') {
    document.documentElement.lang = 'en';
    document.querySelectorAll('[data-en]').forEach((el) => { el.innerHTML = el.dataset.en; });
    document.querySelectorAll('[data-en-placeholder]').forEach((el) => { el.placeholder = el.dataset.enPlaceholder; });
    document.querySelectorAll('[data-en-aria-label]').forEach((el) => { el.setAttribute('aria-label', el.dataset.enAriaLabel); });
  }

  // ---- the switch: to the other language, and start again in it
  document.querySelectorAll('.lang-toggle').forEach((b) => {
    b.textContent = lang === 'en' ? 'Bahasa Indonesia' : 'English';
    b.addEventListener('click', () => { set(KEY, lang === 'en' ? 'id' : 'en'); location.reload(); });
  });

  // ---- where the guest is, from the relay (only while nobody has chosen)
  if (chosen) return;
  let touched = false;
  const touch = () => { touched = true; };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, touch, { once: true, capture: true }));
  const started = Date.now();
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (ctl) setTimeout(() => ctl.abort(), 3000);
  fetch(GEO_URL, ctl ? { signal: ctl.signal } : undefined)
    .then((r) => (r.ok ? r.json() : null))
    .then((geo) => {
      const country = geo && typeof geo.country === 'string' ? geo.country : null;
      if (!country) return;
      set(COUNTRY, country);
      // in English now that we know: straight away if they haven't started, else next time
      if (auto(country) !== lang && !touched && Date.now() - started < 4000) location.reload();
    })
    .catch(() => { /* relay not there: the time zone decides */ });
})();
