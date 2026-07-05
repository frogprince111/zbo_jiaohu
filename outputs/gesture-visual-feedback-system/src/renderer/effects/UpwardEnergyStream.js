import * as THREE from "three";
import { BaseEffect } from "./BaseEffect.js";
import { makeParticleMaterial, randomInRange, setBufferPositions } from "../utils.js";

export class UpwardEnergyStream extends BaseEffect {
  constructor(config) {
    super(config);
    this.duration = 1.4;
    this.count = 420;
    this.positions = [];
    this.speeds = [];

    for (let i = 0; i < this.count; i++) {
      this.positions.push(randomInRange(-0.55, 0.55), randomInRange(-3.6, -1.3), randomInRange(-0.35, 0.35));
      this.speeds.push(randomInRange(2.8, 6.6) * config.intensity);
    }

    this.geometry = new THREE.BufferGeometry();
    setBufferPositions(this.geometry, this.positions);
    this.points = new THREE.Points(this.geometry, makeParticleMaterial(config.color, 0.065, 1));
    this.group.add(this.points);
  }

  update(delta) {
    super.update(delta);
    const t = Math.min(1, this.elapsed / this.duration);

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      this.positions[idx] += Math.sin(this.elapsed * 10 + i) * delta * 0.25;
      this.positions[idx + 1] += this.speeds[i] * delta;
      if (this.positions[idx + 1] > 3.2) {
        this.positions[idx + 1] = -3.4;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 1 - t;
  }
}
