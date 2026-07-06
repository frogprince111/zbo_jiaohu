(function () {
  "use strict";

  const Gestures = Object.freeze({
    FIST: "fist",
    OPEN_PALM: "open_palm",
    ONE_FINGER: "one_finger",
    TWO_FINGERS: "two_fingers",
    THUMB: "thumb",
    PINCH: "pinch"
  });

  const MAPPINGS = {
    [Gestures.FIST]: { effect: "center_cluster", color: "#ff455c", animation: "cluster" },
    [Gestures.OPEN_PALM]: { effect: "fullscreen_field", color: "#49a7ff", animation: "spread" },
    [Gestures.ONE_FINGER]: { effect: "clockwise_orbit", color: "#fff4b8", animation: "clockwise" },
    [Gestures.TWO_FINGERS]: { effect: "counter_orbit", color: "#7cffb2", animation: "counter_clockwise" },
    [Gestures.THUMB]: { effect: "heart_3d", color: "#ff5aa8", animation: "heart_3d" },
    [Gestures.PINCH]: { effect: "photo_focus", color: "#ffffff", animation: "random_photo_focus" }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;
  }

  function formatCameraError(error) {
    const name = error && error.name ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "permission denied. Allow camera access in the browser.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "no camera found.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "camera is already in use by another app.";
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return "HTTPS is required for camera access on mobile.";
    }
    return (error && error.message) || "permission denied";
  }

  function normalizeGestureEvent(input) {
    return {
      gesture: String((input && input.gesture) || ""),
      confidence: clamp(Number((input && input.confidence) || 0), 0, 1),
      controlY: Number.isFinite(input && input.controlY) ? input.controlY : 0
    };
  }

  function makeParticleMaterial(color, size, opacity) {
    return new THREE.PointsMaterial({
      color,
      size,
      opacity,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  function setBufferPositions(geometry, positions) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  class GestureMapper {
    map(input) {
      const event = normalizeGestureEvent(input);
      const mapping = MAPPINGS[event.gesture];
      if (!mapping || event.confidence < 0.2) return null;
      return {
        ...mapping,
        intensity: Number((0.35 + event.confidence * 0.65).toFixed(3)),
        gesture: event.gesture,
        confidence: event.confidence,
        controlY: Number.isFinite(event.controlY) ? event.controlY : 0
      };
    }
  }

  class BaseEffect {
    constructor(config) {
      this.config = config;
      this.group = new THREE.Group();
      this.elapsed = 0;
      this.dead = false;
      this.duration = 1;
    }

    update(delta) {
      this.elapsed += delta;
      if (this.elapsed >= this.duration) this.dead = true;
    }

    destroy(scene) {
      scene.remove(this.group);
      disposeObject(this.group);
    }
  }

  class EnergyShockwave extends BaseEffect {
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
      this.wave.scale.setScalar(0.5 + t * (7 + this.config.intensity * 4));
      this.wave.material.opacity = (1 - t) * 0.95;
      this.wave.rotation.z += delta * 0.8;
    }
  }

  class EnergyFieldExpand extends BaseEffect {
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

  class ParticleCompression extends BaseEffect {
    constructor(config) {
      super(config);
      this.duration = 1.05;
      this.count = 360;
      this.starts = [];
      this.positions = [];
      for (let i = 0; i < this.count; i += 1) {
        const radius = randomInRange(2.4, 5.4);
        const angle = randomInRange(0, Math.PI * 2);
        this.starts.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, randomInRange(-1.2, 1.2)));
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
      for (let i = 0; i < this.count; i += 1) {
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

  class VortexSwirl extends BaseEffect {
    constructor(config) {
      super(config);
      this.duration = 1.8;
      this.count = 520;
      this.seeds = [];
      this.positions = [];
      for (let i = 0; i < this.count; i += 1) {
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
      for (let i = 0; i < this.count; i += 1) {
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

  class SparkBurst extends BaseEffect {
    constructor(config) {
      super(config);
      this.duration = 0.8;
      this.count = 240;
      this.velocities = [];
      this.positions = [];
      for (let i = 0; i < this.count; i += 1) {
        const direction = new THREE.Vector3(randomInRange(-1, 1), randomInRange(-1, 1), randomInRange(-0.6, 0.6)).normalize();
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
      for (let i = 0; i < this.count; i += 1) {
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

  class UpwardEnergyStream extends BaseEffect {
    constructor(config) {
      super(config);
      this.duration = 1.4;
      this.count = 420;
      this.positions = [];
      this.speeds = [];
      for (let i = 0; i < this.count; i += 1) {
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
      for (let i = 0; i < this.count; i += 1) {
        const idx = i * 3;
        this.positions[idx] += Math.sin(this.elapsed * 10 + i) * delta * 0.25;
        this.positions[idx + 1] += this.speeds[i] * delta;
        if (this.positions[idx + 1] > 3.2) this.positions[idx + 1] = -3.4;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.points.material.opacity = 1 - t;
    }
  }

  class GravityParticleFall extends BaseEffect {
    constructor(config) {
      super(config);
      this.duration = 1.5;
      this.count = 430;
      this.positions = [];
      this.speeds = [];
      for (let i = 0; i < this.count; i += 1) {
        this.positions.push(randomInRange(-3.3, 3.3), randomInRange(1.6, 4.4), randomInRange(-0.7, 0.7));
        this.speeds.push(randomInRange(2.3, 5.6) * config.intensity);
      }
      this.geometry = new THREE.BufferGeometry();
      setBufferPositions(this.geometry, this.positions);
      this.points = new THREE.Points(this.geometry, makeParticleMaterial(config.color, 0.06, 1));
      this.group.add(this.points);
    }

    update(delta) {
      super.update(delta);
      const t = Math.min(1, this.elapsed / this.duration);
      for (let i = 0; i < this.count; i += 1) {
        const idx = i * 3;
        this.positions[idx] += Math.sin(this.elapsed * 7 + i) * delta * 0.16;
        this.positions[idx + 1] -= this.speeds[i] * delta;
        if (this.positions[idx + 1] < -3.4) this.positions[idx + 1] = 3.4;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.points.material.opacity = 1 - t;
    }
  }

  class LaserBeam extends BaseEffect {
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

  class GestureRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.mobile = isMobileViewport();
      this.particleCount = this.mobile ? 1500 : 2600;
      this.mode = "spread";
      this.modeColor = new THREE.Color("#49a7ff");
      this.positions = new Float32Array(this.particleCount * 3);
      this.velocities = new Float32Array(this.particleCount * 3);
      this.targets = new Float32Array(this.particleCount * 3);
      this.seeds = [];
      this.verticalSpin = 0;
      this.verticalSpinTarget = 0;
      this.photos = [];
      this.focusedPhoto = null;
      this.photoFocusLocked = false;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color("#08090d");
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      this.camera.position.set(0, 0, 8);
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.clock = new THREE.Clock();
      this.bounds = { x: 5.6, y: 3.15 };
      this.fieldGroup = new THREE.Group();
      this.photoGroup = new THREE.Group();
      this.scene.add(this.fieldGroup);
      this.scene.add(this.photoGroup);
      this.createParticleField();
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    createParticleField() {
      for (let i = 0; i < this.particleCount; i += 1) {
        const idx = i * 3;
        const x = randomInRange(-this.bounds.x, this.bounds.x);
        const y = randomInRange(-this.bounds.y, this.bounds.y);
        const z = randomInRange(-0.8, 0.8);
        this.positions[idx] = x;
        this.positions[idx + 1] = y;
        this.positions[idx + 2] = z;
        this.targets[idx] = x;
        this.targets[idx + 1] = y;
        this.targets[idx + 2] = z;
        this.seeds.push({
          spreadX: x,
          spreadY: y,
          spreadZ: z,
          angle: randomInRange(0, Math.PI * 2),
          phase: randomInRange(0, Math.PI * 2),
          radius: randomInRange(0.25, 5.3),
          sphereTheta: randomInRange(0, Math.PI * 2),
          spherePhi: Math.acos(randomInRange(-1, 1)),
          sphereRadius: randomInRange(1.1, 3.35),
          clusterRadius: Math.cbrt(Math.random()) * randomInRange(0.16, 1.12),
          spreadSphereRadius: Math.cbrt(Math.random()) * randomInRange(2.1, 4.55),
          heartT: Math.random(),
          heartDepth: randomInRange(-0.72, 0.72),
          heartFill: Math.random() < 0.86 ? randomInRange(0.94, 1.04) : randomInRange(0.42, 0.92),
          speed: randomInRange(0.65, 1.45)
        });
      }

      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
      this.material = new THREE.PointsMaterial({
        color: this.modeColor,
        size: this.mobile ? 0.05 : 0.04,
        opacity: 0.92,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.points = new THREE.Points(this.geometry, this.material);
      this.fieldGroup.add(this.points);
    }

    play(config) {
      if (config.gesture !== Gestures.PINCH) {
        this.focusedPhoto = null;
        this.photoFocusLocked = false;
        this.modeColor.set(config.color);
        this.material.color.copy(this.modeColor);
      }
      if (config.gesture === Gestures.FIST) this.mode = "cluster";
      if (config.gesture === Gestures.OPEN_PALM) this.mode = "spread";
      if (config.gesture === Gestures.ONE_FINGER) this.mode = "clockwise";
      if (config.gesture === Gestures.TWO_FINGERS) this.mode = "counter_clockwise";
      if (config.gesture === Gestures.THUMB) {
        this.mode = "heart";
        this.fieldGroup.rotation.set(0, 0, 0);
      }
      if (config.gesture === Gestures.PINCH) {
        this.focusRandomPhoto();
      }
      if (config.gesture === Gestures.TWO_FINGERS) {
        this.verticalSpinTarget = clamp(config.controlY * 3.2, -2.4, 2.4);
      } else {
        this.verticalSpinTarget = 0;
      }
    }

    addPhotoFiles(files, onDone) {
      const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
      if (!imageFiles.length) {
        if (onDone) onDone(this.photos.length);
        return;
      }

      let pending = imageFiles.length;
      imageFiles.forEach((file) => {
        const url = URL.createObjectURL(file);
        new THREE.TextureLoader().load(
          url,
          (texture) => {
            URL.revokeObjectURL(url);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
            texture.needsUpdate = true;
            const image = texture.image || { width: 1, height: 1 };
            const aspect = Math.max(0.3, Math.min(2.4, image.width / image.height || 1));
            const geometry = new THREE.PlaneGeometry(aspect, 1);
            const material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              opacity: 0.86,
              depthWrite: false,
              depthTest: true,
              side: THREE.DoubleSide,
              toneMapped: false
            });
            const mesh = new THREE.Mesh(geometry, material);
            const theta = randomInRange(0, Math.PI * 2);
            const phi = Math.acos(randomInRange(-0.72, 0.72));
            const item = {
              mesh,
              theta,
              phi,
              radius: randomInRange(2.0, 3.4),
              speed: randomInRange(0.35, 0.9),
              targetScale: 0.42,
              scale: 0.01
            };
            mesh.scale.setScalar(item.scale);
            this.photos.push(item);
            this.photoGroup.add(mesh);
            pending -= 1;
            if (pending === 0 && onDone) onDone(this.photos.length);
          },
          undefined,
          () => {
            URL.revokeObjectURL(url);
            pending -= 1;
            if (pending === 0 && onDone) onDone(this.photos.length);
          }
        );
      });
    }

    focusRandomPhoto() {
      if (!this.photos.length) return;
      if (this.photoFocusLocked && this.focusedPhoto) return;
      this.focusedPhoto = this.photos[Math.floor(Math.random() * this.photos.length)];
      this.photoFocusLocked = true;
      this.focusedPhoto.scale = Math.max(this.focusedPhoto.scale, 0.45);
    }

    updatePhotos(t, delta) {
      const isRotating = this.mode === "clockwise" || this.mode === "counter_clockwise";
      const direction = this.mode === "counter_clockwise" ? -1 : 1;

      this.photos.forEach((photo) => {
        const isFocused = photo === this.focusedPhoto;
        if (isFocused) {
          photo.mesh.position.x += (0 - photo.mesh.position.x) * Math.min(1, delta * 5);
          photo.mesh.position.y += (0 - photo.mesh.position.y) * Math.min(1, delta * 5);
          photo.mesh.position.z += (4.55 - photo.mesh.position.z) * Math.min(1, delta * 5);
          photo.targetScale = this.mobile ? 2.7 : 3.35;
          photo.mesh.renderOrder = 1000;
          photo.mesh.material.depthTest = false;
          photo.mesh.material.opacity += (1 - photo.mesh.material.opacity) * Math.min(1, delta * 5);
        } else {
          const isCluster = this.mode === "cluster";
          const theta = photo.theta + (isRotating || isCluster ? t * photo.speed * direction : Math.sin(t * 0.25 + photo.theta) * 0.25);
          const radius = isCluster ? 0.55 + Math.sin(t * photo.speed + photo.theta) * 0.08 : isRotating ? photo.radius : photo.radius + 1.2;
          const x = Math.cos(theta) * Math.sin(photo.phi) * radius;
          const y = Math.cos(photo.phi) * radius;
          const z = Math.sin(theta) * Math.sin(photo.phi) * radius;
          const follow = isCluster ? 8 : 5;
          photo.mesh.position.x += (x - photo.mesh.position.x) * Math.min(1, delta * follow);
          photo.mesh.position.y += (y - photo.mesh.position.y) * Math.min(1, delta * follow);
          photo.mesh.position.z += (z - photo.mesh.position.z) * Math.min(1, delta * follow);
          photo.targetScale = isCluster ? 0.18 : isRotating ? 0.34 : 0.52;
          photo.mesh.renderOrder = 20;
          photo.mesh.material.depthTest = true;
          const targetOpacity = isCluster ? 0.78 : isRotating ? 0.68 : 0.5;
          photo.mesh.material.opacity += (targetOpacity - photo.mesh.material.opacity) * Math.min(1, delta * 5);
        }
        photo.scale += (photo.targetScale - photo.scale) * Math.min(1, delta * (isFocused ? 1.65 : 7));
        photo.mesh.scale.setScalar(photo.scale);
        photo.mesh.lookAt(this.camera.position);
      });
    }

    update(frameDelta) {
      const delta = Math.min(frameDelta || this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      const orbitDirection = this.mode === "counter_clockwise" ? -1 : 1;

      for (let i = 0; i < this.particleCount; i += 1) {
        const idx = i * 3;
        const seed = this.seeds[i];

        if (this.mode === "cluster") {
          const theta = seed.sphereTheta + t * seed.speed * 0.9;
          const phi = seed.spherePhi + Math.sin(t * 0.7 + seed.phase) * 0.08;
          const radius = seed.clusterRadius + Math.sin(t * 2.4 + seed.phase) * 0.035;
          this.targets[idx] = Math.cos(theta) * Math.sin(phi) * radius;
          this.targets[idx + 1] = Math.cos(phi) * radius;
          this.targets[idx + 2] = Math.sin(theta) * Math.sin(phi) * radius;
        } else if (this.mode === "spread") {
          const theta = seed.sphereTheta + Math.sin(t * 0.18 + seed.phase) * 0.22;
          const phi = seed.spherePhi + Math.cos(t * 0.22 + seed.phase) * 0.16;
          const radius = seed.spreadSphereRadius + Math.sin(t * seed.speed + seed.phase) * 0.2;
          this.targets[idx] = Math.cos(theta) * Math.sin(phi) * radius * 1.18;
          this.targets[idx + 1] = Math.cos(phi) * radius * 0.82;
          this.targets[idx + 2] = Math.sin(theta) * Math.sin(phi) * radius;
        } else if (this.mode === "heart") {
          const p = heartPoint(seed.heartT, seed.heartFill);
          const breathe = 1 + Math.sin(t * 1.7 + seed.phase) * 0.035;
          const depth = seed.heartDepth * (0.55 + seed.heartFill * 0.45) + Math.sin(t * seed.speed + seed.phase) * 0.1;
          const roundness = 0.72 + Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(depth) / 0.9, 2))) * 0.28;
          this.targets[idx] = p.x * breathe * roundness;
          this.targets[idx + 1] = p.y * breathe * roundness;
          this.targets[idx + 2] = depth + p.z * 0.4;
        } else {
          const theta = seed.sphereTheta + t * seed.speed * orbitDirection;
          const phi = seed.spherePhi + Math.sin(t * 0.8 + seed.phase) * 0.28;
          const radius = seed.sphereRadius + Math.sin(t * 1.2 + seed.phase) * 0.16;
          this.targets[idx] = Math.cos(theta) * Math.sin(phi) * radius;
          this.targets[idx + 1] = Math.cos(phi) * radius;
          this.targets[idx + 2] = Math.sin(theta) * Math.sin(phi) * radius;
        }

        const stiffness = this.mode === "cluster" ? 9.5 : this.mode === "heart" ? 10.5 : 5.8;
        const damping = this.mode === "spread" ? 0.84 : this.mode === "heart" ? 0.82 : 0.88;
        this.velocities[idx] = (this.velocities[idx] + (this.targets[idx] - this.positions[idx]) * stiffness * delta) * damping;
        this.velocities[idx + 1] = (this.velocities[idx + 1] + (this.targets[idx + 1] - this.positions[idx + 1]) * stiffness * delta) * damping;
        this.velocities[idx + 2] = (this.velocities[idx + 2] + (this.targets[idx + 2] - this.positions[idx + 2]) * stiffness * delta) * damping;
        this.positions[idx] += this.velocities[idx] * delta * 7;
        this.positions[idx + 1] += this.velocities[idx + 1] * delta * 7;
        this.positions[idx + 2] += this.velocities[idx + 2] * delta * 7;
      }

      this.geometry.attributes.position.needsUpdate = true;
      const spin = this.mode === "clockwise" ? -1 : this.mode === "counter_clockwise" ? 1 : 0;
      this.verticalSpin += (this.verticalSpinTarget - this.verticalSpin) * Math.min(1, delta * 8);
      if (this.mode === "heart") {
        this.fieldGroup.rotation.y += delta * 0.22;
        this.fieldGroup.rotation.x += Math.sin(t * 0.8) * delta * 0.08;
      }
      this.fieldGroup.rotation.y += spin * delta * 0.65;
      this.fieldGroup.rotation.x += (spin * 0.18 + this.verticalSpin) * delta;
      this.fieldGroup.rotation.z += spin * delta * 0.08;
      this.updatePhotos(t, delta);
      this.renderer.render(this.scene, this.camera);
    }

    resize() {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const wasMobile = this.mobile;
      this.mobile = isMobileViewport();
      if (wasMobile !== this.mobile) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
        this.material.size = this.mobile ? 0.05 : 0.04;
      }
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }

    destroy() {
      this.geometry.dispose();
      this.material.dispose();
      this.photos.forEach((photo) => {
        photo.mesh.geometry.dispose();
        photo.mesh.material.map.dispose();
        photo.mesh.material.dispose();
      });
      this.renderer.dispose();
    }
  }

  class GestureController {
    constructor(canvas, onStateChange) {
      this.mapper = new GestureMapper();
      this.renderer = new GestureRenderer(canvas);
      this.onStateChange = onStateChange || function () {};
      this.running = false;
      this.animationId = 0;
      this.receiveGesture({ gesture: Gestures.OPEN_PALM, confidence: 0.82 });
    }

    receiveGesture(event) {
      const config = this.mapper.map(event);
      if (!config) return null;
      this.renderer.play(config);
      this.onStateChange({
        gesture: config.gesture,
        effect: config.effect,
        confidence: config.confidence,
        activeCount: this.renderer.particleCount
      });
      return config;
    }

    start() {
      if (this.running) return;
      this.running = true;
      const frame = () => {
        if (!this.running) return;
        this.renderer.update();
        this.onStateChange({ activeCount: this.renderer.particleCount });
        this.animationId = requestAnimationFrame(frame);
      };
      frame();
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.animationId);
    }

    destroy() {
      this.stop();
      this.renderer.destroy();
    }

    addPhotoFiles(files, onDone) {
      this.renderer.addPhotoFiles(files, onDone);
    }
  }

  const mockGestureEvents = [
    { gesture: "fist", confidence: 0.95 },
    { gesture: "open_palm", confidence: 0.88 },
    { gesture: "one_finger", confidence: 0.9 },
    { gesture: "two_fingers", confidence: 0.9 },
    { gesture: "thumb", confidence: 0.92 },
    { gesture: "pinch", confidence: 0.94 }
  ];

  class MockGestureStream {
    constructor(callback, intervalMs) {
      this.callback = callback;
      this.intervalMs = intervalMs || 850;
      this.index = 0;
      this.timer = 0;
      this.running = false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.emit();
      this.timer = window.setInterval(() => this.emit(), this.intervalMs);
    }

    emit() {
      const event = mockGestureEvents[this.index % mockGestureEvents.length];
      this.callback({
        ...event,
        confidence: clamp(event.confidence + (Math.random() - 0.5) * 0.12, 0.2, 1),
        controlY: event.gesture === "two_fingers" ? Math.sin(performance.now() * 0.004) * 0.85 : 0
      });
      this.index += 1;
    }

    stop() {
      this.running = false;
      window.clearInterval(this.timer);
    }

    toggle() {
      if (this.running) {
        this.stop();
        return false;
      }
      this.start();
      return true;
    }
  }

  class HandGestureRecognizer {
    constructor() {
      this.samples = [];
      this.motion = [];
    }

    recognize(landmarks) {
      if (!landmarks || landmarks.length < 21) return null;

      const wrist = landmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      const pinkyTip = landmarks[20];
      const palmSize = Math.max(distance(landmarks[0], landmarks[9]), distance(landmarks[5], landmarks[17]), 0.001);
      const extended = {
        index: isFingerExtended(landmarks, 8, 6, 5, palmSize),
        middle: isFingerExtended(landmarks, 12, 10, 9, palmSize),
        ring: isFingerExtended(landmarks, 16, 14, 13, palmSize),
        pinky: isFingerExtended(landmarks, 20, 18, 17, palmSize)
      };
      const thumbExtended = isThumbExtended(landmarks, palmSize);
      const extendedCount = Object.values(extended).filter(Boolean).length;
      const spread = distance(indexTip, pinkyTip) / palmSize;
      const thumbSpread = distance(thumbTip, landmarks[5]) / palmSize;
      const pinchDistance = distance(thumbTip, indexTip) / palmSize;
      const center = averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
      const now = performance.now();
      const averageTipReach = [8, 12, 16, 20].reduce((sum, tip) => sum + distance(landmarks[tip], wrist) / palmSize, 0) / 4;
      const curledScore = [8, 12, 16, 20].reduce((score, tip) => {
        return score + (isFingerCurled(landmarks, tip, tip - 2, palmSize) ? 1 : 0);
      }, 0);
      this.motion.push({ t: now, y: center.y });
      this.motion = this.motion.filter((sample) => now - sample.t < 260);
      const oldest = this.motion[0] || { t: now, y: center.y };
      const elapsed = Math.max(16, now - oldest.t);
      const verticalVelocity = clamp(((center.y - oldest.y) / elapsed) * 1000, -1.2, 1.2);

      let event = null;
      if (thumbExtended && curledScore >= 2 && extendedCount <= 1) {
        event = { gesture: Gestures.THUMB, confidence: 0.92 };
      } else if (pinchDistance < 0.38 && (extended.index || distance(indexTip, wrist) / palmSize > 1.15)) {
        event = { gesture: Gestures.PINCH, confidence: clamp(1 - pinchDistance, 0.78, 0.97) };
      } else if (extendedCount >= 3 && spread > 1.18 && averageTipReach > 1.48) {
        event = { gesture: Gestures.OPEN_PALM, confidence: clamp((spread + thumbSpread + extendedCount * 0.32) / 3, 0.82, 0.98) };
      } else if (extended.index && extended.middle && !extended.ring && !extended.pinky) {
        event = { gesture: Gestures.TWO_FINGERS, confidence: 0.9 };
      } else if (extended.index && !extended.middle && !extended.ring && !extended.pinky) {
        event = { gesture: Gestures.ONE_FINGER, confidence: 0.9 };
      } else if (extendedCount === 0 || curledScore >= 3) {
        event = { gesture: Gestures.FIST, confidence: 0.88 };
      }

      if (!event) return null;
      this.samples.push(event.gesture);
      if (this.samples.length > 5) this.samples.shift();

      const votes = this.samples.reduce((acc, gesture) => {
        acc[gesture] = (acc[gesture] || 0) + 1;
        return acc;
      }, {});
      const winner = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
      if (votes[winner] < 3) return null;

      return {
        gesture: winner,
        confidence: event.gesture === winner ? event.confidence : 0.76,
        controlY: winner === Gestures.TWO_FINGERS ? verticalVelocity : 0
      };
    }
  }

  class RealHandGestureCamera {
    constructor(options) {
      this.video = options.video;
      this.overlay = options.overlay;
      this.onGesture = options.onGesture;
      this.onStatus = options.onStatus;
      this.recognizer = new HandGestureRecognizer();
      this.lastGesture = "";
      this.lastTriggerTime = 0;
      this.stableGesture = "";
      this.stableFrames = 0;
      this.hands = null;
      this.stream = null;
      this.frameId = 0;
      this.processingFrame = false;
      this.running = false;
    }

    async start() {
      if (this.running) return;
      if (!window.Hands) {
        this.onStatus("MediaPipe failed to load. Check network access.");
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.onStatus("Camera API unavailable. Use HTTPS on mobile browsers.");
        return;
      }

      this.onStatus("Starting camera...");
      this.hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.68,
        minTrackingConfidence: 0.62
      });
      this.hands.onResults((results) => this.handleResults(results));

      const mobile = isMobileViewport();
      const constraints = {
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: mobile ? 480 : 640 },
          height: { ideal: mobile ? 360 : 480 },
          frameRate: { ideal: mobile ? 24 : 30, max: 30 }
        }
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = this.stream;
        this.video.muted = true;
        this.video.playsInline = true;
        await this.video.play();
        this.running = true;
        this.processFrame();
        this.onStatus("Camera running. Use fist, open palm/both hands, one finger, two fingers, thumb, or pinch.");
      } catch (error) {
        this.running = false;
        this.onStatus(`Camera blocked: ${formatCameraError(error)}`);
      }
    }

    processFrame() {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(() => this.processFrame());
      if (this.processingFrame || this.video.readyState < 2) return;

      this.processingFrame = true;
      this.hands
        .send({ image: this.video })
        .catch((error) => {
          this.onStatus(`Hand tracking error: ${error.message || "unknown error"}`);
        })
        .finally(() => {
          this.processingFrame = false;
        });
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.frameId);
      this.processingFrame = false;
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.video.srcObject) {
        this.video.srcObject = null;
      }
      this.clearOverlay();
      this.onStatus("Camera stopped.");
    }

    handleResults(results) {
      this.drawHand(results);
      const landmarks = results.multiHandLandmarks && results.multiHandLandmarks[0];
      const allHands = results.multiHandLandmarks || [];
      if (!landmarks) {
        this.stableGesture = "";
        this.stableFrames = 0;
        return;
      }

      const bothHandsOpen = allHands.length >= 2 && allHands.slice(0, 2).every((hand) => isOpenPalmLandmarks(hand));
      const event = bothHandsOpen
        ? { gesture: Gestures.OPEN_PALM, confidence: 0.96, controlY: 0 }
        : this.recognizer.recognize(landmarks);
      if (!event) return;

      if (event.gesture === this.stableGesture) {
        this.stableFrames += 1;
      } else {
        this.stableGesture = event.gesture;
        this.stableFrames = 1;
      }

      const now = performance.now();
      const stableEnough = this.stableFrames >= 1;
      const cooldown = event.gesture === Gestures.TWO_FINGERS ? 55 : event.gesture === Gestures.PINCH ? 900 : 180;

      if (stableEnough && (event.gesture !== this.lastGesture || now - this.lastTriggerTime > cooldown)) {
        this.lastGesture = event.gesture;
        this.lastTriggerTime = now;
        this.onGesture(event);
      }
    }

    drawHand(results) {
      const ctx = this.overlay.getContext("2d");
      const width = this.overlay.clientWidth;
      const height = this.overlay.clientHeight;
      if (this.overlay.width !== width || this.overlay.height !== height) {
        this.overlay.width = width;
        this.overlay.height = height;
      }
      ctx.clearRect(0, 0, width, height);

      const hands = results.multiHandLandmarks || [];
      if (!hands.length) return;

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-width, 0);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.fillStyle = "rgba(51, 227, 111, 0.92)";
      ctx.lineWidth = 2;

      const chains = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [0, 9, 10, 11, 12],
        [0, 13, 14, 15, 16],
        [0, 17, 18, 19, 20],
        [5, 9, 13, 17]
      ];

      hands.forEach((landmarks) => {
        chains.forEach((chain) => {
          ctx.beginPath();
          chain.forEach((index, step) => {
            const point = landmarks[index];
            const x = point.x * width;
            const y = point.y * height;
            if (step === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        });

        landmarks.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.restore();
    }

    clearOverlay() {
      const ctx = this.overlay.getContext("2d");
      ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  function averagePoint(points) {
    return points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 }
    );
  }

  function heartPoint(t, fill) {
    const angle = t * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(angle), 3);
    const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
    const scale = 0.18 * fill;
    return {
      x: x * scale,
      y: y * scale * 0.88 - 0.35,
      z: Math.sin(t * 91.7) * 0.08
    };
  }

  function isFingerExtended(landmarks, tip, pip, mcp, palmSize) {
    const wrist = landmarks[0];
    const tipReach = distance(landmarks[tip], wrist) / palmSize;
    const pipReach = distance(landmarks[pip], wrist) / palmSize;
    const tipFromMcp = distance(landmarks[tip], landmarks[mcp]) / palmSize;
    const pipFromMcp = distance(landmarks[pip], landmarks[mcp]) / palmSize;
    return tipReach > pipReach * 1.05 && tipReach > 1.42 && tipFromMcp > pipFromMcp * 1.18;
  }

  function isFingerCurled(landmarks, tip, pip, palmSize) {
    const wrist = landmarks[0];
    const tipReach = distance(landmarks[tip], wrist) / palmSize;
    const pipReach = distance(landmarks[pip], wrist) / palmSize;
    return tipReach < 1.42 || tipReach < pipReach * 1.04;
  }

  function isThumbExtended(landmarks, palmSize) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const thumbMcp = landmarks[2];
    const indexMcp = landmarks[5];
    const tipReach = distance(thumbTip, wrist) / palmSize;
    const ipReach = distance(thumbIp, wrist) / palmSize;
    const thumbLength = distance(thumbTip, thumbMcp) / palmSize;
    const thumbAwayFromPalm = distance(thumbTip, indexMcp) / palmSize;
    const mobile = isMobileViewport();
    const reachRatio = mobile ? 1.0 : 1.04;
    const minLength = mobile ? 0.58 : 0.68;
    const minAway = mobile ? 0.58 : 0.72;
    return tipReach > ipReach * reachRatio && thumbLength > minLength && thumbAwayFromPalm > minAway;
  }

  function isOpenPalmLandmarks(landmarks) {
    const wrist = landmarks[0];
    const palmSize = Math.max(distance(landmarks[0], landmarks[9]), distance(landmarks[5], landmarks[17]), 0.001);
    const extendedCount = [
      isFingerExtended(landmarks, 8, 6, 5, palmSize),
      isFingerExtended(landmarks, 12, 10, 9, palmSize),
      isFingerExtended(landmarks, 16, 14, 13, palmSize),
      isFingerExtended(landmarks, 20, 18, 17, palmSize)
    ].filter(Boolean).length;
    const spread = distance(landmarks[8], landmarks[20]) / palmSize;
    const averageTipReach = [8, 12, 16, 20].reduce((sum, tip) => sum + distance(landmarks[tip], wrist) / palmSize, 0) / 4;
    return extendedCount >= 3 && spread > 1.12 && averageTipReach > 1.44;
  }

  function angleDelta(a, b) {
    let delta = b - a;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function boot() {
    if (!window.THREE) {
      const effectName = document.querySelector("#effect-name");
      if (effectName) effectName.textContent = "Three.js load failed";
      return;
    }

    const canvas = document.querySelector("#gesture-canvas");
    const stage = document.querySelector(".stage");
    const gestureName = document.querySelector("#gesture-name");
    const effectName = document.querySelector("#effect-name");
    const confidence = document.querySelector("#confidence");
    const activeCount = document.querySelector("#active-count");
    const cameraVideo = document.querySelector("#camera-video");
    const handOverlay = document.querySelector("#hand-overlay");
    const cameraToggle = document.querySelector("#camera-toggle");
    const fullscreenToggle = document.querySelector("#fullscreen-toggle");
    const cameraStatus = document.querySelector("#camera-status");
    const photoInput = document.querySelector("#photo-input");
    const photoStatus = document.querySelector("#photo-status");
    const mockToggle = document.querySelector("#mock-toggle");

    const controller = new GestureController(canvas, (state) => {
      if (state.gesture) gestureName.textContent = state.gesture;
      if (state.effect) effectName.textContent = state.effect;
      if (Number.isFinite(state.confidence)) confidence.textContent = state.confidence.toFixed(2);
      if (Number.isFinite(state.activeCount)) activeCount.textContent = String(state.activeCount);
    });

    controller.start();
    const stream = new MockGestureStream((event) => controller.receiveGesture(event), 900);
    const realCamera = new RealHandGestureCamera({
      video: cameraVideo,
      overlay: handOverlay,
      onGesture: (event) => controller.receiveGesture(event),
      onStatus: (message) => {
        cameraStatus.textContent = message;
      }
    });

    cameraToggle.addEventListener("click", async () => {
      if (realCamera.running) {
        realCamera.stop();
        stage.classList.remove("camera-on");
        cameraToggle.textContent = "Start Camera";
        return;
      }
      stream.stop();
      mockToggle.textContent = "Start Mock";
      await realCamera.start();
      stage.classList.toggle("camera-on", realCamera.running);
      cameraToggle.textContent = realCamera.running ? "Stop Camera" : "Start Camera";
    });

    fullscreenToggle.addEventListener("click", async () => {
      const isNativeFullscreen = document.fullscreenElement === stage;
      const isExpanded = stage.classList.contains("stage-expanded");

      try {
        if (isNativeFullscreen || isExpanded) {
          if (document.fullscreenElement) await document.exitFullscreen();
          stage.classList.remove("stage-expanded");
          fullscreenToggle.textContent = "Fullscreen";
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
          fullscreenToggle.textContent = "Exit";
        } else {
          stage.classList.add("stage-expanded");
          fullscreenToggle.textContent = "Exit";
        }
        setTimeout(() => controller.renderer.resize(), 80);
      } catch (error) {
        stage.classList.toggle("stage-expanded");
        fullscreenToggle.textContent = stage.classList.contains("stage-expanded") ? "Exit" : "Fullscreen";
        setTimeout(() => controller.renderer.resize(), 80);
      }
    });

    document.addEventListener("fullscreenchange", () => {
      fullscreenToggle.textContent = document.fullscreenElement === stage ? "Exit" : "Fullscreen";
      setTimeout(() => controller.renderer.resize(), 80);
    });

    mockToggle.addEventListener("click", () => {
      if (realCamera.running) {
        realCamera.stop();
        stage.classList.remove("camera-on");
        cameraToggle.textContent = "Start Camera";
      }
      const running = stream.toggle();
      mockToggle.textContent = running ? "Stop Mock" : "Start Mock";
      cameraStatus.textContent = running ? "Mock stream running." : "Camera idle. Use fist, open palm/both hands, one finger, two fingers, thumb, or pinch.";
    });

    photoInput.addEventListener("change", () => {
      photoStatus.textContent = "Loading photos...";
      controller.addPhotoFiles(photoInput.files, (count) => {
        photoStatus.textContent = count ? `${count} photo${count === 1 ? "" : "s"} uploaded.` : "No photos uploaded.";
      });
      photoInput.value = "";
    });

    document.querySelectorAll("[data-gesture]").forEach((button) => {
      button.addEventListener("click", () => {
        controller.receiveGesture({ gesture: button.dataset.gesture, confidence: 1 });
      });
    });

    window.gestureController = controller;
    window.mockGestureStream = stream;
    window.realHandGestureCamera = realCamera;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
