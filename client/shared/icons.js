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
