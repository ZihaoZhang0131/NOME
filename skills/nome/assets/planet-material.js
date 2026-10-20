// Local CC BY 4.0 maps. Rotate longitude on the sphere while lighting stays fixed.
// Source and modifications: /textures/CREDITS.md. No runtime dependencies.
const images = new Map();
function image(name) {
  if (!images.has(name)) images.set(name, new Promise((resolve, reject) => {
    const map = new Image();
    map.onload = () => resolve(map);
    map.onerror = reject;
    map.src = `/textures/2k_${name}.jpg`;
  }));
  return images.get(name);
}
const vertexSource = `
  attribute vec2 position;
  varying vec2 point;
  void main() { point = vec2(position.x, -position.y); gl_Position = vec4(position, 0., 1.); }
`;
const fragmentSource = `
  precision highp float;
  varying vec2 point;
  uniform sampler2D surfaceMap;
  uniform sampler2D cloudMap;
  uniform float longitude;
  uniform float isSun;
  uniform float hasClouds;
  void main() {
    float radius = dot(point, point);
    if (radius > 1.) discard;
    float depth = sqrt(1. - radius);
    vec2 uv = vec2(fract(.5 + atan(point.x, depth) / 6.28318530718 + longitude),
                   .5 + asin(point.y) / 3.14159265359);
    vec3 color = texture2D(surfaceMap, uv).rgb;
    float cloud = texture2D(cloudMap, uv).r * .83 * hasClouds;
    color = mix(color, vec3(245. / 255.), cloud);
    float light = mix(.56 + depth * .44, .72 + depth * .36, isSun);
    float alpha = clamp((1. - sqrt(radius)) * 384., 0., 1.);
    gl_FragColor = vec4(color * light, alpha);
  }
`;
function gpuSphere(gl, map, cloud, sun) {
  const shaders = [];
  const textures = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => {
    textures.forEach(texture => gl.deleteTexture(texture));
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.deleteBuffer(buffer); gl.deleteProgram(program);
  };
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(type); shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    [map, cloud || map].forEach((source, unit) => {
      const texture = gl.createTexture(); textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      // CLAMP_TO_EDGE also supports non-power-of-two maps in WebGL 1; fract wraps longitude.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    });
    gl.uniform1i(gl.getUniformLocation(program, 'surfaceMap'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'cloudMap'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'isSun'), sun ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, 'hasClouds'), cloud ? 1 : 0);
    const longitude = gl.getUniformLocation(program, 'longitude');
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    return { dispose, render(turn) {
      gl.uniform1f(longitude, turn);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } };
  } catch (error) { dispose(); throw error; }
}
// Keep axial rotation available when GPU rendering is unavailable. Cache projection
// coordinates and limit this smaller CPU canvas to 20 fps; never reproject per frame.
function cpuSphere(canvas, map, cloud, sun) {
  const size = 256;
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const read = source => {
    const copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, copy.width, copy.height).data;
  };
  const pixels = read(map), clouds = cloud && read(cloud);
  const output = context.createImageData(size, size), samples = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1, radius = nx * nx + ny * ny;
    if (radius > 1) continue;
    const depth = Math.sqrt(1 - radius);
    samples.push({ target: (y * size + x) * 4, u: .5 + Math.atan2(nx, depth) / (2 * Math.PI),
      row: Math.min(map.height - 1, Math.floor((.5 + Math.asin(ny) / Math.PI) * map.height)) * map.width,
      light: sun ? .72 + depth * .36 : .56 + depth * .44 });
    output.data[(y * size + x) * 4 + 3] = Math.min(1, (1 - Math.sqrt(radius)) * size / 2) * 255;
  }
  return { dispose() {}, render(turn) {
    for (const { target, u, row, light } of samples) {
      const source = (row + Math.floor(((u + turn) % 1) * map.width)) * 4;
      const alpha = clouds ? clouds[source] / 255 * .83 : 0;
      for (let channel = 0; channel < 3; channel++) output.data[target + channel] = (pixels[source + channel] * (1 - alpha) + 245 * alpha) * light;
    }
    context.putImageData(output, 0, 0);
  } };
}
export async function paintSphere(canvas, texture, { sun = false, clouds = false, period = 180000 } = {}) {
  try {
    const [map, cloud] = await Promise.all([image(texture), clouds ? image('earth_clouds') : null]);
    canvas.width = 768; canvas.height = 768;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    let painter = gl ? gpuSphere(gl, map, cloud, sun) : cpuSphere(canvas, map, cloud, sun);
    let lastTime = -Infinity, elapsed = 0, disposed = false;
    const render = time => {
      elapsed = time;
      if (disposed || (gl && gl.isContextLost()) || (!gl && time - lastTime < 50)) return;
      painter.render((time % period) / period);
      lastTime = time;
    };
    const lost = event => { event.preventDefault(); canvas.dataset.loaded = 'restoring'; };
    const restored = () => {
      painter.dispose(); painter = gpuSphere(gl, map, cloud, sun);
      render(elapsed); canvas.dataset.loaded = 'true';
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    render(0); canvas.dataset.loaded = 'true';
    return { render, dispose() {
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      painter.dispose(); gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } };
  } catch { canvas.dataset.loaded = 'error'; return null; }
}
