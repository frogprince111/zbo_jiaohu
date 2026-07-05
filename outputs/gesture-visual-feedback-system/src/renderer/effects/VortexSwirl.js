import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";
import { makeParticleMaterial, randomInRange, setBufferPositions } from "../utils.js";

export class VortexSwirl extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 1.8;
    this.count = 520;
    this.seeds = [];
    this.positions = [];

    for (let i = 0; i < this.count; i++) {
      this.seeds.push({
        angle: randomInRange(0, Math.PI * 2),
        radius: randomInRange(0.25, 3.2),
        height: randomInRange(-2.1, 2.1),
        speed: randomInRange(2.2, 5.8)
      });
      this.positions.push(0, 0, 0);
    }

    this.geometry = new THREE.BufferGeometry();
    setBufferPositions(this.geometry, this.positions);
    this.points = new THREE.Points(this.geometry, makeParticleMaterial(config.color, 0.05, 0.95));
    this.group.add(this.points);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);

    for (let i = 0; i < this.count; i++) {
      const seed = this.seeds[i];
      const angle = seed.angle + this.elapsed * seed.speed;
      const radius = seed.radius * (1 - t * 0.45) + Math.sin(this.elapsed * 8 + i) * 0.04;
      const idx = i * 3;
      this.positions[idx] = Math.cos(angle) * radius;
      this.positions[idx + 1] = seed.height * (1 - t) + Math.sin(angle * 2) * 0.22;
      this.positions[idx + 2] = Math.sin(angle) * radius;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 1 - t;
    this.group.rotation.y += delta * 0.9;
  }
}
