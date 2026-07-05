export const mockGestureEvents = [
  { gesture: "fist", confidence: 0.95 },
  { gesture: "open_palm", confidence: 0.88 },
  { gesture: "one_finger", confidence: 0.9 },
  { gesture: "two_fingers", confidence: 0.9 },
  { gesture: "thumb", confidence: 0.92 },
  { gesture: "pinch", confidence: 0.94 }
];

export class MockGestureStream {
  constructor(callback, intervalMs = 850) {
    this.callback = callback;
    this.intervalMs = intervalMs;
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
      confidence: Math.max(0.2, Math.min(1, event.confidence + (Math.random() - 0.5) * 0.12))
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
