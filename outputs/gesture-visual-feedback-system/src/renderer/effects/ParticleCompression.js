import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";
import { makeParticleMaterial, randomInRange, setBufferPositions } from "../utils.js";

export class ParticleCompression extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 1.05;
    this.count = 360;
    this.starts = [];
    this.positions = [];

    for (let i = 0; i < this.count; i++) {
      const radius = randomInRange(2.4, 5.4);
      const angle = randomInRange(0, Math.PI * 2);
      const z = randomInRange(-1.2, 1.2);
      this.starts.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z));
      this.positions.push(0, 0, 0);
    }

    this.geometry = new THREE.BufferGeometry();
    setBufferPositions(this.geometry, this.positions);
    this.points = new THREE.Points(this.geometry, makeParticleMaterial(config.color, 0.055, 1));
    this.group.add(this.points);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);
    const compress = Math.pow(1 - t, 2.4);
    const bounce = Math.sin(t * Math.PI) * 0.18;

    for (let i = 0; i < this.count; i++) {
      const p = this.starts[i];
      const idx = i * 3;
      this.positions[idx] = p.x * compress + randomInRange(-bounce, bounce);
      this.positions[idx + 1] = p.y * compress + randomInRange(-bounce, bounce);
      this.positions[idx + 2] = p.z * compress;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = Math.max(0, 1 - t * 0.65);
    this.group.rotation.z += delta * 1.8;
  }
}
