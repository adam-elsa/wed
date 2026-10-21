# The venue's relay (multiplayer)

A tiny Cloudflare Worker with one Durable Object that passes each guest's name, look and whereabouts
to the others, so guests in the 3D venue see each other walking about. GitHub Pages still serves the
site; this only carries the messages. Once deployed it runs on Cloudflare (your computer can be off).

For ~30 guests at once over an evening this stays well inside Cloudflare's free plan (100,000 requests
a day; 20 incoming messages count as one request; outgoing messages are free).

## Deploy (once)

1. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. In this folder:

   ```
   npx wrangler login
   npx wrangler deploy
   ```

   `login` opens the browser to let wrangler use your account. The first deploy may ask you to pick a
   `workers.dev` subdomain. It prints the address, like `https://adam-elsa-venue.<you>.workers.dev`.
3. Put that address in `net3d.js` as `RELAY_URL`, with `wss://` and `/ws`:
   `export const RELAY_URL = 'wss://adam-elsa-venue.<you>.workers.dev/ws';`
   Until then (or with it set to `''`), the venue works solo as before.

Only pages from `adam-elsa.github.io` and `localhost` may connect (`ORIGINS` in `src/index.js`).

## Try it on this computer first

```
npx wrangler dev --port 8787
```

then open the site twice (two windows) with `?venue&relay=ws://127.0.0.1:8787/ws` added to the link.
