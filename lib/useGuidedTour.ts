"use client";

import { useEffect, useRef } from "react";
import { createTour, type DriveStep } from "@/lib/tour";
import { markTourComplete, type StepKey } from "@/lib/onboarding";

// Launches a driver.js guided tour when the page is opened with ?tour=<tourKey>
// (deep-linked from the /dashboard "Get started" checklist). Strips the param so
// a refresh doesn't relaunch it, and marks the onboarding step complete on finish.
//
// If `openPanel` is given, it's called after the intro step so a slide-over/add
// form is on screen before the tour points at its fields.
export function useGuidedTour(opts: {
  tourKey: StepKey;
  ready: boolean;
  orgId: string | null;
  steps: DriveStep[];
  openPanel?: () => void;
}) {
  const { tourKey, ready, orgId, steps, openPanel } = opts;
  const started = useRef(false);
  // Hold the latest orgId so completion is recorded even if org context
  // resolves after the tour started.
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;
  // Set when the tour finishes before orgId is known; the effect below records
  // completion as soon as orgId resolves.
  const pendingComplete = useRef(false);

  function recordComplete() {
    if (orgIdRef.current) {
      markTourComplete(orgIdRef.current, tourKey);
      pendingComplete.current = false;
    } else {
      pendingComplete.current = true;
    }
  }

  // Flush a deferred completion once org context resolves.
  useEffect(() => {
    if (pendingComplete.current && orgId) {
      markTourComplete(orgId, tourKey);
      pendingComplete.current = false;
    }
  }, [orgId, tourKey]);

  useEffect(() => {
    if (started.current || !ready) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") !== tourKey) return;

    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);

    const tour = createTour(steps, {
      onNextClick: (_el, _step, o) => {
        if (o.state.activeIndex === 0 && openPanel) {
          openPanel();
          setTimeout(() => tour.moveNext(), 200);
        } else {
          tour.moveNext();
        }
      },
      onDestroyed: () => recordComplete(),
    });
    tour.drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
