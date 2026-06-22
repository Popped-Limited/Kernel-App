"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { SOP, SOPStep } from "@/lib/types";

export default function SOPViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [sop, setSop] = useState<SOP | null>(null);
  const [steps, setSteps] = useState<SOPStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [sopRes, stepsRes] = await Promise.all([
      supabase.from("sops").select("*").eq("id", id).single(),
      supabase.from("sop_steps").select("*").eq("sop_id", id).order("order_index"),
    ]);
    if (sopRes.data) setSop(sopRes.data as SOP);
    if (stepsRes.data) setSteps(stepsRes.data as SOPStep[]);
    setLoading(false);
  }

  // Track active slide via IntersectionObserver
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || steps.length === 0) return;

    const slides = container.querySelectorAll<HTMLElement>("[data-slide]");
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.slide);
            setActiveIdx(idx);
          }
        });
      },
      { root: container, threshold: 0.6 }
    );
    slides.forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, [steps]);

  function scrollTo(idx: number) {
    const container = scrollRef.current;
    if (!container) return;
    const slide = container.querySelector<HTMLElement>(`[data-slide="${idx}"]`);
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-white/40">Loading…</p>
      </div>
    );
  }

  if (!sop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-white/50">SOP not found.</p>
      </div>
    );
  }

  const hasSteps = steps.length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="px-4 pt-safe-top pt-4 pb-3 flex items-center justify-between gap-4 shrink-0">
        <Link href="/compliance/sops" className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
          SOPs
        </Link>
        <div className="text-right min-w-0">
          <p className="text-sm font-semibold truncate">{sop.title}</p>
          {sop.category && <p className="text-xs text-white/40">{sop.category}</p>}
        </div>
      </header>

      {!hasSteps ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-sm">No steps in this SOP yet.</p>
        </div>
      ) : (
        <>
          {/* Carousel */}
          <div
            ref={scrollRef}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
            {steps.map((step, idx) => (
              <div
                key={step.id}
                data-slide={idx}
                className="w-screen shrink-0 snap-center flex flex-col max-w-xl mx-auto"
              >
                {/* Image */}
                <div className="relative w-full bg-gray-900" style={{ aspectRatio: "4/3", maxHeight: "55vh" }}>
                  {step.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.image_url}
                      alt={step.title ?? `Step ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <svg className="h-16 w-16 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                      </svg>
                    </div>
                  )}
                  {/* Step number badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Step</span>
                    <span className="text-sm font-bold text-white">{idx + 1}</span>
                    <span className="text-xs text-white/30">/ {steps.length}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 pt-5 pb-24">
                  {step.title && (
                    <h2 className="text-xl font-bold text-white leading-tight mb-3">{step.title}</h2>
                  )}
                  {step.body ? (
                    <p className="text-base text-white/75 leading-relaxed whitespace-pre-wrap">{step.body}</p>
                  ) : (
                    <p className="text-sm text-white/25 italic">No instructions for this step.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom nav */}
          <div className="fixed bottom-0 left-0 right-0 pb-safe-bottom bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-8 px-5 pb-6">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className={`rounded-full transition-all duration-200 ${
                    i === activeIdx ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/25 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>

            {/* Prev / Next */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => scrollTo(activeIdx - 1)}
                disabled={activeIdx === 0}
                className="flex-1 py-3.5 rounded-xl border border-white/15 text-sm font-medium text-white/60 hover:text-white hover:border-white/30 disabled:opacity-20 transition-colors"
              >
                ← Previous
              </button>
              {activeIdx < steps.length - 1 ? (
                <button
                  onClick={() => scrollTo(activeIdx + 1)}
                  className="flex-2 flex-[2] py-3.5 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-colors"
                >
                  Next step →
                </button>
              ) : (
                <Link
                  href="/compliance/sops"
                  className="flex-2 flex-[2] py-3.5 rounded-xl bg-brand text-brown text-sm font-semibold text-center hover:opacity-90 transition-opacity block"
                >
                  Done ✓
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
