// Art-directed solar system, not astronomical scale or personal-profile scores.
// One shared projection drives both the track and the moving body.
export const sunRadius = 76;
export const sharedOrbit = { radius: 220, inclination: 67, tilt: -18, period: 120000 };
export const orbits = [
  { diameter: 28, texture: 'mercury', name: '水星' },
  { diameter: 40, texture: 'venus_atmosphere', name: '金星' },
  { diameter: 44, texture: 'earth_daymap', name: '地球' },
  { diameter: 34, texture: 'mars', name: '火星' },
  { diameter: 65, texture: 'jupiter', name: '木星' },
  { diameter: 53, texture: 'saturn', name: '土星' }
].map((body, index) => ({ ...sharedOrbit, ...body, phase: -8 + index * 60 }));
export function projectOrbit(index, angle) {
  const orbit = orbits[index];
  const inclination = orbit.inclination * Math.PI / 180;
  const tilt = orbit.tilt * Math.PI / 180;
  const x = orbit.radius * Math.cos(angle);
  const y = orbit.radius * Math.sin(angle) * Math.cos(inclination);
  const z = orbit.radius * Math.sin(angle) * Math.sin(inclination);
  const scale = 900 / (900 - z);
  return { x: (x * Math.cos(tilt) - y * Math.sin(tilt)) * scale,
    y: (x * Math.sin(tilt) + y * Math.cos(tilt)) * scale, z, scale, front: z >= 0 };
}
export function satellitePosition(index, elapsed = 0) {
  const orbit = orbits[index];
  return projectOrbit(index, orbit.phase * Math.PI / 180 + (elapsed % orbit.period) / orbit.period * Math.PI * 2);
}
export function orbitPath(index, front) {
  const start = front ? 0 : Math.PI;
  return Array.from({ length: 97 }, (_, step) => {
    const point = projectOrbit(index, start + step / 96 * Math.PI);
    return `${step ? 'L' : 'M'}${(300 + point.x).toFixed(3)},${(280 + point.y).toFixed(3)}`;
  }).join(' ');
}
