import * as THREE from "three";
import { disposeObject } from "../utils.js";

export class BaseEffect {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.elapsed = 0;
    this.dead = false;
    this.duration = 1;
  }

  update(delta) {
    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      this.dead = true;
    }
  }

  destroy(scene) {
    scene.remove(this.group);
    disposeObject(this.group);
  }
}
