# CatSpot

**A map of cats.** A community record of cat sightings — open it, see what has been spotted near you, and add your own.

**[Open CatSpot →](https://golake.app/catspot)**

## What it does

CatSpot keeps a shared map of cat sightings. You report a cat with two taps — what colour it was, and whether it was friendly — and it appears on the map for everyone.

- **Map view** — clustered markers on a Leaflet / MapLibre map.
- **Report a sighting** — your location is captured, then you pick a coat colour and temperament.
- **Filters** — everything, today, or nearby.
- **Counts** — total sightings and sightings today, animated as they load.
- **No account** — there is nothing to sign up for.

### Cat types

Ginger · Black · White · Grey · Tabby · Calico / Tortoiseshell · Mixed / Multicoloured · Other / Not sure

### Temperament

Reported as **Cooperated** or **Declined to comment** — the cat's opinion on being surveyed.

## Privacy: approximate by design

Cat locations are never published exactly.

1. Your real coordinates are written to a `sightingPrivate` collection that **cannot be read by anyone, including the app** — write-only from the client.
2. Before anything becomes public, the coordinate is **displaced by 50–100 metres** in a random direction.
3. The public record stores the shifted point, a geohash, and a human-readable area name. No precision beyond that.

Firestore rules enforce all of it server-side: the public document must contain exactly the expected keys, `update` and `delete` are denied for everyone, and `createdAt` must equal the server's own clock. The app being tampered with cannot write a precise location or a backdated sighting.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:5173
```

```sh
npm run build      # type-check + production build
npm run preview    # serve the production build
npm run lint
```

You need a Firebase project for `src/firebase.ts`. The Firestore rules in `firestore.rules` are the ones the live site runs against.

## Deploy

The site is served by a Cloudflare Worker as static assets:

```sh
cd deploy
npx wrangler deploy
```

`deploy/wrangler.toml` owns the `golake.app/catspot` route. Build output goes to `deploy/public/`, which is gitignored and rebuilt on every deploy.

## Tech stack

| | |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite, oxlint |
| Map | Leaflet, MapLibre GL, `leaflet.markercluster` |
| Data | Cloud Firestore |
| Geospatial | `geofire-common` — geohash queries for radius search |
| Hosting | Cloudflare Workers (static assets) |

## Credits

Map tiles © their respective providers. Type is Space Grotesk and Inter (Google Fonts).

---

Built by [Samrat](https://github.com/somearts).
