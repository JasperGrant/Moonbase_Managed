#!/usr/bin/env python3
"""Build client/shared/horizon.js from NASA LRO LOLA topography.

Takes two LOLA Gridded Data Record polar DEMs from the PDS Geosciences Node
(https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/):

  ldem_875s_20m.img/.lbl   20 m/px, 87.5 S to the pole   (near horizon, and the ground around the base)
  ldem_80s_80m.img/.lbl    80 m/px, 80 S to the pole      (far horizon, out to 290 km)

and writes, for one site, the 360-degree horizon profile (elevation angle and distance per half
degree of azimuth), a 1.5 km square of real terrain heights around the site, and a sun azimuth
where that horizon is low.

  python3 -I scripts/lola-horizon.py <dir with the four files>

Site: the "Connecting Ridge" between Shackleton and de Gerlache craters, 89.45 S 222.69 E, one of
the Artemis III candidate landing regions (NASA, 2022) and a classic high-illumination site in
LOLA studies (Mazarico et al. 2011). Heights are LOLA radii minus 1737.4 km.
"""
import json, math, os, re, sys
import numpy as np

R_MOON = 1737400.0
SITE = {"name": "Connecting Ridge (Shackleton-de Gerlache), Artemis III candidate region", "lat": -89.45, "lon": 222.69}
EYE = 2.0  # metres above the ground at the site


def load(d, stem):
    lbl = open(os.path.join(d, stem + ".lbl")).read()
    g = lambda k: float(re.search(r"^\s*%s\s*=\s*([-\d.]+)" % k, lbl, re.M).group(1))
    lines, samples = int(g("LINES")), int(g("LINE_SAMPLES"))
    scale = g("MAP_SCALE")
    data = np.memmap(os.path.join(d, stem + ".img"), dtype="<i2", mode="r", shape=(lines, samples))
    return {"h": data, "scale": scale, "k": g("SCALING_FACTOR"), "loff": g("LINE_PROJECTION_OFFSET"), "soff": g("SAMPLE_PROJECTION_OFFSET"), "n": lines}


def to_xy(lat, lon):
    """South polar stereographic, metres: x toward 90 E, y toward 0 E (up in the image)."""
    rho = 2 * R_MOON * math.tan(math.radians(90 + lat) / 2)
    return rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))


def sample(dem, x, y):
    """Bilinear height in metres at map coordinates (arrays ok). NaN outside the grid."""
    c = dem["soff"] - 0.5 + x / dem["scale"]
    r = dem["loff"] - 0.5 - y / dem["scale"]
    c0, r0 = np.floor(c).astype(int), np.floor(r).astype(int)
    ok = (c0 >= 0) & (r0 >= 0) & (c0 < dem["n"] - 1) & (r0 < dem["n"] - 1)
    c0c, r0c = np.clip(c0, 0, dem["n"] - 2), np.clip(r0, 0, dem["n"] - 2)
    fc, fr = c - c0c, r - r0c
    h = dem["h"]
    v = (h[r0c, c0c] * (1 - fc) * (1 - fr) + h[r0c, c0c + 1] * fc * (1 - fr) + h[r0c + 1, c0c] * (1 - fc) * fr + h[r0c + 1, c0c + 1] * fc * fr) * dem["k"]
    return np.where(ok, v, np.nan)


def main(d):
    near, far = load(d, "ldem_875s_20m"), load(d, "ldem_80s_80m")

    # Orientation check against named craters: floors low, massif high.
    for name, lat, lon in [("Shackleton floor", -89.9, 0), ("Malapert massif", -86.0, 0), ("de Gerlache floor", -88.5, -87.1), ("Shoemaker floor", -88.1, 44.9), ("Haworth floor", -87.4, -5.0)]:
        x, y = to_xy(lat, lon)
        print("  %-18s %8.0f m" % (name, sample(far, np.array([x]), np.array([y]))[0]), file=sys.stderr)

    sx, sy = to_xy(SITE["lat"], SITE["lon"])
    h0 = float(sample(near, np.array([sx]), np.array([sy]))[0])
    print("  site height %.0f m, %.1f km from the pole" % (h0, math.hypot(sx, sy) / 1000), file=sys.stderr)

    # Horizon: march every half degree of azimuth (clockwise from image-up = 0 E).
    step = 0.5
    azs = np.arange(0, 360, step)
    d_near = np.concatenate([np.arange(20, 5000, 20), np.arange(5000, 55000, 60)])
    d_far = np.arange(55000, 290000, 160)
    angle, dist = [], []
    for az in azs:
        ux, uy = math.sin(math.radians(az)), math.cos(math.radians(az))
        hn = sample(near, sx + ux * d_near, sy + uy * d_near)
        hf = sample(far, sx + ux * d_far, sy + uy * d_far)
        dd = np.concatenate([d_near, d_far]); hh = np.concatenate([hn, hf])
        drop = dd * dd / (2 * R_MOON)  # the Moon curves away
        ang = np.degrees(np.arctan2(hh - (h0 + EYE) - drop, dd))
        ang = np.where(np.isnan(ang), -90, ang)
        i = int(np.nanargmax(ang))
        angle.append(round(float(ang[i]), 2)); dist.append(round(float(dd[i]) / 1000, 1))

    # Real ground around the site, relative to the site, 20 m grid, 1.52 km square.
    half, gstep = 760, 20
    n = 2 * half // gstep + 1
    gx = np.linspace(-half, half, n)
    X, Y = np.meshgrid(gx, gx)  # Y is "up" in the image = scene -z
    terrain = sample(near, sx + X, sy + Y) - h0
    terrain = np.nan_to_num(terrain, nan=0.0)

    # A sun azimuth where the horizon is lowest, searched near the game's traditional sun side.
    want = 247.0
    best = min(((abs(((az - want + 180) % 360) - 180) > 45) * 999 + a, az) for a, az in zip(angle, azs))
    sun_az = float(best[1])
    print("  sun azimuth %.1f deg (horizon there %.2f deg); horizon toward Earth (az 0) %.2f deg at %.1f km" % (sun_az, best[0], angle[0], dist[0]), file=sys.stderr)
    print("  horizon: min %.2f max %.2f deg; mean %.2f" % (min(angle), max(angle), sum(angle) / len(angle)), file=sys.stderr)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "shared", "horizon.js")
    with open(out, "w") as f:
        f.write("// Generated by scripts/lola-horizon.py from NASA LRO LOLA GDR polar DEMs (LDEM_875S_20M and\n")
        f.write("// LDEM_80S_80M, PDS Geosciences Node). Do not edit; rerun the script.\n")
        f.write("// Site: %s, %.2f S %.2f E, %.0f m above the 1737.4 km sphere.\n" % (SITE["name"], -SITE["lat"], SITE["lon"], h0))
        f.write("export const SITE = %s;\n" % json.dumps({**SITE, "height_m": round(h0, 1), "eye_m": EYE}))
        f.write("// Azimuth clockwise from the direction of 0 E (toward Earth); scene -z. Degrees above level, and km away.\n")
        f.write("export const HORIZON = { step_deg: %s, angle_deg: %s, dist_km: %s };\n" % (step, json.dumps(angle), json.dumps(dist)))
        f.write("// Heights relative to the site on a %d m grid, row-major from scene (-%d, -%d) i.e. x east, then z south.\n" % (gstep, half, half))
        rows = [[round(float(v), 1) for v in terrain[n - 1 - j]] for j in range(n)]  # row 0 = scene z = -half (image up)
        f.write("export const TERRAIN = { step_m: %d, half_m: %d, n: %d, height_m: %s };\n" % (gstep, half, n, json.dumps([v for r in rows for v in r])))
        f.write("export const SUN_AZ_DEG = %s;\n" % sun_az)
    print("wrote", os.path.relpath(out), os.path.getsize(out) // 1024, "KB", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
