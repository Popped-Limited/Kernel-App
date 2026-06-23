"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
.kpage .hero{min-height:80vh;display:flex;align-items:center;padding:64px 0 76px;overflow:hidden;}
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

/* ===== Before Kernel — "replaces all this" struck list ===== */
.problem-grid{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center;}
.problem-head{font-size:clamp(34px,4vw,56px)!important;line-height:1.05;}
.problem-lead{margin:22px 0 0;color:#cfc7b2;font-size:19px;line-height:1.55;max-width:34ch;}
.replace-list{list-style:none;margin:0;padding:0;}
.replace-item{font-family:var(--serif);font-size:clamp(23px,2.5vw,33px);line-height:1.2;padding:13px 0;color:var(--ivory);}
.replace-item span{position:relative;display:inline-block;transition:opacity .45s ease .3s;}
.replace-item span::after{content:"";position:absolute;left:-2px;top:56%;height:3px;width:0;
  background:var(--gold);border-radius:3px;transition:width 1s cubic-bezier(.45,.05,.3,1);}
.replace-list.in .replace-item span{opacity:.42;transition-delay:.7s;}
.replace-list.in .replace-item span::after{width:calc(100% + 4px);}
.replace-list.in .replace-item:nth-child(1) span::after{transition-delay:.1s;}
.replace-list.in .replace-item:nth-child(2) span::after{transition-delay:.55s;}
.replace-list.in .replace-item:nth-child(3) span::after{transition-delay:1s;}
.replace-list.in .replace-item:nth-child(4) span::after{transition-delay:1.45s;}
.replace-list.in .replace-item:nth-child(5) span::after{transition-delay:1.9s;}
.replace-list.in .replace-item:nth-child(6) span::after{transition-delay:2.35s;}
.replace-list.in .replace-item:nth-child(1) span{transition-delay:.7s;}
.replace-list.in .replace-item:nth-child(2) span{transition-delay:1.15s;}
.replace-list.in .replace-item:nth-child(3) span{transition-delay:1.6s;}
.replace-list.in .replace-item:nth-child(4) span{transition-delay:2.05s;}
.replace-list.in .replace-item:nth-child(5) span{transition-delay:2.5s;}
.replace-list.in .replace-item:nth-child(6) span{transition-delay:2.95s;}
@media(max-width:860px){.problem-grid{grid-template-columns:1fr;gap:40px;}.problem-lead{max-width:none;}}

/* ===== With Kernel — interactive feature switcher ===== */
.switch{display:grid;grid-template-columns:.82fr 1.18fr;gap:36px;margin-top:56px;align-items:stretch;}
.switch-list{display:flex;flex-direction:column;gap:4px;}
.switch-item{display:flex;gap:16px;align-items:flex-start;text-align:left;cursor:pointer;width:100%;
  background:transparent;border:none;border-radius:16px;padding:17px 20px;position:relative;font-family:var(--sans);
  transition:background .25s;}
.switch-item::before{content:"";position:absolute;left:0;top:15px;bottom:15px;width:3px;border-radius:3px;background:transparent;transition:background .25s;}
.switch-item:hover{background:rgba(201,162,74,.08);}
.switch-item.on{background:var(--cream);}
.switch-item.on::before{background:var(--gold);}
.si-ico{font-size:23px;line-height:1.25;}
.si-text{display:flex;flex-direction:column;gap:2px;min-width:0;}
.si-title{font-family:var(--serif);font-size:23px;color:var(--ink);line-height:1.1;}
.si-desc{font-size:14px;color:var(--muted);line-height:1.4;max-height:0;overflow:hidden;opacity:0;transition:opacity .3s ease;}
.switch-item.on .si-desc{max-height:52px;opacity:1;}
.switch-preview{position:relative;min-height:430px;}
.sp-card{position:absolute;inset:0;background:var(--white);border:1px solid rgba(58,53,32,.12);border-radius:22px;
  box-shadow:0 40px 80px -40px rgba(58,53,32,.5);overflow:hidden;opacity:0;transform:translateY(14px) scale(.99);
  transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);pointer-events:none;}
.sp-card.on{opacity:1;transform:none;pointer-events:auto;}
/* preview internals */
.pv{display:flex;flex-direction:column;gap:13px;height:100%;}
.pv-top{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.pv-ttl{font-family:var(--serif);font-size:25px;}
.pv-pill{font-weight:700;font-size:11px;letter-spacing:.04em;padding:6px 12px;border-radius:999px;background:var(--cream);color:var(--muted);text-transform:uppercase;white-space:nowrap;}
.pv-pill.ok{background:#e7f0d8;color:#3f5e1d;}
.pv-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:11px 0;border-bottom:1px dashed rgba(58,53,32,.14);font-size:15px;color:var(--muted);}
.pv-row b{color:var(--ink);text-align:right;}
.pv-progress{margin-top:auto;}
.pv-progress-top{display:flex;justify-content:space-between;font-size:14px;color:var(--muted);margin-bottom:8px;}
.pv-pct{color:var(--gold-dark);font-weight:700;}
.pv-track{height:10px;border-radius:999px;background:var(--cream);overflow:hidden;}
.pv-track i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-dark));border-radius:999px;}
.pv-stock{display:grid;grid-template-columns:1.1fr 1fr auto;gap:14px;align-items:center;padding:9px 0;font-size:15px;}
.pv-stock span{color:var(--muted);}
.pv-stock b{color:var(--ink);text-align:right;min-width:58px;}
.pv-flow{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;}
.pv-node{width:100%;max-width:340px;text-align:center;background:var(--cream);border-radius:14px;padding:15px;font-weight:700;color:var(--ink);font-size:16px;}
.pv-node small{display:block;font-weight:500;color:var(--muted);font-size:13px;margin-top:3px;}
.pv-arrow{color:var(--gold-dark);font-size:20px;font-weight:800;}
.pv-doc{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:13px 0;border-bottom:1px dashed rgba(58,53,32,.14);font-size:15px;color:var(--ink);}
.pv-tick{width:22px;height:22px;border-radius:50%;background:#e7f0d8;color:#3f5e1d;display:grid;place-items:center;font-size:12px;font-weight:800;flex:none;}
.pv-check{display:flex;align-items:center;gap:13px;padding:11px 0;font-size:16px;color:var(--ink);}
.pv-btn{margin-top:auto;align-self:flex-start;background:var(--gold);color:var(--ink);font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;}
.pv-people{display:flex;flex-direction:column;gap:14px;justify-content:center;height:100%;}
.pv-person{display:flex;align-items:center;gap:14px;}
.pv-av{width:44px;height:44px;border-radius:50%;background:var(--ink);color:var(--gold);display:grid;place-items:center;font-weight:700;font-size:14px;flex:none;}
.pv-av.plus{background:var(--cream);color:var(--gold-dark);font-size:22px;}
.pv-person b{font-size:16px;color:var(--ink);}
.pv-person small{display:block;color:var(--muted);font-size:13px;}
.pv-note{margin-top:8px;color:var(--muted);font-size:13px;}
/* realistic Kernel app-window frame around each preview */
.appwin{display:grid;grid-template-columns:152px 1fr;height:100%;}
.aw-side{background:var(--cream);border-right:1px solid rgba(58,53,32,.12);padding:13px 9px;display:flex;flex-direction:column;gap:1px;overflow:hidden;}
.aw-logo{display:flex;align-items:center;gap:6px;padding:1px 5px 12px;}
.aw-logo img{height:20px;width:auto;}
.aw-logo span{font-family:var(--serif);font-size:21px;color:var(--ink);line-height:1;}
.aw-row{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);padding:7px 9px;border-radius:7px;font-weight:700;white-space:nowrap;}
.aw-row.on{background:var(--gold);}
.aw-row svg{width:15px;height:15px;flex:none;}
.aw-sec{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);padding:9px 9px 5px;font-weight:700;white-space:nowrap;}
.aw-sec svg{width:15px;height:15px;flex:none;}
.aw-sec .aw-chev{width:12px;height:12px;margin-left:auto;opacity:.5;transition:transform .2s;}
.aw-chev.open{transform:rotate(180deg);}
.aw-sub{margin-left:9px;border-left:1px solid rgba(58,53,32,.2);padding-left:8px;display:flex;flex-direction:column;gap:1px;}
.aw-item{font-size:12.5px;color:var(--ink);padding:6px 9px;border-radius:6px;font-weight:500;white-space:nowrap;}
.aw-item.on{background:var(--gold);font-weight:700;}
.aw-main{display:flex;flex-direction:column;min-width:0;background:var(--white);}
.aw-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 18px;border-bottom:1px solid rgba(58,53,32,.1);}
.aw-title{font-family:var(--serif);font-size:21px;color:var(--ink);line-height:1;}
.aw-user{width:30px;height:30px;border-radius:50%;background:var(--ink);color:var(--gold);display:grid;place-items:center;font-weight:700;font-size:12px;flex:none;}
.aw-body{padding:18px 20px;flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:hidden;}
@media(max-width:860px){.appwin{grid-template-columns:1fr;}.aw-side{display:none;}}
@media(max-width:860px){
  .switch{grid-template-columns:1fr;gap:18px;}
  .switch-preview{display:none;}
  .si-desc{max-height:52px;opacity:1;}
}

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
  .vs-grid{
    display:flex;grid-template-columns:none;
    overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
    gap:16px;margin-left:-28px;margin-right:-28px;padding:6px 28px 20px;
    scrollbar-width:none;
  }
  .vs-grid::-webkit-scrollbar{display:none;}
  .vs-grid>*{flex:0 0 84%;scroll-snap-align:center;}
  .vs-card{padding:34px 26px;}
}

@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto;}
  .reveal{opacity:1!important;transform:none!important;transition:none!important;}
  .stagger>*{opacity:1!important;transform:none!important;animation:none!important;}
  .mock-card,.mock-chip,.photo-card,.vs-card{animation:none!important;}
  .hero-pop{opacity:1!important;transform:none!important;animation:none!important;}
  .pop-puff{display:none!important;}
  /* struck list: show struck state without animating */
  .replace-item span::after{transition:none!important;width:calc(100% + 4px)!important;}
  .replace-item span{opacity:.42!important;transition:none!important;}
  /* feature switcher: no crossfade transition */
  .sp-card{transition:none!important;}
}
`;

const NAV_ICON = {
  home: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  box: "M7 20C5 17 9 14 7 12C5 10 9 7 7 4M12 20C10 17 14 14 12 12C10 10 14 7 12 4M17 20C15 17 19 14 17 12C15 10 19 7 17 4",
  clipboard: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  squares: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  card: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Chev({ open }: { open?: boolean }) {
  return (
    <svg className={"aw-chev" + (open ? " open" : "")} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function AppFrame({ active, title, children }: { active: string; title: string; children: ReactNode }) {
  const item = (label: string) => "aw-item" + (active === label ? " on" : "");
  return (
    <div className="appwin">
      <aside className="aw-side">
        <div className="aw-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/popcorn.png" alt="" /><span>Kernel</span>
        </div>
        <div className={"aw-row" + (active === "Dashboard" ? " on" : "")}><NavIcon d={NAV_ICON.home} />Dashboard</div>
        <div className="aw-sec"><NavIcon d={NAV_ICON.box} />Production<Chev open /></div>
        <div className="aw-sub">
          <div className={item("Finished Goods")}>Finished Goods</div>
        </div>
        <div className="aw-sec"><NavIcon d={NAV_ICON.clipboard} />Compliance<Chev open /></div>
        <div className="aw-sub">
          <div className={item("Submissions")}>Submissions</div>
          <div className={item("Raw Materials")}>Raw Materials</div>
          <div className={item("Suppliers")}>Suppliers</div>
          <div className={item("Traceability")}>Traceability</div>
          <div className={item("Training")}>Training</div>
        </div>
        <div className="aw-sec"><NavIcon d={NAV_ICON.squares} />Admin<Chev /></div>
        <div className="aw-sec"><NavIcon d={NAV_ICON.card} />Account<Chev /></div>
      </aside>
      <div className="aw-main">
        <div className="aw-top"><span className="aw-title">{title}</span><span className="aw-user">YK</span></div>
        <div className="aw-body">{children}</div>
      </div>
    </div>
  );
}

type Feature = { icon: string; title: string; desc: string; preview: ReactNode };

const FEATURES: Feature[] = [
  {
    icon: "📝",
    title: "Digital batch records",
    desc: "Log every production run as it happens.",
    preview: (
      <AppFrame active="Finished Goods" title="Finished Goods">
        <div className="pv-row"><span>Batch</span><b>#POP-001 · Sichuan Pepper Popcorn</b></div>
        <div className="pv-row"><span>Operator</span><b>Kernel Sanders</b></div>
        <div className="pv-row"><span>Units produced</span><b>1,500 bags</b></div>
        <div className="pv-row"><span>Status</span><b><span className="pv-pill ok">Fully Popped ✅</span></b></div>
        <div className="pv-progress">
          <div className="pv-progress-top"><span>Record complete</span><span className="pv-pct">92%</span></div>
          <div className="pv-track"><i style={{ width: "92%" }} /></div>
        </div>
      </AppFrame>
    ),
  },
  {
    icon: "📦",
    title: "Live inventory",
    desc: "Stock deducts itself as you produce.",
    preview: (
      <AppFrame active="Raw Materials" title="Raw materials">
        <div className="pv-stock"><span>Popcorn kernels</span><div className="pv-track"><i style={{ width: "74%" }} /></div><b>48 kg</b></div>
        <div className="pv-stock"><span>Sichuan pepper</span><div className="pv-track"><i style={{ width: "52%" }} /></div><b>12.4 kg</b></div>
        <div className="pv-stock"><span>Kraft bags</span><div className="pv-track"><i style={{ width: "63%" }} /></div><b>3,200</b></div>
        <div className="pv-stock"><span>Labels</span><div className="pv-track"><i style={{ width: "29%" }} /></div><b>2,750</b></div>
      </AppFrame>
    ),
  },
  {
    icon: "🔍",
    title: "Full traceability",
    desc: "Ingredient to shelf in one click.",
    preview: (
      <AppFrame active="Traceability" title="Traceability">
        <div className="pv-flow">
          <div className="pv-node">Supplier<small>Pepper Co. · cert on file</small></div>
          <span className="pv-arrow" aria-hidden="true">↓</span>
          <div className="pv-node">Batch #POP-001<small>1,500 bags produced</small></div>
          <span className="pv-arrow" aria-hidden="true">↓</span>
          <div className="pv-node">Dispatched<small>480 bags → Tesco</small></div>
        </div>
      </AppFrame>
    ),
  },
  {
    icon: "🚚",
    title: "Supplier management",
    desc: "Approved suppliers, specs and certs in one place.",
    preview: (
      <AppFrame active="Suppliers" title="Suppliers">
        <div className="pv-doc"><span>Pepper Co. — Sichuan pepper</span><span className="pv-tick">✓</span></div>
        <div className="pv-doc"><span>Maize Mills — popcorn kernels</span><span className="pv-tick">✓</span></div>
        <div className="pv-doc"><span>KraftPack — bags &amp; labels</span><span className="pv-tick">✓</span></div>
        <div className="pv-note">Specs &amp; certificates stored against every supplier.</div>
      </AppFrame>
    ),
  },
  {
    icon: "📊",
    title: "Audit-ready reports",
    desc: "Export what your auditor wants, before they ask.",
    preview: (
      <AppFrame active="Submissions" title="Evidence pack">
        <div className="pv-doc"><span>Traceability report</span><span className="pv-tick">✓</span></div>
        <div className="pv-doc"><span>Production records</span><span className="pv-tick">✓</span></div>
        <div className="pv-doc"><span>Cleaning &amp; CCP logs</span><span className="pv-tick">✓</span></div>
        <div className="pv-btn">Export PDF →</div>
      </AppFrame>
    ),
  },
  {
    icon: "🎓",
    title: "Staff training portal",
    desc: "Train your team and record every sign-off.",
    preview: (
      <AppFrame active="Training" title="Training">
        <div className="pv-stock"><span>Kernel Sanders</span><div className="pv-track"><i style={{ width: "100%" }} /></div><b>Done</b></div>
        <div className="pv-stock"><span>Kernel Mustard</span><div className="pv-track"><i style={{ width: "100%" }} /></div><b>Done</b></div>
        <div className="pv-stock"><span>New starter</span><div className="pv-track"><i style={{ width: "40%" }} /></div><b>40%</b></div>
        <div className="pv-note">Assign modules, track completion, store sign-offs.</div>
      </AppFrame>
    ),
  },
  {
    icon: "✅",
    title: "SALSA-ready checklists",
    desc: "Checks mapped to the standard you're audited on.",
    preview: (
      <AppFrame active="Submissions" title="SALSA checklist">
        <div className="pv-check"><span className="pv-tick">✓</span>Traceability records</div>
        <div className="pv-check"><span className="pv-tick">✓</span>HACCP &amp; CCP logs</div>
        <div className="pv-check"><span className="pv-tick">✓</span>Approved supplier list</div>
        <div className="pv-check"><span className="pv-tick">✓</span>Cleaning schedules</div>
      </AppFrame>
    ),
  },
];

export default function MarketingPage() {
  const [active, setActive] = useState(0);
  const paused = useRef(false);
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

  // Feature switcher: gently auto-advance unless the user is interacting
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!paused.current) setActive((a) => (a + 1) % FEATURES.length);
    }, 3800);
    return () => clearInterval(id);
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
              The first <b>all-in-one</b> app built specifically for SALSA manufacturers. Not just
              your compliance partner, your operations too.
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
                <span className="t">Batch #POP-001</span>
                <span className="pill ok">Fully Popped ✅</span>
              </div>
              <div className="mock-body">
                <div className="mrow"><span className="k">Product</span><span className="v">Sichuan Pepper Popcorn</span></div>
                <div className="mrow"><span className="k">Operator</span><span className="v">Kernel Sanders</span></div>
                <div className="mrow"><span className="k">Units produced</span><span className="v">1,500 bags</span></div>
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
        <div className="wrap problem-grid">
          <div className="reveal">
            <p className="eyebrow">Life before Kernel</p>
            <h2 className="serif problem-head">Compliance shouldn&apos;t feel like a burden.</h2>
            <p className="problem-lead">
              You shouldn&apos;t need five tools and a fat invoice to prove you make safe food.
              Kernel replaces the lot.
            </p>
          </div>
          <ul className="replace-list reveal">
            <li className="replace-item"><span>£450/month compliance software</span></li>
            <li className="replace-item"><span>Spreadsheets for stock &amp; costing</span></li>
            <li className="replace-item"><span>Paper batch records</span></li>
            <li className="replace-item"><span>Clipboards &amp; ring binders</span></li>
            <li className="replace-item"><span>A different login for everything</span></li>
            <li className="replace-item"><span>Audit-day panic</span></li>
          </ul>
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
          <div
            className="switch reveal"
            onMouseEnter={() => { paused.current = true; }}
            onMouseLeave={() => { paused.current = false; }}
          >
            <div className="switch-list" role="tablist" aria-label="Kernel features">
              {FEATURES.map((f, i) => (
                <button
                  key={f.title}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  className={"switch-item" + (i === active ? " on" : "")}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <span className="si-ico" aria-hidden="true">{f.icon}</span>
                  <span className="si-text">
                    <span className="si-title">{f.title}</span>
                    <span className="si-desc">{f.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="switch-preview">
              {FEATURES.map((f, i) => (
                <div key={f.title} className={"sp-card" + (i === active ? " on" : "")} aria-hidden={i !== active}>
                  {f.preview}
                </div>
              ))}
            </div>
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
              <p className="byline">Tom Palmer, Yep Kitchen Founder</p>
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
          <p>Kernel App, by Popped Limited</p>
          <p className="footer-links">
            <Link href="/login">Log in</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
