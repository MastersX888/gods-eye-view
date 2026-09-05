# Security audit — bilawalsidhu/gods-eye-view

**Scope:** malware / virus / supply-chain / hidden-exfil review of upstream `main`  
**Commit:** [`759652207fd1279ece97f0f19af566feb9a82146`](https://github.com/bilawalsidhu/gods-eye-view/commit/759652207fd1279ece97f0f19af566feb9a82146)  
**Date:** 2026-09-05  
**Verdict:** **No malware found.** This is a legitimate open-source geospatial client, not a trojanized repo.

## What was inspected

- Repository metadata (author Bilawal Sidhu / Halfpixel, MIT, GitHub-verified commit)
- `package.json` / `package-lock.json` (npmjs.org only; no unexpected install scripts)
- GitHub Actions `ci.yml` (contents: read, `npm ci`, tests, build — no secret exfil)
- Pinokio launcher (`pinokio/*`, `scripts/pinokio-*.mjs`) — localhost-only, sharing disabled
- `vite.config.js` proxy surface (allowlisted upstreams, SSRF guards, no arbitrary URL fetch)
- Application `src/` for `eval` / `new Function` / unexpected binaries
- `public/models/*.glb` magic bytes (`glTF` on every model)
- `.gitattributes` (LF normalization only)

## Findings

| Severity | Location | Finding |
|---|---|---|
| Info | whole repo | Local-first by design. Live layers go through a Vite key broker. A public host must not accept API keys. |
| Info | `vite.config.js` | Imports `spawnSync` but does not call it. Process spawning lives in setup/QA scripts only. |
| Info | lockfile | Install scripts exist only on `esbuild`, `fsevents` (macOS), `puppeteer`, and `sharp` — expected toolchain packages. |
| Info | `src/radioMarkup.test.mjs` | `new Function` is a test helper, not shipped UI. |
| Low | hosted threat model | If this Worker is public, anyone can drive the *keyless* proxies (OpenSky, CelesTrak, Overpass). That is quota/abuse risk on public APIs, not credential theft. |

## What this is not

- Not a virus, ransomware, stealer, miner, or obfuscated dropper
- Not the unrelated offensive scanner `Vyntral/god-eye`
- Not safe to expose with OpenAI / AIS / Google / TomTom / FIRMS keys in the host process

## Hosted desk policy

The Seventh City desk keeps secret-bearing routes **off**:

- `/api/setup/*` returns 403
- Voice / OpenAI / AIS / Google Places / TomTom live tiles / FIRMS stay unconfigured
- CCTV, GBFS, Overpass, and radio only contact allowlisted HTTPS hosts
