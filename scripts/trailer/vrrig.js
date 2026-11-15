// Loaded into the astronaut's page before anything else (after test/fakexr.js): the pretend headset draws
// one eye over the whole 16:9 canvas, and once the recorder says so, time stops and runs one frame at a
// time (window.rec.frame). Every frame the recorder poses the head and hands, the game runs exactly one
// frame of 1/fps seconds, and the picture comes back. Smooth footage however slow the machine draws.
(() => {
  window.fakeXROptions = { eyes: 1, fovY: 62 * Math.PI / 180, manual: false };
  const realNow = performance.now.bind(performance);
  let manual = false, vt = 0;
  performance.now = () => (manual ? vt : realNow());

  window.rec = {
    // Stop the clock: from here on only rec.frame moves it.
    manual() { vt = realNow(); manual = true; window.fakeXROptions.manual = true; const s = window.fakeXR.session; if (s?.timer) { clearInterval(s.timer); s.timer = null; } },
    install() {
      const mb = window.moonbase, T = mb.THREE, X = window.fakeXR;
      const AHEAD = new T.Vector3(0, 0, -1);
      const idx = s => mb.controllers.findIndex(c => c.userData.hand === s);
      const wp = o => o.getWorldPosition(new T.Vector3());
      const V = (x, y, z) => new T.Vector3(x, y, z);
      let height = 1.7;
      // Put a hand at a world point, pointing along a world direction.
      function hand(s, at, dir = null) {
        mb.rig.updateMatrixWorld(true);
        const local = mb.rig.worldToLocal(at.clone());
        let q = null;
        if (dir) {
          const qw = new T.Quaternion().setFromUnitVectors(AHEAD, dir.clone().normalize());
          const ql = mb.rig.getWorldQuaternion(new T.Quaternion()).invert().multiply(qw);
          q = [ql.x, ql.y, ql.z, ql.w];
        }
        X.hand(s, [local.x, local.y, local.z], q);
      }
      // Where the hand goes for the tip of the tool it holds to be at `at`, pointing along `dir`.
      function tip(s, tool, at, dir) {
        const g = mb.fx.tools[tool], qw = new T.Quaternion().setFromUnitVectors(AHEAD, dir.clone().normalize());
        hand(s, at.clone().sub(g.userData.tip.clone().applyQuaternion(qw)), dir);
      }
      Object.assign(window.rec, {
        T, V, wp, hand, tip, idx, mb, X,
        // Stand with the head over world (x, z), facing the world point (tx, tz).
        stand(x, z, tx, tz, h = height) {
          height = h;
          const to = x > 250 ? 'in' : 'out';
          if (mb.where() !== to) mb.showPlace(to);
          mb.rig.position.set(x, to === 'out' ? mb.world.height(x, z) : 0, z); mb.rig.rotation.y = Math.atan2(-(tx - x), -(tz - z));
          X.head(0, h, 0);
          mb.rig.updateMatrixWorld(true);
          for (const s of ['left', 'right']) X.hand(s, [s === 'left' ? -0.22 : 0.22, h - 0.6, -0.1], [-0.7071, 0, 0, 0.7071]);
        },
        head(yaw = 0, pitch = 0, dx = 0, dy = 0, dz = 0) { X.head(dx, height + dy, dz, yaw, pitch); },
        // One frame of the game, `ms` long, and its picture.
        frame(ms) {
          vt += ms; X.step();
          return mb.renderer.domElement.toDataURL('image/jpeg', 0.93);
        },
        // Run frames without keeping them (a tool settling, a message arriving).
        run(n, ms) { for (let i = 0; i < n; i++) { vt += ms; X.step(); } },
      });
    },
  };
})();
