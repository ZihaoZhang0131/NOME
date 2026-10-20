import test from 'node:test';
import assert from 'node:assert/strict';
import { orbits, occupiedPhase, eccentricAnomaly, projectOrbit, satellitePosition, orbitPath } from '../skills/nome/assets/orbit.js';

test('bodies share one ellipse and period and return after a full revolution', () => {
  assert.equal(new Set(orbits.map(o => o.diameter)).size, 1);
  for (const key of ['radius', 'eccentricity', 'inclination', 'tilt', 'period']) assert.equal(new Set(orbits.map(o => o[key])).size, 1);
  for (let i = 1; i < 6; i++) {
    assert.equal(orbitPath(i, true), orbitPath(0, true));
    assert.equal(orbitPath(i, false), orbitPath(0, false));
  }
  orbits.forEach((orbit, i) => {
    assert.deepEqual(satellitePosition(i, orbit.period), satellitePosition(i));
    for (let t = 0; t < orbit.period; t += 500) {
      const p = satellitePosition(i, t);
      assert.equal(p.front, p.z >= 0);
      assert.equal(p.scale, 1);
      assert.ok(Math.abs(p.x) + orbit.diameter / 2 < 295);
      assert.ok(Math.abs(p.y) + orbit.diameter / 2 < 260);
    }
  });
});

test('the elongated orthographic ellipse is centred while preserving front and rear depth', () => {
  orbits.forEach((orbit, i) => {
    const rear = projectOrbit(i, Math.PI * 1.5);
    const front = projectOrbit(i, Math.PI * .5);
    assert.ok(rear.z < 0 && front.z > 0);
    assert.equal(rear.scale, front.scale);
    for (let step = 0; step < 360; step++) {
      const angle = step * Math.PI / 180;
      const p = projectOrbit(i, angle), opposite = projectOrbit(i, angle + Math.PI);
      assert.ok(Math.hypot(p.x + opposite.x, p.y + opposite.y) < 1e-10);
    }
    const minor = orbit.radius * Math.sqrt(1 - orbit.eccentricity ** 2) * Math.cos(orbit.inclination * Math.PI / 180);
    assert.ok(orbit.radius / minor > 2.3);
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


function inPlane(p) {
  const tilt = -orbits[0].tilt * Math.PI / 180;
  const inclination = orbits[0].inclination * Math.PI / 180;
  return { x: (p.x * Math.cos(tilt) - p.y * Math.sin(tilt)) / p.scale,
    y: (p.x * Math.sin(tilt) + p.y * Math.cos(tilt)) / p.scale / Math.cos(inclination) };
}

test('the half-orbit formation preserves phase spacing and keeps every enlarged body centre visible', () => {
  const { radius: a, eccentricity: e, period } = orbits[0];
  const b = a * Math.sqrt(1 - e * e);
  const mean = p => {
    const { x, y } = inPlane(p);
    const E = Math.atan2(y / b, x / a);
    return E - e * Math.sin(E);
  };
  for (let elapsed = 0; elapsed <= period * 3; elapsed += 500) {
    const points = orbits.map((_, i) => satellitePosition(i, elapsed));
    points.forEach((p, i) => {
      const { x, y } = inPlane(p);
      assert.ok(Math.abs((x / a) ** 2 + (y / b) ** 2 - 1) < 1e-10);
      const next = points[(i + 1) % 6];
      const gap = (mean(next) - mean(p) + Math.PI * 2) % (Math.PI * 2);
      const expectedGap = (i === 5 ? 360 - occupiedPhase : occupiedPhase / 5) * Math.PI / 180;
      assert.ok(Math.abs(gap - expectedGap) < 1e-10);
      for (let j = i + 1; j < 6; j++) {
        const hoveredRadius = Math.max(orbits[i].diameter, orbits[j].diameter) / 2 * 1.18;
        assert.ok(Math.hypot(p.x - points[j].x, p.y - points[j].y) > hoveredRadius);
      }
    });
  }
});

test('Kepler solver is periodic and handles circular and eccentric orbits', () => {
  for (const e of [0, .28, .7]) for (let M = -Math.PI * 2; M <= Math.PI * 4; M += .1) {
    const E = eccentricAnomaly(M, e);
    assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-11);
  }
});

test('equal areas are swept in equal time, with faster periapsis and a shorter period', () => {
  const { radius: a, eccentricity: e, period, phase } = orbits[0];
  assert.equal(period, 30000 / 2);
  assert.ok((1 + e) / (1 - e) > 2.5);
  const delta = period / 90000;
  const velocity = time => {
    const before = inPlane(satellitePosition(0, time - delta));
    const after = inPlane(satellitePosition(0, time + delta));
    return { x: (after.x - before.x) / (2 * delta), y: (after.y - before.y) / (2 * delta) };
  };
  const expectedAreaRate = Math.PI * a * a * Math.sqrt(1 - e * e) / period;
  for (let time = 0; time < period; time += 500) {
    const p = inPlane(satellitePosition(0, time)), v = velocity(time);
    assert.ok(Math.abs(((p.x - a * e) * v.y - p.y * v.x) / 2 / expectedAreaRate - 1) < 1e-7);
  }
  const periapsis = -phase / 360 * period;
  const near = velocity(periapsis), far = velocity(periapsis + period / 2);
  assert.ok(Math.abs(Math.hypot(near.x, near.y) / Math.hypot(far.x, far.y) - (1 + e) / (1 - e)) < 1e-7);
});

test('the initial formation covers half of the visible track', () => {
  const { radius: a, eccentricity: e, inclination } = orbits[0];
  const b = a * Math.sqrt(1 - e * e) * Math.cos(inclination * Math.PI / 180);
  const length = (start, end) => {
    const steps = 1200;
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
      const angle = start + (end - start) * i / steps;
      sum += (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2) * Math.hypot(a * Math.sin(angle), b * Math.cos(angle));
    }
    return sum * (end - start) / steps / 3;
  };
  const first = eccentricAnomaly(orbits[0].phase * Math.PI / 180, e);
  const last = eccentricAnomaly(orbits[5].phase * Math.PI / 180, e);
  const coverage = length(first, last) / length(0, Math.PI * 2);
  assert.ok(Math.abs(coverage - 1 / 2) < 1e-10);
  assert.equal(occupiedPhase, 180);
});

test('each enlarged body has an independently reachable round target on mobile and desktop', () => {
  for (const atlasWidth of [307.2, 374.4, 662.4, 930]) {
    const scale = atlasWidth / 600;
    for (let elapsed = 0; elapsed < orbits[0].period; elapsed += 250) {
      const points = orbits.map((orbit, index) => {
        const p = satellitePosition(index, elapsed);
        return { x: p.x * scale, y: p.y * scale, diameter: orbit.diameter * scale };
      });
      points.forEach((point, i) => {
        const hitRadius = Math.max(44, point.diameter + 16) / 2;
        points.forEach((other, j) => {
          if (i !== j) assert.ok(Math.hypot(point.x - other.x, point.y - other.y) > hitRadius, 'a neighbouring target must not cover another planet centre');
        });
      });
    }
  }
});
