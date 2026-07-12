(function () {
  "use strict";

  const Gestures = Object.freeze({
    FIST: "fist",
    OPEN_PALM: "open_palm",
    PINCH: "pinch"
  });

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
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return "浏览器拒绝了摄像头权限，请允许摄像头。";
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return "没有找到可用摄像头。";
    if (name === "NotReadableError" || name === "TrackStartError") return "摄像头可能被其他应用占用。";
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return "手机浏览器必须使用 HTTPS 链接才能调用摄像头。";
    }
    return (error && error.message) || "摄像头权限不可用。";
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          ["map", "roughnessMap", "bumpMap", "normalMap", "alphaMap"].forEach((key) => {
            if (material[key] && typeof material[key].dispose === "function") material[key].dispose();
          });
          material.dispose();
        });
      }
    });
  }

  class CubeRenderer {
    constructor(canvas, onStateChange) {
      this.canvas = canvas;
      this.onStateChange = onStateChange || function () {};
      this.mobile = isMobileViewport();
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      this.camera.position.set(0, 0, 8);
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      this.clock = new THREE.Clock();
      this.variant = 0;
      this.mode = "standby";
      this.portalVisible = false;
      this.targetScale = 0;
      this.visibleScale = 0;
      this.targetPosition = new THREE.Vector3(0, 0, 2.05);
      this.lastAnchorX = 0.5;
      this.lastAnchorY = 0.48;
      this.transition = null;
      this.textureCache = {};

      this.addEnvironment();
      this.createPortal();
      this.resize();
      this.handleViewportChange = () => this.resize();
      window.addEventListener("resize", this.handleViewportChange);
      window.addEventListener("orientationchange", this.handleViewportChange);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", this.handleViewportChange);
    }

    addEnvironment() {
      this.scene.add(new THREE.AmbientLight("#ffffff", 1.05));
      const keyLight = new THREE.DirectionalLight("#ffffff", 1.3);
      keyLight.position.set(3, 4, 6);
      this.scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight("#8dfcff", 0.55);
      rimLight.position.set(-4, 2, -3);
      this.scene.add(rimLight);
    }

    createPortal() {
      this.portal = new THREE.Group();
      this.portal.visible = false;
      this.portal.position.set(0, 0, 1);
      this.scene.add(this.portal);

      const box = new THREE.BoxGeometry(2.6, 2.6, 2.6);
      this.edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(box),
        new THREE.LineBasicMaterial({
          color: "#8dfcff",
          transparent: true,
          opacity: 0.94,
          blending: THREE.AdditiveBlending
        })
      );
      this.portal.add(this.edges);

      this.shapeGroup = new THREE.Group();
      this.shapes = [
        this.createRifleShape(),
        this.createHelmetShape(),
        this.createPanShape(),
        this.createGrenadeShape(),
        this.createScopedRifleShape(),
        this.createVestShape(),
        this.createFirstAidKitShape(),
        this.createBackpackShape()
      ];
      this.shapes.forEach((shape, index) => {
        shape.visible = index === 0;
        this.shapeGroup.add(shape);
      });
      this.portal.add(this.shapeGroup);

      const count = this.mobile ? 320 : 520;
      this.particlePositions = new Float32Array(count * 3);
      this.particleStartPositions = new Float32Array(count * 3);
      this.particleTargetPositions = new Float32Array(count * 3);
      this.particlePowderTargets = new Float32Array(count * 3);
      this.particleSolidTargets = new Float32Array(count * 3);
      this.particleSeeds = [];
      for (let i = 0; i < count; i += 1) {
        const theta = randomInRange(0, Math.PI * 2);
        const phi = Math.acos(randomInRange(-1, 1));
        const radius = randomInRange(0.14, 1.08);
        this.particleSeeds.push({
          theta,
          phi,
          radius,
          phase: randomInRange(0, Math.PI * 2),
          speed: randomInRange(0.7, 2.1)
        });
        const idx = i * 3;
        this.particlePositions[idx] = Math.cos(theta) * Math.sin(phi) * radius;
        this.particlePositions[idx + 1] = Math.cos(phi) * radius;
        this.particlePositions[idx + 2] = Math.sin(theta) * Math.sin(phi) * radius;
        const powderRadius = randomInRange(0.82, 1.42);
        const solidRadius = randomInRange(0.08, 0.48);
        this.particlePowderTargets[idx] = Math.cos(theta) * Math.sin(phi) * powderRadius;
        this.particlePowderTargets[idx + 1] = Math.cos(phi) * powderRadius + randomInRange(-0.08, 0.18);
        this.particlePowderTargets[idx + 2] = Math.sin(theta) * Math.sin(phi) * powderRadius;
        this.particleSolidTargets[idx] = Math.cos(theta) * Math.sin(phi) * solidRadius;
        this.particleSolidTargets[idx + 1] = Math.cos(phi) * solidRadius;
        this.particleSolidTargets[idx + 2] = Math.sin(theta) * Math.sin(phi) * solidRadius;
      }
      this.particleGeometry = new THREE.BufferGeometry();
      const positionAttribute = new THREE.BufferAttribute(this.particlePositions, 3);
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      this.particleGeometry.setAttribute("position", positionAttribute);
      this.particleMaterial = new THREE.PointsMaterial({
        color: "#d9eef0",
        size: this.mobile ? 0.05 : 0.04,
        opacity: 0.82,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
      this.particles.visible = false;
      this.portal.add(this.particles);
    }

    makeMaterial(color, opacity = 0.94, options = {}) {
      const surface = options.surface || (options.metalness > 0.3 ? "brushed-metal" : options.roughness > 0.8 ? "fabric" : "worn");
      const texture = options.surface === false ? null : this.createSurfaceTexture(color, surface);
      const material = new THREE.MeshStandardMaterial({
        color: texture ? "#ffffff" : color,
        opacity,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
        emissive: options.emissive ?? color,
        emissiveIntensity: options.emissiveIntensity ?? 0.16,
        roughness: options.roughness ?? 0.66,
        metalness: options.metalness ?? 0.18,
        map: texture,
        roughnessMap: texture,
        bumpMap: texture,
        bumpScale: options.bumpScale ?? (surface === "fabric" ? 0.035 : surface === "brushed-metal" ? 0.018 : 0.024)
      });
      if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(options.repeatX || 1.6, options.repeatY || 1.6);
      }
      return material;
    }

    createSurfaceTexture(color, surface) {
      const key = `${color}-${surface}`;
      if (this.textureCache[key]) return this.textureCache[key];
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const base = new THREE.Color(color);
      const data = ctx.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const i = (y * canvas.width + x) * 4;
          const grain = Math.sin(x * 0.41 + y * 0.17) * 0.04 + Math.sin(x * 1.73) * 0.018 + (Math.random() - 0.5) * 0.12;
          const weave = surface === "fabric" ? (x % 9 < 2 || y % 11 < 2 ? -0.1 : 0.04) : 0;
          const brushed = surface === "brushed-metal" ? (Math.sin(y * 0.9) * 0.08 + (x % 23 === 0 ? 0.16 : 0)) : 0;
          const worn = surface === "worn" ? (Math.sin((x + y) * 0.19) * 0.05 + ((x * y) % 97 < 3 ? 0.18 : 0)) : 0;
          const factor = clamp(0.88 + grain + weave + brushed + worn, 0.42, 1.3);
          data.data[i] = clamp(base.r * 255 * factor, 0, 255);
          data.data[i + 1] = clamp(base.g * 255 * factor, 0, 255);
          data.data[i + 2] = clamp(base.b * 255 * factor, 0, 255);
          data.data[i + 3] = 255;
        }
      }
      ctx.putImageData(data, 0, 0);
      ctx.globalAlpha = surface === "brushed-metal" ? 0.32 : 0.18;
      ctx.strokeStyle = "#ffffff";
      for (let i = 0; i < 18; i += 1) {
        const y = (i * 17 + 11) % 128;
        ctx.beginPath();
        ctx.moveTo((i * 19) % 128, y);
        ctx.lineTo(128, y + Math.sin(i) * 14);
        ctx.stroke();
      }
      ctx.globalAlpha = surface === "fabric" ? 0.26 : 0.12;
      ctx.strokeStyle = "#000000";
      for (let i = 0; i < 128; i += surface === "fabric" ? 8 : 19) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 18, 128);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      this.textureCache[key] = texture;
      return texture;
    }

    collectMaterials(group) {
      const materials = [];
      group.traverse((child) => {
        if (!child.material) return;
        if (Array.isArray(child.material)) materials.push(...child.material);
        else materials.push(child.material);
      });
      materials.forEach((material) => {
        material.userData.baseOpacity = Number.isFinite(material.opacity) ? material.opacity : 1;
      });
      group.userData.materials = materials;
      return group;
    }

    setShapeOpacity(shape, opacity) {
      (shape.userData.materials || []).forEach((material) => {
        material.opacity = (material.userData.baseOpacity ?? 1) * opacity;
        material.depthWrite = opacity > 0.12;
      });
    }

    addBox(group, material, position, scale, rotation = [0, 0, 0]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      this.addEdgeLines(mesh);
      group.add(mesh);
      return mesh;
    }

    addCylinder(group, material, position, radiusTop, radiusBottom, height, rotation = [0, 0, 0], segments = 18) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      this.addEdgeLines(mesh, 0.24);
      group.add(mesh);
      return mesh;
    }

    addSphere(group, material, position, scale, segments = 24) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(8, Math.floor(segments * 0.65))), material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      this.addEdgeLines(mesh, 0.2);
      group.add(mesh);
      return mesh;
    }

    addEdgeLines(mesh, opacity = 0.32) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: "#b7b8b1",
          transparent: true,
          opacity,
          depthWrite: false
        })
      );
      mesh.add(edges);
    }

    addTorus(group, material, position, radius, tube, rotation = [0, 0, 0], segments = 42) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, segments), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      this.addEdgeLines(mesh, 0.2);
      group.add(mesh);
      return mesh;
    }

    addDetailBars(group, material, start, step, count, scale, rotation = [0, 0, 0]) {
      for (let i = 0; i < count; i += 1) {
        this.addBox(
          group,
          material,
          [start[0] + step[0] * i, start[1] + step[1] * i, start[2] + step[2] * i],
          scale,
          rotation
        );
      }
    }

    addRivetLine(group, material, start, step, count, radius = 0.022, zDepth = 0.035) {
      for (let i = 0; i < count; i += 1) {
        this.addCylinder(
          group,
          material,
          [start[0] + step[0] * i, start[1] + step[1] * i, start[2] + step[2] * i],
          radius,
          radius,
          zDepth,
          [Math.PI / 2, 0, 0],
          14
        );
      }
    }

    addScratchSet(group, material, origin, count, spreadX, spreadY, z, scale = [0.16, 0.006, 0.01]) {
      for (let i = 0; i < count; i += 1) {
        const x = origin[0] + Math.sin(i * 2.17) * spreadX;
        const y = origin[1] + Math.cos(i * 1.63) * spreadY;
        this.addBox(group, material, [x, y, z], scale, [0, 0, Math.sin(i) * 0.55]);
      }
    }

    addSlotRow(group, material, start, step, count, scale, rotation = [0, 0, 0]) {
      for (let i = 0; i < count; i += 1) {
        this.addBox(
          group,
          material,
          [start[0] + step[0] * i, start[1] + step[1] * i, start[2] + step[2] * i],
          scale,
          rotation
        );
      }
    }

    addExtrudedShape(group, material, points, depth, position = [0, 0, 0], scale = [1, 1, 1]) {
      const shape = new THREE.Shape();
      points.forEach((point, index) => {
        if (index === 0) shape.moveTo(point[0], point[1]);
        else shape.lineTo(point[0], point[1]);
      });
      shape.closePath();
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: 0.018,
          bevelSize: 0.018,
          bevelSegments: 2
        }),
        material
      );
      mesh.position.set(position[0], position[1], position[2] - depth / 2);
      mesh.scale.set(...scale);
      this.addEdgeLines(mesh, 0.18);
      group.add(mesh);
      return mesh;
    }

    addRoundedPanel(group, material, center, width, height, depth, radius) {
      const x = -width / 2;
      const y = -height / 2;
      const shape = new THREE.Shape();
      shape.moveTo(x + radius, y);
      shape.lineTo(x + width - radius, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + radius);
      shape.lineTo(x + width, y + height - radius);
      shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      shape.lineTo(x + radius, y + height);
      shape.quadraticCurveTo(x, y + height, x, y + height - radius);
      shape.lineTo(x, y + radius);
      shape.quadraticCurveTo(x, y, x + radius, y);
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: 0.024,
          bevelSize: 0.024,
          bevelSegments: 3
        }),
        material
      );
      mesh.position.set(center[0], center[1], center[2] - depth / 2);
      this.addEdgeLines(mesh, 0.16);
      group.add(mesh);
      return mesh;
    }

    createRifleShape() {
      const group = new THREE.Group();
      const black = this.makeMaterial("#363b3e", 0.96, { metalness: 0.42, roughness: 0.38 });
      const dark = this.makeMaterial("#4a5052", 0.96, { metalness: 0.34, roughness: 0.48 });
      const rubber = this.makeMaterial("#272a2b", 0.96, { metalness: 0.08, roughness: 0.76 });
      const recess = this.makeMaterial("#050606", 0.98, { metalness: 0.2, roughness: 0.72, surface: false });
      this.addExtrudedShape(
        group,
        dark,
        [
          [-1.05, 0.17],
          [-0.66, 0.24],
          [0.12, 0.24],
          [0.36, 0.17],
          [0.78, 0.16],
          [1.16, 0.15],
          [1.24, 0.08],
          [1.24, -0.08],
          [1.12, -0.15],
          [0.54, -0.07],
          [0.34, -0.24],
          [0.25, -0.52],
          [0.08, -0.55],
          [-0.02, -0.25],
          [-0.22, -0.18],
          [-0.3, -0.64],
          [-0.5, -0.65],
          [-0.47, -0.12],
          [-0.72, -0.1],
          [-0.98, -0.02]
        ],
        0.16,
        [0, 0, 0.02]
      );
      this.addCylinder(group, black, [-0.55, 0.08, 0], 0.035, 0.035, 1.25, [0, 0, Math.PI / 2], 24);
      this.addCylinder(group, black, [-1.2, 0.08, 0], 0.06, 0.045, 0.22, [0, 0, Math.PI / 2], 24);
      this.addBox(group, dark, [0.1, 0.05, 0.02], [0.75, 0.19, 0.2]);
      this.addBox(group, black, [-0.55, 0.15, 0], [0.72, 0.14, 0.2]);
      for (let i = 0; i < 14; i += 1) this.addBox(group, black, [-0.86 + i * 0.08, 0.26, 0], [0.045, 0.035, 0.22]);
      this.addBox(group, black, [0.62, 0.08, 0.02], [0.46, 0.1, 0.18]);
      this.addRoundedPanel(group, rubber, [1.0, 0.02, 0.02], 0.46, 0.25, 0.18, 0.065);
      this.addBox(group, rubber, [0.77, 0.03, 0.02], [0.24, 0.12, 0.17], [0, 0, -0.05]);
      this.addBox(group, rubber, [0.36, -0.28, 0], [0.18, 0.5, 0.16], [0, 0, -0.35]);
      this.addBox(group, black, [-0.02, -0.36, 0], [0.2, 0.62, 0.16], [0, 0, 0.08]);
      this.addBox(group, black, [-0.58, -0.24, 0], [0.14, 0.42, 0.14]);
      this.addBox(group, dark, [-0.08, -0.09, 0.01], [0.26, 0.18, 0.2]);
      this.addCylinder(group, black, [0.1, -0.15, 0.02], 0.075, 0.075, 0.22, [Math.PI / 2, 0, 0], 24);
      this.addDetailBars(group, dark, [-0.72, 0.02, 0.13], [0.12, 0, 0], 8, [0.055, 0.035, 0.045]);
      this.addDetailBars(group, rubber, [0.31, -0.15, 0.11], [0.02, -0.07, 0], 5, [0.16, 0.018, 0.035], [0, 0, -0.35]);
      this.addDetailBars(group, dark, [-0.03, -0.63, 0.09], [0.035, -0.005, 0], 4, [0.018, 0.42, 0.035], [0, 0, 0.08]);
      this.addDetailBars(group, dark, [0.78, 0.15, 0.11], [0.08, 0, 0], 3, [0.045, 0.025, 0.035]);
      this.addBox(group, black, [-0.02, -0.11, 0.14], [0.26, 0.045, 0.04]);
      this.addTorus(group, black, [0.1, -0.2, 0.13], 0.13, 0.012, [Math.PI / 2, 0, 0], 28);
      this.addCylinder(group, dark, [-0.98, 0.21, 0], 0.026, 0.026, 0.14, [Math.PI / 2, 0, 0], 16);
      this.addBox(group, dark, [0.42, 0.25, 0], [0.08, 0.12, 0.12]);
      this.addDetailBars(group, rubber, [-0.9, 0.03, 0.16], [0.11, 0, 0], 6, [0.06, 0.018, 0.035]);
      this.addDetailBars(group, black, [-0.9, -0.03, 0.16], [0.11, 0, 0], 6, [0.075, 0.012, 0.035]);
      this.addRivetLine(group, dark, [-0.18, 0.14, 0.12], [0.12, 0, 0], 5, 0.018, 0.035);
      this.addRivetLine(group, dark, [-0.9, 0.19, 0.13], [0.18, 0, 0], 4, 0.014, 0.03);
      this.addDetailBars(group, rubber, [0.84, -0.02, 0.13], [0.07, -0.012, 0], 4, [0.05, 0.012, 0.035], [0, 0, -0.08]);
      this.addDetailBars(group, rubber, [-1.25, 0.12, 0.08], [0.015, -0.04, 0], 3, [0.035, 0.012, 0.04], [0, 0, -0.2]);
      this.addBox(group, dark, [0.08, 0.2, 0.13], [0.32, 0.035, 0.035]);
      this.addBox(group, dark, [0.25, 0.17, 0.13], [0.08, 0.028, 0.035]);
      this.addSlotRow(group, recess, [-0.92, 0.09, 0.17], [0.14, 0, 0], 5, [0.075, 0.028, 0.026]);
      this.addSlotRow(group, recess, [-0.9, -0.01, 0.17], [0.14, 0, 0], 5, [0.055, 0.026, 0.026]);
      this.addSlotRow(group, recess, [-1.25, 0.08, 0.07], [0.02, 0.035, 0], 3, [0.038, 0.012, 0.026], [0, 0, 0.15]);
      this.addBox(group, recess, [0.05, 0.02, 0.15], [0.34, 0.045, 0.03]);
      this.addBox(group, recess, [0.98, 0.07, 0.13], [0.18, 0.026, 0.03], [0, 0, -0.03]);
      group.scale.setScalar(0.92);
      return this.collectMaterials(group);
    }

    createHelmetShape() {
      const group = new THREE.Group();
      const shell = this.makeMaterial("#556044", 0.96, { metalness: 0.22, roughness: 0.54 });
      const metal = this.makeMaterial("#444947", 0.96, { metalness: 0.4, roughness: 0.46 });
      const glass = this.makeMaterial("#1b2021", 0.82, { metalness: 0.12, roughness: 0.2 });
      const recess = this.makeMaterial("#070808", 0.98, { metalness: 0.1, roughness: 0.65, surface: false });
      this.addSphere(group, shell, [0, 0.12, 0], [0.68, 0.52, 0.58], 40);
      this.addBox(group, shell, [0, -0.16, 0], [1.06, 0.38, 0.8]);
      this.addBox(group, metal, [0, -0.02, 0.48], [1.14, 0.28, 0.12]);
      this.addBox(group, glass, [0, -0.03, 0.56], [0.8, 0.15, 0.06]);
      this.addBox(group, metal, [-0.62, -0.08, 0.2], [0.16, 0.42, 0.18], [0, 0.18, 0]);
      this.addBox(group, metal, [0.62, -0.08, 0.2], [0.16, 0.42, 0.18], [0, -0.18, 0]);
      this.addCylinder(group, metal, [0, -0.5, 0.05], 0.025, 0.025, 0.95, [0, 0, Math.PI / 2], 16);
      this.addBox(group, metal, [-0.42, -0.42, 0.03], [0.12, 0.38, 0.08], [0, 0, -0.34]);
      this.addBox(group, metal, [0.42, -0.42, 0.03], [0.12, 0.38, 0.08], [0, 0, 0.34]);
      this.addBox(group, metal, [0, 0.62, 0.04], [0.34, 0.08, 0.22]);
      this.addBox(group, metal, [0, 0.68, 0.04], [0.22, 0.06, 0.18]);
      this.addDetailBars(group, metal, [-0.48, 0.13, 0.55], [0.16, 0, 0], 7, [0.045, 0.03, 0.035]);
      this.addCylinder(group, metal, [-0.54, -0.02, 0.53], 0.035, 0.035, 0.06, [Math.PI / 2, 0, 0], 16);
      this.addCylinder(group, metal, [0.54, -0.02, 0.53], 0.035, 0.035, 0.06, [Math.PI / 2, 0, 0], 16);
      this.addDetailBars(group, shell, [-0.43, 0.28, 0.47], [0.18, 0.035, 0], 6, [0.12, 0.012, 0.025], [0, 0, 0.12]);
      this.addBox(group, metal, [0.69, -0.04, 0], [0.12, 0.2, 0.22]);
      this.addRivetLine(group, metal, [-0.42, 0.05, 0.57], [0.14, 0, 0], 7, 0.017, 0.028);
      this.addRivetLine(group, metal, [-0.52, -0.2, 0.5], [1.04, 0, 0], 2, 0.025, 0.04);
      this.addBox(group, metal, [-0.67, -0.02, -0.08], [0.07, 0.34, 0.14]);
      this.addBox(group, metal, [0.67, -0.02, -0.08], [0.07, 0.34, 0.14]);
      this.addTorus(group, metal, [-0.54, -0.54, 0.04], 0.08, 0.01, [Math.PI / 2, 0, 0], 24);
      this.addTorus(group, metal, [0.54, -0.54, 0.04], 0.08, 0.01, [Math.PI / 2, 0, 0], 24);
      this.addScratchSet(group, this.makeMaterial("#8c927d", 0.5, { metalness: 0.05, roughness: 0.95 }), [0, 0.28, 0], 10, 0.42, 0.18, 0.55, [0.1, 0.006, 0.008]);
      this.addBox(group, recess, [0, -0.21, 0.54], [0.92, 0.04, 0.035]);
      this.addBox(group, recess, [0, 0.1, 0.57], [0.72, 0.035, 0.025]);
      this.addSlotRow(group, recess, [-0.38, 0.36, 0.49], [0.15, 0.03, 0], 6, [0.07, 0.012, 0.018], [0, 0, 0.12]);
      return this.collectMaterials(group);
    }

    createPanShape() {
      const group = new THREE.Group();
      const iron = this.makeMaterial("#3e3d39", 0.96, { metalness: 0.55, roughness: 0.5 });
      const worn = this.makeMaterial("#5c5246", 0.9, { metalness: 0.45, roughness: 0.68 });
      this.addCylinder(group, iron, [0, 0.22, 0], 0.62, 0.55, 0.18, [Math.PI / 2, 0, 0], 48);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.045, 12, 64), iron);
      rim.position.set(0, 0.22, 0.1);
      group.add(rim);
      this.addCylinder(group, worn, [0, 0.22, 0.13], 0.46, 0.46, 0.025, [Math.PI / 2, 0, 0], 48);
      this.addBox(group, iron, [0, -0.58, 0], [0.17, 1.05, 0.12]);
      this.addCylinder(group, iron, [0, -1.08, 0], 0.08, 0.08, 0.16, [Math.PI / 2, 0, 0], 24);
      this.addCylinder(group, iron, [0, 0.8, 0], 0.13, 0.13, 0.34, [0, 0, Math.PI / 2], 24);
      this.addTorus(group, iron, [0, 0.22, 0.14], 0.42, 0.012, [0, 0, 0], 64);
      this.addTorus(group, iron, [0, 0.22, 0.151], 0.25, 0.008, [0, 0, 0], 48);
      this.addDetailBars(group, worn, [-0.3, 0.38, 0.17], [0.12, -0.05, 0], 6, [0.18, 0.01, 0.018], [0, 0, -0.25]);
      this.addCylinder(group, worn, [-0.055, -0.12, 0.09], 0.03, 0.03, 0.04, [Math.PI / 2, 0, 0], 18);
      this.addCylinder(group, worn, [0.055, -0.12, 0.09], 0.03, 0.03, 0.04, [Math.PI / 2, 0, 0], 18);
      this.addDetailBars(group, worn, [0, -0.44, 0.08], [0, -0.12, 0], 5, [0.14, 0.014, 0.025]);
      this.addScratchSet(group, worn, [0.02, 0.22, 0], 18, 0.38, 0.28, 0.17, [0.18, 0.004, 0.01]);
      this.addRivetLine(group, worn, [-0.055, -0.15, 0.13], [0.11, 0, 0], 2, 0.028, 0.045);
      this.addDetailBars(group, iron, [-0.07, -0.9, 0.08], [0.035, -0.06, 0], 4, [0.045, 0.012, 0.025], [0, 0, 0.25]);
      this.addTorus(group, iron, [0, -1.08, 0.09], 0.055, 0.008, [0, 0, 0], 24);
      group.scale.setScalar(0.82);
      return this.collectMaterials(group);
    }

    createGrenadeShape() {
      const group = new THREE.Group();
      const olive = this.makeMaterial("#48513a", 0.96, { metalness: 0.2, roughness: 0.58 });
      const metal = this.makeMaterial("#323735", 0.96, { metalness: 0.5, roughness: 0.42 });
      this.addSphere(group, olive, [0, -0.08, 0], [0.42, 0.58, 0.38], 36);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          const x = -0.28 + col * 0.14;
          const y = -0.42 + row * 0.18;
          const z = 0.33 - Math.abs(x) * 0.2;
          this.addBox(group, olive, [x, y, z], [0.1, 0.12, 0.08]);
        }
      }
      this.addCylinder(group, metal, [0, 0.55, 0], 0.18, 0.23, 0.2, [0, 0, 0], 24);
      this.addBox(group, metal, [0.28, 0.32, 0.04], [0.1, 0.72, 0.08], [0, 0, -0.14]);
      this.addBox(group, metal, [0, 0.74, 0], [0.34, 0.16, 0.22]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 10, 32), metal);
      ring.position.set(0.34, 0.58, 0.02);
      ring.rotation.y = Math.PI / 2;
      group.add(ring);
      this.addCylinder(group, metal, [0.23, 0.58, 0.02], 0.018, 0.018, 0.2, [0, 0, Math.PI / 2], 16);
      this.addTorus(group, metal, [0, 0.18, 0], 0.41, 0.01, [Math.PI / 2, 0, 0], 40);
      this.addTorus(group, metal, [0, -0.18, 0], 0.38, 0.01, [Math.PI / 2, 0, 0], 40);
      group.scale.setScalar(0.95);
      return this.collectMaterials(group);
    }

    createScopedRifleShape() {
      const group = new THREE.Group();
      const black = this.makeMaterial("#353a3d", 0.96, { metalness: 0.42, roughness: 0.36 });
      const grey = this.makeMaterial("#52585d", 0.96, { metalness: 0.36, roughness: 0.46 });
      const recess = this.makeMaterial("#050606", 0.98, { metalness: 0.2, roughness: 0.72, surface: false });
      this.addExtrudedShape(
        group,
        grey,
        [
          [-1.34, 0.18],
          [-0.66, 0.21],
          [0.18, 0.19],
          [0.54, 0.13],
          [1.12, 0.12],
          [1.25, 0.04],
          [1.24, -0.14],
          [1.08, -0.22],
          [0.72, -0.14],
          [0.42, -0.33],
          [0.31, -0.55],
          [0.15, -0.54],
          [0.02, -0.28],
          [-0.18, -0.22],
          [-0.26, -0.48],
          [-0.44, -0.5],
          [-0.44, -0.12],
          [-0.92, -0.08],
          [-1.16, -0.02]
        ],
        0.16,
        [0, 0, 0.02]
      );
      this.addCylinder(group, black, [-0.72, 0.1, 0], 0.026, 0.026, 1.45, [0, 0, Math.PI / 2], 24);
      this.addCylinder(group, black, [-1.48, 0.1, 0], 0.052, 0.04, 0.22, [0, 0, Math.PI / 2], 24);
      this.addBox(group, grey, [0.05, 0.02, 0], [0.82, 0.2, 0.18]);
      this.addBox(group, black, [0.64, 0.0, 0], [0.45, 0.17, 0.16]);
      this.addRoundedPanel(group, grey, [0.98, -0.04, 0.02], 0.42, 0.28, 0.18, 0.065);
      this.addBox(group, grey, [0.78, -0.02, 0.02], [0.22, 0.14, 0.16]);
      this.addBox(group, black, [0.38, -0.28, 0], [0.16, 0.42, 0.14], [0, 0, -0.28]);
      this.addBox(group, black, [0.0, -0.24, 0], [0.24, 0.36, 0.16]);
      this.addCylinder(group, black, [0.14, 0.32, 0], 0.08, 0.08, 0.56, [0, 0, Math.PI / 2], 32);
      this.addCylinder(group, black, [-0.18, 0.32, 0], 0.13, 0.1, 0.24, [0, 0, Math.PI / 2], 32);
      this.addCylinder(group, black, [0.46, 0.32, 0], 0.1, 0.13, 0.24, [0, 0, Math.PI / 2], 32);
      this.addBox(group, black, [-0.38, -0.28, 0], [0.04, 0.54, 0.04], [0, 0, -0.2]);
      this.addBox(group, black, [-0.12, -0.28, 0], [0.04, 0.54, 0.04], [0, 0, 0.2]);
      this.addDetailBars(group, grey, [-0.72, 0.17, 0.09], [0.13, 0, 0], 8, [0.07, 0.028, 0.03]);
      this.addCylinder(group, grey, [-0.92, -0.02, 0], 0.035, 0.035, 0.36, [0, 0, Math.PI / 2], 20);
      this.addCylinder(group, black, [-0.2, 0.14, 0], 0.035, 0.035, 0.34, [0, 0, Math.PI / 2], 20);
      this.addCylinder(group, black, [0.5, 0.14, 0], 0.035, 0.035, 0.22, [0, 0, Math.PI / 2], 20);
      this.addBox(group, grey, [0.8, -0.16, 0.09], [0.26, 0.04, 0.04]);
      this.addDetailBars(group, black, [0.35, -0.17, 0.1], [0.02, -0.06, 0], 4, [0.14, 0.016, 0.03], [0, 0, -0.28]);
      this.addTorus(group, black, [0.13, -0.15, 0.12], 0.12, 0.011, [Math.PI / 2, 0, 0], 28);
      this.addDetailBars(group, black, [-1.34, 0.14, 0.08], [0.035, 0, 0], 5, [0.018, 0.05, 0.035]);
      this.addRivetLine(group, grey, [-0.25, 0.12, 0.13], [0.16, 0, 0], 5, 0.014, 0.03);
      this.addRivetLine(group, black, [-0.18, 0.44, 0.09], [0.31, 0, 0], 3, 0.017, 0.03);
      this.addDetailBars(group, grey, [-0.02, -0.42, 0.1], [0.05, -0.01, 0], 4, [0.018, 0.3, 0.026], [0, 0, 0.03]);
      this.addDetailBars(group, black, [-0.46, -0.08, 0.11], [0.08, 0, 0], 5, [0.045, 0.012, 0.026]);
      this.addBox(group, grey, [0.96, 0.08, 0.12], [0.16, 0.035, 0.035]);
      this.addSlotRow(group, recess, [-0.8, 0.05, 0.14], [0.12, 0, 0], 7, [0.07, 0.025, 0.026]);
      this.addSlotRow(group, recess, [0.72, 0.05, 0.13], [0.08, 0, 0], 3, [0.052, 0.022, 0.025]);
      this.addBox(group, recess, [0.05, -0.01, 0.14], [0.46, 0.04, 0.026]);
      this.addBox(group, recess, [0.98, -0.08, 0.13], [0.15, 0.026, 0.024]);
      group.scale.setScalar(0.88);
      return this.collectMaterials(group);
    }

    createVestShape() {
      const group = new THREE.Group();
      const fabric = this.makeMaterial("#343737", 0.96, { metalness: 0.04, roughness: 0.88 });
      const panel = this.makeMaterial("#4a4f4b", 0.96, { metalness: 0.06, roughness: 0.82 });
      const recess = this.makeMaterial("#111212", 0.96, { metalness: 0.02, roughness: 0.95, surface: "fabric" });
      this.addRoundedPanel(group, fabric, [0, -0.02, 0.12], 0.96, 1.08, 0.2, 0.14);
      this.addRoundedPanel(group, fabric, [0, -0.02, -0.2], 0.84, 1.0, 0.14, 0.12);
      this.addRoundedPanel(group, panel, [-0.3, 0.62, 0.1], 0.17, 0.34, 0.065, 0.05);
      this.addRoundedPanel(group, panel, [0.3, 0.62, 0.1], 0.17, 0.34, 0.065, 0.05);
      this.addRoundedPanel(group, panel, [-0.5, -0.02, 0.02], 0.12, 0.72, 0.18, 0.04);
      this.addRoundedPanel(group, panel, [0.5, -0.02, 0.02], 0.12, 0.72, 0.18, 0.04);
      this.addBox(group, fabric, [-0.42, 0.57, -0.05], [0.08, 0.29, 0.12], [0, 0, -0.16]);
      this.addBox(group, fabric, [0.42, 0.57, -0.05], [0.08, 0.29, 0.12], [0, 0, 0.16]);
      this.addBox(group, fabric, [-0.52, -0.08, -0.08], [0.09, 0.62, 0.26]);
      this.addBox(group, fabric, [0.52, -0.08, -0.08], [0.09, 0.62, 0.26]);
      this.addBox(group, recess, [0, 0.38, 0.24], [0.62, 0.012, 0.018]);
      this.addBox(group, recess, [0, 0.18, 0.24], [0.62, 0.012, 0.018]);
      this.addBox(group, recess, [0, -0.02, 0.24], [0.62, 0.012, 0.018]);
      this.addRoundedPanel(group, panel, [-0.26, -0.47, 0.25], 0.2, 0.28, 0.08, 0.05);
      this.addRoundedPanel(group, panel, [0, -0.47, 0.25], 0.2, 0.28, 0.08, 0.05);
      this.addRoundedPanel(group, panel, [0.26, -0.47, 0.25], 0.2, 0.28, 0.08, 0.05);
      this.addScratchSet(group, this.makeMaterial("#626760", 0.35, { metalness: 0.02, roughness: 1, surface: "fabric" }), [0, 0.04, 0], 12, 0.38, 0.42, 0.27, [0.09, 0.004, 0.008]);
      group.scale.setScalar(0.98);
      return this.collectMaterials(group);
    }

    createFirstAidKitShape() {
      const group = new THREE.Group();
      const red = this.makeMaterial("#a72625", 0.96, { metalness: 0.06, roughness: 0.72 });
      const white = this.makeMaterial("#e4ded2", 0.96, { metalness: 0.02, roughness: 0.78 });
      const dark = this.makeMaterial("#2c2b29", 0.96, { metalness: 0.24, roughness: 0.48 });
      this.addRoundedPanel(group, white, [0, 0, -0.02], 1.02, 0.74, 0.42, 0.12);
      this.addRoundedPanel(group, red, [0, 0, 0.24], 0.92, 0.62, 0.06, 0.08);
      this.addBox(group, white, [0, 0, 0.31], [0.16, 0.42, 0.04]);
      this.addBox(group, white, [0, 0, 0.32], [0.42, 0.16, 0.04]);
      this.addBox(group, red, [0, -0.43, 0], [1.0, 0.1, 0.45]);
      this.addBox(group, red, [0, 0.43, 0], [0.58, 0.1, 0.32]);
      this.addTorus(group, red, [0, 0.55, 0.03], 0.27, 0.035, [0, 0, 0], 32);
      this.addBox(group, red, [0, 0.45, -0.05], [0.44, 0.08, 0.12]);
      this.addCylinder(group, dark, [0, 0.38, 0.28], 0.015, 0.015, 0.92, [0, 0, Math.PI / 2], 16);
      this.addBox(group, dark, [0.56, 0.08, 0.05], [0.08, 0.28, 0.12]);
      this.addDetailBars(group, dark, [-0.46, 0.39, 0.3], [0.055, 0, 0], 18, [0.022, 0.045, 0.025]);
      this.addDetailBars(group, dark, [-0.5, -0.29, 0.3], [0.1, 0, 0], 11, [0.04, 0.018, 0.024]);
      this.addBox(group, red, [-0.46, 0, 0.31], [0.08, 0.52, 0.04]);
      this.addBox(group, red, [0.46, 0, 0.31], [0.08, 0.52, 0.04]);
      this.addBox(group, dark, [0.42, 0.34, 0.31], [0.12, 0.09, 0.05]);
      this.addBox(group, dark, [-0.42, 0.34, 0.31], [0.12, 0.09, 0.05]);
      this.addCylinder(group, dark, [0.48, 0.38, 0.34], 0.018, 0.018, 0.22, [0, 0, 0], 12);
      this.addBox(group, white, [0, 0, 0.36], [0.23, 0.06, 0.03]);
      this.addBox(group, white, [0, 0, 0.365], [0.06, 0.23, 0.03]);
      this.addScratchSet(group, this.makeMaterial("#f2eadb", 0.42, { metalness: 0.02, roughness: 1 }), [0, 0.02, 0], 14, 0.42, 0.26, 0.36, [0.12, 0.004, 0.008]);
      this.addRivetLine(group, dark, [-0.48, -0.41, 0.27], [0.96, 0, 0], 2, 0.018, 0.035);
      this.addRivetLine(group, dark, [-0.36, 0.58, 0.02], [0.72, 0, 0], 2, 0.018, 0.035);
      this.addDetailBars(group, dark, [0.54, 0.22, 0.29], [0, -0.055, 0], 5, [0.028, 0.018, 0.04]);
      this.addBox(group, dark, [0.46, 0.02, 0.31], [0.065, 0.08, 0.05]);
      this.addBox(group, dark, [-0.46, 0.02, 0.31], [0.065, 0.08, 0.05]);
      return this.collectMaterials(group);
    }

    createBackpackShape() {
      const group = new THREE.Group();
      const olive = this.makeMaterial("#4f5138", 0.96, { metalness: 0.04, roughness: 0.86 });
      const strap = this.makeMaterial("#3e402f", 0.96, { metalness: 0.03, roughness: 0.9 });
      const recess = this.makeMaterial("#363829", 0.96, { metalness: 0.02, roughness: 0.94, surface: "fabric" });
      this.addRoundedPanel(group, olive, [0, 0.02, 0.06], 0.92, 1.14, 0.38, 0.17);
      this.addRoundedPanel(group, olive, [0, 0.3, 0.34], 0.7, 0.38, 0.1, 0.09);
      this.addRoundedPanel(group, olive, [0, -0.34, 0.36], 0.72, 0.42, 0.12, 0.09);
      this.addRoundedPanel(group, olive, [-0.55, -0.18, 0.1], 0.16, 0.48, 0.14, 0.06);
      this.addRoundedPanel(group, olive, [0.55, -0.18, 0.1], 0.16, 0.48, 0.14, 0.06);
      this.addBox(group, olive, [-0.47, -0.18, -0.03], [0.12, 0.44, 0.26]);
      this.addBox(group, olive, [0.47, -0.18, -0.03], [0.12, 0.44, 0.26]);
      for (let row = 0; row < 3; row += 1) {
        this.addBox(group, recess, [0, 0.38 - row * 0.16, 0.405], [0.56, 0.012, 0.018]);
        this.addBox(group, recess, [0, -0.28 - row * 0.13, 0.43], [0.5, 0.01, 0.018]);
      }
      this.addBox(group, strap, [-0.38, 0.05, -0.28], [0.12, 1.05, 0.08], [0, 0, -0.12]);
      this.addBox(group, strap, [0.38, 0.05, -0.28], [0.12, 1.05, 0.08], [0, 0, 0.12]);
      this.addRoundedPanel(group, strap, [-0.47, 0.08, 0.34], 0.055, 0.76, 0.04, 0.025);
      this.addRoundedPanel(group, strap, [0.47, 0.08, 0.34], 0.055, 0.76, 0.04, 0.025);
      this.addCylinder(group, strap, [-0.28, 0.56, 0.32], 0.015, 0.015, 0.28, [0, 0, Math.PI / 2], 12);
      this.addCylinder(group, strap, [0.28, 0.56, 0.32], 0.015, 0.015, 0.28, [0, 0, Math.PI / 2], 12);
      this.addScratchSet(group, this.makeMaterial("#77785c", 0.38, { metalness: 0.02, roughness: 1 }), [0, 0.08, 0], 16, 0.38, 0.42, 0.52, [0.1, 0.004, 0.008]);
      this.addBox(group, recess, [0, 0.04, 0.55], [0.58, 0.018, 0.022]);
      this.addBox(group, recess, [0, -0.56, 0.39], [0.48, 0.018, 0.022]);
      return this.collectMaterials(group);
    }

    getPortalPosition(handX, handY) {
      const worldX = clamp((0.5 - handX) * 7.2 - 0.55, -3.05, 2.7);
      const worldY = clamp((0.52 - handY) * 4.6 + 1.05, -1.35, 2.15);
      return new THREE.Vector3(worldX, worldY, 2.05);
    }

    setAnchorPosition(handX, handY, immediate) {
      if (!Number.isFinite(handX) || !Number.isFinite(handY)) return;
      const move = Math.hypot(handX - this.lastAnchorX, handY - this.lastAnchorY);
      if (!immediate && move < 0.018) return;
      this.lastAnchorX = handX;
      this.lastAnchorY = handY;
      this.targetPosition.copy(this.getPortalPosition(handX, handY));
      if (immediate) this.portal.position.copy(this.targetPosition);
    }

    summon(handX, handY) {
      this.setAnchorPosition(handX, handY, true);
      this.portal.visible = true;
      this.portalVisible = true;
      this.targetScale = 1;
      this.visibleScale = Math.max(this.visibleScale, 0.16);
      this.portal.scale.setScalar(this.visibleScale);
      this.setEmptyMode();
      this.onStateChange({ gesture: "pinch_open", effect: "empty_cube", activeCount: 0 });
    }

    reset() {
      this.portal.visible = false;
      this.portalVisible = false;
      this.targetScale = 0;
      this.visibleScale = 0;
      this.transition = null;
      this.variant = 0;
      this.mode = "standby";
      this.setEmptyMode();
      this.portal.position.set(0, 0, 1);
      this.targetPosition.set(0, 0, 2.05);
      this.lastAnchorX = 0.5;
      this.lastAnchorY = 0.48;
      this.onStateChange({ gesture: "waiting", effect: "standby", activeCount: 0 });
    }

    setEmptyMode() {
      this.mode = "empty";
      this.shapes.forEach((shape) => {
        shape.visible = false;
      });
      this.particles.visible = false;
      this.edges.material.color.set("#8dfcff");
    }

    setShapeMode(advance) {
      if (!this.portalVisible) this.summon(0.5, 0.48);
      if (advance && this.mode !== "empty") this.variant = (this.variant + 1) % this.shapes.length;
      else if (advance) this.variant = 0;
      this.startCoalesceTransition();
    }

    setParticleMode() {
      if (!this.portalVisible) this.summon(0.5, 0.48);
      this.startPowderBurst();
    }

    isBusy() {
      return Boolean(this.transition);
    }

    showShape() {
      this.transition = null;
      this.mode = "shape";
      this.shapes.forEach((shape, index) => {
        shape.visible = index === this.variant;
        this.setShapeOpacity(shape, 0.9);
      });
      this.particles.visible = false;
      this.edges.material.color.set("#8dfcff");
      this.onStateChange({ gesture: "fist", effect: "solid_animation", activeCount: this.variant + 1 });
    }

    showPowder() {
      this.transition = null;
      this.mode = "powder";
      this.shapes.forEach((shape) => {
        shape.visible = false;
      });
      this.particles.visible = true;
      this.particleMaterial.color.set("#d9eef0");
      this.particleMaterial.opacity = 0.68;
      this.edges.material.color.set("#d9eef0");
      this.onStateChange({ gesture: "open_palm", effect: "powder", activeCount: this.variant + 1 });
    }

    startPowderBurst() {
      if (this.mode === "powder" || this.transition?.type === "explode") return;
      this.transition = { type: "explode", elapsed: 0, duration: 0.28 };
      this.mode = "transition";
      this.shapes.forEach((shape, index) => {
        shape.visible = index === this.variant;
        this.setShapeOpacity(shape, 0.9);
      });
      this.particles.visible = true;
      this.particleMaterial.color.set("#d9eef0");
      this.particleMaterial.opacity = 0.86;
      this.edges.material.color.set("#d9eef0");
      this.seedExplosionParticles();
      this.onStateChange({ gesture: "open_palm", effect: "powder_burst", activeCount: this.variant + 1 });
    }

    startCoalesceTransition() {
      if (this.transition?.type === "coalesce") return;
      this.transition = { type: "coalesce", elapsed: 0, duration: 0.34 };
      this.mode = "transition";
      this.particles.visible = true;
      this.shapes.forEach((shape, index) => {
        shape.visible = index === this.variant;
        this.setShapeOpacity(shape, 0);
        shape.scale.setScalar(0.72);
      });
      this.particleMaterial.color.set("#d9eef0");
      this.particleMaterial.opacity = 0.78;
      this.edges.material.color.set("#8dfcff");
      this.seedCoalesceParticles();
      this.onStateChange({ gesture: "fist", effect: "powder_to_solid", activeCount: this.variant + 1 });
    }

    seedExplosionParticles() {
      for (let i = 0; i < this.particleSeeds.length; i += 1) {
        const idx = i * 3;
        const theta = this.particleSeeds[i].theta;
        const phi = this.particleSeeds[i].phi;
        const startRadius = randomInRange(0.16, 0.58);
        this.particleStartPositions[idx] = Math.cos(theta) * Math.sin(phi) * startRadius;
        this.particleStartPositions[idx + 1] = Math.cos(phi) * startRadius;
        this.particleStartPositions[idx + 2] = Math.sin(theta) * Math.sin(phi) * startRadius;
        this.particleTargetPositions[idx] = this.particlePowderTargets[idx];
        this.particleTargetPositions[idx + 1] = this.particlePowderTargets[idx + 1];
        this.particleTargetPositions[idx + 2] = this.particlePowderTargets[idx + 2];
      }
      this.particlePositions.set(this.particleStartPositions);
      this.particleGeometry.attributes.position.needsUpdate = true;
    }

    seedCoalesceParticles() {
      this.particleStartPositions.set(this.particlePositions);
      this.particleTargetPositions.set(this.particleSolidTargets);
    }

    update() {
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      if (this.portalVisible) this.updatePortal(t, delta);
      this.renderer.render(this.scene, this.camera);
    }

    updatePortal(t, delta) {
      this.visibleScale += (this.targetScale - this.visibleScale) * Math.min(1, delta * 7);
      this.portal.position.lerp(this.targetPosition, Math.min(1, delta * 7.5));
      this.portal.scale.setScalar(this.visibleScale);
      this.portal.rotation.set(0.18, -0.34, 0);
      this.edges.material.opacity = 0.92;

      if (this.transition) {
        this.updateTransition(delta);
        return;
      }

      this.shapes.forEach((shape, index) => {
        if (!shape.visible) return;
        shape.rotation.x = Math.sin(t * 0.9 + index) * 0.08;
        shape.rotation.y = Math.sin(t * 1.05 + index * 0.7) * 0.18;
        shape.rotation.z = Math.sin(t * 0.7 + index * 0.4) * 0.035;
        shape.scale.setScalar(1 + Math.sin(t * 3.2 + index) * 0.06);
      });

      if (!this.particles.visible) return;
      this.particleSeeds.forEach((seed, i) => {
        const angle = seed.theta + t * seed.speed * 0.18;
        const radius = seed.radius + 0.26 + Math.sin(t * 1.1 + seed.phase) * 0.055;
        const idx = i * 3;
        this.particlePositions[idx] = Math.cos(angle) * Math.sin(seed.phi) * radius;
        this.particlePositions[idx + 1] = Math.cos(seed.phi + Math.sin(t + seed.phase) * 0.08) * radius + Math.sin(t * 0.8 + seed.phase) * 0.05;
        this.particlePositions[idx + 2] = Math.sin(angle) * Math.sin(seed.phi) * radius;
      });
      this.particleGeometry.attributes.position.needsUpdate = true;
      this.particles.rotation.y -= delta * 0.12;
      this.particles.rotation.x += delta * 0.05;
    }

    updateTransition(delta) {
      this.transition.elapsed += delta;
      const t = clamp(this.transition.elapsed / this.transition.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);

      for (let i = 0; i < this.particleSeeds.length; i += 1) {
        const idx = i * 3;
        const wobble = Math.sin(this.transition.elapsed * 28 + this.particleSeeds[i].phase) * 0.05 * (1 - t);
        this.particlePositions[idx] = this.particleStartPositions[idx] + (this.particleTargetPositions[idx] - this.particleStartPositions[idx]) * eased + wobble;
        this.particlePositions[idx + 1] = this.particleStartPositions[idx + 1] + (this.particleTargetPositions[idx + 1] - this.particleStartPositions[idx + 1]) * eased;
        this.particlePositions[idx + 2] = this.particleStartPositions[idx + 2] + (this.particleTargetPositions[idx + 2] - this.particleStartPositions[idx + 2]) * eased + wobble;
      }
      this.particleGeometry.attributes.position.needsUpdate = true;

      this.shapes.forEach((shape, index) => {
        if (index !== this.variant) return;
        if (this.transition.type === "explode") {
          this.setShapeOpacity(shape, Math.max(0, 0.9 * (1 - eased * 1.35)));
          shape.scale.setScalar(1 + eased * 0.32);
          this.particleMaterial.opacity = Math.min(0.86, 0.22 + eased * 0.64);
        } else {
          this.setShapeOpacity(shape, Math.min(0.9, eased * 0.9));
          shape.scale.setScalar(0.72 + eased * 0.28);
          this.particleMaterial.opacity = Math.max(0, 0.78 * (1 - eased * 1.08));
        }
      });

      if (t >= 1) {
        if (this.transition.type === "explode") this.showPowder();
        else this.showShape();
      }
    }

    resize() {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const wasMobile = this.mobile;
      this.mobile = isMobileViewport();
      if (wasMobile !== this.mobile) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
        this.particleMaterial.size = this.mobile ? 0.055 : 0.044;
      }
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }

    destroy() {
      window.removeEventListener("resize", this.handleViewportChange);
      window.removeEventListener("orientationchange", this.handleViewportChange);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", this.handleViewportChange);
      disposeObject(this.scene);
      this.renderer.dispose();
    }
  }

  class CubeGestureCamera {
    constructor(options) {
      this.video = options.video;
      this.overlay = options.overlay;
      this.onSummon = options.onSummon;
      this.onShape = options.onShape;
      this.onParticles = options.onParticles;
      this.onReset = options.onReset || function () {};
      this.canControl = options.canControl || function () { return true; };
      this.onStatus = options.onStatus;
      this.handStates = {};
      this.portalHandKey = "";
      this.portalAnchorCenter = null;
      this.portalActive = false;
      this.lastSummonTime = 0;
      this.lastControlTime = 0;
      this.lastControlGesture = "";
      this.controlCandidateGesture = "";
      this.controlCandidateTime = 0;
      this.lastAnchorSeenTime = 0;
      this.hands = null;
      this.handsReady = null;
      this.stream = null;
      this.frameId = 0;
      this.processingFrame = false;
      this.running = false;
    }

    prepare() {
      if (!window.Hands || this.handsReady) return this.handsReady;
      this.handsReady = new Promise(async (resolve) => {
        try {
          const mobile = isMobileViewport();
          this.hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
          this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: mobile ? 0 : 1,
            minDetectionConfidence: mobile ? 0.58 : 0.68,
            minTrackingConfidence: mobile ? 0.54 : 0.62
          });
          this.hands.onResults((results) => this.handleResults(results));
          if (typeof this.hands.initialize === "function") await this.hands.initialize();
        } catch (error) {
          this.handsReady = null;
          resolve(null);
          return;
        }
        resolve(this.hands);
      });
      return this.handsReady;
    }

    async start() {
      if (this.running) return;
      if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        this.onStatus("摄像头无法开启：手机浏览器必须使用 HTTPS 链接。");
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.onStatus("当前浏览器无法调用摄像头。");
        return;
      }

      this.onStatus("摄像头启动中...");
      try {
        const mobile = isMobileViewport();
        const preferredConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: mobile ? 640 : 640 },
            height: { ideal: mobile ? 480 : 480 },
            frameRate: { ideal: mobile ? 24 : 30, max: 30 }
          }
        };
        try {
          this.stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        } catch (error) {
          if (error && (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError")) {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user" } });
          } else {
            throw error;
          }
        }
        this.video.srcObject = this.stream;
        this.video.muted = true;
        this.video.playsInline = true;
        await this.video.play();
        this.running = true;
        if (!window.Hands) {
          this.onStatus("摄像头已开启，但手势识别库加载失败。");
          return;
        }
        const hands = await this.prepare();
        if (!this.running || !hands) return;
        this.processFrame();
        this.onStatus("手势识别已就绪。张开让立体图像爆成粉末，握拳让粉末快速合成立体图像。");
      } catch (error) {
        this.running = false;
        if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.video.srcObject = null;
        this.onStatus(`摄像头无法开启：${formatCameraError(error)}`);
      }
    }

    processFrame() {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(() => this.processFrame());
      if (this.processingFrame || this.video.readyState < 2) return;
      this.processingFrame = true;
      this.hands
        .send({ image: this.video })
        .catch((error) => this.onStatus(`Hand tracking error: ${error.message || "unknown error"}`))
        .finally(() => {
          this.processingFrame = false;
        });
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.frameId);
      this.processingFrame = false;
      if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.video.srcObject = null;
      this.clearOverlay();
      this.resetState();
      this.onReset();
      this.onStatus("摄像头已关闭。");
    }

    resetState() {
      this.handStates = {};
      this.portalHandKey = "";
      this.portalAnchorCenter = null;
      this.portalActive = false;
      this.lastSummonTime = 0;
      this.lastControlTime = 0;
      this.lastControlGesture = "";
      this.controlCandidateGesture = "";
      this.controlCandidateTime = 0;
      this.lastAnchorSeenTime = 0;
    }

    handleResults(results) {
      this.clearOverlay();
      const now = performance.now();
      const landmarksList = results.multiHandLandmarks || [];
      const handedness = results.multiHandedness || [];
      if (this.portalActive && landmarksList.length === 0) {
        this.resetState();
        this.onReset();
        this.onStatus("未识别到手，立方体已隐藏。");
        return;
      }
      if (!landmarksList.length) {
        this.handStates = {};
        return;
      }

      const hands = landmarksList.map((landmarks, index) => {
        const label = handedness[index] && handedness[index].label ? handedness[index].label : `hand-${index}`;
        const center = averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
        const instant = classifyHand(landmarks);
        const previous = this.handStates[label] || {};
        const instantStreak = previous.instant === instant ? (previous.instantStreak || 0) + 1 : 1;
        const stableGesture = this.getStableGesture(previous, instant, instantStreak);
        return {
          key: label,
          landmarks,
          instant,
          gesture: stableGesture,
          instantStreak,
          center
        };
      });

      hands.forEach((hand) => {
        const previous = this.handStates[hand.key];
        if (
          !this.portalActive &&
          previous &&
          previous.sawPinch &&
          previous.gesture !== Gestures.OPEN_PALM &&
          hand.gesture === Gestures.OPEN_PALM &&
          now - this.lastSummonTime > 900
        ) {
          this.portalActive = true;
          this.portalHandKey = hand.key;
          this.portalAnchorCenter = { ...hand.center };
          this.lastSummonTime = now;
          this.lastAnchorSeenTime = now;
          this.onSummon(hand.center);
          Object.keys(this.handStates).forEach((key) => {
            this.handStates[key].sawPinch = false;
          });
        }
      });

      if (this.portalActive) {
        const controlHand = this.findControlHand(hands);
        this.handleControlGesture(controlHand, now);
      }

      this.handStates = hands.reduce((states, hand) => {
        const previous = this.handStates[hand.key] || {};
        states[hand.key] = {
          gesture: hand.gesture,
          instant: hand.instant,
          instantStreak: hand.instantStreak,
          sawPinch: hand.instant === Gestures.PINCH || (previous.sawPinch && hand.gesture !== Gestures.OPEN_PALM),
          t: now
        };
        return states;
      }, {});
    }

    findControlHand(hands) {
      if (!hands || hands.length < 2) return null;
      const candidates = hands.filter((hand) => {
        if (hand.key === this.portalHandKey) return false;
        if (!this.portalAnchorCenter) return true;
        return distance2D(hand.center, this.portalAnchorCenter) > 0.16;
      });
      if (candidates.length) return candidates[0];
      if (!this.portalAnchorCenter) return null;
      return hands
        .slice()
        .sort((a, b) => distance2D(b.center, this.portalAnchorCenter) - distance2D(a.center, this.portalAnchorCenter))[0];
    }

    handleControlGesture(controlHand, now) {
      if (!controlHand) {
        this.controlCandidateGesture = "";
        return;
      }

      const gesture = controlHand.gesture;
      if (gesture !== Gestures.FIST && gesture !== Gestures.OPEN_PALM) {
        this.controlCandidateGesture = "";
        return;
      }

      if (!this.canControl()) {
        this.controlCandidateGesture = "";
        return;
      }

      const requiredStreak = gesture === Gestures.FIST ? 5 : 4;
      if (controlHand.instant !== gesture || controlHand.instantStreak < requiredStreak) return;

      if (gesture !== this.controlCandidateGesture) {
        this.controlCandidateGesture = gesture;
        this.controlCandidateTime = now;
        return;
      }

      if (now - this.controlCandidateTime < 140) return;
      if (gesture === this.lastControlGesture || now - this.lastControlTime < 820) return;

      this.lastControlGesture = gesture;
      this.lastControlTime = now;
      if (gesture === Gestures.FIST) this.onShape();
      else this.onParticles();
    }

    getStableGesture(previous, instant, streak) {
      if (!instant) return previous.gesture || "";
      const required = instant === Gestures.PINCH ? 1 : isMobileViewport() ? 2 : 2;
      if (streak >= required) return instant;
      return previous.gesture || "";
    }

    clearOverlay() {
      const ctx = this.overlay.getContext("2d");
      ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  function distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function averagePoint(points) {
    return points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 }
    );
  }

  function isFingerExtended(landmarks, tip, pip, mcp, palmSize) {
    const wrist = landmarks[0];
    const mobile = isMobileViewport();
    const tipReach = distance(landmarks[tip], wrist) / palmSize;
    const pipReach = distance(landmarks[pip], wrist) / palmSize;
    const tipFromMcp = distance(landmarks[tip], landmarks[mcp]) / palmSize;
    const pipFromMcp = distance(landmarks[pip], landmarks[mcp]) / palmSize;
    return (
      tipReach > pipReach * (mobile ? 1.015 : 1.05) &&
      tipReach > (mobile ? 1.28 : 1.42) &&
      tipFromMcp > pipFromMcp * (mobile ? 1.08 : 1.18)
    );
  }

  function isFingerCurled(landmarks, tip, pip, palmSize) {
    const wrist = landmarks[0];
    const mobile = isMobileViewport();
    const tipReach = distance(landmarks[tip], wrist) / palmSize;
    const pipReach = distance(landmarks[pip], wrist) / palmSize;
    return tipReach < (mobile ? 1.25 : 1.42) || tipReach < pipReach * (mobile ? 1.01 : 1.04);
  }

  function classifyHand(landmarks) {
    if (!landmarks || landmarks.length < 21) return "";
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const palmSize = Math.max(distance(landmarks[0], landmarks[9]), distance(landmarks[5], landmarks[17]), 0.001);
    const extended = {
      index: isFingerExtended(landmarks, 8, 6, 5, palmSize),
      middle: isFingerExtended(landmarks, 12, 10, 9, palmSize),
      ring: isFingerExtended(landmarks, 16, 14, 13, palmSize),
      pinky: isFingerExtended(landmarks, 20, 18, 17, palmSize)
    };
    const extendedCount = Object.values(extended).filter(Boolean).length;
    const curledScore = [8, 12, 16, 20].reduce((score, tip) => score + (isFingerCurled(landmarks, tip, tip - 2, palmSize) ? 1 : 0), 0);
    const pinchDistance = distance(thumbTip, indexTip) / palmSize;
    const spread = distance(landmarks[8], landmarks[20]) / palmSize;
    const thumbSpread = distance(landmarks[4], landmarks[5]) / palmSize;
    const averageTipReach = [8, 12, 16, 20].reduce((sum, tip) => sum + distance(landmarks[tip], wrist) / palmSize, 0) / 4;
    const mobile = isMobileViewport();

    if (pinchDistance < (mobile ? 0.52 : 0.46) && distance(indexTip, wrist) / palmSize > (mobile ? 0.96 : 1.04)) {
      return Gestures.PINCH;
    }
    if (
      extendedCount >= 3 &&
      spread > (mobile ? 0.82 : 1.02) &&
      averageTipReach > (mobile ? 1.2 : 1.34) &&
      thumbSpread > (mobile ? 0.4 : 0.5)
    ) {
      return Gestures.OPEN_PALM;
    }
    if (extendedCount <= 1 || curledScore >= 3 || (averageTipReach < (mobile ? 1.2 : 1.34) && spread < (mobile ? 0.96 : 1.12))) {
      return Gestures.FIST;
    }
    return "";
  }

  function boot() {
    if (!window.THREE) return;
    const canvas = document.querySelector("#gesture-canvas");
    const stage = document.querySelector(".stage");
    const gestureName = document.querySelector("#gesture-name");
    const effectName = document.querySelector("#effect-name");
    const activeCount = document.querySelector("#active-count");
    const cameraVideo = document.querySelector("#camera-video");
    const handOverlay = document.querySelector("#hand-overlay");
    const cameraToggle = document.querySelector("#camera-toggle");
    const fullscreenToggle = document.querySelector("#fullscreen-toggle");
    const stageExitFullscreen = document.querySelector("#stage-exit-fullscreen");
    const cameraStatus = document.querySelector("#camera-status");
    const mockToggle = document.querySelector("#mock-toggle");

    const renderer = new CubeRenderer(canvas, (state) => {
      if (state.gesture) gestureName.textContent = state.gesture;
      if (state.effect) effectName.textContent = state.effect;
      if (Number.isFinite(state.activeCount)) activeCount.textContent = String(state.activeCount);
    });

    let animationId = 0;
    const frame = () => {
      renderer.update();
      animationId = requestAnimationFrame(frame);
    };
    frame();

    const camera = new CubeGestureCamera({
      video: cameraVideo,
      overlay: handOverlay,
      onSummon: (center) => renderer.summon(center.x, center.y),
      onShape: () => renderer.setShapeMode(true),
      onParticles: () => renderer.setParticleMode(),
      onReset: () => renderer.reset(),
      canControl: () => !renderer.isBusy(),
      onStatus: (message) => {
        cameraStatus.textContent = message;
      }
    });

    let mockTimer = 0;
    let mockRunning = false;
    const mockSteps = [
      () => renderer.summon(0.5, 0.46),
      () => renderer.setShapeMode(true),
      () => renderer.setParticleMode(),
      () => renderer.setShapeMode(true)
    ];
    let mockIndex = 0;

    function stopMock() {
      mockRunning = false;
      window.clearInterval(mockTimer);
      mockToggle.textContent = "开始模拟";
    }

    cameraToggle.addEventListener("click", async () => {
      if (camera.running) {
        camera.stop();
        stage.classList.remove("camera-on");
        cameraToggle.textContent = "开启摄像头";
        renderer.reset();
        return;
      }
      stopMock();
      await camera.start();
      stage.classList.toggle("camera-on", camera.running);
      cameraToggle.textContent = camera.running ? "关闭摄像头" : "开启摄像头";
    });

    mockToggle.addEventListener("click", () => {
      if (camera.running) {
        camera.stop();
        stage.classList.remove("camera-on");
        cameraToggle.textContent = "开启摄像头";
      }
      if (mockRunning) {
        stopMock();
        renderer.reset();
        cameraStatus.textContent = "模拟已停止。";
        return;
      }
      mockRunning = true;
      mockToggle.textContent = "停止模拟";
      cameraStatus.textContent = "模拟立方体交互运行中。";
      mockIndex = 0;
      mockSteps[mockIndex]();
      mockIndex += 1;
      mockTimer = window.setInterval(() => {
        mockSteps[mockIndex % mockSteps.length]();
        mockIndex += 1;
      }, 1100);
    });

    document.querySelectorAll("[data-cube-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.cubeAction;
        if (action === "summon") renderer.summon(0.5, 0.46);
        if (action === "shape") renderer.setShapeMode(true);
        if (action === "particles") renderer.setParticleMode();
      });
    });

    const setFullscreenLabel = (active) => {
      fullscreenToggle.textContent = active ? "退出全屏" : "全屏";
    };

    const toggleStageFullscreen = async (forceExit = false) => {
      const isNativeFullscreen = document.fullscreenElement === stage;
      const isExpanded = stage.classList.contains("stage-expanded");
      try {
        if (forceExit || isNativeFullscreen || isExpanded) {
          if (document.fullscreenElement) await document.exitFullscreen();
          stage.classList.remove("stage-expanded");
          setFullscreenLabel(false);
        } else if (stage.requestFullscreen && !/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          await stage.requestFullscreen();
          setFullscreenLabel(true);
        } else {
          stage.classList.add("stage-expanded");
          setFullscreenLabel(true);
        }
        setTimeout(() => renderer.resize(), 80);
      } catch (error) {
        if (forceExit) stage.classList.remove("stage-expanded");
        else stage.classList.toggle("stage-expanded");
        setFullscreenLabel(stage.classList.contains("stage-expanded"));
        setTimeout(() => renderer.resize(), 80);
      }
    };

    fullscreenToggle.addEventListener("click", () => toggleStageFullscreen());
    stageExitFullscreen.addEventListener("click", () => toggleStageFullscreen(true));
    document.addEventListener("fullscreenchange", () => {
      setFullscreenLabel(document.fullscreenElement === stage || stage.classList.contains("stage-expanded"));
      setTimeout(() => renderer.resize(), 80);
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => renderer.resize(), 120);
      setTimeout(() => renderer.resize(), 420);
    });

    window.cubeRenderer = renderer;
    window.cubeGestureCamera = camera;
    window.addEventListener("beforeunload", () => {
      cancelAnimationFrame(animationId);
      camera.stop();
      renderer.destroy();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
