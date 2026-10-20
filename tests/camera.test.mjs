import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraPose } from '../skills/nome/assets/camera.js';
import { orbits, satellitePosition } from '../skills/nome/assets/orbit.js';

test('camera keeps every selected body in the reading area across viewports and orbital phases', () => {
  for (const [viewportWidth, viewportHeight] of [[1440, 900], [800, 600], [390, 844], [320, 568]]) {
    const mobile = viewportWidth <= 760;
    const width = Math.min(viewportWidth * (mobile ? .96 : .86), viewportHeight * (mobile ? .94 : .92), 930);
    const height = width * 560 / 600;
    const left = (viewportWidth - width) / 2, top = (viewportHeight - height) / 2;
    orbits.forEach((orbit, i) => {
      for (const elapsed of [0, 15000, 47000]) {
        const point = satellitePosition(i, elapsed);
        const pose = cameraPose({ viewportWidth, viewportHeight, width, height, left, top, point, diameter: orbit.diameter });
        const x = left + pose.x + (width / 2 + point.x * width / 600) * pose.scale;
        const y = top + pose.y + (height / 2 + point.y * width / 600) * pose.scale;
        assert.ok(Math.abs(x - viewportWidth * (mobile ? .5 : .255)) < 1e-8);
        assert.ok(Math.abs(y - viewportHeight * (mobile ? .205 : .5)) < 1e-8);
        const radius = orbit.diameter * width / 600 * pose.scale / 2;
        const expectedWidth = mobile ? Math.min(viewportWidth * .64, viewportHeight * .28) : Math.min(viewportWidth * .36, viewportHeight * .58, 520);
        assert.ok(Math.abs(radius * 2 - expectedWidth) < 1e-8);
        assert.ok(x - radius >= 0 && x + radius <= viewportWidth * (mobile ? 1 : .52));
        assert.ok(y - radius >= 0 && y + radius < viewportHeight * (mobile ? .4 : 1));
      }
    });
  }
});
