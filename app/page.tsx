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

  function triggerPop() {
    if (popState !== "idle") return;
    setPopState("popping");
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 180);
    setTimeout(() => setPopState("popped"), 580);

    const pieces: RainPiece[] = Array.from({ length: 24 }, (_, i) => ({
      id: i, left: Math.random() * 100,
      size: 40 + Math.random() * 40,
      duration: 1.8 + Math.random() * 1.4,
      delay: i * 0.1,
    }));
    setRainPieces(pieces);
    setTimeout(() => setRainPieces([]), 5000);
  }

  const FEATURES_ALL = [
    "Unlimited QR code checklists",
    "Full SALSA audit trail",
    "Goods in & out logging",
    "Full forward & backward traceability",
    "Production records & batch logging",
    "Auto-deducting inventory",
    "Ingredient costing & live stock value",
    "Supplier approval management",
    "Missed check email alerts",
    "Julian code tracking",
  ];

  return (
    <div className={styles.page}>
      {/* Flash */}
      <div className={`${styles.popFlash} ${showFlash ? styles.popFlashActive : ""}`} />

      {/* Popcorn rain — uses the actual popcorn image */}
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
        />
      ))}

      {/* Nav */}
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <a href="#" className={styles.navLogo}>
          <img
            src="/kernel.png"
            alt=""
            className={`${styles.navLogoImg} ${pastHero ? styles.navLogoImgVisible : ""}`}
          />
          Kernel
        </a>
        <div className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login" className={styles.navCta}>Log in</Link>
        </div>
        {/* Mobile-only login button — always visible */}
        <Link href="/login" className={`${styles.navCta} ${styles.navCtaMobile}`}>Log in</Link>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        {/* Kernel / Popcorn image */}
        <div className={styles.kernelWrap} onClick={triggerPop}>
          {popState === "popped" ? (
            <img src="/popcorn.png" alt="Popcorn" className={styles.popcornReveal} />
          ) : (
            <img
              src="/kernel.png"
              alt="Kernel — click to pop"
              className={popState === "popping" ? styles.kernelPopping : styles.kernelImg}
            />
          )}
          {popState === "idle" && (
            <div className={styles.clickHint}>
              <span className={styles.clickHintArrow}>☝️</span>
              click me
            </div>
          )}
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
              Packed with potential. A great product, real craft, genuine passion. But buried
              under the weight of running a food business — compliance audits, paper records,
              expensive software that wasn&apos;t built for someone like you.
            </p>
            <p>
              A kernel has everything it needs to become something incredible. It just needs
              the right conditions. That&apos;s what Kernel gives you — the infrastructure,
              the records, the compliance backbone — so you can pop.
            </p>
          </div>
        </div>
        <div className={`${styles.fadeIn} ${styles.fadeDelay}`}>
          <div className={`${styles.stateCard} ${styles.stateBefore}`}>
            <p className={styles.stateTag}>Before Kernel</p>
            <ul className={styles.stateItems}>
              <li>Paper checklists that go missing</li>
              <li>££££/month across fragmented tools</li>
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
              <li>From £79/month — everything included</li>
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
            <div className={styles.featureDesc}>QR codes at every station. Staff scan, fill in, submit. Missed check alerts, digital sign-offs, full audit trail.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📦</div>
            <span className={styles.featureTag}>Supply chain</span>
            <div className={styles.featureTitle}>Goods in & out</div>
            <div className={styles.featureDesc}>Log every delivery and dispatch. Assign Julian codes. Full supplier approval management built in.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔍</div>
            <span className={styles.featureTag}>Traceability</span>
            <div className={styles.featureTitle}>Full forward & backward trace</div>
            <div className={styles.featureDesc}>Search any ingredient — see every batch it went into. Search any batch — see exactly where it was dispatched. Recall-ready in seconds.</div>
          </div>
          <div className={`${styles.featureCard} ${styles.featureCardSpan2}`}>
            <div className={styles.featureIcon}>🏭</div>
            <span className={styles.featureTag}>Production</span>
            <div className={styles.featureTitle}>Digital production records & inventory</div>
            <div className={styles.featureDesc}>Log every production run, assign batch codes, track every ingredient used. Inventory deducts automatically when you make a batch. Assign costs to ingredients and Kernel calculates your live stock value — ready for end-of-month bookkeeping without a single spreadsheet.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔔</div>
            <span className={styles.featureTag}>Alerts</span>
            <div className={styles.featureTitle}>Missed check alerts</div>
            <div className={styles.featureDesc}>Get an email the moment a check is overdue. Nothing falls through the cracks on a busy production day.</div>
          </div>
        </div>
      </section>

      {/* Founder story */}
      <section className={styles.showcase}>
        <div className={styles.showcaseInner}>
          <div className={`${styles.founderSection} ${styles.fadeIn}`}>
            <div className={styles.founderLeft}>
              <p className={styles.showcaseLabel}>Why Kernel exists</p>
              <h2 className={styles.showcaseHeadline}>
                Built by a food founder.<br /><em>For food founders.</em>
              </h2>
            </div>
            <div className={styles.founderRight}>
              <p className={styles.founderBody}>
                We know what you need because we are you. The pre-audit panic. The paper checklists
                that disappear. The spreadsheet you&apos;re still updating at 10pm instead of working
                on your next product.
              </p>
              <p className={styles.founderBody}>
                Kernel wasn&apos;t designed by enterprise software teams. It was built by someone
                who lived every one of those problems — and got tired of waiting for a solution
                that actually fit.
              </p>
              <p className={styles.founderQuote}>
                &ldquo;We built the tool we always needed. Now it&apos;s yours.&rdquo;
              </p>
            </div>
          </div>

          {/* Dashboard screenshot */}
          <div className={`${styles.screenshotWrap} ${styles.fadeIn}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dashboard-screenshot.png"
              alt="Kernel dashboard"
              className={styles.screenshotImg}
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.pricing} id="pricing">
        <div className={`${styles.pricingTop} ${styles.fadeIn}`}>
          <p className={styles.pricingEyebrow}>Pricing</p>
          <h2 className={styles.pricingHeadline}>
            Everything in one place.<br /><em>One simple price.</em>
          </h2>
          <p className={styles.pricingSub}>
            No modules. No add-ons. No surprises.
            Every feature, from day one.
          </p>
        </div>

        {/* Value comparison bar */}
        <div className={`${styles.valueBar} ${styles.fadeIn}`}>
          <div className={styles.valueBarItem}>
            <p className={styles.valueBarLabel}>Fragmented software</p>
            <div className={`${styles.valueBarPrice} ${styles.crossed}`}>££££<span style={{ fontSize: "0.4em" }}>/mo</span></div>
            <p className={styles.valueBarNote}>Compliance tool + stock system + traceability + records…</p>
          </div>
          <div className={styles.valueBarItem}>
            <p className={styles.valueBarLabel}>Kernel</p>
            <div className={`${styles.valueBarPrice} ${styles.kernel}`}>£79<span style={{ fontSize: "0.4em" }}>/mo</span></div>
            <p className={styles.valueBarNote}><strong>All of the above. One login.</strong></p>
          </div>
        </div>

        <div className={`${styles.pricingGrid} ${styles.fadeIn}`}>
          {/* Solo */}
          <div className={styles.pricingCard}>
            <div className={styles.planHeader}>
              <span className={styles.planBadge}>Solo</span>
              <div className={styles.planName}>Just you.</div>
              <p className={styles.planTagline}>Every single feature. One user. The full Kernel experience, nothing removed.</p>
            </div>
            <div className={styles.priceRow}>
              <span className={styles.priceCurrency}>£</span>
              <span className={styles.priceAmount}>79</span>
              <span className={styles.pricePer}>/mo</span>
            </div>
            <p className={styles.priceContext}>1 user · <strong>All features included</strong> · Cancel any time</p>
            <div className={styles.planDivider} />
            <ul className={styles.planFeatures}>
              {FEATURES_ALL.map((f) => (
                <li key={f} className={styles.planFeatureItem}>
                  <span className={styles.planCheck}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/login" className={styles.planBtn}>Get started</Link>
          </div>

          {/* Team — featured */}
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <div className={styles.planHeader}>
              <span className={styles.planBadge}><span className={styles.planPopularDot} /> Team</span>
              <div className={styles.planName}>You and your team.</div>
              <p className={styles.planTagline}>Five users. One platform. Everyone on the same page, every shift.</p>
            </div>
            <div className={styles.priceRow}>
              <span className={styles.priceCurrency}>£</span>
              <span className={styles.priceAmount}>149</span>
              <span className={styles.pricePer}>/mo</span>
            </div>
            <p className={styles.priceContext}>5 users · <strong>All features included</strong> · Cancel any time</p>
            <div className={styles.planDivider} />
            <ul className={styles.planFeatures}>
              {FEATURES_ALL.map((f) => (
                <li key={f} className={styles.planFeatureItem}>
                  <span className={styles.planCheck}>✓</span> {f}
                </li>
              ))}
              <li className={styles.planFeatureItem}>
                <span className={styles.planCheck}>✓</span> 5 team members
              </li>
            </ul>
            <Link href="/login" className={styles.planBtn}>Get started</Link>
          </div>
        </div>

        <p className={styles.guarantee}>
          🔒 &nbsp;No long contracts. No setup fees. Cancel any time.
        </p>
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
