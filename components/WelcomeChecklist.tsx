"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import {
  ONBOARDING_STEPS,
  fetchDataDoneSteps,
  getCompletedTours,
  dismissOnboarding,
  type StepKey,
} from "@/lib/onboarding";

// "Get started" checklist shown on /dashboard to brand-new orgs. Hidden once the org
// dismisses it, completes all 5 steps, or was created before onboarding shipped
// (those orgs have onboarding_dismissed = true — see scripts/add-onboarding.sql).

export default function WelcomeChecklist() {
  const { orgId } = useOrganisation();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<Set<StepKey>>(new Set());
  const [dismissing, setDismissing] = useState(false);
  const [celebrating, setCelebrating] = useState(false); // all steps done — show the send-off
  const [popping, setPopping] = useState(false);         // run the "pop" animation, then unmount

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      // Gate on the org's onboarding_dismissed flag. Fail CLOSED: if the column
      // doesn't exist yet (migration not run) or the row can't be read, show
      // nothing — so existing customers are never shown onboarding by accident.
      const { data: org, error } = await supabase
        .from("organisations")
        .select("onboarding_dismissed")
        .eq("id", orgId)
        .single();
      if (cancelled || error || !org || org.onboarding_dismissed) return;

      const dataDone = await fetchDataDoneSteps();
      const tourDone = getCompletedTours(orgId);
      for (const k of tourDone) dataDone.add(k);
      if (cancelled) return;

      setDone(dataDone);
      setShow(true);
      // Every step complete → show the celebratory send-off, then pop away.
      if (dataDone.size >= ONBOARDING_STEPS.length) setCelebrating(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Hold the congrats note briefly, then trigger the pop animation.
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setPopping(true), 2200);
    return () => clearTimeout(t);
  }, [celebrating]);

  // When the pop animation finishes, persist the dismissal and unmount.
  function handlePopEnd() {
    if (orgId) dismissOnboarding(orgId);
    setShow(false);
  }

  async function handleDismiss() {
    if (!orgId) return;
    setDismissing(true);
    await dismissOnboarding(orgId);
    setShow(false);
  }

  if (!show) return null;

  const doneCount = done.size;
  const total = ONBOARDING_STEPS.length;
  const pct = Math.round((doneCount / total) * 100);

  // All done — celebratory send-off that "pops" away to reveal the dashboard.
  if (celebrating) {
    return (
      <section
        onAnimationEnd={popping ? handlePopEnd : undefined}
        className={`card overflow-hidden border-2 border-brand shadow-md bg-brand text-center ${
          popping ? "animate-pop" : ""
        }`}
      >
        <div className="px-5 py-8">
          <div className="text-5xl mb-2 animate-bounce">🍿</div>
          <h2 className="text-lg font-bold text-brown">Congratulations — you&apos;re ready to pop!</h2>
          <p className="text-sm text-brown/70 mt-1">You&apos;re all set up. Here&apos;s your dashboard.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden border-2 border-brand shadow-md">
      <div className="bg-brand px-5 py-4 border-b border-brand-dark/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-brown">Welcome to Kernel 👋</h2>
            <p className="text-sm text-brown/70 mt-0.5">
              {doneCount === 0
                ? "Let's get you set up — here are 5 steps to get going."
                : `${doneCount} of ${total} done — nice work.`}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="text-xs text-brown/50 hover:text-brown transition shrink-0"
          >
            Dismiss
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-brown/15 overflow-hidden">
          <div className="h-full bg-brown rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ol className="divide-y divide-gray-100">
        {ONBOARDING_STEPS.map((step, i) => {
          const isDone = done.has(step.key);
          return (
            <li key={step.key} className="flex items-center gap-3 px-5 py-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone ? "bg-brand text-brown" : "bg-gray-100 text-gray-500"
                }`}
              >
                {isDone ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 10l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {step.title}
                </p>
                {!isDone && <p className="text-xs text-gray-500 mt-0.5">{step.blurb}</p>}
              </div>
              {!isDone && (
                <button
                  onClick={() => router.push(step.href)}
                  className="btn-primary text-xs py-1.5 px-3 shrink-0"
                >
                  Show me how →
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
