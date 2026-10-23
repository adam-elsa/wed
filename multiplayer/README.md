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

## After changing src/index.js

Run `npx wrangler deploy` again in this folder. Deploying restarts the relay, so everyone connected
drops and reconnects by themselves a second later.

## Who counts as here

- Closing the page says goodbye: the others see the guest leave at once.
- A browser that disappears without saying goodbye (a phone losing signal or killing the tab) stops
  the `ping` every page sends every 10 seconds; the relay sees it out after 30 (`QUIET`).
- A page still open but not in the venue (in the background, or on the 2D invitation) stops sending
  where it is; after 2 minutes (`IDLE`) the relay lets it go with code 4000, and the page comes back
  in on its own as soon as the guest is walking again.

An alarm looks round every 15 seconds while anyone is connected. The pings are answered by
Cloudflare itself (`setWebSocketAutoResponse`), without waking the relay.

## /geo

`GET /geo` answers `{"country": "MY"}` (the visitor's country, from Cloudflare) to pages from the
site, so `lang.js` can greet guests from Malaysia in English. Nothing is stored.

Only pages from `adam-elsa.github.io` and `localhost` may connect (`ORIGINS` in `src/index.js`).

## Try it on this computer first

```
npx wrangler dev --port 8787
```

then open the site twice (two windows) with `?venue&relay=ws://127.0.0.1:8787/ws` added to the link.
