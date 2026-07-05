import { GestureMapper } from "../mapper/GestureMapper.js";
import { GestureRenderer } from "../renderer/GestureRenderer.js";

export class GestureController {
  constructor(canvas, onStateChange = () => {}) {
    this.mapper = new GestureMapper();
    this.renderer = new GestureRenderer(canvas);
    this.onStateChange = onStateChange;
    this.running = false;
    this.animationId = 0;
  }

  receiveGesture(event) {
    const config = this.mapper.map(event);
    if (!config) return null;

    this.renderer.play(config);
    this.onStateChange({
      gesture: config.gesture,
      effect: config.effect,
      confidence: config.confidence,
      activeCount: this.renderer.effects.length
    });
    return config;
  }

  start() {
    if (this.running) return;
    this.running = true;

    const frame = () => {
      if (!this.running) return;
      this.renderer.update();
      this.onStateChange({ activeCount: this.renderer.effects.length });
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
}
