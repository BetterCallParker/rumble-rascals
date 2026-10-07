// 3D models for weapons & throwables. Weapons are built with the grip at the origin
// and the business end pointing along +Y, so they can sit in a glove.
import * as THREE from 'three';
import { toon, toonGradient, starDecalTexture, stopSignTexture, barrelTexture, crateTexture } from './toon.js';
import { ITEMS } from '/shared/items.js';

const cache = {};
function tex(key, fn) {
  return cache[key] || (cache[key] = fn());
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

export function buildItem(kind) {
  const g = new THREE.Group();
  const def = ITEMS[kind];
  switch (kind) {
    case 'bat': {
      const body = mesh(
        new THREE.CylinderGeometry(0.1, 0.045, 1.25, 14),
        new THREE.MeshToonMaterial({ map: tex('bat', () => starDecalTexture('#e8322c')), gradientMap: toonGradient() }),
      );
      body.position.y = 0.55;
      const knob = mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0x20161a));
      knob.position.y = -0.08;
      const cap = mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe8322c));
      cap.position.y = 1.17;
      g.add(body, knob, cap);
      break;
    }
    case 'hammer': {
      const handle = mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.15, 10), toon(0xc28a4a));
      handle.position.y = 0.5;
      const head = mesh(new THREE.BoxGeometry(0.62, 0.3, 0.3), toon(0x6d6a80));
      head.position.y = 1.12;
      const band = mesh(new THREE.BoxGeometry(0.2, 0.32, 0.32), toon(0xffc61a));
      band.position.y = 1.12;
      g.add(handle, head, band);
      break;
    }
    case 'pan': {
      const handle = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8), toon(0x3a2a20));
      handle.position.y = 0.2;
      const pan = mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.08, 20), toon(0x2b2b33));
      pan.rotation.x = Math.PI / 2;
      pan.position.y = 0.75;
      const inner = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.085, 20), toon(0x505060));
      inner.rotation.x = Math.PI / 2;
      inner.position.set(0, 0.75, 0.005);
      g.add(handle, pan, inner);
      break;
    }
    case 'fish': {
      const bodyMat = toon(0x4fb3d9);
      const body = mesh(new THREE.SphereGeometry(0.22, 14, 10), bodyMat);
      body.scale.set(0.7, 2.2, 1);
      body.position.y = 0.55;
      const tail = mesh(new THREE.ConeGeometry(0.22, 0.3, 4), toon(0x2f8ab0));
      tail.position.y = 0.0;
      tail.rotation.z = Math.PI;
      tail.scale.set(1, 1, 0.3);
      const eyeW = mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xffffff));
      eyeW.position.set(0.1, 0.9, 0.1);
      const eyeB = mesh(new THREE.SphereGeometry(0.035, 6, 6), toon(0x111111));
      eyeB.position.set(0.15, 0.92, 0.12);
      const belly = mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0xd9f4ff));
      belly.scale.set(0.5, 1.8, 0.8);
      belly.position.set(0, 0.55, 0.1);
      g.add(body, tail, eyeW, eyeB, belly);
      break;
    }
    case 'sign': {
      const pole = mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.75, 8), toon(0x9a98ab));
      pole.position.y = 0.75;
      const sign = mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8),
        [toon(0xffffff), new THREE.MeshToonMaterial({ map: tex('stop', stopSignTexture), gradientMap: toonGradient() }), toon(0xd81e1e)],
      );
      sign.rotation.x = Math.PI / 2;
      sign.rotation.y = Math.PI / 8;
      sign.position.y = 1.82;
      g.add(pole, sign);
      break;
    }
    case 'wrench': {
      const shaft = mesh(new THREE.BoxGeometry(0.12, 0.85, 0.06), toon(0xa9b0c4));
      shaft.position.y = 0.4;
      const jaw = mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 12, Math.PI * 1.4), toon(0xa9b0c4));
      jaw.position.y = 0.95;
      jaw.rotation.z = -Math.PI * 0.2;
      const grip = mesh(new THREE.BoxGeometry(0.14, 0.32, 0.08), toon(0xe8322c));
      grip.position.y = 0.05;
      g.add(shaft, jaw, grip);
      break;
    }
    case 'crate': {
      const m = new THREE.MeshToonMaterial({ map: tex('crate', () => crateTexture()), gradientMap: toonGradient() });
      const box = mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), m);
      g.add(box);
      break;
    }
    case 'barrel': {
      const m = new THREE.MeshToonMaterial({ map: tex('barrel', barrelTexture), gradientMap: toonGradient() });
      const body = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 18), [m, toon(0xa3150f), toon(0xa3150f)]);
      const rim1 = mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 20), toon(0x5a5a68));
      rim1.rotation.x = Math.PI / 2;
      rim1.position.y = 0.3;
      const rim2 = rim1.clone();
      rim2.position.y = -0.3;
      g.add(body, rim1, rim2);
      break;
    }
    case 'tire': {
      const t = mesh(new THREE.TorusGeometry(0.38, 0.17, 10, 22), toon(0x26232e));
      const hub = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), toon(0xbfc4d4));
      hub.rotation.x = Math.PI / 2;
      g.add(t, hub);
      break;
    }
  }
  g.userData.kind = kind;
  g.userData.def = def;
  return g;
}
