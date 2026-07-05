import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";

export class LaserBeam extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 0.95;

    const beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 7.2, 24);
    const coreGeometry = new THREE.CylinderGeometry(0.01, 0.01, 7.6, 16);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: config.color,
      opacity: 0.35,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: config.color,
      opacity: 1,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    this.beam = new THREE.Mesh(beamGeometry, beamMaterial);
    this.core = new THREE.Mesh(coreGeometry, coreMaterial);
    this.beam.rotation.z = Math.PI / 2;
    this.core.rotation.z = Math.PI / 2;
    this.beam.position.x = 1.9;
    this.core.position.x = 1.9;
    this.group.add(this.beam, this.core);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);
    const flicker = 0.78 + Math.sin(this.elapsed * 56) * 0.22;
    this.group.rotation.z = Math.sin(this.elapsed * 7) * 0.035;
    this.beam.material.opacity = (1 - t) * 0.35 * flicker;
    this.core.material.opacity = (1 - t) * flicker;
    this.beam.scale.y = 1 + Math.sin(this.elapsed * 18) * 0.08;
  }
}
