import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";

export class EnergyShockwave extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 1.15;

    const geometry = new THREE.RingGeometry(0.18, 0.22, 96);
    const material = new THREE.MeshBasicMaterial({
      color: config.color,
      opacity: 0.95,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    this.wave = new THREE.Mesh(geometry, material);
    this.group.add(this.wave);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);
    const scale = 0.5 + t * (7 + this.config.intensity * 4);
    this.wave.scale.setScalar(scale);
    this.wave.material.opacity = (1 - t) * 0.95;
    this.wave.rotation.z += delta * 0.8;
  }
}
