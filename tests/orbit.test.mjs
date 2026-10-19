import test from 'node:test';
import assert from 'node:assert/strict';
import { orbits, sunRadius, projectOrbit, satellitePosition, orbitPath } from '../skills/nome/assets/orbit.js';

test('bodies share one plane and speed and return after a full revolution', () => {
  for (const key of ['radius', 'inclination', 'tilt', 'period']) assert.equal(new Set(orbits.map(o => o[key])).size, 1);
  for (let i = 1; i < 6; i++) {
    assert.equal(orbitPath(i, true), orbitPath(0, true));
    assert.equal(orbitPath(i, false), orbitPath(0, false));
  }
  orbits.forEach((orbit, i) => {
    assert.deepEqual(satellitePosition(i, orbit.period), satellitePosition(i));
    const start = satellitePosition(i);
    const half = satellitePosition(i, orbit.period / 2);
    assert.ok(Math.abs(start.z + half.z) < 1e-10);
    for (let t = 0; t < orbit.period; t += 500) {
      const p = satellitePosition(i, t);
      assert.equal(p.front, p.z >= 0);
      assert.ok(p.scale > .78 && p.scale < 1.35);
      assert.ok(Math.abs(p.x) + orbit.diameter * p.scale / 2 < 285);
      assert.ok(Math.abs(p.y) + orbit.diameter * p.scale / 2 < 260);
    }
  });
});

test('every orbital plane crosses behind the opaque sun and back in front', () => {
  orbits.forEach((orbit, i) => {
    const rear = projectOrbit(i, Math.PI * 1.5);
    const front = projectOrbit(i, Math.PI * .5);
    assert.ok(rear.z < 0 && front.z > 0);
    assert.ok(Math.hypot(rear.x, rear.y) - orbit.diameter * rear.scale / 2 < sunRadius);
    assert.ok(rear.scale < 1 && front.scale > 1);
  });
});

test('front and rear tracks use the same 3D projection as their bodies', () => {
  orbits.forEach((_, i) => {
    for (const front of [false, true]) {
      const points = [...orbitPath(i, front).matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
      assert.equal(points.length, 97);
      points.forEach((match, step) => {
        const p = projectOrbit(i, (front ? 0 : Math.PI) + step / 96 * Math.PI);
        assert.ok(Math.abs(Number(match[1]) - 300 - p.x) < .00051);
        assert.ok(Math.abs(Number(match[2]) - 280 - p.y) < .00051);
      });
    }
  });
});


test('satellites keep 60 degree spacing without catching up or overlapping over repeated revolutions', () => {
  const tilt = -orbits[0].tilt * Math.PI / 180;
  const inclination = orbits[0].inclination * Math.PI / 180;
  const angle = p => Math.atan2((p.x / p.scale * Math.sin(tilt) + p.y / p.scale * Math.cos(tilt)) / Math.cos(inclination), p.x / p.scale * Math.cos(tilt) - p.y / p.scale * Math.sin(tilt));
  for (let elapsed = 0; elapsed <= orbits[0].period * 3; elapsed += 500) {
    const points = orbits.map((_, i) => satellitePosition(i, elapsed));
    points.forEach((p, i) => {
      const next = points[(i + 1) % 6];
      const gap = (angle(next) - angle(p) + Math.PI * 2) % (Math.PI * 2);
      assert.ok(Math.abs(gap - Math.PI / 3) < 1e-10);
      for (let j = i + 1; j < 6; j++) {
        const radii = (orbits[i].diameter * p.scale + orbits[j].diameter * points[j].scale) / 2;
        assert.ok(Math.hypot(p.x - points[j].x, p.y - points[j].y) > radii + 8);
      }
    });
  }
});
