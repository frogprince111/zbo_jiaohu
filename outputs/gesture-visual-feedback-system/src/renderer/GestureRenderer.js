import * as THREE from "three";
import { EnergyShockwave } from "./effects/EnergyShockwave.js";
import { EnergyFieldExpand } from "./effects/EnergyFieldExpand.js";
import { ParticleCompression } from "./effects/ParticleCompression.js";
import { VortexSwirl } from "./effects/VortexSwirl.js";
import { SparkBurst } from "./effects/SparkBurst.js";
import { UpwardEnergyStream } from "./effects/UpwardEnergyStream.js";
import { GravityParticleFall } from "./effects/GravityParticleFall.js";
import { LaserBeam } from "./effects/LaserBeam.js";

const EffectClasses = {
  energy_shockwave: EnergyShockwave,
  energy_field_expand: EnergyFieldExpand,
  particle_compression: ParticleCompression,
  vortex_swirl: VortexSwirl,
  spark_burst: SparkBurst,
  upward_energy_stream: UpwardEnergyStream,
  gravity_particle_fall: GravityParticleFall,
  laser_beam: LaserBeam
};

export class GestureRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.effects = [];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#08090d");
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 0, 8);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.clock = new THREE.Clock();

    this.addBackground();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  addBackground() {
    const grid = new THREE.GridHelper(12, 24, "#243044", "#121824");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -2.2;
    this.scene.add(grid);

    const light = new THREE.AmbientLight("#ffffff", 0.9);
    this.scene.add(light);
  }

  play(config) {
    const EffectClass = EffectClasses[config.effect];
    if (!EffectClass) return;

    const effect = new EffectClass(config);
    this.effects.push(effect);
    this.scene.add(effect.group);
  }

  update(frameDelta = this.clock.getDelta()) {
    const delta = Math.min(frameDelta, 0.1);

    for (const effect of this.effects) {
      effect.update(delta);
    }

    const alive = [];
    for (const effect of this.effects) {
      if (effect.dead) {
        effect.destroy(this.scene);
      } else {
        alive.push(effect);
      }
    }
    this.effects = alive;
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  destroy() {
    this.effects.forEach((effect) => effect.destroy(this.scene));
    this.effects = [];
    this.renderer.dispose();
  }
}
