# God's Eye View — Seventh City desk

Hosted, click-to-open dashboard for [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view). The source of truth is this GitHub repo. Nothing has to keep running on the PC.

Audited upstream pin: `759652207fd1279ece97f0f19af566feb9a82146`. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md).

## Open it

After deploy, the live URL is printed by Wrangler / the GitHub Action. The desktop shortcut created on this PC points at that URL and refreshes live from public feeds (flights, satellites, launches, earthquakes, cameras).

## What works without keys

- Esri / OSM globe
- Live flights (OpenSky, with an adsb.lol regional fallback)
- Military ADS-B
- Satellites (CelesTrak)
- Space launches
- Earthquakes (USGS, browser-direct)
- Public CCTV catalogs (Austin + London)
- Radio directory
- Overpass / walking routes / terrain heights

## What stays off on purpose

Voice, live ships, NASA FIRMS, TomTom congestion, and Google place search need private keys. The official app stores those on a **localhost** Vite server. This public desk does not accept keys, so those panels stay honest-unavailable.

Photorealistic Google 3D is the same story: add a URL-restricted Cesium ion token later if you want that basemap. Until then the globe uses Esri / OSM.

## Update / redeploy

Push to `main`, or run the **Build and deploy God's Eye View** workflow. It checks out the pinned upstream SHA, builds the official client, and deploys this Worker in front of it.

Set repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` once. Do not put provider API keys in those secrets.
