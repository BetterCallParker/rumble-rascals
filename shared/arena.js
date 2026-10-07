// Arena layout shared by server (collision) and client (rendering).
// All static colliders are axis-aligned boxes.

function box(kind, x0, y0, z0, x1, y1, z1, extra = {}) {
  return { kind, x0, y0, z0, x1, y1, z1, ...extra };
}

export const ARENA = {
  name: 'Rooftop Rumble',
  boxes: [
    // Main rooftop deck
    box('deck', -13, -2.5, -9, 13, 0, 9),
    // Side islands across a jumpable gap
    box('island', 15, -2, -3.5, 20, 0, 3.5),
    box('island', -20, -2, -3.5, -15, 0, 3.5),
    // Raised scaffolds in the back corners
    box('scaffold', -13, 0, -9, -8, 2.4, -4.2),
    box('scaffold', 8, 0, -9, 13, 2.4, -4.2),
    // Shipping container at back center
    box('container', -3.2, 0, -9, 3.2, 2.6, -6.6),
    // Crate steps up to scaffolds / container
    box('crate', -7.6, 0, -6.4, -6.4, 1.2, -5.2),
    box('crate', 6.4, 0, -6.4, 7.6, 1.2, -5.2),
    box('crate', -4.6, 0, -8.6, -3.4, 1.2, -7.4),
    // Cover crates in the field
    box('crate', -6.2, 0, 2.4, -4.8, 1.4, 3.8),
    box('crate', 4.8, 0, 1.6, 6.2, 1.4, 3.0),
    box('crateY', 0.9, 0, 4.6, 2.1, 1.2, 5.8),
    // Low back ledge between the scaffolds (you can be thrown over it)
    box('ledge', -8, 0, -9.4, -3.2, 0.55, -9),
    box('ledge', 3.2, 0, -9.4, 8, 0.55, -9),
  ],
  spawns: [
    [-6, 0, 0], [6, 0, 0], [0, 0, -3], [0, 0, 6],
    [-9, 0, 5], [9, 0, 5], [-10, 0, -1], [10, 0, -1],
  ],
  // where the training dummy stands (and pops back to after a ring-out)
  dummySpawn: [0, 0, 2.6],
  itemSpawns: [
    [-2.5, 0, 1], [2.5, 0, -1], [-9, 0, 2], [9, 0, 2], [0, 2.6, -7.8],
    [-10.5, 2.4, -6.5], [10.5, 2.4, -6.5], [17.5, 0, 0], [-17.5, 0, 0],
    [-3, 0, 7], [3, 0, 7.5], [0, 0, -4.5],
  ],
  // Swinging wrecking ball hazard
  ball: {
    pivot: [0, 13.4, -1],
    length: 12.2,
    radius: 1.25,
    period: 7.5, // seconds per full swing
    amplitude: 0.95, // radians
    yawSpeed: 0.23, // swing plane wobble speed
  },
  bounds: { minX: -20, maxX: 20, minZ: -9.4, maxZ: 9 },
};

export function ballPosition(ball, t) {
  const ang = ball.amplitude * Math.sin((Math.PI * 2 * t) / ball.period);
  const yaw = 0.7 * Math.sin(t * ball.yawSpeed);
  const horiz = Math.sin(ang) * ball.length;
  return {
    x: ball.pivot[0] + Math.cos(yaw) * horiz,
    y: ball.pivot[1] - Math.cos(ang) * ball.length,
    z: ball.pivot[2] + Math.sin(yaw) * horiz,
    ang,
    yaw,
    // angular velocity sign/magnitude for knockback direction
    dang: Math.cos((Math.PI * 2 * t) / ball.period),
  };
}
