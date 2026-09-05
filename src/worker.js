/**
 * Hosted keyless proxy for God's Eye View.
 *
 * Mirrors the official Vite middleware surface for public, no-key feeds.
 * Secret-bearing routes (OpenAI, AISStream, Google Places, key setup) stay
 * disabled so this public Worker cannot spend anyone's quota.
 *
 * Every upstream host is allowlisted. Clients cannot pass an arbitrary URL.
 */

const UA = 'gods-eye-view-desk/1.0 (+https://github.com/MastersX888/gods-eye-view)';
const CELESTRAK_UA = 'gods-eye-view-celestrak-proxy/1.0 (+https://github.com/bilawalsidhu/gods-eye-view)';

const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const RADIO_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];

const CCTV_IMAGE_HOSTS = new Set([
  'cctv.austinmobility.io',
  'cwwp2.dot.ca.gov',
  's3-eu-west-1.amazonaws.com',
]);

const GBFS_HOSTS = new Set([
  'gbfs.bcycle.com',
  'gbfs.citibikenyc.com',
  'gbfs.divvybikes.com',
  'gbfs.baywheels.com',
  'gbfs.capitalbikeshare.com',
  'gbfs.citi-bike-nyc.com',
  'layer.bicyclesharing.net',
  'gbfs.nextbike.net',
  'madrid.publicbikesystem.net',
  'gbfs.urbansharing.com',
]);

const HUD_UNCONFIGURED = {
  configured: false,
  code: 'OPENAI_NOT_CONFIGURED',
  error: null,
  summary: null,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, url);
      } catch (error) {
        return json({ error: 'Proxy error' }, 502);
      }
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return json({ error: 'Static assets not bound' }, 500);
  },
};

async function handleApi(request, url) {
  const path = url.pathname;

  if (path === '/api/opensky') return proxyOpenSky();
  if (path === '/api/opensky-track') return proxyOpenSkyTrack(url);
  if (path === '/api/adsblol/mil') return proxyText('https://api.adsb.lol/v2/mil', { accept: 'application/json' });
  if (path === '/api/adsblol/trace') return proxyAdsbTrace(url);
  if (path.startsWith('/api/celestrak/')) return proxyCelestrak(path.slice('/api/celestrak/'.length));
  if (path === '/api/launches') return proxyLaunches();
  if (path.startsWith('/api/adsbdb/')) return proxyAdsbdb(path);
  if (path === '/api/overpass') return proxyOverpass(request);
  if (path === '/api/route') return proxyRoute(url);
  if (path === '/api/terrain/heights') return proxyTerrain(url);
  if (path === '/api/weather-effects') return proxyWeather(url);
  if (path === '/api/military-installations') return proxyMilitaryInstallations(url);
  if (path.startsWith('/api/radio/')) return proxyRadio(request, url);
  if (path.startsWith('/api/gbfs/')) return proxyGbfs(path.slice('/api/gbfs/'.length));
  if (path.startsWith('/api/cctv/')) return proxyCctv(path, url);
  if (path.startsWith('/api/tomtom')) return proxyTomtom(path);
  if (path.startsWith('/api/firms')) return json({ hasKey: false, lastFetch: null, count: null, stale: false, ttlMs: 0, transactions: null });
  if (path.startsWith('/api/ais-live')) return json({ error: 'AISStream is not configured on this hosted desk' }, 503);
  if (path === '/api/openai/hud-summary') return json(HUD_UNCONFIGURED);
  if (path === '/api/realtime/token' || path === '/api/realtime/debug-log') {
    return json({ error: 'Voice is disabled on the hosted desk' }, 503);
  }
  if (path.startsWith('/api/google/')) {
    return json({ error: 'Google Places is not configured on this hosted desk' }, 503);
  }
  if (path.startsWith('/api/setup/')) {
    return json({ error: 'Provider Settings stay local. This hosted desk does not accept keys.' }, 403);
  }

  return json({ error: 'Unknown API route' }, 404);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': extra.cache || 'no-store',
      ...extra.headers,
    },
  });
}

function text(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': extra.type || 'text/plain; charset=utf-8',
      'cache-control': extra.cache || 'no-store',
      ...extra.headers,
    },
  });
}

async function cappedText(response, maxBytes = 2_000_000) {
  const buf = await response.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error('upstream too large');
  return new TextDecoder().decode(buf);
}

async function proxyText(upstreamUrl, { accept, ua } = {}) {
  const upstream = await fetch(upstreamUrl, {
    headers: {
      'user-agent': ua || UA,
      accept: accept || '*/*',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await cappedText(upstream, 4_000_000);
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  });
}

async function proxyOpenSky() {
  const headers = { 'user-agent': UA, accept: 'application/json' };
  let upstream = await fetch('https://opensky-network.org/api/states/all?extended=1', {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!upstream.ok) {
    upstream = await fetch('https://api.adsb.lol/v2/lat/39.1/lon/-94.6/dist/250', {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
  }
  const body = await cappedText(upstream, 6_000_000);
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-opensky-used-mode': 'anon',
    },
  });
}

async function proxyOpenSkyTrack(url) {
  const icao24 = String(url.searchParams.get('icao24') || '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(icao24)) return json({ error: 'invalid icao24' }, 400);
  return proxyText(`https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=0`, {
    accept: 'application/json',
  });
}

async function proxyAdsbTrace(url) {
  const hex = String(url.searchParams.get('hex') || '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return json({ error: 'invalid hex' }, 400);
  return proxyText(`https://adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`, {
    accept: 'application/json',
  });
}

async function proxyCelestrak(group) {
  const name = decodeURIComponent(group.split('?')[0] || '');
  if (!/^[a-z0-9-]+$/i.test(name)) return text('invalid group', 400);
  const upstream = new URL('https://celestrak.org/NORAD/elements/gp.php');
  upstream.searchParams.set('GROUP', name);
  upstream.searchParams.set('FORMAT', 'tle');
  const res = await fetch(upstream, {
    headers: { 'user-agent': CELESTRAK_UA },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await cappedText(res, 2_000_000);
  if (!res.ok || !/^1 /m.test(body)) return text('celestrak unavailable', 502);
  return text(body, 200, { cache: 'public, max-age=3600', headers: { 'x-tle-cache': 'MISS' } });
}

async function proxyLaunches() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  const upstream = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
  upstream.searchParams.set('net__gte', start.toISOString());
  upstream.searchParams.set('net__lte', end.toISOString());
  upstream.searchParams.set('limit', '100');
  upstream.searchParams.set('mode', 'detailed');
  return proxyText(upstream, { accept: 'application/json' });
}

async function proxyAdsbdb(path) {
  const typeMatch = path.match(/^\/api\/adsbdb\/type\/([0-9a-z]+)$/i);
  const routeMatch = path.match(/^\/api\/adsbdb\/route\/([^/]+)$/i);
  let upstream;
  if (typeMatch) {
    upstream = `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(typeMatch[1].toLowerCase())}`;
  } else if (routeMatch) {
    upstream = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(routeMatch[1])}`;
  } else {
    return json({ error: 'not found' }, 404);
  }
  return proxyText(upstream, { accept: 'application/json' });
}

async function proxyOverpass(request) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const body = await request.text();
  if (body.length > 20_000) return json({ error: 'Overpass query too large' }, 413);
  if (!body.trim()) return json({ error: 'Missing Overpass query body' }, 400);
  if (!/\bbox:|\baround:|\(/.test(body) || /\bgeom\b[\s\S]{0,40}out\s+skel\s+qt/i.test(body) && body.length > 12_000) {
    // Keep the query bounded: require a bbox or around clause.
  }
  if (!/\bbox:|\baround:/.test(body)) return json({ error: 'Overpass query must include bbox or around' }, 400);

  let lastError = 'unavailable';
  for (const host of OVERPASS_HOSTS) {
    try {
      const upstream = await fetch(host, {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(body)}`,
        signal: AbortSignal.timeout(25_000),
      });
      if (!upstream.ok) {
        lastError = `HTTP ${upstream.status}`;
        continue;
      }
      const textBody = await cappedText(upstream, 4_000_000);
      return new Response(textBody, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    } catch (error) {
      lastError = error?.message || 'fetch failed';
    }
  }
  return json({ error: `Overpass unavailable (${lastError})` }, 503);
}

async function proxyRoute(url) {
  const profile = String(url.searchParams.get('profile') || 'foot');
  const coords = String(url.searchParams.get('coords') || '');
  const osrmProfile = profile === 'bike' ? 'bike' : profile === 'car' ? 'car' : 'foot';
  if (!/^[-0-9.,;]+$/.test(coords) || coords.length > 400) return json({ error: 'invalid coords' }, 400);
  const upstream = `https://routing.openstreetmap.de/routed-${osrmProfile}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  return proxyText(upstream, { accept: 'application/json' });
}

async function proxyTerrain(url) {
  const raw = url.searchParams.get('points');
  if (!raw) return json({ error: 'invalid points parameter — expected "lon,lat;lon,lat;…"' }, 400);
  const pairs = raw.split(';').map((part) => part.trim()).filter(Boolean);
  if (!pairs.length || pairs.length > 256) {
    return json({ error: 'invalid or too many points' }, 400);
  }
  const points = [];
  for (const pair of pairs) {
    const [lon, lat] = pair.split(',').map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return json({ error: 'invalid points parameter — expected "lon,lat;lon,lat;…"' }, 400);
    }
    points.push([lon, lat]);
  }
  const upstream = new URL('https://terrain.reearth.land/heights.json');
  upstream.searchParams.set('lnglats', points.map(([lon, lat]) => `${lon},${lat}`).join('|'));
  const res = await fetch(upstream, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return json({ error: 'terrain unavailable' }, 503);
  const payload = JSON.parse(await cappedText(res, 1_000_000));
  const results = points.map(([lon, lat], index) => {
    const row = Array.isArray(payload) ? payload[index] : payload?.results?.[index];
    const ellipsoid = Number(row?.ellipsoid ?? row?.height ?? row?.h ?? row);
    return Number.isFinite(ellipsoid) ? { ellipsoid } : null;
  });
  return json({ results });
}

async function proxyWeather(url) {
  const latitude = Number(url.searchParams.get('lat') ?? url.searchParams.get('latitude'));
  const longitude = Number(url.searchParams.get('lon') ?? url.searchParams.get('longitude'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return json({ error: 'Valid latitude and longitude are required' }, 400);
  }
  const upstream = new URL('https://api.open-meteo.com/v1/forecast');
  upstream.searchParams.set('latitude', String(latitude));
  upstream.searchParams.set('longitude', String(longitude));
  upstream.searchParams.set('current', 'temperature_2m,weather_code,cloud_cover,wind_speed_10m');
  const res = await fetch(upstream, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return json({ error: 'Weather effects are temporarily unavailable' }, 503);
  const data = JSON.parse(await cappedText(res, 200_000));
  return json({
    status: 'ready',
    retrievedAt: new Date().toISOString(),
    coordinates: { latitude, longitude },
    weather: data.current || data,
  });
}

async function proxyMilitaryInstallations(url) {
  const south = Number(url.searchParams.get('south'));
  const west = Number(url.searchParams.get('west'));
  const north = Number(url.searchParams.get('north'));
  const east = Number(url.searchParams.get('east'));
  if (![south, west, north, east].every(Number.isFinite)) {
    return json({ error: 'bounded bbox required' }, 400);
  }
  if (Math.abs(north - south) > 8 || Math.abs(east - west) > 8) {
    return json({ error: 'bbox too large' }, 400);
  }
  const query = `[out:json][timeout:20];(
    nwr["military"~"airfield|base|barracks|naval_base|office|range"](${south},${west},${north},${east});
  );out center tags;`;
  return proxyOverpass(new Request(url.origin + '/api/overpass', { method: 'POST', body: query }));
}

async function proxyRadio(request, url) {
  if (url.pathname === '/api/radio/stations') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    let lastError = 'unavailable';
    for (const host of RADIO_HOSTS) {
      try {
        const upstream = new URL(host + '/json/stations/search');
        upstream.searchParams.set('hidebroken', 'true');
        upstream.searchParams.set('limit', '750');
        upstream.searchParams.set('order', 'clickcount');
        upstream.searchParams.set('reverse', 'true');
        const res = await fetch(upstream, {
          headers: { 'user-agent': UA, accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
          redirect: 'error',
        });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        const rows = JSON.parse(await cappedText(res, 3_000_000));
        if (!Array.isArray(rows)) continue;
        const stations = rows.slice(0, 750).map((station) => ({
          id: station.stationuuid,
          name: station.name,
          lat: Number(station.geo_lat ?? station.latitude),
          lon: Number(station.geo_long ?? station.longitude),
          streamUrl: station.url_resolved || station.url,
          homepage: station.homepage,
          tags: station.tags,
          languages: station.language,
          state: station.state,
          country: station.country,
          countryCode: station.countrycode,
          metadataTrust: 'directory',
          codec: station.codec,
          bitrate: Number(station.bitrate) || 0,
        })).filter((station) => station.id && Number.isFinite(station.lat) && Number.isFinite(station.lon));
        return json({
          stations,
          updatedAt: new Date().toISOString(),
          stale: false,
          degraded: stations.length < 50,
          degradedReason: stations.length < 50 ? 'station-coverage-below-policy' : null,
          coverage: { successfulQueries: 1, totalQueries: 1, stationCount: stations.length, healthyStationMinimum: 50 },
          acceptedGeneration: 1,
          catalogInstance: 'hosted-desk',
        });
      } catch (error) {
        lastError = error?.message || 'fetch failed';
      }
    }
    return json({ error: 'Radio directory is temporarily unavailable', degraded: true, degradedReason: lastError }, 503);
  }

  const click = url.pathname.match(/^\/api\/radio\/click\/([0-9a-f-]+)$/i);
  if (click) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
  return json({ error: 'Unknown radio route' }, 404);
}

async function proxyGbfs(encoded) {
  let target;
  try {
    target = new URL(decodeURIComponent(encoded));
  } catch {
    return json({ error: 'invalid GBFS url' }, 400);
  }
  if (target.protocol !== 'https:' || !GBFS_HOSTS.has(target.hostname)) {
    return json({ error: 'GBFS host not allowlisted' }, 400);
  }
  return proxyText(target, { accept: 'application/json' });
}

async function proxyCctv(path, url) {
  if (path === '/api/cctv/sources') {
    const sources = await loadCctvSources();
    return json({ sources });
  }
  if (path === '/api/cctv/health') {
    return json({ cameras: {} });
  }
  const frame = path.match(/^\/api\/cctv\/frame\/(.+)$/);
  const media = path.match(/^\/api\/cctv\/media\/(.+)$/);
  const stream = path.match(/^\/api\/cctv\/stream\/(.+)$/);
  if (stream) {
    const sources = await loadCctvSources();
    const camera = sources.find((item) => item.id === decodeURIComponent(stream[1]));
    return json({
      id: camera?.id || decodeURIComponent(stream[1]),
      feedType: camera?.feedType || 'image',
      url: camera?.url || null,
    });
  }
  if (frame || media) {
    const sources = await loadCctvSources();
    const id = decodeURIComponent((frame || media)[1]);
    const camera = sources.find((item) => item.id === id);
    if (!camera?.url) return json({ error: 'No media URL configured for this camera' }, 404);
    let mediaUrl;
    try {
      mediaUrl = new URL(camera.url);
    } catch {
      return json({ error: 'Invalid camera URL' }, 404);
    }
    if (mediaUrl.protocol !== 'https:' || !CCTV_IMAGE_HOSTS.has(mediaUrl.hostname)) {
      return json({ error: 'Camera host not allowlisted' }, 400);
    }
    const upstream = await fetch(mediaUrl, {
      headers: { 'user-agent': 'gods-eye-view-cctv-proxy/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'image/jpeg',
        'cache-control': 'no-store',
      },
    });
  }
  return json({ error: 'not found' }, 404);
}

async function loadCctvSources() {
  const sources = [];
  try {
    const austin = await fetch('https://data.austintexas.gov/api/views/b4k4-adkb/rows.json?accessType=DOWNLOAD', {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (austin.ok) {
      const payload = JSON.parse(await cappedText(austin, 3_000_000));
      const columns = payload.meta?.view?.columns || [];
      const index = Object.fromEntries(columns.map((col, i) => [col.fieldName || col.name, i]));
      for (const row of payload.data || []) {
        const cameraId = String(row[index.camera_id] || row[index.cameraid] || '').trim();
        const lat = Number(row[index.location_latitude] || row[index.latitude]);
        const lon = Number(row[index.location_longitude] || row[index.longitude]);
        if (!cameraId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        sources.push({
          id: `austin:${cameraId}`,
          name: String(row[index.camera_name] || row[index.location_name] || cameraId),
          city: 'Austin',
          cityId: 'austin',
          provider: 'Austin Transportation',
          lat,
          lon,
          headingDeg: 0,
          headingConfidence: '',
          pitchDeg: -18,
          fovDeg: 62,
          rangeM: 180,
          mountHeightM: 8,
          groundElevationM: null,
          feedType: 'image',
          sourceKind: 'configured',
          poseSource: 'published',
          license: 'public',
          url: `https://cctv.austinmobility.io/image/${encodeURIComponent(cameraId)}.jpg`,
        });
      }
    }
  } catch {
    // Catalog is best-effort; the globe still has bundled seeds.
  }

  try {
    const tfl = await fetch('https://api.tfl.gov.uk/Place/Type/JamCam', {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (tfl.ok) {
      const rows = JSON.parse(await cappedText(tfl, 2_000_000));
      for (const place of Array.isArray(rows) ? rows : []) {
        const lat = Number(place.lat);
        const lon = Number(place.lon);
        const id = String(place.id || '').replace(/^JamCams_/, '');
        if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        sources.push({
          id: `tfl:${id}`,
          name: place.commonName || id,
          city: 'London',
          cityId: 'london',
          provider: 'TfL JamCam',
          lat,
          lon,
          headingDeg: 0,
          headingConfidence: '',
          pitchDeg: -18,
          fovDeg: 62,
          rangeM: 180,
          mountHeightM: 8,
          groundElevationM: null,
          feedType: 'image',
          sourceKind: 'configured',
          poseSource: 'published',
          license: 'public',
          url: `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${id}.jpg`,
        });
      }
    }
  } catch {
    // same
  }
  return sources;
}

function proxyTomtom(path) {
  if (path === '/api/tomtom/status' || path === '/api/tomtom/status/') {
    return json({ hasKey: false, dailyCount: 0, budget: 0, date: new Date().toISOString().slice(0, 10) });
  }
  return json({ error: 'no_key' }, 503);
}
