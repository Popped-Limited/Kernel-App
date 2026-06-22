import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";

// Shared driver.js factory so every Kernel guided tour looks and behaves the
// same. Pass page-specific steps; styling/labels are centralised here.
// The brand look is applied via the `.kernel-tour` popover class (see globals.css).

export function createTour(steps: DriveStep[], config: Partial<Config> = {}) {
  return driver({
    showProgress: true,
    progressText: "Step {{current}} of {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Done",
    popoverClass: "kernel-tour",
    allowClose: true,
    overlayColor: "#3A3520",
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    steps,
    ...config,
  });
}

export type { DriveStep };
