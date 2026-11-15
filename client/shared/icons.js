// Small pictures drawn on a 2D canvas: the tools. Mission control and the
// astronaut both use them, so a welder looks like the same welder everywhere.

// A tool, centred on (x, y), about `size` across, in one colour (a silhouette).
export function drawTool(g, tool, x, y, size, color) {
  const u = size / 100;
  g.save();
  g.translate(x, y); g.scale(u, u);
  g.fillStyle = g.strokeStyle = color;
  g.lineCap = g.lineJoin = 'round';
  if (tool === 'brush') {
    g.rotate(-0.6);
    g.fillRect(-7, -46, 14, 52);                      // handle
    g.fillRect(-24, 6, 48, 14);                       // head
    g.lineWidth = 5;
    for (let i = -20; i <= 20; i += 8) { g.beginPath(); g.moveTo(i, 20); g.lineTo(i, 44); g.stroke(); } // bristles
  } else if (tool === 'patch') {
    g.lineWidth = 8;
    g.strokeRect(-34, -34, 68, 68);                   // the patch
    g.fillRect(-7, -22, 14, 44); g.fillRect(-22, -7, 44, 14); // a cross
  } else if (tool === 'welder') {
    g.rotate(-0.5);
    g.fillRect(-14, -8, 34, 46);                      // grip
    g.fillRect(-36, -26, 60, 20);                     // barrel
    g.beginPath(); g.moveTo(-36, -26); g.lineTo(-52, -16); g.lineTo(-36, -6); g.fill(); // nozzle
    g.lineWidth = 5;
    for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(-58, -16); g.lineTo(-58 - Math.cos(a) * 14, -16 + Math.sin(a) * 14); g.stroke(); } // sparks
  } else if (tool === 'tire') {
    g.lineWidth = 16;
    g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 5;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  } else if (tool === 'gen') {
    g.fillRect(-40, -18, 80, 52);                     // body
    g.fillRect(-28, -34, 22, 16);                     // tank cap
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(-40, -18); g.lineTo(-40, -40); g.lineTo(40, -40); g.lineTo(40, -18); g.stroke(); // carry frame
    g.globalCompositeOperation = 'destination-out';   // a lightning bolt cut out of the body
    g.beginPath(); g.moveTo(8, -10); g.lineTo(-12, 12); g.lineTo(0, 12); g.lineTo(-8, 28); g.lineTo(14, 4); g.lineTo(2, 4); g.closePath(); g.fill();
  }
  g.restore();
}

// A fault's symbol, centred on (x, y), about `size` across, in one colour. Each hints at what broke; none of
// them is the tool that fixes it. The Scientist's chart, its legend and the results log all use these.
export function drawFault(g, type, x, y, size, color) {
  const u = size / 100;
  g.save();
  g.translate(x, y); g.scale(u, u);
  g.fillStyle = g.strokeStyle = color;
  g.lineCap = g.lineJoin = 'round';
  g.lineWidth = 8;
  if (type === 'dust') {                               // a tilted panel with dust on it
    g.beginPath(); g.moveTo(-40, 20); g.lineTo(-20, -30); g.lineTo(40, -30); g.lineTo(20, 20); g.closePath(); g.stroke();
    for (const [dx, dy] of [[-12, -16], [6, -8], [20, -20], [-2, 6], [-22, 2], [14, 8]]) { g.beginPath(); g.arc(dx, dy, 4.5, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(0, 20); g.lineTo(0, 42); g.stroke();
  } else if (type === 'board') {                       // a plug pulled out of its socket
    g.strokeRect(-42, -30, 30, 60);
    g.beginPath(); g.arc(-27, 0, 7, 0, 7); g.fill();
    g.fillRect(4, -14, 26, 28);
    g.beginPath(); g.moveTo(-6, -7); g.lineTo(4, -7); g.moveTo(-6, 7); g.lineTo(4, 7); g.stroke();
    g.beginPath(); g.moveTo(30, 0); g.bezierCurveTo(44, 0, 40, 30, 46, 40); g.stroke();
  } else if (type === 'wheel') {                       // a wheel with a wedge missing
    g.lineWidth = 12;
    g.beginPath(); g.arc(0, 0, 32, 0.6, Math.PI * 2 - 0.1); g.stroke();
    g.lineWidth = 6;
    for (let i = 0; i < 6; i++) { const a = 0.9 + i * 0.95; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
  } else if (type === 'hull') {                        // a zigzag crack, and a puff of air out of it
    g.beginPath(); g.moveTo(-40, -30); g.lineTo(-22, -10); g.lineTo(-30, 4); g.lineTo(-10, 20); g.lineTo(-16, 38); g.stroke();
    for (const [dx, r] of [[10, 9], [26, 12], [44, 9]]) { g.beginPath(); g.arc(dx, 4 - dx * 0.25, r, 0, 7); g.stroke(); }
  } else if (type === 'suit') {                        // a glove with a drop falling off it
    g.beginPath(); g.moveTo(-30, 34); g.lineTo(-30, -6);
    for (let i = 0; i < 4; i++) { const fx = -26 + i * 13; g.lineTo(fx, -34 + Math.abs(i - 1.5) * 4); g.lineTo(fx + 8, -34 + Math.abs(i - 1.5) * 4); g.lineTo(fx + 8, -10); }
    g.lineTo(20, 8); g.lineTo(16, 34); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(38, 4); g.quadraticCurveTo(48, 22, 38, 26); g.quadraticCurveTo(28, 22, 38, 4); g.fill();
  } else if (type === 'meteor') {                      // a streak with a tail
    g.beginPath(); g.arc(22, 22, 14, 0, 7); g.fill();
    g.lineWidth = 6; for (const o of [-10, 0, 10]) { g.beginPath(); g.moveTo(12 + o, 14 - o); g.lineTo(-38 + o, -36 - o); g.stroke(); }
  }
  g.restore();
}

// A sample's chart glyph: the same shape whatever its colour, so the chart reads without colour.
export function drawGlyph(g, glyph, x, y, size, color) {
  const r = size / 2;
  g.save(); g.fillStyle = g.strokeStyle = color; g.lineWidth = Math.max(1.5, size * 0.12);
  g.beginPath();
  if (glyph === 'diamond') { g.moveTo(x, y - r); g.lineTo(x + r * 0.75, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.75, y); g.closePath(); g.fill(); }
  else if (glyph === 'triangle') { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); g.fill(); }
  else if (glyph === 'dots') { g.arc(x, y, r * 0.9, 0, 7); g.stroke(); for (const [dx, dy] of [[-0.3, -0.2], [0.3, -0.1], [0, 0.35]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * 0.16, 0, 7); g.fill(); } }
  else if (glyph === 'star') { for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  g.restore();
}

// A picture of a sample (or its lookalike) for the field guide: the same colours and marks as the 3D rock.
// col: SAMPLE_COL from palette.js (passed in, so this file needs nothing else).
export function drawSample(g, look, x, y, size, col, foil = '#b8913f') {
  const r = size / 2;
  let a = look.length * 131; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const outline = (angular, squash = 0.75) => {
    g.beginPath();
    const n = angular ? 7 : 18;
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, rr = r * (angular ? 0.75 + rnd() * 0.3 : 0.88 + rnd() * 0.1); g[i ? 'lineTo' : 'moveTo'](x + Math.cos(t) * rr, y + Math.sin(t) * rr * squash); }
    g.closePath();
  };
  const base = { 'pale-flecked': col.anor, 'pale-plain': col.anor, 'dark-pitted': col.basalt, 'dark-smooth': col.basalt, 'ochre-beads': col.glass, 'foil-scrap': foil, 'frost-blue': col.ice, 'dusty-pale': col.dusty }[look];
  g.save();
  outline(look === 'pale-flecked' || look === 'foil-scrap', look === 'dark-smooth' ? 0.45 : look === 'ochre-beads' ? 0.6 : 0.75);
  g.fillStyle = base; g.fill();
  g.strokeStyle = 'rgba(36,34,30,0.8)'; g.lineWidth = Math.max(1, size * 0.03); g.stroke();
  g.clip();
  const dots = (n, fn) => { for (let i = 0; i < n; i++) fn(x + (rnd() - 0.5) * size, y + (rnd() - 0.5) * size * 0.7, rnd()); };
  if (look === 'pale-flecked') dots(22, (px, py, s) => { g.fillStyle = col.fleck; g.fillRect(px, py, size * (0.03 + s * 0.04), size * 0.025); });
  if (look === 'dark-pitted') dots(14, (px, py, s) => { g.fillStyle = col.pit; g.beginPath(); g.arc(px, py, size * (0.025 + s * 0.035), 0, 7); g.fill(); });
  if (look === 'ochre-beads') dots(26, (px, py, s) => { g.fillStyle = col.bead; g.beginPath(); g.arc(px, py, size * (0.02 + s * 0.025), 0, 7); g.fill(); });
  if (look === 'frost-blue') dots(40, (px, py, s) => { g.fillStyle = col.frost; g.fillRect(px, py, size * 0.02 * (1 + s), size * 0.02 * (1 + s)); });
  if (look === 'foil-scrap') dots(8, (px, py) => { g.strokeStyle = 'rgba(36,34,30,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - size * 0.12, py); g.lineTo(px + size * 0.1, py + size * 0.06); g.stroke(); });
  // a highlight, so it reads as a lump and not a blot
  g.fillStyle = 'rgba(241,226,189,0.18)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.2, r * 0.35, r * 0.18, -0.3, 0, 7); g.fill();
  g.restore();
}
