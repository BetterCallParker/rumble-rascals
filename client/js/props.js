// 3D models for every item. Hand-held items are built with the grip at the origin and the
// business end pointing along +Y, so they can sit in a glove and extend along the arm.
import * as THREE from 'three';
import { toon, toonGradient, starDecalTexture, stopSignTexture, barrelTexture, crateTexture, canvasTex } from './toon.js';
import { ITEMS } from '/shared/items.js';

const cache = {};
const tex = (key, fn) => cache[key] || (cache[key] = fn());
const mat = (c, o) => toon(c, o);
const mapMat = (t) => new THREE.MeshToonMaterial({ map: t, gradientMap: toonGradient() });

function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const boxG = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function tntTexture() {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#c62a1e';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#ffe14d';
    g.fillRect(0, 96, w, 64);
    g.font = 'bold 70px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#15101e';
    g.fillText('TNT', w / 2, 152);
    g.lineWidth = 10;
    g.strokeStyle = '#15101e';
    g.strokeRect(5, 5, w - 10, w - 10);
  });
}

function melonTexture() {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#3fa535';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#1f6b1c';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 7, w);
  }, { repeat: true });
}

function beachTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    const cols = ['#ef2f2a', '#ffffff', '#2f6cf0', '#ffffff', '#ffd21f', '#ffffff'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * w) / cols.length, 0, w / cols.length + 1, h);
    });
  });
}

export function buildItem(kind) {
  const g = new THREE.Group();
  const def = ITEMS[kind];
  const add = (...m) => g.add(...m);
  switch (kind) {
    // ---------------------------------------------------------------- melee
    case 'bat':
      add(mesh(cyl(0.1, 0.045, 1.25, 14), mapMat(tex('bat', () => starDecalTexture('#e8322c'))), 0, 0.55),
        mesh(sph(0.07, 10, 8), mat(0x20161a), 0, -0.08), mesh(sph(0.1, 12, 8), mat(0xe8322c), 0, 1.17));
      break;
    case 'hammer':
      add(mesh(cyl(0.045, 0.05, 1.15, 10), mat(0xc28a4a), 0, 0.5), mesh(boxG(0.62, 0.3, 0.3), mat(0x6d6a80), 0, 1.12),
        mesh(boxG(0.2, 0.32, 0.32), mat(0xffc61a), 0, 1.12));
      break;
    case 'pan': {
      const pan = mesh(cyl(0.34, 0.28, 0.08, 20), mat(0x2b2b33), 0, 0.75);
      pan.rotation.x = Math.PI / 2;
      const inner = mesh(cyl(0.29, 0.29, 0.085, 20), mat(0x505060), 0, 0.75, 0.005);
      inner.rotation.x = Math.PI / 2;
      add(mesh(cyl(0.04, 0.05, 0.5, 8), mat(0x3a2a20), 0, 0.2), pan, inner);
      break;
    }
    case 'fish': {
      const body = mesh(sph(0.22), mat(0x4fb3d9), 0, 0.55);
      body.scale.set(0.7, 2.2, 1);
      const tail = mesh(new THREE.ConeGeometry(0.22, 0.3, 4), mat(0x2f8ab0), 0, 0);
      tail.rotation.z = Math.PI;
      tail.scale.set(1, 1, 0.3);
      add(body, tail, mesh(sph(0.07, 8, 6), mat(0xffffff), 0.1, 0.9, 0.1), mesh(sph(0.035, 6, 6), mat(0x111111), 0.15, 0.92, 0.12));
      break;
    }
    case 'sign': {
      const sign = mesh(cyl(0.45, 0.45, 0.06, 8), [mat(0xffffff), mapMat(tex('stop', stopSignTexture)), mat(0xd81e1e)], 0, 1.82);
      sign.rotation.x = Math.PI / 2;
      sign.rotation.y = Math.PI / 8;
      add(mesh(cyl(0.045, 0.045, 1.75, 8), mat(0x9a98ab), 0, 0.75), sign);
      break;
    }
    case 'wrench': {
      const jaw = mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 12, Math.PI * 1.4), mat(0xa9b0c4), 0, 0.95);
      jaw.rotation.z = -Math.PI * 0.2;
      add(mesh(boxG(0.12, 0.85, 0.06), mat(0xa9b0c4), 0, 0.4), jaw, mesh(boxG(0.14, 0.32, 0.08), mat(0xe8322c), 0, 0.05));
      break;
    }
    case 'plank':
      add(mesh(boxG(0.26, 1.75, 0.08), mat(0xb77a3e), 0, 0.75), mesh(boxG(0.06, 0.06, 0.1), mat(0x9a98ab), 0.07, 1.3, 0.02));
      break;
    case 'chair': {
      const seat = mesh(boxG(0.5, 0.05, 0.45), mat(0x8a8fa8), 0, 0.7, 0.2);
      add(mesh(cyl(0.025, 0.025, 1.2, 6), mat(0x5a5f78), -0.22, 0.5), mesh(cyl(0.025, 0.025, 1.2, 6), mat(0x5a5f78), 0.22, 0.5),
        mesh(boxG(0.5, 0.32, 0.04), mat(0x8a8fa8), 0, 1.0), seat);
      break;
    }
    case 'guitar': {
      const body = mesh(sph(0.3, 16, 12), mat(0xef2f2a), 0, 1.15);
      body.scale.set(1, 1.15, 0.35);
      const body2 = mesh(sph(0.22, 14, 10), mat(0xef2f2a), 0, 0.82);
      body2.scale.set(1, 1, 0.35);
      add(mesh(boxG(0.09, 0.85, 0.05), mat(0x5a3a1f), 0, 0.35), body, body2, mesh(cyl(0.08, 0.08, 0.13, 12), mat(0x15101e), 0, 1.05, 0.06),
        mesh(boxG(0.14, 0.18, 0.06), mat(0x3a2a20), 0, -0.1));
      break;
    }
    case 'chicken': {
      const body = mesh(sph(0.15, 12, 10), mat(0xffe14d), 0, 0.55);
      body.scale.set(0.8, 2.6, 0.8);
      add(body, mesh(sph(0.13), mat(0xffe14d), 0, 0.98), mesh(new THREE.ConeGeometry(0.05, 0.14, 6), mat(0xff8a00), 0, 0.98, 0.15),
        mesh(boxG(0.03, 0.1, 0.08), mat(0xef2f2a), 0, 1.12));
      g.children[g.children.length - 2].rotation.x = Math.PI / 2;
      break;
    }
    case 'cone': {
      const c = mesh(new THREE.ConeGeometry(0.28, 0.85, 14), mat(0xff7a1a), 0, 0.55);
      add(c, mesh(cyl(0.2, 0.235, 0.12, 14), mat(0xffffff), 0, 0.47), mesh(boxG(0.6, 0.06, 0.6), mat(0x15101e), 0, 0.1));
      break;
    }
    case 'plunger':
      add(mesh(cyl(0.035, 0.035, 0.9, 8), mat(0xc28a4a), 0, 0.45), mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc91e2e), 0, 0.95));
      g.children[1].rotation.x = Math.PI;
      break;
    case 'golfclub':
      add(mesh(cyl(0.025, 0.03, 1.4, 8), mat(0xbfc4d4), 0, 0.65), mesh(boxG(0.22, 0.12, 0.08), mat(0x6d6a80), 0.07, 1.38),
        mesh(cyl(0.05, 0.05, 0.3, 8), mat(0x15101e), 0, 0.05));
      break;
    case 'mallet': {
      const head = mesh(cyl(0.3, 0.3, 0.7, 16), mat(0xc98b45), 0, 1.25);
      head.rotation.z = Math.PI / 2;
      add(mesh(cyl(0.05, 0.05, 1.2, 8), mat(0xe8c48a), 0, 0.55), head, mesh(cyl(0.31, 0.31, 0.08, 16), mat(0xef2f2a), -0.25, 1.25),
        mesh(cyl(0.31, 0.31, 0.08, 16), mat(0xef2f2a), 0.25, 1.25));
      g.children[2].rotation.z = Math.PI / 2;
      g.children[3].rotation.z = Math.PI / 2;
      break;
    }
    case 'broom': {
      const bristles = mesh(new THREE.ConeGeometry(0.22, 0.45, 10), mat(0xe8c44a), 0, 1.6);
      bristles.rotation.x = Math.PI;
      add(mesh(cyl(0.03, 0.03, 1.5, 8), mat(0xb77a3e), 0, 0.7), bristles, mesh(cyl(0.07, 0.07, 0.08, 10), mat(0xef2f2a), 0, 1.38));
      break;
    }
    case 'lollipop': {
      const candy = mesh(cyl(0.34, 0.34, 0.08, 24), mapMat(tex('lolly', () => canvasTex(128, 128, (c, w) => {
        for (let i = 0; i < 12; i++) {
          c.fillStyle = i % 2 ? '#ff6fb5' : '#ffffff';
          c.beginPath();
          c.moveTo(w / 2, w / 2);
          c.arc(w / 2, w / 2, w / 2, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
          c.fill();
        }
      }))), 0, 1.15);
      candy.rotation.x = Math.PI / 2;
      add(mesh(cyl(0.03, 0.03, 1.0, 8), mat(0xffffff), 0, 0.5), candy);
      break;
    }
    case 'shovel': {
      const blade = mesh(boxG(0.32, 0.4, 0.04), mat(0x8a8fa8), 0, 1.35);
      add(mesh(cyl(0.035, 0.035, 1.2, 8), mat(0xb77a3e), 0, 0.55), blade, mesh(boxG(0.22, 0.05, 0.05), mat(0x15101e), 0, -0.05));
      break;
    }
    case 'pipe':
      add(mesh(cyl(0.06, 0.06, 1.25, 10), mat(0x7a8094), 0, 0.6), mesh(cyl(0.085, 0.085, 0.14, 10), mat(0x5a5f78), 0, 1.2),
        mesh(cyl(0.085, 0.085, 0.14, 10), mat(0x5a5f78), 0, 0.02));
      break;
    case 'hockeystick': {
      const blade = mesh(boxG(0.32, 0.12, 0.05), mat(0x15101e), 0.13, 1.55);
      add(mesh(boxG(0.06, 1.5, 0.04), mat(0xe8c48a), 0, 0.75), blade);
      break;
    }
    case 'torch': {
      const flame = mesh(new THREE.ConeGeometry(0.16, 0.42, 8), new THREE.MeshBasicMaterial({ color: 0xffa31a }), 0, 1.45);
      add(mesh(cyl(0.04, 0.05, 1.15, 8), mat(0x8a5524), 0, 0.55), mesh(cyl(0.11, 0.07, 0.22, 10), mat(0x3a2a20), 0, 1.15),
        flame, mesh(new THREE.ConeGeometry(0.09, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), 0, 1.4));
      g.userData.flame = flame;
      break;
    }
    // ---------------------------------------------------------------- guns (barrel along +Y)
    case 'poppistol':
      add(mesh(cyl(0.07, 0.07, 0.55, 12), mat(0x2fd4b8), 0, 0.32), mesh(boxG(0.12, 0.12, 0.25), mat(0xffd21f), 0, 0.08, -0.08),
        mesh(cyl(0.05, 0.06, 0.12, 10), mat(0xc98b45), 0, 0.63));
      break;
    case 'blunderbuss': {
      const bell = mesh(cyl(0.16, 0.07, 0.3, 14), mat(0xc9a14a), 0, 0.95);
      add(mesh(cyl(0.07, 0.07, 0.75, 10), mat(0x8a6a2a), 0, 0.45), bell, mesh(boxG(0.12, 0.3, 0.14), mat(0x6b3f1f), 0, 0.02, -0.08));
      break;
    }
    case 'raygun':
      add(mesh(cyl(0.05, 0.11, 0.5, 14), mat(0xb7bcd0), 0, 0.3), mesh(sph(0.12), mat(0x9b5cf0), 0, 0.12), mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), mat(0xff6fb5), 0, 0.4),
        mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 14), mat(0xff6fb5), 0, 0.5), mesh(sph(0.05), new THREE.MeshBasicMaterial({ color: 0x5cff8a }), 0, 0.58));
      g.children[2].rotation.x = Math.PI / 2;
      g.children[3].rotation.x = Math.PI / 2;
      break;
    case 'rocket':
      add(mesh(cyl(0.14, 0.14, 1.2, 14), mat(0x5f8a3a), 0, 0.5), mesh(cyl(0.17, 0.17, 0.12, 14), mat(0x3d3a4a), 0, 1.1),
        mesh(new THREE.ConeGeometry(0.11, 0.2, 10), mat(0xef2f2a), 0, 1.2), mesh(boxG(0.1, 0.25, 0.16), mat(0x3d3a4a), 0, 0.2, -0.16));
      break;
    case 'flamethrower':
      add(mesh(cyl(0.16, 0.16, 0.6, 14), mat(0xef2f2a), 0, 0.2, -0.18), mesh(cyl(0.05, 0.05, 0.85, 10), mat(0x5a5f78), 0, 0.55),
        mesh(cyl(0.08, 0.06, 0.12, 10), mat(0x3d3a4a), 0, 1.0), mesh(sph(0.05), new THREE.MeshBasicMaterial({ color: 0x5ab4ff }), 0, 1.08));
      break;
    case 'acidgun': {
      const tank = mesh(sph(0.2, 14, 10), new THREE.MeshToonMaterial({ color: 0x7dff4a, gradientMap: toonGradient(), emissive: 0x2f7a10 }), 0, 0.15, -0.1);
      add(mesh(cyl(0.07, 0.07, 0.6, 10), mat(0xff9420), 0, 0.45), tank, mesh(cyl(0.04, 0.04, 0.18, 8), mat(0x2f6cf0), 0, 0.82));
      break;
    }
    // ---------------------------------------------------------------- heavy
    case 'crate':
      add(mesh(boxG(0.95, 0.95, 0.95), mapMat(tex('crate', () => crateTexture()))));
      break;
    case 'barrel': {
      const r1 = mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 20), mat(0x5a5a68), 0, 0.3);
      r1.rotation.x = Math.PI / 2;
      const r2 = r1.clone();
      r2.position.y = -0.3;
      add(mesh(cyl(0.42, 0.42, 0.95, 18), [mapMat(tex('barrel', barrelTexture)), mat(0xa3150f), mat(0xa3150f)]), r1, r2);
      break;
    }
    case 'tnt':
      add(mesh(boxG(0.85, 0.85, 0.85), mapMat(tex('tnt', tntTexture))), mesh(cyl(0.02, 0.02, 0.3, 6), mat(0x3a2a20), 0, 0.55));
      break;
    case 'bomb': {
      add(mesh(sph(0.46, 18, 14), mat(0x26232e)), mesh(cyl(0.12, 0.12, 0.14, 12), mat(0x5a5a68), 0, 0.48), mesh(cyl(0.025, 0.025, 0.25, 6), mat(0xc9a14a), 0, 0.65));
      const spark = mesh(sph(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d }), 0, 0.8);
      add(spark);
      g.userData.spark = spark;
      break;
    }
    case 'tire': {
      const hub = mesh(cyl(0.2, 0.2, 0.14, 14), mat(0xbfc4d4));
      hub.rotation.x = Math.PI / 2;
      add(mesh(new THREE.TorusGeometry(0.38, 0.17, 10, 22), mat(0x26232e)), hub);
      break;
    }
    case 'watermelon': {
      const m = mesh(sph(0.45, 16, 12), mapMat(tex('melon', melonTexture)));
      m.scale.set(1, 0.82, 0.82);
      add(m);
      break;
    }
    case 'bowlingball':
      add(mesh(sph(0.4, 18, 14), mat(0x2f6cf0)), mesh(sph(0.06, 6, 6), mat(0x15101e), 0.12, 0.3, 0.22), mesh(sph(0.06, 6, 6), mat(0x15101e), -0.05, 0.33, 0.24),
        mesh(sph(0.065, 6, 6), mat(0x15101e), 0.05, 0.2, 0.32));
      break;
    case 'beachball':
      add(mesh(sph(0.55, 20, 14), mapMat(tex('beach', beachTexture))));
      break;
    case 'anvil':
      add(mesh(boxG(0.8, 0.22, 0.42), mat(0x3d3a4a), 0, 0.2), mesh(boxG(0.4, 0.35, 0.3), mat(0x3d3a4a), 0, -0.07),
        mesh(boxG(0.6, 0.12, 0.42), mat(0x3d3a4a), 0, -0.3), mesh(new THREE.ConeGeometry(0.11, 0.35, 4), mat(0x3d3a4a), 0.55, 0.2));
      g.children[3].rotation.z = -Math.PI / 2;
      break;
    case 'trashcan': {
      const lid = mesh(cyl(0.44, 0.44, 0.06, 18), mat(0x8a8fa8), 0, 0.5);
      add(mesh(cyl(0.4, 0.34, 0.95, 18), mat(0x9aa0b8)), lid, mesh(boxG(0.18, 0.05, 0.05), mat(0x5a5f78), 0, 0.56));
      break;
    }
    case 'iceblock':
      add(mesh(boxG(0.9, 0.9, 0.9), new THREE.MeshToonMaterial({ color: 0xbfeaff, gradientMap: toonGradient(), emissive: 0x2a6080 })));
      break;
    case 'penguin': {
      const body = mesh(sph(0.42, 16, 12), mat(0x26232e));
      body.scale.set(0.95, 1.2, 0.9);
      const belly = mesh(sph(0.32, 14, 10), mat(0xffffff), 0, -0.05, 0.14);
      belly.scale.set(0.9, 1.2, 0.8);
      const beak = mesh(new THREE.ConeGeometry(0.07, 0.18, 8), mat(0xff9420), 0, 0.22, 0.4);
      beak.rotation.x = Math.PI / 2;
      add(body, belly, beak, mesh(sph(0.05, 6, 6), mat(0xffffff), 0.12, 0.33, 0.33), mesh(sph(0.05, 6, 6), mat(0xffffff), -0.12, 0.33, 0.33));
      break;
    }
    // ---------------------------------------------------------------- light throwables
    case 'tomato':
      add(mesh(sph(0.2), mat(0xe8322c)), mesh(cyl(0.02, 0.06, 0.06, 6), mat(0x3fa535), 0, 0.2));
      break;
    case 'brick':
      add(mesh(boxG(0.42, 0.18, 0.2), mat(0xb5462a)));
      break;
    case 'snowball':
      add(mesh(sph(0.22, 12, 10), mat(0xf4f8ff)));
      break;
    case 'coal': {
      const c = mesh(new THREE.DodecahedronGeometry(0.2), mat(0x2b2838));
      add(c);
      break;
    }
    case 'gear': {
      const ring = mesh(cyl(0.22, 0.22, 0.08, 12), mat(0xa9b0c4));
      ring.rotation.x = Math.PI / 2;
      add(ring);
      for (let i = 0; i < 8; i++) {
        const t = mesh(boxG(0.09, 0.09, 0.08), mat(0xa9b0c4));
        const a = (i / 8) * Math.PI * 2;
        t.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0);
        t.rotation.z = a;
        add(t);
      }
      break;
    }
    case 'banana': {
      const b = mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12, Math.PI * 1.1), mat(0xffe14d));
      add(b, mesh(sph(0.03, 6, 6), mat(0x5a3a1f), 0.18, 0, 0));
      break;
    }
    case 'duck': {
      const body = mesh(sph(0.17, 12, 10), mat(0xffe14d));
      body.scale.set(1.1, 0.85, 1);
      const beak = mesh(new THREE.ConeGeometry(0.04, 0.1, 6), mat(0xff9420), 0, 0.14, 0.16);
      beak.rotation.x = Math.PI / 2;
      add(body, mesh(sph(0.11), mat(0xffe14d), 0, 0.15, 0.05), beak);
      break;
    }
    case 'pie':
      add(mesh(cyl(0.22, 0.18, 0.1, 18), mat(0xd9a05a)), mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff), 0, 0.04),
        mesh(sph(0.04, 6, 6), mat(0xef2f2a), 0, 0.22));
      break;
    case 'grenade':
      add(mesh(sph(0.18, 12, 10), mat(0x4f6b2a)), mesh(cyl(0.06, 0.06, 0.08, 8), mat(0x8a8fa8), 0, 0.19), mesh(new THREE.TorusGeometry(0.05, 0.015, 4, 10), mat(0xc9a14a), 0.06, 0.25));
      break;
    case 'acidflask': {
      const glass = mesh(sph(0.17, 12, 10), new THREE.MeshToonMaterial({ color: 0x7dff4a, gradientMap: toonGradient(), emissive: 0x2f7a10 }));
      add(glass, mesh(cyl(0.05, 0.06, 0.16, 8), mat(0xbfeaff), 0, 0.2), mesh(cyl(0.06, 0.06, 0.05, 8), mat(0x8a5524), 0, 0.3));
      break;
    }
    default:
      add(mesh(boxG(0.4, 0.4, 0.4), mat(0xff00ff)));
  }
  g.userData.kind = kind;
  g.userData.def = def;
  return g;
}

// ------------------------------------------------------------------ bullets & projectiles
const BULLET_GEO = {};
export function buildBullet(kind) {
  let m;
  switch (kind) {
    case 'cork':
      m = new THREE.Mesh(BULLET_GEO.cork || (BULLET_GEO.cork = new THREE.CylinderGeometry(0.08, 0.1, 0.18, 10)), toon(0xd9a05a));
      break;
    case 'pellet':
      m = new THREE.Mesh(BULLET_GEO.pellet || (BULLET_GEO.pellet = new THREE.SphereGeometry(0.09, 8, 6)), toon(0x3d3a4a));
      break;
    case 'ray':
      m = new THREE.Mesh(BULLET_GEO.ray || (BULLET_GEO.ray = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8)), new THREE.MeshBasicMaterial({ color: 0x5cff8a }));
      break;
    case 'rocket': {
      m = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), toon(0xdfe3f0));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), toon(0xef2f2a));
      nose.position.y = 0.36;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0xffa31a }));
      flame.position.y = -0.42;
      flame.rotation.x = Math.PI;
      m.add(body, nose, flame);
      break;
    }
    case 'flame':
      m = new THREE.Mesh(BULLET_GEO.flame || (BULLET_GEO.flame = new THREE.IcosahedronGeometry(0.4, 0)), new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, depthWrite: false }));
      m.layers.set(1);
      break;
    case 'acid':
      m = new THREE.Mesh(BULLET_GEO.acid || (BULLET_GEO.acid = new THREE.SphereGeometry(0.18, 8, 6)), new THREE.MeshToonMaterial({ color: 0x8aff4a, gradientMap: toonGradient(), emissive: 0x2f7a10 }));
      break;
    default:
      m = new THREE.Mesh(new THREE.SphereGeometry(0.1), toon(0xffffff));
  }
  m.userData.kind = kind;
  return m;
}
