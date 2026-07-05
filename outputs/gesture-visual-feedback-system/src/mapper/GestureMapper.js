import { Gestures, normalizeGestureEvent } from "../gesture/GestureEvent.js";

const MAPPINGS = {
  [Gestures.FIST]: {
    effect: "center_cluster",
    color: "#ff455c",
    animation: "cluster"
  },
  [Gestures.OPEN_PALM]: {
    effect: "fullscreen_field",
    color: "#49a7ff",
    animation: "spread"
  },
  [Gestures.ONE_FINGER]: {
    effect: "clockwise_orbit",
    color: "#fff4b8",
    animation: "clockwise"
  },
  [Gestures.TWO_FINGERS]: {
    effect: "counter_orbit",
    color: "#7cffb2",
    animation: "counter_clockwise"
  },
  [Gestures.THUMB]: {
    effect: "heart_3d",
    color: "#ff5aa8",
    animation: "heart_3d"
  },
  [Gestures.PINCH]: {
    effect: "photo_focus",
    color: "#ffffff",
    animation: "random_photo_focus"
  }
};

export class GestureMapper {
  map(input) {
    const event = normalizeGestureEvent(input);
    const mapping = MAPPINGS[event.gesture];

    if (!mapping || event.confidence < 0.2) {
      return null;
    }

    return {
      ...mapping,
      intensity: Number((0.35 + event.confidence * 0.65).toFixed(3)),
      gesture: event.gesture,
      confidence: event.confidence,
      controlY: event.controlY
    };
  }
}
