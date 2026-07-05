export const Gestures = Object.freeze({
  FIST: "fist",
  OPEN_PALM: "open_palm",
  ONE_FINGER: "one_finger",
  TWO_FINGERS: "two_fingers",
  THUMB: "thumb",
  PINCH: "pinch"
});

export function normalizeGestureEvent(input) {
  const gesture = String(input?.gesture ?? "");
  const confidence = Number.isFinite(input?.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : 0;
  const controlY = Number.isFinite(input?.controlY) ? input.controlY : 0;

  return { gesture, confidence, controlY };
}
