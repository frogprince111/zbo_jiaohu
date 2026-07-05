import * as THREE from "three";

export function makeParticleMaterial(color, size = 0.09, opacity = 1) {
  return new THREE.PointsMaterial({
    color,
    size,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

export function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export function setBufferPositions(geometry, positions) {
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
}

export function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
