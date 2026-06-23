"use client";

import { useEffect } from "react";
import Link from "next/link";

const css = `
:root{
  --gold:#F5C65A;
  --gold-dark:#C9A24A;
  --cream:#EDE5D0;
  --ivory:#F7F2E8;
  --ink:#3A3520;
  --muted:#7A7050;
  --black:#000000;
  --white:#FFFFFF;

  --serif: var(--font-instrument-serif), Georgia, serif;
  --sans: var(--font-inter), system-ui, -apple-system, sans-serif;

  --maxw:1200px;
  --r:20px;
}

.kpage *{box-sizing:border-box;}
html{scroll-behavior:smooth;}
.kpage{
  background:var(--ivory);color:var(--ink);
  font-family:var(--sans);font-size:18px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
:where(.kpage) a{color:inherit;text-decoration:none;}

/* grain overlay */
.kpage::after{
  content:"";position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:.045;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.wrap{max-width:var(--maxw);margin:0 auto;padding:0 28px;}

/* ---------- type ---------- */
.kpage .serif{font-family:var(--serif);font-weight:400;letter-spacing:-.005em;line-height:1;}
.eyebrow{font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-dark);}
.italic{font-style:italic;color:var(--gold-dark);}
.kpage h1,.kpage h2,.kpage h3{margin:0;}

/* ---------- buttons / links ---------- */
.btn{
  display:inline-flex;align-items:center;gap:.5em;font-family:var(--sans);
  font-weight:700;font-size:18px;padding:17px 30px;border-radius:12px;
  cursor:pointer;border:none;background:var(--gold);color:var(--ink);
  transition:transform .25s cubic-bezier(.2,.8,.2,1), background .25s, box-shadow .25s;
  box-shadow:0 10px 30px -10px rgba(245,198,90,.7);
}
.btn:hover{background:var(--gold-dark);transform:translateY(-3px);box-shadow:0 18px 40px -12px rgba(201,162,74,.8);}
.btn-dark{background:var(--ink);color:var(--ivory);box-shadow:0 12px 30px -10px rgba(0,0,0,.45);}
.btn-dark:hover{background:var(--black);}
.textlink{font-weight:600;color:var(--muted);border-bottom:1px solid transparent;transition:color .2s,border-color .2s;}
.textlink:hover{color:var(--ink);border-color:var(--ink);}
.kpage a:focus-visible,.btn:focus-visible{outline:3px solid var(--gold-dark);outline-offset:3px;border-radius:8px;}

/* ---------- nav ---------- */
header.nav{position:sticky;top:0;z-index:100;backdrop-filter:saturate(150%) blur(12px);
  background:rgba(247,242,232,.75);border-bottom:1px solid rgba(58,53,32,.08);}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:76px;}
.logo{font-family:var(--serif);font-size:36px;line-height:1;}
.logo b{color:inherit;font-weight:inherit;}
.nav-links{display:flex;align-items:center;gap:32px;}
.nav-links a.lnk{font-weight:600;font-size:15px;color:var(--muted);transition:color .2s;}
.nav-links a.lnk:hover{color:var(--ink);}
.nav-cta{background:var(--ink);color:var(--ivory);padding:11px 22px;border-radius:10px;font-weight:700;font-size:15px;transition:transform .2s,background .2s;}
.nav-cta:hover{transform:translateY(-2px);background:var(--black);}
.nav-cta-gold{background:var(--gold);color:var(--ink);}
.nav-cta-gold:hover{background:var(--gold-dark);}
@media(max-width:820px){.nav-links a.lnk{display:none;}}

/* ---------- sections ---------- */
.kpage section{padding:130px 0;position:relative;}
.sec-head{max-width:780px;}
.sec-head.center{margin:0 auto;text-align:center;}
.sec-head h2{font-size:clamp(46px,6vw,76px);margin-top:16px;text-wrap:balance;}
.sec-head .lead{color:var(--muted);font-size:21px;margin-top:18px;}

/* ---------- hero ---------- */
.hero{min-height:100vh;display:flex;align-items:center;padding:110px 0 80px;overflow:hidden;}
.hero-glow{position:absolute;top:-220px;right:-160px;width:760px;height:760px;border-radius:50%;
  background:radial-gradient(circle,rgba(245,198,90,.5),rgba(245,198,90,0) 62%);filter:blur(10px);pointer-events:none;}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;position:relative;z-index:2;}
.hero h1{font-size:clamp(56px,8vw,104px);margin:20px 0 0;max-width:12ch;}
.hero .sub{max-width:34ch;margin:28px 0 0;font-size:20px;color:var(--muted);font-weight:500;line-height:1.5;}
.hero .sub b{color:var(--ink);font-weight:700;}
.hero-cta{display:flex;align-items:center;gap:26px;margin-top:38px;flex-wrap:wrap;}

/* staggered hero load */
.stagger>*{opacity:0;transform:translateY(20px);animation:rise .8s cubic-bezier(.2,.8,.2,1) forwards;}
.stagger>*:nth-child(1){animation-delay:.05s;}
.stagger>*:nth-child(2){animation-delay:.18s;}
.stagger>*:nth-child(3){animation-delay:.31s;}
.stagger>*:nth-child(4){animation-delay:.44s;}
@keyframes rise{to{opacity:1;transform:none;}}

/* hero UI card mockup (pure CSS) */
.mock{position:relative;justify-self:center;width:100%;max-width:440px;}
.mock-card{
  background:var(--white);border-radius:24px;border:1px solid rgba(58,53,32,.1);
  box-shadow:0 40px 80px -30px rgba(58,53,32,.45);overflow:hidden;
  transform:rotate(1.4deg);animation:float 6s ease-in-out infinite;
}
@keyframes float{0%,100%{transform:rotate(1.4deg) translateY(0);}50%{transform:rotate(1.4deg) translateY(-12px);}}
.mock-top{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:var(--cream);}
.mock-top .t{font-family:var(--serif);font-size:23px;}
.pill{font-weight:700;font-size:12px;padding:6px 12px;border-radius:999px;background:var(--ink);color:var(--gold);}
.pill.ok{background:#e7f0d8;color:#3f5e1d;}
.mock-body{padding:22px;}
.mrow{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px dashed rgba(58,53,32,.14);}
.mrow:last-child{border-bottom:none;}
.mrow .k{color:var(--muted);font-size:14px;font-weight:600;}
.mrow .v{font-size:15px;font-weight:700;}
.mbar{height:9px;border-radius:999px;background:var(--cream);overflow:hidden;margin-top:6px;}
.mbar i{display:block;height:100%;width:84%;background:linear-gradient(90deg,var(--gold),var(--gold-dark));border-radius:999px;}
.mock-chip{position:absolute;left:-26px;bottom:34px;background:var(--white);border:1px solid rgba(58,53,32,.1);
  border-radius:16px;padding:14px 18px;box-shadow:0 20px 40px -18px rgba(58,53,32,.4);transform:rotate(-3deg);
  animation:float 5s ease-in-out infinite .8s;}
.mock-chip .big{font-family:var(--serif);font-size:30px;line-height:1;}
.mock-chip .lbl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}

/* popcorn — third floating element, anchored inside the hero */
.hero-pop{position:absolute;z-index:4;transform:scale(0);opacity:0;
  filter:drop-shadow(0 16px 26px rgba(58,53,32,.4));}
.hero-pop.pop{animation:kpop .85s cubic-bezier(.18,.9,.32,1.4) forwards;}
.hero-pop.settled{animation:floatPop 5.5s ease-in-out infinite;opacity:1;}
@keyframes floatPop{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-15px) rotate(5deg);}}
.pop-a{top:42px;left:-48px;width:104px;}
.pop-b{top:-58px;right:78px;width:94px;}
.pop-c{bottom:-46px;right:-18px;width:124px;}
.pop-b.settled{animation-duration:6.2s;}
.pop-c.settled{animation-duration:5s;}

@media(max-width:900px){
  .hero-grid{grid-template-columns:1fr;gap:56px;text-align:left;}
  .mock{margin-top:6px;}
  .pop-a{left:-12px;width:82px;}
  .pop-b{right:22px;top:-44px;width:74px;}
  .pop-c{bottom:-34px;right:0;width:100px;}
}

/* ---------- problem ---------- */
.problem{background:var(--ink);color:var(--cream);}
.problem .eyebrow{color:var(--gold);}
.problem h2{color:var(--ivory);font-size:clamp(40px,5.5vw,68px);}
.pain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:60px;}
.pain{background:var(--cream);border:1px solid rgba(58,53,32,.08);border-radius:var(--r);color:var(--ink);
  padding:34px;transition:transform .3s,border-color .3s,box-shadow .3s;}
.pain:hover{transform:translateY(-6px);border-color:var(--gold);
  box-shadow:0 24px 50px -24px rgba(245,198,90,.65);}
.pain .ico{font-size:34px;}
.pain h3{font-family:var(--serif);font-size:30px;color:var(--ink);margin:16px 0 8px;}
.pain p{margin:0;color:var(--muted);font-size:16px;line-height:1.5;}
@media(max-width:820px){.pain-grid{grid-template-columns:1fr;}}

/* ---------- ecosystem (single features section) ---------- */
.eco{background:var(--ivory);}
.eco-title{white-space:nowrap;font-size:clamp(32px,5vw,62px)!important;}
@media(max-width:600px){.eco-title{white-space:normal;}}

/* ---------- features ---------- */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:60px;}
.feat{background:var(--cream);border:1px solid rgba(58,53,32,.08);border-radius:var(--r);padding:30px;
  transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s,border-color .3s;}
.feat:hover{transform:translateY(-4px);box-shadow:0 24px 46px -26px rgba(201,162,74,.7);border-color:var(--gold);}
.feat .ico{font-size:32px;filter:saturate(1.1);}
.feat h3{font-family:var(--serif);font-size:25px;margin:14px 0 6px;}
.feat p{margin:0;color:var(--muted);font-size:15px;line-height:1.45;}
@media(max-width:1000px){.feat-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:560px){.feat-grid{grid-template-columns:1fr;}}

/* ---------- we are you ---------- */
.weare-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:center;}
.weare blockquote{margin:0 0 30px;font-family:var(--serif);font-size:clamp(34px,4.6vw,56px);line-height:1.08;}
.weare blockquote b{color:var(--gold-dark);}
.weare blockquote .bq-gold{color:var(--gold-dark);font-weight:400;}
.weare .side{border-left:3px solid var(--gold);padding-left:26px;}
.weare .side p{margin:0 0 16px;color:var(--muted);font-size:17px;line-height:1.55;}
.weare .byline{margin:22px 0 0;color:var(--ink);font-weight:700;font-size:15px;}
.photo-card{background:var(--white);border-radius:20px;border:1px solid var(--gold-dark);
  box-shadow:0 40px 80px -30px rgba(58,53,32,.45);overflow:hidden;padding:6px;max-width:420px;margin:0 auto;
  transform:rotate(-1.6deg);animation:floatPhoto 6.5s ease-in-out infinite;}
.photo-card img{width:100%;display:block;border-radius:15px;object-fit:cover;aspect-ratio:4/5;}
@keyframes floatPhoto{0%,100%{transform:rotate(-1.6deg) translateY(0);}50%{transform:rotate(-1.6deg) translateY(-13px);}}
@media(max-width:860px){.weare-grid{grid-template-columns:1fr;gap:40px;}.photo-card{order:-1;}}

/* ---------- pricing ---------- */
.pricing{text-align:center;background:linear-gradient(180deg,var(--cream),var(--ivory));}
.price-headline{font-size:clamp(46px,6.2vw,84px)!important;}
.vs-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:56px;text-align:left;}
.vs-card{border-radius:24px;padding:42px 40px;border:1px solid rgba(58,53,32,.1);
  animation:floatSoft 6s ease-in-out infinite;}
.vs-card.vs-without{background:var(--white);box-shadow:0 30px 70px -44px rgba(58,53,32,.5);}
.vs-card.vs-with{background:var(--ink);color:var(--cream);border-color:rgba(255,255,255,.08);
  box-shadow:0 44px 90px -42px rgba(0,0,0,.6);animation-duration:6.8s;animation-delay:.7s;}
@keyframes floatSoft{0%,100%{transform:translateY(0);}50%{transform:translateY(-9px);}}
.vs-eyebrow{font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-dark);margin:0 0 24px;}
.vs-with .vs-eyebrow{color:var(--gold);}
.vs-list{list-style:none;margin:0;padding:0;}
.vs-list li{display:flex;align-items:flex-start;gap:14px;padding:11px 0;font-size:17px;line-height:1.4;}
.vs-with .vs-list li{color:#e9e2cf;}
.vs-mark{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;}
.vs-mark.no{background:rgba(58,53,32,.07);color:var(--muted);}
.vs-mark.yes{background:rgba(245,198,90,.18);color:var(--gold);}
.pricing-cta{margin-top:50px;}
.price-foot{margin-top:20px;color:var(--muted);font-size:15px;}
.price-foot b{color:var(--gold-dark);}
@media(max-width:760px){.vs-grid{grid-template-columns:1fr;}}

/* ---------- footer ---------- */
.kpage footer{background:var(--ink);color:#bdb59f;padding:54px 0;text-align:center;font-size:14px;}
.kpage footer .logo{color:var(--ivory);margin-bottom:10px;}
.kpage footer a{color:var(--gold);}
.footer-links{margin-top:14px;}
.footer-links a{margin:0 4px;}

/* ---------- scroll reveal ---------- */
.reveal{opacity:0;transform:translateY(30px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1);}
.reveal.in{opacity:1;transform:none;}
.d1{transition-delay:.1s;}.d2{transition-delay:.2s;}.d3{transition-delay:.3s;}

/* ---------- kernel pop ---------- */
@keyframes kpop{
  0%{transform:scale(0) rotate(-15deg);opacity:0;}
  55%{transform:scale(1.2) rotate(8deg);opacity:1;}
  78%{transform:scale(.94) rotate(-4deg);opacity:1;}
  100%{transform:scale(1) rotate(0);opacity:1;}
}
.pop-puff{position:fixed;width:9px;height:9px;border-radius:50%;
  background:var(--gold);z-index:8999;pointer-events:none;}

/* ---------- mobile: swipeable card carousels ---------- */
@media(max-width:768px){
  .pain-grid,.feat-grid,.vs-grid{
    display:flex;grid-template-columns:none;
    overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
    gap:16px;margin-left:-28px;margin-right:-28px;padding:6px 28px 20px;
    scrollbar-width:none;
  }
  .pain-grid::-webkit-scrollbar,.feat-grid::-webkit-scrollbar,.vs-grid::-webkit-scrollbar{display:none;}
  .pain-grid>*,.feat-grid>*,.vs-grid>*{flex:0 0 84%;scroll-snap-align:center;}
  .vs-card{padding:34px 26px;}
}

@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto;}
  .reveal{opacity:1!important;transform:none!important;transition:none!important;}
  .stagger>*{opacity:1!important;transform:none!important;animation:none!important;}
  .mock-card,.mock-chip,.photo-card,.vs-card{animation:none!important;}
  .hero-pop{opacity:1!important;transform:none!important;animation:none!important;}
  .pop-puff{display:none!important;}
}
`;

export default function MarketingPage() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // scroll reveal
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.16, rootMargin: "0px 0px -7% 0px" }
      );
      els.forEach((el) => io!.observe(el));
    } else {
      els.forEach((el) => el.classList.add("in"));
    }

    // Signature: Kernel Pop — three pieces pop in on seconds 1, 2, 3
    const popEls = Array.from(document.querySelectorAll<HTMLElement>(".hero-pop"));
    const puff = (el: HTMLElement) => {
      if (reduce) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (let i = 0; i < 10; i++) {
        const p = document.createElement("div");
        p.className = "pop-puff";
        document.body.appendChild(p);
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        const ang = Math.PI * 2 * (i / 10);
        const dist = 50 + Math.random() * 45;
        p.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            {
              transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${
                Math.sin(ang) * dist - 18
              }px)) scale(0)`,
              opacity: 0,
            },
          ],
          { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.2,.7,.3,1)" }
        );
        window.setTimeout(() => p.remove(), 950);
      }
    };

    const timers: number[] = [];
    const handlers: Array<[HTMLElement, () => void]> = [];
    popEls.forEach((el, i) => {
      const onEnd = () => el.classList.add("settled");
      el.addEventListener("animationend", onEnd, { once: true });
      handlers.push([el, onEnd]);
      const t = window.setTimeout(() => {
        el.classList.add("pop");
        puff(el);
      }, (i + 1) * 1000);
      timers.push(t);
    });

    return () => {
      io?.disconnect();
      timers.forEach((t) => clearTimeout(t));
      handlers.forEach(([el, h]) => el.removeEventListener("animationend", h));
    };
  }, []);

  return (
    <div className="kpage">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <header className="nav">
        <div className="wrap nav-inner">
          <div className="logo">
            Kern<b>el</b>
          </div>
          <nav className="nav-links" aria-label="Primary">
            <a className="lnk" href="#problem">The Problem</a>
            <a className="lnk" href="#ecosystem">Features</a>
            <a className="lnk" href="#pricing">Pricing</a>
            <Link className="nav-cta nav-cta-gold" href="/login">Log in</Link>
            <Link className="nav-cta" href="/signup">Start popping →</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="hero-glow" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="stagger">
            <p className="eyebrow">The operating system for small food makers</p>
            <h1 className="serif">
              Stop being a kernel. <span className="italic">Start being popcorn.</span>
            </h1>
            <p className="sub">
              The <b>only</b> app built for SALSA food manufacturers. Production records, live
              inventory, full traceability. <b>One system.</b>
            </p>
            <div className="hero-cta">
              <Link className="btn" href="/signup">Start popping →</Link>
              <a className="textlink" href="#ecosystem">See how it works ↓</a>
            </div>
          </div>

          {/* CSS UI mockup + popcorn (three floating elements) */}
          <div className="mock" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-pop pop-a" src="/popcorn.png" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-pop pop-b" src="/popcorn.png" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-pop pop-c" src="/popcorn.png" alt="" />
            <div className="mock-card">
              <div className="mock-top">
                <span className="t">Batch #KS-0042</span>
                <span className="pill ok">Fully Popped ✅</span>
              </div>
              <div className="mock-body">
                <div className="mrow"><span className="k">Product</span><span className="v">Sichuan Chilli Oil</span></div>
                <div className="mrow"><span className="k">Operator</span><span className="v">Kernel Sanders</span></div>
                <div className="mrow"><span className="k">Units produced</span><span className="v">480 jars</span></div>
                <div className="mrow"><span className="k">Traceability</span><span className="v">12 ingredients linked</span></div>
                <div className="mrow">
                  <div className="k" style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Record complete</span>
                      <span style={{ color: "var(--gold-dark)" }}>84%</span>
                    </div>
                    <div className="mbar"><i /></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mock-chip">
              <div className="lbl">Awaiting sign-off</div>
              <div className="big">4 checklists</div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="problem" id="problem">
        <div className="wrap">
          <div className="sec-head reveal">
            <p className="eyebrow">Life before Kernel</p>
            <h2 className="serif">Compliance shouldn&apos;t feel like a burden.</h2>
          </div>
          <div className="pain-grid">
            <div className="pain reveal">
              <div className="ico" aria-hidden="true">📋</div>
              <h3 className="serif">Paper slows you down</h3>
              <p>Batch sheets in a binder. One coffee spill from a failed audit.</p>
            </div>
            <div className="pain reveal d1">
              <div className="ico" aria-hidden="true">🧮</div>
              <h3 className="serif">Spreadsheets lack connectivity</h3>
              <p>Seven tabs only you understand. Stock that&apos;s never quite right.</p>
            </div>
            <div className="pain reveal d2">
              <div className="ico" aria-hidden="true">💸</div>
              <h3 className="serif">Existing software isn&apos;t made for you</h3>
              <p>Enterprise prices, enterprise bloat. Built for factories, not makers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ECOSYSTEM + FEATURES (merged) */}
      <section className="eco" id="ecosystem">
        <div className="wrap">
          <div className="sec-head center reveal">
            <p className="eyebrow">With Kernel</p>
            <h2 className="serif eco-title">One app. Everything connected.</h2>
            <p className="lead">Your auditor will actually smile.</p>
          </div>
          <div className="feat-grid">
            <div className="feat reveal"><div className="ico" aria-hidden="true">📝</div><h3 className="serif">Digital batch records</h3><p>Log production as it happens. No end-of-day catch-up.</p></div>
            <div className="feat reveal d1"><div className="ico" aria-hidden="true">📦</div><h3 className="serif">Live inventory tracking</h3><p>Stock updates itself as you produce and dispatch.</p></div>
            <div className="feat reveal d2"><div className="ico" aria-hidden="true">🔍</div><h3 className="serif">Ingredient traceability</h3><p>Trace any batch back to its raw materials instantly.</p></div>
            <div className="feat reveal"><div className="ico" aria-hidden="true">🚚</div><h3 className="serif">Supplier management</h3><p>Approved suppliers, specs and certs in one place.</p></div>
            <div className="feat reveal d1"><div className="ico" aria-hidden="true">📚</div><h3 className="serif">Document library</h3><p>SOPs, policies and records — always audit-ready.</p></div>
            <div className="feat reveal d2"><div className="ico" aria-hidden="true">📊</div><h3 className="serif">Audit-ready reports</h3><p>Export what your auditor wants, before they ask.</p></div>
            <div className="feat reveal"><div className="ico" aria-hidden="true">👥</div><h3 className="serif">Unlimited team access</h3><p>Add your whole kitchen. We don&apos;t charge per head.</p></div>
            <div className="feat reveal d1"><div className="ico" aria-hidden="true">🎓</div><h3 className="serif">Staff training portal</h3><p>Assign, track and record training in one place.</p></div>
            <div className="feat reveal d2"><div className="ico" aria-hidden="true">✅</div><h3 className="serif">Built for SALSA</h3><p>Designed around the standard you&apos;re audited against.</p></div>
          </div>
        </div>
      </section>

      {/* WE ARE YOU */}
      <section>
        <div className="wrap weare weare-grid">
          <div className="reveal">
            <blockquote>
              I didn&apos;t build this in an office.<br />
              <span className="bq-gold">I built it in my own factory.</span>
            </blockquote>
            <div className="side">
              <p>
                I went through SALSA, experienced the pain points first hand and got frustrated
                paying for expensive software that wasn&apos;t made for me.
              </p>
              <p>
                So I built Kernel to do exactly what I needed it to do. It saved me so much time, I
                thought — you probably need this too.
              </p>
              <p className="byline">Built by Tom Palmer, Yep Kitchen Founder</p>
            </div>
          </div>
          <div className="reveal d1">
            <div className="photo-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tom-in-the-factory.jpg" alt="Tom in the Yep Kitchen factory" />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="wrap">
          <div className="sec-head center reveal">
            <p className="eyebrow">Pricing</p>
            <h2 className="serif price-headline">£149 a month. <span className="italic">Everything included.</span></h2>
            <p className="lead">Every feature. Unlimited users. No surprises.</p>
          </div>
          <div className="vs-grid reveal d1">
            <div className="vs-card vs-without">
              <p className="vs-eyebrow">Without Kernel</p>
              <ul className="vs-list">
                <li><span className="vs-mark no">✗</span>Audit prep takes days, not minutes</li>
                <li><span className="vs-mark no">✗</span>Traceability means searching through folders</li>
                <li><span className="vs-mark no">✗</span>More products means more admin</li>
                <li><span className="vs-mark no">✗</span>Compliance software costs £300–500/month</li>
                <li><span className="vs-mark no">✗</span>SOPs live in folders no one can find</li>
                <li><span className="vs-mark no">✗</span>Multiple tools, multiple logins, multiple bills</li>
                <li><span className="vs-mark no">✗</span>Built on effort, not infrastructure</li>
              </ul>
            </div>
            <div className="vs-card vs-with">
              <p className="vs-eyebrow">With Kernel</p>
              <ul className="vs-list">
                <li><span className="vs-mark yes">✓</span>Audit-ready records, always up to date</li>
                <li><span className="vs-mark yes">✓</span>Full traceability in seconds, not hours</li>
                <li><span className="vs-mark yes">✓</span>Scales with your product range automatically</li>
                <li><span className="vs-mark yes">✓</span>SOPs &amp; training records, always accessible</li>
                <li><span className="vs-mark yes">✓</span>£149/month — a fraction of the alternative</li>
                <li><span className="vs-mark yes">✓</span>Everything in one place, one login</li>
                <li><span className="vs-mark yes">✓</span>Built for growing food businesses like yours</li>
              </ul>
            </div>
          </div>
          <div className="pricing-cta reveal">
            <Link className="btn" href="/signup">Start your free trial →</Link>
            <p className="price-foot"><b>Kernel EHO</b> &amp; <b>Kernel BRC</b> — coming soon.</p>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="logo">Kern<b>el</b></div>
          <p>Built in a kitchen by Yep Kitchen · SALSA accredited · kernelapp.co.uk</p>
          <p className="footer-links">
            <Link href="/login">Log in</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
