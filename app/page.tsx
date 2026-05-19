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
          <img
            src="/kernel.png"
            alt=""
            className={`${styles.navLogoImg} ${pastHero ? styles.navLogoImgVisible : ""}`}
          />
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

        <p className={styles.heroEyebrow}>The operating system for food makers</p>
        <h1 className={styles.heroHeadline}>
          Stop being a kernel.<br /><em>Start being popcorn.</em>
        </h1>
        <p className={styles.heroSub}>
          Buried under compliance paperwork, spreadsheets, and software that costs a fortune
          and wasn&apos;t built for you. Kernel handles the infrastructure so you can pop!
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
              Packed with potential. A great product, real craft, genuine passion. You know your
              business, every recipe, every process, every standard you hold yourself to.
              You just need the infrastructure to match.
            </p>
            <p>
              That&apos;s what Kernel gives you. The compliance backbone, the production records,
              the traceability, so you can stop carrying the admin weight and focus on what
              you&apos;re actually here to make.
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
                  <li>£99/month — everything included</li>
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
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🏭</div>
            <span className={styles.featureTag}>Production</span>
            <div className={styles.featureTitle}>Digital production records</div>
            <div className={styles.featureDesc}>Log every production run, assign batch codes, track every ingredient used. HACCP-compliant batch records at the touch of a button.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>💰</div>
            <span className={styles.featureTag}>Inventory</span>
            <div className={styles.featureTitle}>Inventory management</div>
            <div className={styles.featureDesc}>Stock deducts automatically when you run a batch. Assign costs to ingredients and see your live stock value — ready for bookkeeping without spreadsheets.</div>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔔</div>
            <span className={styles.featureTag}>Alerts</span>
            <div className={styles.featureTitle}>Missed check alerts</div>
            <div className={styles.featureDesc}>Get an email the moment a check is overdue. Nothing falls through the cracks on a busy production day.</div>
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
              <p className={styles.founderQuote}>
                &ldquo;We built the tool we always needed. Now it&apos;s yours.&rdquo;
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
            One price.<br /><em>Everything included.</em>
          </h2>
          <p className={styles.pricingSub}>
            Growing food businesses are stuck between two bad choices.
            We built the third option.
          </p>
        </div>

        {/* Market gap comparison */}
        <div className={`${styles.marketComparison} ${styles.fadeIn}`}>
          <div className={styles.marketCol}>
            <p className={styles.marketColEyebrow}>Option 1</p>
            <p className={styles.marketColName}>Spreadsheets &amp; paper</p>
            <div className={styles.marketColPrice}>£0</div>
            <p className={styles.marketColNote}>per month</p>
            <ul className={styles.marketColList}>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Audit prep takes days, not minutes</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Traceability requires manual searching</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>More products means more admin</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Built on effort, not infrastructure</li>
            </ul>
          </div>
          <div className={styles.marketCol}>
            <p className={styles.marketColEyebrow}>Option 2</p>
            <p className={styles.marketColName}>Enterprise software</p>
            <div className={`${styles.marketColPrice} ${styles.marketColPriceCrossed}`}>£300–500</div>
            <p className={styles.marketColNote}>per month</p>
            <ul className={styles.marketColList}>
              <li><span className={`${styles.mcBullet} ${styles.mcYes}`}>✓</span>Compliance covered</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Built for enterprises, not for you</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Expensive — and still needs add-ons</li>
              <li><span className={`${styles.mcBullet} ${styles.mcNo}`}>✗</span>Multiple subscriptions to cover everything</li>
            </ul>
          </div>
          <div className={`${styles.marketCol} ${styles.marketColKernel}`}>
            <p className={styles.marketColEyebrow}>The third option</p>
            <p className={styles.marketColName}>Kernel</p>
            <div className={styles.marketColPrice}>£99</div>
            <p className={styles.marketColNote}>per month</p>
            <ul className={styles.marketColList}>
              <li><span className={`${styles.mcBullet} ${styles.mcYes}`}>✓</span>Fully compliant</li>
              <li><span className={`${styles.mcBullet} ${styles.mcYes}`}>✓</span>Built for growing food businesses</li>
              <li><span className={`${styles.mcBullet} ${styles.mcYes}`}>✓</span>Everything in one place, one login</li>
              <li><span className={`${styles.mcBullet} ${styles.mcYes}`}>✓</span>Built by one of you</li>
            </ul>
          </div>
        </div>

        {/* Single pricing card */}
        <div className={`${styles.pricingSingle} ${styles.fadeIn}`}>
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <div className={styles.planHeader}>
              <span className={styles.planBadge}><span className={styles.planPopularDot} /> Everything included</span>
              <div className={styles.planName}>One flat price.</div>
              <p className={styles.planTagline}>Every feature from day one. Unlimited users. No setup fee. No surprises.</p>
            </div>
            <div className={styles.priceRow}>
              <span className={styles.priceCurrency}>£</span>
              <span className={styles.priceAmount}>99</span>
              <span className={styles.pricePer}>/mo</span>
            </div>
            <p className={styles.priceContext}>Unlimited users · <strong>All features included</strong> · Cancel any time</p>
            <div className={styles.planDivider} />
            <ul className={styles.planFeatures}>
              {FEATURES_ALL.map((f) => (
                <li key={f} className={styles.planFeatureItem}>
                  <span className={styles.planCheck}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/login" className={styles.planBtn}>Get started — £99 / month</Link>
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
