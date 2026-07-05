import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";

export class EnergyFieldExpand extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 1.35;

    const geometry = new THREE.SphereGeometry(1, 48, 24);
    const material = new THREE.MeshBasicMaterial({
      color: config.color,
      opacity: 0.18,
      transparent: true,
      wireframe: true,
      blending: THREE.AdditiveBlending
    });

    this.field = new THREE.Mesh(geometry, material);
    this.group.add(this.field);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);
    const pulse = 1 + Math.sin(t * Math.PI * 7) * 0.08;
    this.field.scale.setScalar((1 + t * 4.5 * this.config.intensity) * pulse);
    this.field.rotation.x += delta * 0.5;
    this.field.rotation.y += delta * 0.65;
    this.field.material.opacity = (1 - t) * 0.24;
  }
}
