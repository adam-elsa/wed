// The venue's relay: every guest walking the 3D venue keeps one WebSocket open to it, and it
// passes each one's name, look and whereabouts on to everybody else. One Durable Object holds
// the whole wedding (the lobby and the ballroom both; each guest says which room they are in).
//
// It keeps nothing: who is here lives on the open sockets themselves (serializeAttachment), so
// the object can hibernate between messages and wake up knowing the crowd. Billing: Cloudflare
// counts 20 incoming messages as one request and doesn't charge for outgoing ones, so passing
// each update on to 30 people costs no more than receiving it.
//
// Messages, as JSON, guest -> relay:
//   { t: 'hi', name, look }        on connecting (look as in avatar3d.js, or null)
//   { t: 's', r, x, z, y, a }      where I am: room ('lobby' | 'ballroom'), position, facing, walking (0/1)
//   { t: 'look', look }            changed my character
//   { t: 'name', name }            wrote my name in the guest book
// relay -> guest:
//   { t: 'welcome', id, peers: [{ id, name, look, s }] }   (s: their last 's', or null)
//   { t: 'join', id, name, look } / { t: 'leave', id } / { t: 's', id, ... } / { t: 'look', id, look } / { t: 'name', id, name }

import { DurableObject } from 'cloudflare:workers';

// pages allowed to connect: the site, and a local preview
const ORIGINS = [/^https:\/\/adam-elsa\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_GUESTS = 120;        // a wedding, not a stadium
const MAX_RATE = 20;           // messages a second from one guest before they're ignored
const NAME_MAX = 40;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Adam & Elsa venue relay', { status: 200 });
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
    const origin = request.headers.get('Origin') || '';
    if (!ORIGINS.some((re) => re.test(origin))) return new Response('forbidden', { status: 403 });
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
  async fetch(request) {
    if (this.ctx.getWebSockets().length >= MAX_GUESTS) return new Response('the venue is full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); // hibernatable: the object can sleep while sockets stay open
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name: '', look: null, s: null, hi: false, win: 0, n: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  others(ws) { return this.ctx.getWebSockets().filter((w) => w !== ws); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (err) { /* gone */ } }
  tell(ws, msg) { const text = JSON.stringify(msg); for (const w of this.others(ws)) this.send(w, text); }

  async webSocketMessage(ws, data) {
    const me = ws.deserializeAttachment();
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
      const s = { r: m.r === 'ballroom' ? 'ballroom' : 'lobby', x: num(m.x, -30, 30), z: num(m.z, -30, 30), y: num(m.y, -10, 10), a: m.a ? 1 : 0 };
      me.s = s; ws.serializeAttachment(me);
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
  bye(ws) {
    const me = ws.deserializeAttachment();
    if (me && me.hi) this.tell(ws, { t: 'leave', id: me.id });
    try { ws.close(); } catch (err) { /* already */ }
  }
}
