// Art-directed solar system, not astronomical scale or personal-profile scores.
// One shared projection drives both the track and the moving body.
export const planetDiameter = 60;
// Centre the visible ellipse. Its unrendered focus is at x = radius * eccentricity.
export const sharedOrbit = { radius: 270, eccentricity: .46, inclination: 62, tilt: -18, period: 15000 };
export const occupiedPhase = 180;
export const orbits = [
  { texture: 'mercury', name: '水星' },
  { texture: 'venus_atmosphere', name: '金星' },
  { texture: 'earth_daymap', name: '地球' },
  { texture: 'mars', name: '火星' },
  { texture: 'jupiter', name: '木星' },
  { texture: 'saturn', name: '土星' }
// The six bodies occupy half the mean-anomaly cycle, leaving a larger trailing gap.
// Kepler motion naturally compresses and stretches the visible formation over time.
].map((body, index) => ({ ...sharedOrbit, ...body, diameter: planetDiameter, phase: index * occupiedPhase / 5 }));
export function eccentricAnomaly(meanAnomaly, eccentricity) {
  let angle = meanAnomaly;
  // Kepler's equation: M = E - e sin(E). Mean anomaly advances uniformly in time.
  for (let step = 0; step < 8; step++) {
    const correction = (angle - eccentricity * Math.sin(angle) - meanAnomaly) / (1 - eccentricity * Math.cos(angle));
    angle -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  return angle;
}
export function projectOrbit(index, angle) {
  const orbit = orbits[index];
  const inclination = orbit.inclination * Math.PI / 180;
  const tilt = orbit.tilt * Math.PI / 180;
  const x = orbit.radius * Math.cos(angle);
  const minor = orbit.radius * Math.sqrt(1 - orbit.eccentricity ** 2) * Math.sin(angle);
  const y = minor * Math.cos(inclination);
  const z = minor * Math.sin(inclination);
  // Orthographic projection keeps the silhouette balanced; z still orders depth.
  const scale = 1;
  return { x: (x * Math.cos(tilt) - y * Math.sin(tilt)) * scale,
    y: (x * Math.sin(tilt) + y * Math.cos(tilt)) * scale, z, scale, front: z >= 0 };
}
export function satellitePosition(index, elapsed = 0) {
  const orbit = orbits[index];
  const meanAnomaly = orbit.phase * Math.PI / 180 + (elapsed % orbit.period) / orbit.period * Math.PI * 2;
  return projectOrbit(index, eccentricAnomaly(meanAnomaly, orbit.eccentricity));
}
export function orbitPath(index, front) {
  const start = front ? 0 : Math.PI;
  return Array.from({ length: 97 }, (_, step) => {
    const point = projectOrbit(index, start + step / 96 * Math.PI);
    return `${step ? 'L' : 'M'}${(300 + point.x).toFixed(3)},${(280 + point.y).toFixed(3)}`;
  }).join(' ');
}
