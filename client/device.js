// Is this browser inside a VR headset? A headset player can only ever be the Astronaut, so the
// landing page and the astronaut's page ask this before offering anything.
//
// Two things must both be true: the browser says it can run an immersive VR session, and it calls
// itself a headset browser (Quest, Pico, Wolvic, ...). A desktop PC with a headset plugged in passes
// the first but not the second, so it counts as a laptop until its player presses Enter VR.
// Apple Vision Pro's Safari reports itself as a Mac, so it is not detected; ?device=headset forces it.
//
//   ?device=headset or ?device=laptop on any page forces the answer (tests, and a wrong guess).
const HEADSET_BROWSER = /OculusBrowser|Quest|Pico|Wolvic|VR\s?Browser|Vive/i;

export function forcedDevice() {
  const d = new URLSearchParams(location.search).get('device');
  return d === 'headset' || d === 'laptop' ? d : null;
}

export async function isHeadset() {
  const forced = forcedDevice();
  if (forced) return forced === 'headset';
  if (!HEADSET_BROWSER.test(navigator.userAgent)) return false;
  try { return !!(await navigator.xr?.isSessionSupported('immersive-vr')); } catch { return false; }
}

// A link that keeps a forced ?device= answer, so it survives going from page to page.
export function keepDevice(path) {
  const forced = forcedDevice();
  return forced ? `${path}${path.includes('?') ? '&' : '?'}device=${forced}` : path;
}
