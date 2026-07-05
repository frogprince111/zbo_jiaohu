import { GestureController } from "./controller/GestureController.js";
import { MockGestureStream } from "./mock/mockGestureStream.js";

const canvas = document.querySelector("#gesture-canvas");
const gestureName = document.querySelector("#gesture-name");
const effectName = document.querySelector("#effect-name");
const confidence = document.querySelector("#confidence");
const activeCount = document.querySelector("#active-count");
const mockToggle = document.querySelector("#mock-toggle");

const controller = new GestureController(canvas, (state) => {
  if (state.gesture) gestureName.textContent = state.gesture;
  if (state.effect) effectName.textContent = state.effect;
  if (Number.isFinite(state.confidence)) confidence.textContent = state.confidence.toFixed(2);
  if (Number.isFinite(state.activeCount)) activeCount.textContent = String(state.activeCount);
});

controller.start();

const stream = new MockGestureStream((event) => controller.receiveGesture(event), 900);
stream.start();

mockToggle.addEventListener("click", () => {
  const running = stream.toggle();
  mockToggle.textContent = running ? "Pause Mock" : "Resume Mock";
});

document.querySelectorAll("[data-gesture]").forEach((button) => {
  button.addEventListener("click", () => {
    controller.receiveGesture({
      gesture: button.dataset.gesture,
      confidence: 1
    });
  });
});

window.gestureController = controller;
