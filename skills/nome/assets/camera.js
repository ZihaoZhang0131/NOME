// Keep the original scene mounted: the camera maps a body center into its reading position.
export function cameraPose({ viewportWidth, viewportHeight, left, top, width, height, point, diameter }) {
  const mobile = viewportWidth <= 760;
  const visualWidth = mobile ? Math.min(viewportWidth * .64, viewportHeight * .28) : Math.min(viewportWidth * .36, viewportHeight * .58, 520);
  const bodyWidth = visualWidth;
  const scale = bodyWidth / (diameter * width / 600 * point.scale);
  const targetX = viewportWidth * (mobile ? .5 : .255);
  const targetY = viewportHeight * (mobile ? .205 : .5);
  const x = width / 2 + point.x * width / 600;
  const y = height / 2 + point.y * width / 600;
  return { x: targetX - left - x * scale, y: targetY - top - y * scale, scale };
}
export function cameraTransform(pose) {
  return `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`;
}
