(() => {
  'use strict';

  // ---------- CONFIG ----------
  // TODO: paste your deployed Google Apps Script Web App URL here (see gas/rsvp-endpoint.gs + README).
  const RSVP_ENDPOINT_URL = '';
  // RSVPs also go to the RSVP form (Fluent Forms #705) on our NgantenStory invitation,
  // inv.nstory.id/adam-elsa, so they land in the same entries list as RSVPs made there.
  // Set to '' to stop sending there.
  const NSTORY_AJAX_URL = 'https://inv.nstory.id/wp-admin/admin-ajax.php';
  const NSTORY_FORM_ID = '705';
  const NSTORY_POST_ID = '25279687'; // the adam-elsa page
  // Guestbook messages also go to the invitation's guestbook (CommentPress = WordPress comments
  // on that page), where they show publicly with the others. Set to '' to stop.
  const NSTORY_COMMENTS_URL = 'https://inv.nstory.id/wp-comments-post.php';
  // ...and the guestbook shows the invitation's messages, read live from WordPress's public
  // comments API (it allows this site to read it). Refreshed every minute. Set to '' to stop.
  const NSTORY_WISHES_URL = 'https://inv.nstory.id/wp-json/wp/v2/comments?post=' + NSTORY_POST_ID
    + '&per_page=100&_fields=id,author_name,date_gmt,content';
  const WEDDING_DATE = new Date('2026-10-24T12:30:00+07:00'); // Akad time, used for countdown

  // ---------- guest name from URL ----------
  // Spaces can be "+" (?to=Budi+Santoso) or, shorter to share, left out with each word
  // capitalised (?to=BudiSantoso, ?to=BapakDanIbuHasan): a name with no space in it is split
  // where a capital follows a small letter, and before the last capital of a run of them
  // (?to=KeluargaPTABCIndonesia -> "Keluarga PTABC Indonesia").
  const params = new URLSearchParams(window.location.search);
  const guest = spaceOut(params.get('to') || params.get('nama'));
  function spaceOut(name) {
    name = (name || '').trim();
    if (/\s/.test(name)) return name; // spaces given: keep it exactly as written
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  }
  if (guest) {
    // the 3D opener's greeting and "Dear, <name>" on the hero
    document.querySelectorAll('[data-guest]').forEach((el) => { el.textContent = guest; });
  }

  // ---------- guest name on the hero: big, but never wider than the screen ----------
  // "Dear, <name>" stays on one line; a long name is shrunk until the line fits (down to
  // 18px), and only past that does it wrap onto a second line.
  const heroDear = document.querySelector('.inv-hero-dear');
  const heroName = heroDear && heroDear.querySelector('.inv-hero-guest-name');
  function fitGuestName() {
    if (!heroName || !heroDear.clientWidth) return; // not on screen yet
    heroName.style.fontSize = '';
    heroDear.classList.remove('is-wrapping');
    let size = parseFloat(getComputedStyle(heroName).fontSize);
    for (let i = 0; i < 6 && heroDear.scrollWidth > heroDear.clientWidth + 1 && size > 18; i++) {
      size = Math.max(18, Math.floor(size * (heroDear.clientWidth / heroDear.scrollWidth) * 0.98));
      heroName.style.fontSize = size + 'px';
    }
    if (heroDear.scrollWidth > heroDear.clientWidth + 1) heroDear.classList.add('is-wrapping');
  }
  window.addEventListener('resize', fitGuestName);
  if (document.fonts) document.fonts.ready.then(fitGuestName);

  // ---------- opening ----------
  const gate = document.getElementById('gate');
  const openBtn = document.getElementById('openBtn');
  const siteMain = document.getElementById('siteMain');
  const musicToggle = document.getElementById('musicToggle');
  const musicIcon = musicToggle.querySelector('.music-icon');
  const bgm = document.getElementById('bgm');

  // music has to start inside a tap
  function startMusic() {
    musicToggle.hidden = false;
    bgm.volume = 0.5;
    bgm.play().then(
      () => musicIcon.classList.remove('paused'),
      () => musicIcon.classList.add('paused') // autoplay blocked; the guest can tap the disc
    );
  }

  let opening = false;
  function openInvitation() {
    if (opening) return;
    opening = true;
    startMusic();
    // 3D gate (gate3d.js): the walk up to the hotel with the verse, then the lobby with our
    // story and the photo cards — resolves when the guest leaves it (or right away if the
    // scene never loaded)
    const scene3d = window.weddingGate;
    Promise.resolve(scene3d ? scene3d.flyIn() : null).then(revealSite, revealSite);
  }

  // Opened from the framed invitation on the lobby wall (gate3d.js). The venue stays mounted
  // and paused behind it; closing puts the guest back exactly where they were standing.
  const inviteClose = document.getElementById('inviteClose');
  let onOverlayClose = null;
  window.openInvitationOverlay = function (onClose) {
    onOverlayClose = onClose || null;
    siteMain.hidden = false;
    document.body.classList.add('invitation-overlay');
    inviteClose.hidden = false;
    fitGuestName();
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
    initReveal();
  };
  inviteClose.addEventListener('click', () => {
    document.body.classList.remove('invitation-overlay');
    siteMain.hidden = true;
    inviteClose.hidden = true;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    const back = onOverlayClose;
    onOverlayClose = null;
    if (back) back();
  });

  function revealSite() {
    gate.classList.add('gate-hidden');
    siteMain.hidden = false;
    fitGuestName();
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
    setTimeout(() => {
      // the gate has to go even if tearing the 3D scenes down trips over something,
      // or its canvas and WebGL context sit behind the invitation for the whole visit
      try {
        if (window.weddingGate) window.weddingGate.dispose();
      } catch (err) {
        console.error(err);
      }
      gate.remove();
    }, 900);
    initReveal();
  }

  musicToggle.addEventListener('click', () => {
    if (bgm.paused) {
      bgm.play().then(() => musicIcon.classList.remove('paused'), () => {});
    } else {
      bgm.pause();
      musicIcon.classList.add('paused');
    }
  });

  // ---------- entrance animations ----------
  let revealObserver;
  function initReveal() {
    if (revealObserver) return;
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.anim-up, .anim-left, .anim-fade, .anim-zoom, .anim-draw')
      .forEach((el) => revealObserver.observe(el));
  }

  // ---------- countdown ----------
  function tickCountdown() {
    let diff = WEDDING_DATE - new Date();
    if (diff < 0) diff = 0;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val).padStart(2, '0');
    };
    set('cd-days', days);
    set('cd-hours', hours);
    set('cd-mins', mins);
    set('cd-secs', secs);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---------- guestbook ----------
  const wishesList = document.getElementById('wishesList');

  // "1 hour, 37 mins ago", like the template's comment plugin
  function timeAgo(date) {
    const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    if (mins < 1) return 'just now';
    if (mins < 60) return `${plural(mins, 'min')} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${plural(hours, 'hour')}, ${plural(mins % 60, 'min')} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${plural(days, 'day')}, ${plural(hours % 24, 'hour')} ago`;
    const weeks = Math.floor(days / 7);
    if (days < 30) return `${plural(weeks, 'week')}, ${plural(days % 7, 'day')} ago`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderWish(name, message, time, toTop) {
    if (!message) return;
    const item = document.createElement('li');
    item.className = 'inv-wish';
    const head = document.createElement('p');
    head.className = 'inv-wish-head';
    const nameEl = document.createElement('span');
    nameEl.className = 'inv-wish-name';
    nameEl.textContent = name || 'Tamu';
    head.appendChild(nameEl);
    const when = time ? new Date(time) : null;
    if (when && !isNaN(when)) {
      const timeEl = document.createElement('span');
      timeEl.className = 'inv-wish-time';
      timeEl.textContent = timeAgo(when);
      head.appendChild(timeEl);
    }
    item.appendChild(head);
    // first line dark, the rest a softer grey, as in the template
    String(message).split(/\n+/).filter(Boolean).forEach((line) => {
      const msgEl = document.createElement('p');
      msgEl.className = 'inv-wish-msg';
      msgEl.textContent = line;
      item.appendChild(msgEl);
    });
    if (toTop) wishesList.prepend(item); else wishesList.appendChild(item);
  }

  // messages this visitor just sent, shown until the invitation's own copy comes back
  let pendingWishes = [];
  const wishKey = (name, message) => (name + '|' + message).replace(/\s+/g, ' ').trim().toLowerCase();

  // WordPress returns the comment as HTML: turn it into plain lines (never inserted as HTML)
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    const paras = [...doc.querySelectorAll('p')];
    return (paras.length ? paras.map((p) => p.textContent) : [doc.body.textContent]).join('\n').trim();
  }

  async function fetchNstoryWishes() {
    const wishes = [];
    for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
      const res = await fetch(NSTORY_WISHES_URL + '&page=' + page);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      pages = parseInt(res.headers.get('X-WP-TotalPages'), 10) || 1;
      (await res.json()).forEach((c) => wishes.push({
        name: htmlToText(c.author_name),
        message: htmlToText(c.content && c.content.rendered),
        time: c.date_gmt ? c.date_gmt + 'Z' : '',
      }));
    }
    return wishes; // newest first
  }

  // the invitation's messages, plus any of ours it doesn't show yet, on top
  function showWishes(wishes) {
    const seen = new Set(wishes.map((w) => wishKey(w.name, w.message)));
    pendingWishes = pendingWishes.filter((w) => !seen.has(wishKey(w.name, w.message)));
    wishesList.textContent = '';
    [...pendingWishes, ...wishes].forEach((w) => renderWish(w.name, w.message, w.time, false));
  }

  let nstoryWishes = null; // last list read from the invitation
  async function refreshNstoryWishes() {
    try {
      nstoryWishes = await fetchNstoryWishes();
      showWishes(nstoryWishes);
    } catch (err) {
      // keep whatever is on screen; try again on the next refresh
    }
  }

  async function loadWishes() {
    if (NSTORY_WISHES_URL) {
      await refreshNstoryWishes();
      if (nstoryWishes) {
        setInterval(() => { if (!document.hidden) refreshNstoryWishes(); }, 60000);
        return;
      }
    }
    // no invitation to read from: the Google Sheet copy, if it's set up
    if (!RSVP_ENDPOINT_URL) return;
    try {
      const res = await fetch(RSVP_ENDPOINT_URL);
      const data = await res.json();
      if (Array.isArray(data)) {
        // newest first
        data.filter((row) => row.message).reverse()
          .forEach((row) => renderWish(row.name, row.message, row.time, false));
      }
    } catch (err) {
      // silently ignore; guestbook is a nice-to-have
    }
  }
  loadWishes();

  async function send(payload) {
    if (!RSVP_ENDPOINT_URL) return 'preview';
    await fetch(RSVP_ENDPOINT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    return 'sent';
  }

  // Same request the invitation's own form makes: admin-ajax, action=fluentform_submit, the
  // form's fields serialized into `data`. Cross-site, so the reply can't be read ('no-cors'):
  // this only fails on a network error, not if the invitation turns the entry down.
  async function sendToNstory(rsvp) {
    if (!NSTORY_AJAX_URL) return;
    const coming = rsvp.attendance === 'Hadir';
    const guests = parseInt(rsvp.guests, 10) || 1;
    // The invitation's "Jumlah Tamu" only offers 1 or 2, and might turn down anything else; we
    // allow up to 6, so for 3+ send 2 and keep the real number with the name: "Budi (5 tamu)".
    const fields = new URLSearchParams({
      __fluent_form_embded_post_id: NSTORY_POST_ID,
      _wp_http_referer: '/adam-elsa/',
      input_text: coming && guests > 2 ? `${rsvp.name} (${guests} tamu)` : rsvp.name,
      input_radio: coming ? 'Saya akan hadir' : 'Maaf tidak hadir',
    });
    // it only asks "Jumlah Tamu" of guests who are coming
    if (coming) fields.set('dropdown', String(Math.min(guests, 2)));
    await fetch(NSTORY_AJAX_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: fields.toString(), action: 'fluentform_submit', form_id: NSTORY_FORM_ID }),
    });
  }

  // Same fields the invitation's guestbook form posts, including its fixed anti-spam fields
  // (name=username, nombre and form-saic left empty). Also no-cors: the reply can't be read.
  async function sendWishToNstory(name, message) {
    if (!NSTORY_COMMENTS_URL) return;
    await fetch(NSTORY_COMMENTS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({
        author: name.replace(/[?%$=\/]/g, '').slice(0, 80), // the guestbook refuses these characters
        email: 'anonymous@wordpress.com',
        comment: message,
        name: 'username',
        nombre: '',
        'form-saic': '',
        submit: 'Kirim',
        commentpress: 'true',
        comment_post_ID: NSTORY_POST_ID,
        comment_parent: '0',
        comment_press: 'true',
      }),
    });
  }

  // ---------- RSVP ----------
  const rsvpForm = document.getElementById('rsvpForm');
  if (guest && !rsvpForm.elements.name.value) rsvpForm.elements.name.value = guest;
  // "Jumlah Tamu" only for guests who are coming, as on the invitation
  const guestsGroup = rsvpForm.querySelector('.ff-guests');
  const syncGuests = () => { guestsGroup.hidden = rsvpForm.elements.attendance.value !== 'Hadir'; };
  rsvpForm.addEventListener('change', syncGuests);
  syncGuests();
  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = rsvpForm.querySelector('.rsvp-status');
    const name = rsvpForm.elements.name.value.trim();
    if (!name) {
      status.textContent = 'Mohon isi nama Anda.';
      status.className = 'rsvp-status err';
      rsvpForm.elements.name.focus();
      return;
    }
    status.textContent = 'Mengirim...';
    status.className = 'rsvp-status';
    const rsvp = {
      name,
      attendance: rsvpForm.elements.attendance.value,
      guests: rsvpForm.elements.guests.value,
      message: '',
    };
    try {
      const [toSheet] = await Promise.all([send(rsvp), sendToNstory(rsvp)]);
      status.textContent = toSheet === 'preview' && !NSTORY_AJAX_URL
        ? 'Terima kasih! (mode pratinjau — belum tersambung ke Google Sheet)'
        : 'Terima kasih atas konfirmasinya!';
      status.className = 'rsvp-status ok';
    } catch (err) {
      status.textContent = 'Gagal mengirim. Silakan coba lagi.';
      status.className = 'rsvp-status err';
    }
  });

  const wishForm = document.getElementById('wishForm');
  if (guest && !wishForm.elements.name.value) wishForm.elements.name.value = guest;
  wishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = wishForm.querySelector('.rsvp-status');
    const name = wishForm.elements.name.value.trim();
    const message = wishForm.elements.message.value.trim();
    if (!name || message.length < 2) return; // the invitation's guestbook needs 2+ characters
    status.textContent = 'Mengirim...';
    status.className = 'rsvp-status';
    try {
      const [toSheet] = await Promise.all([
        send({ name, attendance: '', guests: '', message }),
        sendWishToNstory(name, message),
      ]);
      const mine = { name, message, time: new Date().toISOString() };
      if (nstoryWishes) {
        // show it now, then let the invitation's own copy take its place once it's there
        pendingWishes.unshift(mine);
        showWishes(nstoryWishes);
        [4000, 15000].forEach((ms) => setTimeout(refreshNstoryWishes, ms));
      } else {
        renderWish(mine.name, mine.message, mine.time, true);
      }
      wishForm.elements.message.value = '';
      status.textContent = toSheet === 'preview' && !NSTORY_COMMENTS_URL ? 'Terima kasih! (mode pratinjau)' : '';
      status.className = 'rsvp-status ok';
    } catch (err) {
      status.textContent = 'Gagal mengirim. Silakan coba lagi.';
      status.className = 'rsvp-status err';
    }
  });

  // ---------- bank transfer popup ----------
  const giftPopup = document.getElementById('giftPopup');
  const openGift = document.getElementById('openGift');
  function showGift() {
    giftPopup.hidden = false;
    requestAnimationFrame(() => giftPopup.classList.add('is-open'));
    giftPopup.querySelector('.inv-popup-close').focus();
  }
  function hideGift() {
    giftPopup.classList.remove('is-open');
    setTimeout(() => { giftPopup.hidden = true; }, 400);
    openGift.focus();
  }
  openGift.addEventListener('click', showGift);
  giftPopup.addEventListener('click', (e) => {
    if (e.target === giftPopup || e.target.closest('.inv-popup-close')) hideGift();
  });

  // ---------- the lobby's reception desk (gate3d.js) ----------
  // The RSVP card at the 3D reception desk and the gift box's "salin" button; both go to the
  // same places as the invitation's own form and account number below.
  const lobbyRsvp = document.getElementById('lobbyRsvpForm');
  if (lobbyRsvp) {
    if (guest && !lobbyRsvp.elements.name.value) lobbyRsvp.elements.name.value = guest;
    lobbyRsvp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = lobbyRsvp.querySelector('.rsvp-status');
      const name = lobbyRsvp.elements.name.value.trim();
      if (!name) {
        status.textContent = 'Mohon isi nama Anda.';
        status.className = 'rsvp-status err';
        lobbyRsvp.elements.name.focus();
        return;
      }
      status.textContent = 'Mengirim...';
      status.className = 'rsvp-status';
      const rsvp = {
        name,
        attendance: lobbyRsvp.elements.attendance.value,
        guests: lobbyRsvp.elements.attendance.value === 'Hadir' ? lobbyRsvp.elements.guests.value : '',
        message: '',
      };
      try {
        const [toSheet] = await Promise.all([send(rsvp), sendToNstory(rsvp)]);
        status.textContent = toSheet === 'preview' && !NSTORY_AJAX_URL
          ? 'Terima kasih! (mode pratinjau — belum tersambung ke Google Sheet)'
          : 'Terima kasih atas konfirmasinya!';
        status.className = 'rsvp-status ok';
        // the invitation's own form shows the same answer when the guest gets there
        rsvpForm.elements.name.value = name;
        rsvpForm.elements.attendance.value = rsvp.attendance;
        syncGuests();
      } catch (err) {
        status.textContent = 'Gagal mengirim. Silakan coba lagi.';
        status.className = 'rsvp-status err';
      }
    });
  }

  const lobbyCopy = document.getElementById('lobbyCopyGift');
  if (lobbyCopy) {
    lobbyCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById('lobbyGiftNumber').textContent.trim());
        lobbyCopy.textContent = 'Tersalin!';
        setTimeout(() => (lobbyCopy.textContent = 'Salin Nomor Rekening'), 1800);
      } catch (err) {
        // clipboard blocked — no-op
      }
    });
  }

  const copyBtn = document.getElementById('copyGift');
  copyBtn.addEventListener('click', async () => {
    const label = copyBtn.querySelector('span');
    try {
      await navigator.clipboard.writeText(document.getElementById('giftNumber').textContent.trim());
      label.textContent = 'Copied!';
      setTimeout(() => (label.textContent = 'Copy'), 1500);
    } catch (err) {
      // clipboard blocked — no-op
    }
  });

  // ---------- gallery lightbox ----------
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox.querySelector('img');
  document.querySelectorAll('.inv-gallery-item').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      lightboxImg.src = link.getAttribute('href');
      lightbox.hidden = false;
    });
  });
  lightbox.addEventListener('click', () => { lightbox.hidden = true; lightboxImg.removeAttribute('src'); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!giftPopup.hidden) hideGift();
    if (!lightbox.hidden) lightbox.click();
  });

  // ---------- scroll hint down the left edge ----------
  // Stays until the guest scrolls into the RSVP section (its top a third of the way up the
  // screen), and comes back if they scroll up above it again. While the invitation is hidden
  // (the 3D venue) the section has no size, which counts as not there yet.
  const scrollHint = document.querySelector('.inv-scroll-hint');
  const rsvpSection = document.querySelector('.inv-rsvp');
  const syncScrollHint = () => {
    const r = rsvpSection.getBoundingClientRect();
    scrollHint.classList.toggle('is-gone', r.height > 0 && r.top < window.innerHeight * 0.66);
  };
  window.addEventListener('scroll', syncScrollHint, { passive: true });
  window.addEventListener('resize', syncScrollHint);

  // ---------- 2D or 3D ----------
  // The 3D venue (the walk up to the hotel, the lobby, the ballroom) only with ?venue, e.g.
  // ?to=Nama+Tamu&venue, or ?ballroom to go straight to the ballroom.
  if (!params.has('venue') && !params.has('ballroom')) {
    // the default: no opener at all, straight onto the invitation (runs before gate3d.js is
    // loaded, which index.html then skips). Browsers only let sound start inside a tap, so if
    // the music is blocked now it starts on the guest's first tap or key press (a tap on the
    // music disc is left to the disc itself).
    gate.remove();
    siteMain.hidden = false;
    fitGuestName();
    initReveal();
    startMusic();
    const events = ['pointerdown', 'touchend', 'keydown'];
    const stopWaiting = () => events.forEach((t) => document.removeEventListener(t, playOnFirstTap, true));
    function playOnFirstTap(e) {
      if (!bgm.paused || musicToggle.contains(e.target)) return stopWaiting();
      bgm.play().then(() => { musicIcon.classList.remove('paused'); stopWaiting(); }, () => {});
    }
    events.forEach((t) => document.addEventListener(t, playOnFirstTap, true));
  } else {
    document.body.style.overflow = 'hidden';
    openBtn.addEventListener('click', openInvitation);
    // if the 3D scene never shows up (no WebGL / CDN blocked), drop the loader
    setTimeout(() => {
      if (!gate.classList.contains('is-ready')) gate.classList.add('no-scene');
    }, 10000);
  }
})();
