// Local CC BY 4.0 maps, projected onto spheres once. No per-frame pixel work.
// Source and modifications: /textures/CREDITS.md.
const images = new Map();
function pixels(name) {
  if (!images.has(name)) images.set(name, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, image.width, image.height));
    };
    image.onerror = reject;
    image.src = `/textures/2k_${name}`;
  }));
  return images.get(name);
}
export async function paintSphere(canvas, texture, { sun = false, clouds = false } = {}) {
  try {
    const map = await pixels(`${texture}.jpg`);
    const cloud = clouds ? await pixels('earth_clouds.jpg') : null;
    const size = 768;
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    const output = context.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1;
      const radius = nx * nx + ny * ny;
      if (radius > 1) continue;
      const nz = Math.sqrt(1 - radius);
      const u = .5 + Math.atan2(nx, nz) / (2 * Math.PI);
      const v = .5 + Math.asin(ny) / Math.PI;
      const source = (Math.min(map.height - 1, Math.floor(v * map.height)) * map.width + Math.floor(u * map.width)) * 4;
      const target = (y * size + x) * 4;
      const light = sun ? .72 + nz * .36 : .56 + nz * .44;
      const cloudIndex = cloud && (Math.min(cloud.height - 1, Math.floor(v * cloud.height)) * cloud.width + Math.floor(u * cloud.width)) * 4;
      const cloudAlpha = cloud ? cloud.data[cloudIndex] / 255 * .83 : 0;
      for (let channel = 0; channel < 3; channel++) output.data[target + channel] = (map.data[source + channel] * (1 - cloudAlpha) + 245 * cloudAlpha) * light;
      output.data[target + 3] = Math.min(1, (1 - Math.sqrt(radius)) * size / 2) * 255;
    }
    context.putImageData(output, 0, 0);
    canvas.dataset.loaded = 'true';
  } catch { canvas.dataset.loaded = 'error'; }
}
