// Builds the Rooftop Rumble level: deck, crates, scaffolds, city skyline, crane + wrecking ball.
import * as THREE from 'three';
import { ARENA } from '/shared/arena.js';
import {
  toon, toonGradient, floorTexture, emblemTexture, concreteTexture, hazardTexture, crateTexture, yellowCrateTexture,
  plankTexture, scaffoldTexture, containerTexture, windowsTexture, fenceTexture, billboardTexture,
} from './toon.js';

function texMat(tex, color = 0xffffff, repeat = null) {
  const t = tex.clone();
  t.needsUpdate = true;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return new THREE.MeshToonMaterial({ map: t, color, gradientMap: toonGradient() });
}

function shadowed(m, cast = true, receive = true) {
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function buildArena(scene) {
  const level = new THREE.Group();
  scene.add(level);

  const floorTex = floorTexture();
  const islandTex = floorTexture('#c9d8ec', 'rgba(50,70,110,0.28)');
  const concrete = concreteTexture('#a99bc4');
  const hazard = hazardTexture();
  const crate = crateTexture();
  const ycrate = yellowCrateTexture();
  const planks = plankTexture();
  const scaffold = scaffoldTexture();
  const container = containerTexture();

  for (const b of ARENA.boxes) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    let mats;
    const side = (tex, rep) => texMat(tex, 0xffffff, rep);
    switch (b.kind) {
      case 'deck':
      case 'island': {
        const top = texMat(b.kind === 'island' ? islandTex : floorTex, 0xffffff, [w / 2, d / 2]);
        const sx = side(concrete, [d / 4, h / 2]);
        const sz = side(concrete, [w / 4, h / 2]);
        mats = [sx, sx, top, sx, sz, sz];
        break;
      }
      case 'scaffold': {
        const top = texMat(planks, 0xffffff, [w / 2, d / 2]);
        const s1 = side(scaffold, [d / 2.4, h / 2.4]);
        const s2 = side(scaffold, [w / 2.4, h / 2.4]);
        mats = [s1, s1, top, s1, s2, s2];
        break;
      }
      case 'container': {
        const s = texMat(container);
        const top = toon(0x2557c4);
        const end = toon(0x2557c4);
        mats = [end, end, top, top, s, s];
        break;
      }
      case 'crate':
        mats = texMat(crate);
        break;
      case 'crateY':
        mats = texMat(ycrate);
        break;
      case 'ledge': {
        const s = side(hazard, [w / 2, 1]);
        mats = [toon(0xb9a7c9), toon(0xb9a7c9), toon(0xd8cce8), toon(0xb9a7c9), s, s];
        break;
      }
      default:
        mats = toon(0xcccccc);
    }
    const m = shadowed(new THREE.Mesh(geo, mats));
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    level.add(m);

    // hazard trim on the top edge of decks
    if (b.kind === 'deck' || b.kind === 'island') {
      const trimMat = texMat(hazard, 0xffffff, [w / 2, 1]);
      const trimMatZ = texMat(hazard, 0xffffff, [d / 2, 1]);
      const tFront = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.35, 0.05), trimMat);
      tFront.position.set(m.position.x, b.y1 - 0.18, b.z1 + 0.01);
      const tBack = tFront.clone();
      tBack.position.z = b.z0 - 0.01;
      const tL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, d + 0.02), trimMatZ);
      tL.position.set(b.x0 - 0.01, b.y1 - 0.18, m.position.z);
      const tR = tL.clone();
      tR.position.x = b.x1 + 0.01;
      level.add(tFront, tBack, tL, tR);
    }
  }

  // painted arena circle in the middle of the roof
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: emblemTexture(), transparent: true, depthWrite: false }),
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.set(0, 0.012, 0.5);
  emblem.layers.set(1);
  level.add(emblem);

  // ---------------------------------------------------------------- the buildings under the rooftops
  const bldgTex = windowsTexture('#8f7fc0', '#ffe9a0', '#3a2f6b');
  const mainB = shadowed(new THREE.Mesh(new THREE.BoxGeometry(25.6, 70, 17.6), texMat(bldgTex, 0xffffff, [6, 14])), false, true);
  mainB.position.set(0, -37.5, 0);
  level.add(mainB);
  for (const sx of [-1, 1]) {
    const isl = new THREE.Mesh(new THREE.BoxGeometry(4.8, 60, 6.8), texMat(windowsTexture('#5d8fd6', '#fff3b0', '#203a6b'), 0xffffff, [1.5, 12]));
    isl.position.set(sx * 17.5, -32, 0);
    level.add(isl);
  }

  // ---------------------------------------------------------------- set dressing
  // light poles + bunting
  const poleMat = toon(0x3d3a4a);
  const poles = [[-12.6, 8.6], [12.6, 8.6], [-12.6, -3.8], [12.6, -3.8]];
  for (const [x, z] of poles) {
    const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), poleMat));
    p.position.set(x, 2.6, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(0xfff3b0, { emissive: 0xffd866 }));
    lamp.position.set(x, 5.3, z);
    level.add(p, lamp);
  }
  addBunting(level, [-12.6, 5, -3.8], [12.6, 5, -3.8], 26);
  addBunting(level, [-12.6, 5, 8.6], [-12.6, 5, -3.8], 12);
  addBunting(level, [12.6, 5, 8.6], [12.6, 5, -3.8], 12);

  // chain-link fence behind the scaffolds
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const x of [-10.5, 10.5]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), fenceMat.clone());
    f.material.map = f.material.map.clone();
    f.material.map.repeat.set(5 / 1.2, 2.2 / 1.2);
    f.material.map.needsUpdate = true;
    f.position.set(x, 2.4 + 1.1, -9.05);
    f.layers.set(1);
    level.add(f);
    for (const dx of [-2.5, 0, 2.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), poleMat);
      post.position.set(x + dx, 2.4 + 1.15, -9.05);
      level.add(post);
    }
  }

  // rooftop AC units / vents on the islands
  const acMat = toon(0xd8d4e8);
  for (const sx of [-1, 1]) {
    const ac = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), acMat));
    ac.position.set(sx * 19.2, 0.45, -2.6);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 16), toon(0x3d3a4a));
    fan.position.set(sx * 19.2, 0.93, -2.6);
    level.add(ac, fan);
  }

  // ---------------------------------------------------------------- skyline
  const cityColors = ['#7f8fe0', '#9f86d8', '#5f9fe0', '#c58fd0', '#6fb0d8', '#8b7ad1'];
  const rng = mulberry(1234);
  for (let i = 0; i < 70; i++) {
    const ang = rng() * Math.PI * 2;
    const r = 70 + rng() * 110;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r - 20;
    if (z > 30 && Math.abs(x) < 60) continue; // keep the camera side open
    const w = 8 + rng() * 14, d = 8 + rng() * 14, h = 20 + rng() * 70;
    const col = cityColors[(rng() * cityColors.length) | 0];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), texMat(windowsTexture(col), 0xffffff, [w / 6, h / 10]));
    b.position.set(x, h / 2 - 60, z);
    level.add(b);
    if (rng() < 0.3) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 6), toon(0x3d3a4a));
      ant.position.set(x, h - 60 + 4, z);
      level.add(ant);
    }
  }
  // billboards
  const bb1 = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: billboardTexture('POW! COLA', 'It hits back!', '#ef2f2a', '#ffd21f') }));
  bb1.position.set(-22, 9, -32);
  bb1.rotation.y = 0.35;
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: billboardTexture('BONK!', 'Rumble Rascals Live', '#2f6cf0', '#fff') }));
  bb2.position.set(24, 10, -30);
  bb2.rotation.y = -0.4;
  for (const bb of [bb1, bb2]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(16.6, 8.6, 0.4), toon(0x3d3a4a));
    frame.position.copy(bb.position);
    frame.rotation.copy(bb.rotation);
    frame.translateZ(-0.25);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 20, 6), toon(0x3d3a4a));
    leg.position.set(bb.position.x, bb.position.y - 14, bb.position.z);
    level.add(frame, bb, leg);
  }

  // clouds (puffy toon spheres, some below the rooftop to sell the height)
  const cloudMat = toon(0xffffff);
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    const n = 4 + ((rng() * 4) | 0);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rng() * 2.5, 12, 10), cloudMat);
      s.position.set(j * 2.6 - n * 1.3, rng() * 1.5, rng() * 2);
      s.scale.y = 0.75;
      c.add(s);
    }
    const ang = rng() * Math.PI * 2;
    const r = 55 + rng() * 120;
    c.position.set(Math.cos(ang) * r, i < 8 ? -25 - rng() * 20 : 25 + rng() * 35, Math.sin(ang) * r - 30);
    c.userData.drift = 0.3 + rng() * 0.6;
    c.userData.cloud = true;
    level.add(c);
  }

  // ---------------------------------------------------------------- crane + wrecking ball
  const crane = buildCrane();
  level.add(crane.group);

  // item drop markers live here
  return { level, crane };
}

function addBunting(parent, a, b, count) {
  const colors = [0xef2f2a, 0xffd21f, 0x2f6cf0, 0x2fd4b8, 0xff6fb5];
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * 0.9;
    pts.push(p);
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15101e }));
  parent.add(line);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3));
  tri.computeVertexNormals();
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * 0.9;
    const f = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    f.position.copy(p);
    f.lookAt(p.x + (B.z - A.z), p.y, p.z - (B.x - A.x));
    f.userData.flag = Math.random() * 6;
    parent.add(f);
  }
}

function buildCrane() {
  const ball = ARENA.ball;
  const group = new THREE.Group();
  const yellow = toon(0xffc61a);
  const dark = toon(0x3d3a4a);
  // tower (behind the arena)
  const towerX = 0, towerZ = -26;
  const towerH = 18;
  const tower = new THREE.Group();
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, towerH + 40, 0.25), yellow);
    leg.position.set(towerX + dx, towerH / 2 - 20, towerZ + dz);
    tower.add(leg);
  }
  for (let y = -18; y < towerH; y += 2) {
    for (const rot of [0, Math.PI / 2]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), yellow);
      brace.position.set(towerX, y, towerZ);
      brace.rotation.set(0, rot, 0.75);
      brace.translateZ(0.8);
      tower.add(brace);
    }
  }
  group.add(tower);
  // jib reaching over the arena to the pivot
  const pivot = new THREE.Vector3(...ball.pivot);
  const jibLen = pivot.z - towerZ + 4;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, jibLen), yellow);
  jib.position.set(0, towerH + 0.5, towerZ + jibLen / 2 - 2);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), toon(0xef2f2a));
  cab.position.set(0, towerH - 1, towerZ + 1.6);
  group.add(jib, cab);
  // pulley block down to the pivot
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, towerH - pivot.y, 6), dark);
  drop.position.set(pivot.x, (towerH + pivot.y) / 2, pivot.z);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), dark);
  block.position.copy(pivot);
  group.add(drop, block);

  // swinging chain + ball
  const swing = new THREE.Group();
  swing.position.copy(pivot);
  group.add(swing);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ball.length - ball.radius, 6), dark);
  chain.position.y = -(ball.length - ball.radius) / 2;
  swing.add(chain);
  const links = [];
  for (let i = 0; i < 14; i++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 5, 10), dark);
    l.position.y = -((i + 0.5) / 14) * (ball.length - ball.radius);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    swing.add(l);
    links.push(l);
  }
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(ball.radius, 24, 18), toon(0x2b2838));
  ballMesh.position.y = -ball.length;
  ballMesh.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(ball.radius * 1.0, 0.12, 8, 30), toon(0xffc61a));
  band.position.y = -ball.length;
  band.rotation.x = Math.PI / 2;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 12), dark);
  hook.position.y = -ball.length + ball.radius + 0.15;
  swing.add(ballMesh, band, hook);

  // ground warning ring under the ball
  const warn = new THREE.Mesh(
    new THREE.RingGeometry(ball.radius * 0.9, ball.radius * 1.15, 32),
    new THREE.MeshBasicMaterial({ color: 0xef2f2a, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  warn.rotation.x = -Math.PI / 2;
  warn.layers.set(1);
  group.add(warn);

  return {
    group,
    // ang/yaw from shared ballPosition()
    update(b) {
      swing.rotation.set(0, 0, 0);
      swing.rotateY(-b.yaw);
      swing.rotateZ(b.ang);
      warn.position.set(b.x, 0.03, b.z);
      const height = b.y - ball.radius;
      warn.visible = height < 2.5;
      warn.material.opacity = 0.25 + (1 - Math.min(1, Math.max(0, height) / 2.5)) * 0.5;
    },
  };
}

function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
