"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./marketing.module.css";

const KernelCanvas = dynamic(() => import("@/components/KernelCanvas"), { ssr: false });

interface RainPiece {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
}

export default function MarketingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [popped, setPopped] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [rainPieces, setRainPieces] = useState<RainPiece[]>([]);
  const fadeRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add(styles.visible); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(`.${styles.fadeIn}`).forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function triggerPop() {
    if (popped) return;
    setPopped(true);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);

    const pieces: RainPiece[] = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 20 + Math.random() * 24,
      duration: 1.5 + Math.random() * 1.5,
      delay: i * 0.08,
    }));
    setRainPieces(pieces);
    setTimeout(() => setRainPieces([]), 4500);
  }

  return (
    <div className={styles.page}>
      {/* Flash */}
      <div className={`${styles.popFlash} ${showFlash ? styles.popFlashActive : ""}`} />

      {/* Popcorn rain */}
      {rainPieces.map((p) => (
        <div
          key={p.id}
          className={styles.popcornPiece}
          style={{
            left: `${p.left}vw`,
            fontSize: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          🍿
        </div>
      ))}

      {/* Nav */}
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <a href="#" className={styles.navLogo}>
          <img src="/kernel.png" alt="" className={styles.navLogoImg} />
          Kernel
        </a>
        <div className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login" className={styles.navCta}>Log in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div style={{ marginBottom: 48 }}>
          <KernelCanvas popped={popped} onPop={triggerPop} />
        </div>
        <p className={styles.heroEyebrow}>The operating system for food makers</p>
        <h1 className={styles.heroHeadline}>
          Stop being a kernel.<br /><em>Start being popcorn.</em>
        </h1>
        <p className={styles.heroSub}>
          You&apos;re full of potential — buried under compliance paperwork, spreadsheets, and
          software that costs a fortune and wasn&apos;t built for you. Kernel handles the
          infrastructure so you can focus on what you actually make.
        </p>
        <div className={styles.heroActions}>
          <Link href="/login" className={styles.btnPrimary}>Log in to Kernel</Link>
          <a href="#transform" className={styles.btnGhost}>See how it works →</a>
        </div>
        <button className={styles.popHint} onClick={triggerPop}>🍿 click to pop</button>
      </section>

      {/* Ticker */}
      <div className={styles.ticker}>
        <div className={styles.tickerInner}>
          {[
            "SALSA compliance", "Batch traceability", "Goods in & out",
            "Production records", "Inventory management", "Ingredient costing",
            "QR code checklists", "SALSA compliance", "Batch traceability",
            "Goods in & out", "Production records", "Inventory management",
            "Ingredient costing", "QR code checklists",
          ].map((item, i) => (
            <span key={i}>
              <span className={styles.tickerItem}>{item}</span>
              <span className={styles.tickerCorn}>🌽</span>
            </span>
          ))}
        </div>
      </div>

      {/* Transform */}
      <section className={styles.transformSection} id="transform">
        <div className={styles.fadeIn}>
          <p className={styles.transformLabel}>The transformation</p>
          <h2 className={styles.transformHeadline}>
            Every food maker starts as a <em>kernel</em>
          </h2>
          <div className={styles.transformBody}>
            <p>
              Packed with potential. A great product, real craft, genuine passion. But buried under
              the weight of running a food business — compliance audits, paper records, expensive
              software that wasn&apos;t built for someone like you.
            </p>
            <p>
              A kernel has everything it needs to become something incredible. It just needs the
              right conditions. That&apos;s what Kernel gives you — the infrastructure, the records,
              the compliance backbone — so you can pop.
            </p>
          </div>
        </div>
        <div className={`${styles.fadeIn} ${styles.fadeDelay}`}>
          <div className={`${styles.stateCard} ${styles.stateBefore}`}>
            <p className={styles.stateTag}>Before Kernel</p>
            <ul className={styles.stateItems}>
              <li>Paper checklists that go missing</li>
              <li>£400+/month for basic compliance software</li>
              <li>Spreadsheets for stock and costing</li>
              <li>No traceability until audit day panic</li>
              <li>Hours lost on admin every week</li>
            </ul>
          </div>
          <div className={styles.stateArrow}>↓</div>
          <div className={`${styles.stateCard} ${styles.stateAfter}`}>
            <p className={styles.stateTag}>After Kernel</p>
            <ul className={styles.stateItems}>
              <li>QR codes, digital sign-offs, full audit trail</li>
              <li>From £29/month — everything included</li>
              <li>Live stock value, auto-deducting inventory</li>
              <li>Full traceability with a single search</li>
              <li>Focus on making great food</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features} id="features">
        <p className={`${styles.featuresLabel} ${styles.fadeIn}`}>Everything in one place</p>
        <h2 className={`${styles.featuresHeadline} ${styles.fadeIn}`}>
          Not just compliance.<br /><em>The whole operation.</em>
        </h2>
        <div className={`${styles.featuresGrid} ${styles.fadeIn}`}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📋</div>
            <span className={styles.featureTag}>Compliance</span>
            <div className={styles.featureTitle}>SALSA-ready checklists</div>
            <div className={styles.featureDesc}>
              QR codes at every station. Staff scan, fill in, submit. Missed check alerts,
              digital sign-offs, full audit trail.
            </div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📦</div>
            <span className={styles.featureTag}>Supply chain</span>
            <div className={styles.featureTitle}>Goods in & out</div>
            <div className={styles.featureDesc}>
              Log every delivery and dispatch. Assign ingredient codes. Photo evidence
              attached to every record.
            </div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔍</div>
            <span className={styles.featureTag}>Traceability</span>
            <div className={styles.featureTitle}>Full forward & backward trace</div>
            <div className={styles.featureDesc}>
              Search any ingredient — see every batch it went into. Search any batch — see
              exactly where it was dispatched. Recall-ready in seconds.
            </div>
          </div>
          <div className={`${styles.featureCard} ${styles.featureCardSpan2}`}>
            <div className={styles.featureIcon}>🏭</div>
            <span className={styles.featureTag}>Production</span>
            <div className={styles.featureTitle}>Digital production records & inventory</div>
            <div className={styles.featureDesc}>
              Log every production run, assign batch codes, track every ingredient used.
              Inventory deducts automatically when you make a batch. Assign costs to
              ingredients and Kernel calculates your live stock value — ready for
              end-of-month bookkeeping without a single spreadsheet.
            </div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔔</div>
            <span className={styles.featureTag}>Alerts</span>
            <div className={styles.featureTitle}>Missed check alerts</div>
            <div className={styles.featureDesc}>
              Get an email the moment a check is overdue. Nothing falls through the cracks
              on a busy production day.
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.pricing} id="pricing">
        <div className={`${styles.pricingTop} ${styles.fadeIn}`}>
          <h2 className={styles.pricingHeadline}>Priced for food businesses, not enterprises</h2>
          <p className={styles.pricingSub}>Everything included. No per-user fees. Cancel any time.</p>
        </div>
        <div className={`${styles.pricingGrid} ${styles.fadeIn}`}>
          <div className={styles.pricingCard}>
            <span className={styles.planBadge}>Starter</span>
            <p className={styles.planName}>Small producers</p>
            <div className={styles.planPrice}><sup>£</sup>29<span>/mo</span></div>
            <p className={styles.planDesc}>Everything you need to pass your SALSA audit and run a clean, compliant operation.</p>
            <ul className={styles.planFeatures}>
              <li>Up to 25 checklists</li>
              <li>5 team members</li>
              <li>Goods in & out records</li>
              <li>QR code generation</li>
              <li>Email alerts</li>
            </ul>
            <Link href="/login" className={styles.planBtn}>Get started</Link>
          </div>
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <span className={styles.planBadge}>Growth</span>
            <p className={styles.planName}>Most popular</p>
            <div className={styles.planPrice}><sup>£</sup>79<span>/mo</span></div>
            <p className={styles.planDesc}>Full traceability, production records, inventory and costing. The complete picture.</p>
            <ul className={styles.planFeatures}>
              <li>Unlimited checklists & team members</li>
              <li>Full forward & backward traceability</li>
              <li>Production records & batch logging</li>
              <li>Inventory with auto-deduction</li>
              <li>Ingredient costing & stock value</li>
            </ul>
            <Link href="/login" className={styles.planBtn}>Get started</Link>
          </div>
          <div className={styles.pricingCard}>
            <span className={styles.planBadge}>Scale</span>
            <p className={styles.planName}>Multi-site operations</p>
            <div className={styles.planPrice}><sup>£</sup>199<span>/mo</span></div>
            <p className={styles.planDesc}>Multiple sites, advanced reporting, API access and priority support.</p>
            <ul className={styles.planFeatures}>
              <li>Everything in Growth</li>
              <li>Multi-site support</li>
              <li>Advanced analytics</li>
              <li>API access</li>
              <li>Priority support & onboarding</li>
            </ul>
            <Link href="/login" className={styles.planBtn}>Talk to us</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>
          <img src="/kernel.png" alt="" className={styles.footerLogoImg} />
          Kernel
        </div>
        <div className={styles.footerLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login">Log in</Link>
        </div>
        <p className={styles.footerCopy}>© 2026 Kernel. Built for food manufacturers.</p>
      </footer>
    </div>
  );
}
