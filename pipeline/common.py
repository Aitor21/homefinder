"""Shared plumbing for the HomeFinder pipeline.

Design notes:
  * Every network call goes through `fetch`, which caches to pipeline/cache/.
    A warm cache means a rerun does zero network I/O -- the pipeline is idempotent
    and safe to interrupt at any point.
  * stdlib + numpy only. No requests/pandas/scipy, which keeps this installable
    on Python 3.14 where some wheels are still catching up.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
DATA = ROOT / "data"
WEB_DATA = ROOT.parent / "web" / "public" / "data"

for _d in (CACHE, DATA, WEB_DATA):
    _d.mkdir(parents=True, exist_ok=True)

# Open-Meteo and Overpass both ask for a contactable UA. Be a good citizen.
USER_AGENT = "HomeFinder/1.0 (personal relocation research)"

EARTH_R_KM = 6371.0088

_T0 = time.time()


def log(msg, indent=0):
    el = time.time() - _T0
    print(f"[{el:7.1f}s] {'  ' * indent}{msg}", flush=True)


def warn(msg):
    print(f"[WARN] {msg}", file=sys.stderr, flush=True)


# -------------------------------------------------------------------------- http


def _cache_path(key, suffix):
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)[:60]
    return CACHE / f"{safe}.{h}{suffix}"


def fetch(url, cache_key=None, data=None, binary=False, retries=4, pause=0.0, timeout=180):
    """GET/POST with a permanent on-disk cache. Returns str, or bytes if binary."""
    key = cache_key or url
    if data and not cache_key:
        key = url + "|" + hashlib.sha256(data).hexdigest()[:12]
    cp = _cache_path(key, ".bin.gz" if binary else ".txt.gz")

    if cp.exists():
        with gzip.open(cp, "rb") as fh:
            raw = fh.read()
        return raw if binary else raw.decode("utf-8")

    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                # A dropped connection yields a SHORT read, not an exception. If
                # that gets cached the corruption is permanent: every retry then
                # reads the poisoned file and fails identically, instantly.
                declared = resp.headers.get("Content-Length")
                if declared and len(raw) < int(declared):
                    raise IOError(
                        f"truncated response: {len(raw)} of {declared} bytes"
                    )
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
            # Write to a temp file and move it into place, so an interrupt during
            # the write cannot leave a half-written cache entry either.
            tmp = cp.with_suffix(cp.suffix + ".part")
            with gzip.open(tmp, "wb") as fh:
                fh.write(raw)
            tmp.replace(cp)
            if pause:
                time.sleep(pause)
            return raw if binary else raw.decode("utf-8")
        except Exception as exc:  # noqa: BLE001 - deliberately broad, we retry
            last = exc
            # Overpass returns 429/504 under load; back off generously.
            backoff = min(60, 4 * (2 ** attempt))
            if attempt < retries - 1:
                warn(f"{type(exc).__name__} on {url[:90]} -- retry in {backoff}s")
                time.sleep(backoff)
    raise RuntimeError(f"failed after {retries} attempts: {url[:120]}") from last


def fetch_json(url, **kw):
    """fetch + parse, discarding the cache entry if it turns out to be corrupt.

    Without this a single truncated response is fatal forever: the bad bytes sit
    in the cache and every retry re-reads them rather than going back to the
    network.
    """
    txt = fetch(url, **kw)
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        key = kw.get("cache_key") or url
        cp = _cache_path(key, ".txt.gz")
        if cp.exists():
            warn(f"cached response for {key[:60]} is corrupt ({len(txt)} chars) -- refetching")
            cp.unlink()
        return json.loads(fetch(url, **kw))


def fetch_file(url, filename, expect_min_bytes=0):
    """Download a large binary to cache/<filename>, stored uncompressed.

    `fetch` gzips its cache, which is pointless work for a several-hundred-MB
    zip that is already compressed. This streams straight to disk instead and
    skips the download if a plausible copy is already there.
    """
    dest = CACHE / filename
    if dest.exists() and dest.stat().st_size >= max(expect_min_bytes, 1):
        return dest

    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as fh:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        nxt = 25
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
            done += len(chunk)
            if total and done * 100 // total >= nxt:
                log(f"  {filename}: {nxt}% ({done / 1e6:.0f}/{total / 1e6:.0f} MB)", 1)
                nxt += 25
    tmp.replace(dest)
    log(f"  {filename}: {dest.stat().st_size / 1e6:.0f} MB in {time.time() - t0:.0f}s", 1)
    return dest


# The same database, run by different people, so load can be spread rather than
# piled on one host. Every entry must hold the WHOLE planet: overpass.osm.ch was
# on this list and only carries Switzerland, so it answered every other query
# with a perfectly valid, perfectly empty result. `_overpass_ok` now refuses
# anything that does not look like a full-planet answer, but the list should
# not need that safety net.
OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


def _overpass_ok(doc):
    """Is this a real answer, or an error dressed as one?

    Overpass reports a server-side timeout as HTTP 200 with a `remark` and
    whatever elements it had gathered, often none. Cached, that becomes a
    permanent "nothing here" for a whole region. A regional extract gives
    itself away with a base timestamp that is not a date.
    """
    if not isinstance(doc, dict) or "elements" not in doc:
        return False, "no elements"
    remark = str(doc.get("remark", ""))
    if "error" in remark.lower() or "timed out" in remark.lower():
        return False, remark[:120]
    base = str((doc.get("osm3s") or {}).get("timestamp_osm_base", ""))
    if not (len(base) >= 10 and base[4] == "-" and base[7] == "-"):
        return False, f"not a full-planet server (base {base!r})"
    return True, ""


def overpass(query, cache_key):
    """POST an Overpass QL query. Cached, so reruns are free.

    Tries each mirror before giving up, and waits in minutes rather than
    seconds between rounds. Overpass rate limits reset on a timescale of
    minutes: a backoff that tops out at half a minute abandons the request
    while the server is still refusing, and the caller then treats an empty
    result as "nothing there" rather than "never asked". A whole layer was
    lost that way.
    """
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    cp = _cache_path(cache_key, ".txt.gz")

    def usable(txt):
        """(doc, why). fetch() caches before anyone can look at the answer, so
        a bad one is deleted here; otherwise every retry, on every mirror,
        re-reads the same bad file from disk and fails identically. That
        happened with a response cut off mid-transfer: chunked encoding sends
        no length to check, so the half-document was cached as if whole."""
        try:
            doc = json.loads(txt)
        except json.JSONDecodeError:
            doc, why = None, "truncated or not JSON"
        else:
            ok, why = _overpass_ok(doc)
            if ok:
                return doc, ""
        if cp.exists():
            cp.unlink()
        return None, why

    # Cheap: if it is already on disk no request is made at all.
    if cp.exists():
        doc, why = usable(fetch(OVERPASS_MIRRORS[0], cache_key=cache_key,
                                data=body, retries=1, timeout=900))
        if doc is not None:
            return doc
        warn(f"cached Overpass answer for {cache_key} is unusable ({why}); refetching")

    last = None
    for round_no in range(3):
        for host in OVERPASS_MIRRORS:
            try:
                doc, why = usable(fetch(host, cache_key=cache_key, data=body,
                                        retries=2, pause=4.0, timeout=900))
                if doc is None:
                    raise RuntimeError(f"{host.split('/')[2]}: {why}")
                return doc
            except Exception as exc:  # noqa: BLE001  any mirror may be busy
                last = exc
        if round_no < 2:
            wait = 120 * (round_no + 1)
            warn(f"all Overpass mirrors busy; waiting {wait}s before retrying")
            time.sleep(wait)
    raise RuntimeError(f"every Overpass mirror refused: {type(last).__name__}")


# --------------------------------------------------------------------------- geo


def haversine(lat1, lon1, lat2, lon2):
    """Vectorised great-circle distance in km. Broadcasts like numpy."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def nearest(a_lat, a_lon, b_lat, b_lon, chunk=512):
    """For each point in A, distance (km) and index of the closest point in B.

    Chunked over A so a large POI set never materialises an NxM matrix.
    Returns (dist_km, idx); dist is +inf and idx -1 when B is empty.
    """
    a_lat = np.asarray(a_lat, dtype=np.float64)
    a_lon = np.asarray(a_lon, dtype=np.float64)
    n = a_lat.size
    if b_lat is None or len(b_lat) == 0:
        return np.full(n, np.inf), np.full(n, -1, dtype=np.int64)

    b_lat = np.asarray(b_lat, dtype=np.float64)
    b_lon = np.asarray(b_lon, dtype=np.float64)
    dist = np.empty(n, dtype=np.float64)
    idx = np.empty(n, dtype=np.int64)

    for s in range(0, n, chunk):
        e = min(s + chunk, n)
        d = haversine(a_lat[s:e, None], a_lon[s:e, None], b_lat[None, :], b_lon[None, :])
        idx[s:e] = np.argmin(d, axis=1)
        dist[s:e] = d[np.arange(e - s), idx[s:e]]
    return dist, idx


def count_within(a_lat, a_lon, b_lat, b_lon, radius_km, chunk=512):
    """How many B points lie within radius_km of each A point."""
    a_lat = np.asarray(a_lat, dtype=np.float64)
    a_lon = np.asarray(a_lon, dtype=np.float64)
    n = a_lat.size
    out = np.zeros(n, dtype=np.int32)
    if b_lat is None or len(b_lat) == 0:
        return out
    b_lat = np.asarray(b_lat, dtype=np.float64)
    b_lon = np.asarray(b_lon, dtype=np.float64)
    for s in range(0, n, chunk):
        e = min(s + chunk, n)
        d = haversine(a_lat[s:e, None], a_lon[s:e, None], b_lat[None, :], b_lon[None, :])
        out[s:e] = (d <= radius_km).sum(axis=1)
    return out


# ------------------------------------------------------------ gridded search
#
# The two functions above compare every place with every point, which is fine
# for 3,000 ski areas and hopeless for 400,000 supermarkets: 31k x 400k is twelve
# billion distances and several gigabytes per chunk. Bucketing the points into
# half-degree cells means each place only looks at its own neighbourhood.
#
# The subtle part is knowing when to stop looking. A candidate found inside the
# searched block is only the true nearest if nothing OUTSIDE the block could be
# closer, so each place carries a "safe radius": the shortest possible distance
# from it to anywhere beyond the block's edge. Meridians converge, so that edge
# is nearer in longitude than in latitude away from the equator, and the bound
# uses the exact distance from a point to a meridian rather than assuming a
# degree of longitude is a fixed length. Results are identical to the brute
# force versions; `_grid_selftest` checks that on every call site's data shape.

_KM_PER_DEG = np.pi * EARTH_R_KM / 180.0


class _PointGrid:
    def __init__(self, lat, lon, cell):
        self.lat = np.asarray(lat, dtype=np.float64)
        self.lon = np.asarray(lon, dtype=np.float64)
        self.cell = cell
        self.ncols = int(round(360.0 / cell))
        self.nrows = int(round(180.0 / cell)) + 1
        gy, gx = self.cells(self.lat, self.lon)
        key = gy * self.ncols + gx
        self.order = np.argsort(key, kind="stable")
        ks = key[self.order]
        uniq, start = np.unique(ks, return_index=True)
        end = np.r_[start[1:], len(ks)]
        self.index = {int(k): (int(s), int(e)) for k, s, e in zip(uniq, start, end)}

    def cells(self, lat, lon):
        gy = np.clip(((lat + 90.0) // self.cell).astype(np.int64), 0, self.nrows - 1)
        gx = ((lon + 180.0) // self.cell).astype(np.int64) % self.ncols
        return gy, gx

    def block(self, gy, gx, r):
        """Indices of every point within r cells of cell (gy, gx), wrapping at 180."""
        parts = []
        xs = range(self.ncols) if 2 * r + 1 >= self.ncols else range(gx - r, gx + r + 1)
        for y in range(max(0, gy - r), min(self.nrows - 1, gy + r) + 1):
            base = y * self.ncols
            for x in xs:
                se = self.index.get(base + (x % self.ncols))
                if se:
                    parts.append(self.order[se[0]:se[1]])
        return np.concatenate(parts) if parts else np.empty(0, dtype=np.int64)


def _safe_km(lat, reach_deg):
    """Shortest distance from each point to anything `reach_deg` beyond its cell."""
    along_lat = reach_deg * _KM_PER_DEG
    x = np.radians(min(90.0, reach_deg))
    along_lon = EARTH_R_KM * np.arcsin(np.clip(np.cos(np.radians(lat)) * np.sin(x), 0, 1))
    return np.minimum(along_lat, along_lon)


def _groups(grid, a_lat, a_lon):
    gy, gx = grid.cells(a_lat, a_lon)
    key = gy * grid.ncols + gx
    order = np.argsort(key, kind="stable")
    ks = key[order]
    uniq, start = np.unique(ks, return_index=True)
    end = np.r_[start[1:], len(ks)]
    for k, s, e in zip(uniq, start, end):
        yield int(k) // grid.ncols, int(k) % grid.ncols, order[s:e]


def nearest_grid(a_lat, a_lon, b_lat, b_lon, cell=0.5):
    """Same contract as `nearest`, for point sets too large to brute-force."""
    a_lat = np.asarray(a_lat, dtype=np.float64)
    a_lon = np.asarray(a_lon, dtype=np.float64)
    n = a_lat.size
    dist = np.full(n, np.inf)
    idx = np.full(n, -1, dtype=np.int64)
    if b_lat is None or len(b_lat) == 0 or n == 0:
        return dist, idx
    g = _PointGrid(b_lat, b_lon, cell)
    everything = np.arange(len(g.lat))
    for gy, gx, members in _groups(g, a_lat, a_lon):
        todo = members
        r = 1
        while len(todo):
            # Past a quarter of the planet the block is no cheaper than
            # looking at everything, and looking at everything is always right.
            full = r * cell >= 45.0
            cand = everything if full else g.block(gy, gx, r)
            if len(cand):
                d = haversine(a_lat[todo][:, None], a_lon[todo][:, None],
                              g.lat[cand][None, :], g.lon[cand][None, :])
                j = np.argmin(d, axis=1)
                dm = d[np.arange(len(todo)), j]
                ok = np.ones(len(todo), dtype=bool) if full else dm <= _safe_km(a_lat[todo], r * cell)
                dist[todo[ok]] = dm[ok]
                idx[todo[ok]] = cand[j[ok]]
                todo = todo[~ok]
            if full:
                break
            r *= 2
    return dist, idx


def count_within_grid(a_lat, a_lon, b_lat, b_lon, radius_km, cell=0.5):
    """Same contract as `count_within`, gridded."""
    a_lat = np.asarray(a_lat, dtype=np.float64)
    a_lon = np.asarray(a_lon, dtype=np.float64)
    out = np.zeros(a_lat.size, dtype=np.int32)
    if b_lat is None or len(b_lat) == 0 or a_lat.size == 0:
        return out
    g = _PointGrid(b_lat, b_lon, cell)
    for gy, gx, members in _groups(g, a_lat, a_lon):
        # Enough rings that the safe radius covers the search radius for the
        # most poleward place in the cell.
        r = 1
        while r * cell < 45.0 and (_safe_km(a_lat[members], r * cell) < radius_km).any():
            r += 1
        cand = np.arange(len(g.lat)) if r * cell >= 45.0 else g.block(gy, gx, r)
        if not len(cand):
            continue
        d = haversine(a_lat[members][:, None], a_lon[members][:, None],
                      g.lat[cand][None, :], g.lon[cand][None, :])
        out[members] = (d <= radius_km).sum(axis=1)
    return out


def _grid_selftest(seed=7):
    """The gridded search must agree with brute force, including at the date
    line and far north, which is where a lazy bound would go wrong."""
    rng = np.random.default_rng(seed)
    a_lat = np.r_[rng.uniform(-60, 72, 400), [65.0, 70.5, -46.0, 0.0]]
    a_lon = np.r_[rng.uniform(-180, 180, 400), [179.9, -179.8, 169.0, 179.99]]
    b_lat = np.r_[rng.uniform(-60, 75, 3000), [65.1, -46.2]]
    b_lon = np.r_[rng.uniform(-180, 180, 3000), [-179.9, 168.7]]
    d1, _ = nearest(a_lat, a_lon, b_lat, b_lon)
    d2, _ = nearest_grid(a_lat, a_lon, b_lat, b_lon)
    if not np.allclose(d1, d2):
        raise SystemExit(f"nearest_grid disagrees with brute force: max diff {np.max(np.abs(d1 - d2))}")
    c1 = count_within(a_lat, a_lon, b_lat, b_lon, 300.0)
    c2 = count_within_grid(a_lat, a_lon, b_lat, b_lon, 300.0)
    if not np.array_equal(c1, c2):
        raise SystemExit("count_within_grid disagrees with brute force")


# ---------------------------------------------------------------------------- io


def write_stage(name, rows):
    p = DATA / f"{name}.json"
    p.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    log(f"wrote {name}.json ({len(rows)} rows, {p.stat().st_size / 1e6:.1f} MB)")


def read_stage(name):
    p = DATA / f"{name}.json"
    if not p.exists():
        raise SystemExit(f"missing stage output {p}. Run that stage first.")
    return json.loads(p.read_text(encoding="utf-8"))


def stage_exists(name):
    return (DATA / f"{name}.json").exists()


# -------------------------------------------------------------------------- text


def strip_accents(s):
    return "".join(
        c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn"
    )


_ARTICLES = {"el", "la", "los", "las", "o", "a", "os", "as", "l", "s", "es", "sa"}


def norm_name(s):
    """Normalise a municipality name for fuzzy joining across sources.

    Spanish sources disagree constantly on article placement: INE writes
    'Coruna, A' where everyone else writes 'A Coruna'. Sorting the tokens
    sidesteps the whole problem, and dropping articles handles the rest.
    """
    s = strip_accents(s).lower()
    for ch in "/-'":
        s = s.replace(ch, " ")
    s = "".join(c if (c.isalnum() or c.isspace()) else " " for c in s)
    toks = [t for t in s.split() if t not in _ARTICLES]
    return " ".join(sorted(toks))
