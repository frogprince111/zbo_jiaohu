import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";
import { makeParticleMaterial, randomInRange, setBufferPositions } from "../utils.js";

export class SparkBurst extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 0.8;
    this.count = 240;
    this.velocities = [];
    this.positions = [];

    for (let i = 0; i < this.count; i++) {
      const direction = new THREE.Vector3(
        randomInRange(-1, 1),
        randomInRange(-1, 1),
        randomInRange(-0.6, 0.6)
      ).normalize();
      direction.multiplyScalar(randomInRange(2.4, 6.2) * config.intensity);
      this.velocities.push(direction);
      this.positions.push(0, 0, 0);
    }

    this.geometry = new THREE.BufferGeometry();
    setBufferPositions(this.geometry, this.positions);
    this.points = new THREE.Points(this.geometry, makeParticleMaterial(config.color, 0.07, 1));
    this.group.add(this.points);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);

    for (let i = 0; i < this.count; i++) {
      const velocity = this.velocities[i];
      const idx = i * 3;
      this.positions[idx] += velocity.x * delta;
      this.positions[idx + 1] += velocity.y * delta;
      this.positions[idx + 2] += velocity.z * delta;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 1 - t;
  }
}
