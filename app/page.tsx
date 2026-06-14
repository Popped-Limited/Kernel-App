"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./marketing.module.css";

interface RainPiece {
  id: number; left: number; size: number; duration: number; delay: number;
}

export default function MarketingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [popState, setPopState] = useState<"idle" | "popping" | "popped">("idle");
  const [showFlash, setShowFlash] = useState(false);
  const [rainPieces, setRainPieces] = useState<RainPiece[]>([]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setPastHero(window.scrollY > window.innerHeight * 0.75);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add(styles.visible); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(`.${styles.fadeIn}`).forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Preload popcorn image before the pop fires
  useEffect(() => {
    const img = new window.Image();
    img.src = "/popcorn.png";
  }, []);

  // Auto-pop after 3 seconds
  useEffect(() => {
    const t = setTimeout(() => triggerPop(), 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerPop() {
    if (popState !== "idle") return;
    setPopState("popping");
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);
    setTimeout(() => setPopState("popped"), 280);

    const pieces: RainPiece[] = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 40 + Math.random() * 40,
      duration: 1.8 + Math.random() * 1.4,
      delay: i * 0.08,
    }));
    setRainPieces(pieces);
    setTimeout(() => setRainPieces([]), 5000);
  }

  return (
    <div className={styles.page}>
      {/* Flash */}
      <div className={`${styles.popFlash} ${showFlash ? styles.popFlashActive : ""}`} />

      {/* Popcorn rain — img with silent onError so broken icons never show */}
      {rainPieces.map((p) => (
        <img
          key={p.id}
          src="/popcorn.png"
          alt=""
          className={styles.popcornPiece}
          style={{
            left: `${p.left}vw`,
            width: p.size,
            height: p.size,
            objectFit: "contain",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
        />
      ))}

      {/* Nav */}
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <a href="#" className={styles.navLogo}>
          Kernel
        </a>
        <div className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login" className={styles.navCta}>Log in</Link>
        </div>
        <Link href="/login" className={`${styles.navCta} ${styles.navCtaMobile}`}>Log in</Link>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.kernelWrap} onClick={triggerPop}>
          {popState === "popped" ? (
            <img
              src="/popcorn.png"
              alt="Popcorn"
              className={styles.popcornReveal}
              onError={(e) => {
                // If image fails, replace with emoji
                const el = e.currentTarget;
                el.style.display = "none";
                const span = document.createElement("span");
                span.textContent = "🍿";
                span.style.cssText = "font-size:160px;line-height:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%;animation:popcornBurst 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards";
                el.parentNode?.appendChild(span);
              }}
            />
          ) : (
            <img
              src="/kernel.png"
              alt="Kernel — click to pop"
              className={popState === "popping" ? styles.kernelPopping : styles.kernelImg}
            />
          )}
        </div>

        <p className={styles.heroEyebrow}>The complete operating system for small food businesses</p>
        <h1 className={styles.heroHeadline}>
          Stop being a kernel.<br /><em>Start being popcorn.</em>
        </h1>
        <p className={styles.heroSub}>
          Buried under compliance paperwork, spreadsheets, and software that costs a fortune
          and wasn&apos;t built for you. Kernel handles the infrastructure so you can pop!
        </p>
        <div className={styles.heroActions}>
          <Link href="/signup" className={styles.btnPrimary}>Start free trial</Link>
          <a href="#transform" className={styles.btnGhost}>See how it works →</a>
        </div>
      </section>

      {/* Transform */}
      <section className={styles.transformSection} id="transform">
        <div className={styles.fadeIn}>
          <p className={styles.transformLabel}>The transformation</p>
          <h2 className={styles.transformHeadline}>
            Every food maker starts as a <em>kernel</em>
          </h2>
          <div className={styles.transformBody}>
            <p>
              You&apos;re packed with potential, a great product, and genuine passion. Kernel
              gives you the infrastructure to match.
            </p>
          </div>
        </div>
        <div className={`${styles.fadeIn} ${styles.fadeDelay}`}>
          <div className={styles.transformCards}>
            <div className={styles.transformCard}>
              <div className={`${styles.stateCard} ${styles.stateBefore}`}>
                <p className={styles.stateTag}>Before Kernel</p>
                <ul className={styles.stateItems}>
                  <li>Paper checklists that go missing</li>
                  <li>Enterprise software at £300–500/month</li>
                  <li>Spreadsheets for stock and costing</li>
                  <li>No traceability until audit day panic</li>
                  <li>Hours lost on admin every week</li>
                </ul>
              </div>
            </div>
            <div className={styles.stateArrow}>↓</div>
            <div className={styles.transformCard}>
              <div className={`${styles.stateCard} ${styles.stateAfter}`}>
                <p className={styles.stateTag}>After Kernel</p>
                <ul className={styles.stateItems}>
                  <li>QR codes, digital sign-offs, full audit trail</li>
                  <li>£149/month — everything included</li>
                  <li>Live stock value, auto-deducting inventory</li>
                  <li>Full traceability with a single search</li>
                  <li>Focus on making great food</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features} id="features">
        <p className={`${styles.featuresLabel} ${styles.fadeIn}`}>Everything in one place</p>
        <h2 className={`${styles.featuresHeadline} ${styles.fadeIn}`}>
          Not just compliance.<br /><em>The whole business.</em>
        </h2>
        <div className={`${styles.featuresGrid} ${styles.fadeIn}`}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📋</div>
            <span className={styles.featureTag}>Compliance</span>
            <div className={styles.featureTitle}>SALSA-ready checklists</div>
            <div className={styles.featureDesc}>Scan a QR code, fill it in, submit. Digital sign-offs and a full audit trail.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📦</div>
            <span className={styles.featureTag}>Supply chain</span>
            <div className={styles.featureTitle}>Goods in & out</div>
            <div className={styles.featureDesc}>Log every delivery and dispatch, with supplier approval built in.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔍</div>
            <span className={styles.featureTag}>Traceability</span>
            <div className={styles.featureTitle}>Full forward & backward trace</div>
            <div className={styles.featureDesc}>Trace any ingredient to every batch, and any batch to every customer. Recall-ready in seconds.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🏭</div>
            <span className={styles.featureTag}>Production</span>
            <div className={styles.featureTitle}>Digital production records</div>
            <div className={styles.featureDesc}>Batch codes, ingredients and HACCP records logged for every production run.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>💰</div>
            <span className={styles.featureTag}>Inventory</span>
            <div className={styles.featureTitle}>Inventory management</div>
            <div className={styles.featureDesc}>Stock deducts automatically as you produce. See your live stock value any time.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔔</div>
            <span className={styles.featureTag}>Alerts</span>
            <div className={styles.featureTitle}>Missed check alerts</div>
            <div className={styles.featureDesc}>Get an email the moment a check is overdue. Nothing slips through.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📖</div>
            <span className={styles.featureTag}>SOPs</span>
            <div className={styles.featureTitle}>SOP builder & storage</div>
            <div className={styles.featureDesc}>Write and store your SOPs in one place. Staff always see the latest version.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎓</div>
            <span className={styles.featureTag}>Training</span>
            <div className={styles.featureTitle}>Training portal</div>
            <div className={styles.featureDesc}>Upload your policies and run guided sessions — sign off the whole team in one go.</div>
          </div>
        </div>
      </section>

      {/* Founder story — no screenshot */}
      <section className={styles.showcase}>
        <div className={styles.showcaseInner}>
          <div className={`${styles.founderSection} ${styles.fadeIn}`}>
            <div className={styles.founderLeft}>
              <p className={styles.showcaseLabel}>Why Kernel exists</p>
              <h2 className={styles.showcaseHeadline}>
                Built by a food founder.<br /><em>For food founders.</em>
              </h2>
              <blockquote className={styles.founderQuote}>
                &ldquo;I built the tool we always needed. Now it&apos;s yours.&rdquo;
                <cite className={styles.founderCite}>Tom Palmer · Founder, Yep Kitchen</cite>
              </blockquote>
            </div>
            <div className={styles.founderRight}>
              <p className={styles.founderBody}>
                We know what you need because we are you. The pre-audit panic. The endless folders
                of paper records you&apos;re expected to maintain. The spreadsheet you&apos;re still
                updating at 10pm instead of working on your next product.
              </p>
              <p className={styles.founderBody}>
                Kernel started as an internal tool for a growing food brand — paying £400 a month
                for compliance software that wasn&apos;t made for us. We got tired of waiting for
                something that actually fit, so we built it ourselves. Every feature exists because
                a real food business needed it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.pricing} id="pricing">
        <div className={`${styles.pricingTop} ${styles.fadeIn}`}>
          <p className={styles.pricingEyebrow}>Pricing</p>
          <h2 className={styles.pricingHeadline}>
            £149 a month.<br /><em>Everything included.</em>
          </h2>
          <p className={styles.pricingSub}>
            Every feature. Unlimited users. No surprises.
          </p>
        </div>

        <div className={`${styles.pricingCta} ${styles.fadeIn}`}>
          <Link href="/signup" className={styles.btnPrimary}>Start your 7-day free trial</Link>
          <p className={styles.guarantee}>🔒 &nbsp;No contracts · Cancel any time</p>
          <p className={styles.pricingClimate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 22c1.5-7 6-10 9-12" />
            </svg>
            1% of your subscription funds carbon removal
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>
          Kernel
        </div>
        <div className={styles.footerLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login">Log in</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <p className={styles.footerCopy}>© 2026 Kernel, an app by Popped Limited — because every kernel deserves to pop.</p>
      </footer>
    </div>
  );
}
