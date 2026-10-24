// The venue's relay: every guest walking the 3D venue keeps one WebSocket open to it, and it
// passes each one's name, look and whereabouts on to everybody else. One Durable Object holds
// the whole wedding (the lobby and the ballroom both; each guest says which room they are in).
//
// It keeps nothing: who is here lives on the open sockets themselves (serializeAttachment), so
// the object can hibernate between messages and wake up knowing the crowd. Billing: Cloudflare
// counts 20 incoming messages as one request and doesn't charge for outgoing ones, so passing
// each update on to 30 people costs no more than receiving it.
//
// A guest who shuts the browser doesn't always say goodbye (a phone drops the connection without
// closing it), so every page says 'ping' every 10 seconds, answered with 'pong' by Cloudflare
// itself without waking the object. While anyone is connected an alarm looks round every 15
// seconds and sends off whoever hasn't been heard from (a ping or a message) for 30.
// A page that is still there but not in the venue (put away in the background, or reading the 2D
// invitation) stops saying where it is; after 2 minutes of that it is let go too, with code 4000
// so it doesn't reconnect straight away: it comes back in once the guest is walking again.
//
// Messages, as JSON, guest -> relay:
//   { t: 'hi', name, look }        on connecting (look as in avatar3d.js, or null)
//   { t: 's', r, x, z, y, a, p, h } where I am: room ('lobby' | 'ballroom'), position, facing, walking (0/1),
//                                  and what I'm doing: p 'sit' | 'sitl' | an emote's id (emotes3d.js) | '',
//                                  h how high I sit
//   { t: 'look', look }            changed my character
//   { t: 'name', name }            wrote my name in the guest book
// relay -> guest:
//   { t: 'welcome', id, peers: [{ id, name, look, s }] }   (s: their last 's', or null)
//   { t: 'join', id, name, look } / { t: 'leave', id } / { t: 's', id, ... } / { t: 'look', id, look } / { t: 'name', id, name }
//
// It also counts visits, and nothing else about them: POST /hit { k: 'page' | 'venue', id } from
// the site (script.js: every page opened; gate3d.js: going into the 3D venue), id being a random
// one the browser keeps, to tell visitors apart. Kept per day (Jakarta time) as totals and as how
// many different visitors; GET /stats shows them as JSON. No names, no addresses.

import { DurableObject } from 'cloudflare:workers';

// pages allowed to connect: the site, and a local preview
const ORIGINS = [/^https:\/\/adam-elsa\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_GUESTS = 120;        // a wedding, not a stadium
const MAX_RATE = 20;           // messages a second from one guest before they're ignored
const NAME_MAX = 40;
const QUIET = 30 * 1000;       // ms without a ping or a message before a guest counts as gone
const SWEEP = 15 * 1000;       // ms between looks round for them
const IDLE = 2 * 60 * 1000;    // ms without saying where they are (not walking the venue) before they're let go

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Adam & Elsa venue relay', { status: 200 });
    const origin = request.headers.get('Origin') || '';
    const allowed = ORIGINS.some((re) => re.test(origin));
    // which country the guest is in (Cloudflare knows it from their IP), so the site can greet
    // guests from Malaysia in English (lang.js); only the country goes back, nothing is kept
    if (url.pathname === '/geo') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      return new Response(JSON.stringify({ country: (request.cf && request.cf.country) || null }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store', Vary: 'Origin' },
      });
    }
    if (url.pathname === '/hit' || url.pathname === '/stats') {
      if (url.pathname === '/hit' && (!allowed || request.method !== 'POST')) return new Response('forbidden', { status: 403 });
      return env.VENUE.get(env.VENUE.idFromName('wedding')).fetch(request);
    }
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
    if (!allowed) return new Response('forbidden', { status: 403 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const room = env.VENUE.get(env.VENUE.idFromName('wedding'));
    return room.fetch(request);
  },
};

const clean = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
// a look is a small object of part ids and colours: keep it small and plain
function cleanLook(look) {
  if (!look || typeof look !== 'object') return null;
  const out = { gender: look.gender === 'male' ? 'male' : 'female', parts: {}, colors: {} };
  for (const [k, v] of Object.entries(look.parts || {}).slice(0, 8)) out.parts[clean(k).slice(0, 12)] = v == null ? null : clean(v);
  for (const [k, v] of Object.entries(look.colors || {}).slice(0, 8)) if (/^#[0-9a-f]{6}$/i.test(v)) out.colors[clean(k).slice(0, 12)] = v;
  return out;
}

export class Venue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // the pages' heartbeat, answered without waking the object (see alarm())
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/hit') return this.hit(request);
    if (path === '/stats') return this.stats();
    if (this.here().length >= MAX_GUESTS) return new Response('the venue is full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); // hibernatable: the object can sleep while sockets stay open
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name: '', look: null, s: null, hi: false, win: 0, n: 0, seen: Date.now(), at: Date.now() });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + SWEEP);
    return new Response(null, { status: 101, webSocket: client });
  }

  // one visit: the day's total, and whether this visitor is new today (and new at all)
  async hit(request) {
    let m = {};
    try { m = JSON.parse(await request.text()); } catch (err) { /* counted as a page */ }
    const kind = m && m.k === 'venue' ? 'venue' : 'page';
    const id = m && typeof m.id === 'string' ? m.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) : '';
    const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const s = this.ctx.storage;
    const d = (await s.get(`d:${day}`)) || { page: 0, venue: 0, pageVisitors: 0, venueVisitors: 0 };
    const all = (await s.get('all')) || { since: day, page: 0, venue: 0, pageVisitors: 0, venueVisitors: 0 };
    d[kind]++;
    all[kind]++;
    if (id) {
      if (!(await s.get(`u:${day}:${kind}:${id}`))) { await s.put(`u:${day}:${kind}:${id}`, 1); d[`${kind}Visitors`]++; }
      if (!(await s.get(`a:${kind}:${id}`))) { await s.put(`a:${kind}:${id}`, 1); all[`${kind}Visitors`]++; }
    }
    await s.put({ [`d:${day}`]: d, all });
    return new Response(null, { status: 204 });
  }

  // the counts so far: page = the invitation opened, venue = the 3D venue gone into;
  // ...Visitors = how many different browsers did
  async stats() {
    const days = {};
    for (const [k, v] of await this.ctx.storage.list({ prefix: 'd:' })) days[k.slice(2)] = v;
    const all = (await this.ctx.storage.get('all')) || null;
    return new Response(JSON.stringify({ total: all, days, online: this.here().length }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    });
  }

  // look round for guests gone quiet (the browser closed without saying so), or still connected
  // but no longer in the venue, and see them out
  async alarm() {
    const now = Date.now();
    for (const ws of this.here()) {
      const me = ws.deserializeAttachment() || {};
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      if (now - Math.max(me.seen || 0, pinged ? pinged.getTime() : 0) > QUIET) this.bye(ws);
      else if (now - (me.at || 0) > IDLE) this.bye(ws, 4000, 'idle');
    }
    if (this.here().length) await this.ctx.storage.setAlarm(Date.now() + SWEEP);
  }

  // the sockets still open: one closed from this end can linger until the other end answers
  here() { return this.ctx.getWebSockets().filter((w) => { const a = w.deserializeAttachment(); return !(a && a.gone); }); }
  others(ws) { return this.here().filter((w) => w !== ws); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (err) { /* gone */ } }
  tell(ws, msg) { const text = JSON.stringify(msg); for (const w of this.others(ws)) this.send(w, text); }

  async webSocketMessage(ws, data) {
    const me = ws.deserializeAttachment();
    me.seen = Date.now();
    // a guest flooding the room is ignored for the rest of that second
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== me.win) { me.win = sec; me.n = 0; }
    if (++me.n > MAX_RATE) { ws.serializeAttachment(me); return; }
    let m;
    try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (err) { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hi' && !me.hi) {
      me.hi = true; me.name = clean(m.name) || 'Tamu'; me.look = cleanLook(m.look);
      ws.serializeAttachment(me);
      const peers = this.others(ws).map((w) => w.deserializeAttachment()).filter((p) => p.hi)
        .map((p) => ({ id: p.id, name: p.name, look: p.look, s: p.s }));
      this.send(ws, { t: 'welcome', id: me.id, peers });
      this.tell(ws, { t: 'join', id: me.id, name: me.name, look: me.look });
      return;
    }
    if (!me.hi) return;
    if (m.t === 's') {
      const s = { r: m.r === 'ballroom' ? 'ballroom' : 'lobby', x: num(m.x, -30, 30), z: num(m.z, -30, 30), y: num(m.y, -10, 10), a: m.a ? 1 : 0, p: typeof m.p === 'string' && /^[a-z]{1,8}$/.test(m.p) ? m.p : '', h: num(m.h, 0, 1) };
      me.s = s; me.at = Date.now(); ws.serializeAttachment(me);
      this.tell(ws, { t: 's', id: me.id, ...s });
    } else if (m.t === 'name') {
      me.name = clean(m.name) || me.name; ws.serializeAttachment(me);
      this.tell(ws, { t: 'name', id: me.id, name: me.name });
    } else if (m.t === 'look') {
      me.look = cleanLook(m.look); ws.serializeAttachment(me);
      this.tell(ws, { t: 'look', id: me.id, look: me.look });
    } else {
      ws.serializeAttachment(me);
    }
  }

  async webSocketClose(ws) { this.bye(ws); }
  async webSocketError(ws) { this.bye(ws); }
  bye(ws, code = 1000, reason = 'bye') {
    const me = ws.deserializeAttachment();
    if (me && me.gone) return; // seen out already
    if (me) { me.gone = true; try { ws.serializeAttachment(me); } catch (err) { /* closed */ } }
    if (me && me.hi) this.tell(ws, { t: 'leave', id: me.id });
    try { ws.close(code, reason); } catch (err) { /* already */ }
  }
}
