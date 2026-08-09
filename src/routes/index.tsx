import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useReveal } from "@/hooks/use-reveal";
import heroPoster from "@/assets/hero-poster.jpg.asset.json";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Crop,
  Images,
  ListChecks,
  MessageSquareText,
  Pause,
  Play,
  Volume2,
  VolumeX,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { platforms } from "@/lib/postflow-data";

const heroReels = [
  { src: "/landing-videos/side-hustle-ideas.mp4", label: "Side hustle ideas" },
  {
    src: "/landing-videos/easy-lifestyle-inspiration.mp4",
    label: "Easy lifestyle inspiration",
  },
  {
    src: "/landing-videos/peaceful-home-mood-board.mp4",
    label: "Peaceful home mood board",
  },
  {
    src: "/landing-videos/motivational-styling-ideas.mp4",
    label: "Motivational styling ideas",
  },
  {
    src: "/landing-videos/wedding-aisle-inspiration.mp4",
    label: "Wedding aisle inspiration",
  },
  { src: "/landing-videos/postflow-showcase.mp4", label: "PostFlow creator showcase" },
];

function formatVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PostFlow — Upload Once, Publish Everywhere" },
      {
        name: "description",
        content:
          "Upload one image or video and publish or schedule it across Instagram, Facebook, Pinterest, YouTube and Snapchat from a single dashboard.",
      },
      { property: "og:title", content: "PostFlow — Upload Once, Publish Everywhere" },
      {
        property: "og:description",
        content:
          "One media upload, every platform. Connect accounts, customise captions per platform, publish now or schedule for later.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    n: "01",
    title: "Connect accounts",
    body: "Connect supported social accounts securely through official authorization. PostFlow never asks for your password.",
  },
  {
    n: "02",
    title: "Upload content",
    body: "Upload one video or image, let PostFlow resize it, then customise the caption for each platform.",
  },
  {
    n: "03",
    title: "Publish or schedule",
    body: "Post immediately or pick a future date, time and time zone — then track every platform result.",
  },
];

const features = [
  {
    icon: Zap,
    title: "One-click multi-platform publishing",
    body: "Select accounts once and dispatch a separate publishing job per platform.",
  },
  {
    icon: Crop,
    title: "Smart media resizing",
    body: "Automatic 9:16, 1:1, 4:5 and 16:9 variants with compatibility checks.",
  },
  {
    icon: MessageSquareText,
    title: "Platform-specific captions",
    body: "Write one caption, then override titles, tags and settings per platform.",
  },
  {
    icon: CalendarClock,
    title: "Post scheduling",
    body: "Date, time and time-zone control with drag-and-drop rescheduling.",
  },
  {
    icon: Images,
    title: "Media library",
    body: "Folders, search, variants and usage counts for every uploaded file.",
  },
  {
    icon: ListChecks,
    title: "Failure tracking",
    body: "Per-platform errors that explain what failed, why, and how to retry.",
  },
  {
    icon: Sparkles,
    title: "Content calendar",
    body: "Month, week, day and list views of everything scheduled and published.",
  },
  {
    icon: ShieldCheck,
    title: "Secure connections",
    body: "Encrypted provider tokens, OAuth state verification and audit logs.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    strong: false,
    items: [
      "2 connected accounts",
      "10 posts per month",
      "100 MB max video",
      "1 GB storage",
      "30-day post history",
    ],
  },
  {
    name: "Creator",
    price: "$19",
    strong: true,
    items: [
      "6 connected accounts",
      "100 posts per month",
      "500 MB max video",
      "10 GB storage",
      "Calendar & caption templates",
    ],
  },
  {
    name: "Agency",
    price: "$59",
    strong: false,
    items: [
      "Multiple workspaces",
      "Team members & client accounts",
      "Approval workflow",
      "Advanced analytics",
      "Priority support",
    ],
  },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 -mb-[76px] h-[76px] px-4 pt-4">
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full border border-primary/20 px-4 py-2.5 transition-[background-color,box-shadow] duration-200 md:px-6 ${
          scrolled ? "bg-background/95 shadow-soft" : "bg-transparent"
        }`}
      >
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            PF
          </span>
          <span className="text-lg font-semibold">PostFlow</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          <a href="#features" className="hover:opacity-70">
            Features
          </a>
          <a href="#platforms" className="hover:opacity-70">
            Platforms
          </a>
          <a href="#how" className="hover:opacity-70">
            How It Works
          </a>
          <a href="#pricing" className="hover:opacity-70">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
            Login
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroMock() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reelIndex, setReelIndex] = useState(0);
  const [duration, setDuration] = useState("--:--");

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => undefined);
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  }, []);

  const toggleMuted = useCallback(() => {
    const el = videoRef.current;
    const nextMuted = !muted;
    if (el) el.muted = nextMuted;
    setMuted(nextMuted);
  }, [muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    setDuration("--:--");
    void el.play().catch(() => undefined);
    setPaused(false);
  }, [reelIndex]);

  const handleTilt = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -12, y: px * 14 });
  }, []);

  return (
    <div className="reveal is-visible rounded-3xl border border-border bg-background p-4 shadow-lift md:p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,150px)_minmax(0,1fr)]">
        <div className="[perspective:1000px]">
          <div
            onPointerMove={handleTilt}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${tilt.x || tilt.y ? 1.04 : 1})`,
            }}
            className="group relative overflow-hidden rounded-2xl border border-border shadow-soft transition-transform duration-200 ease-out [transform-style:preserve-3d] hover:shadow-lift"
          >
            <video
              ref={videoRef}
              className="mesh-vanilla aspect-[9/16] w-full bg-primary/10 object-cover"
              src={heroReels[reelIndex].src}
              poster={heroPoster.url}
              autoPlay
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) =>
                setDuration(formatVideoDuration(event.currentTarget.duration))
              }
              onEnded={() => setReelIndex((i) => (i + 1) % heroReels.length)}
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload noplaybackrate noremoteplayback"
              aria-label={`${heroReels[reelIndex].label}, sample vertical reel published with PostFlow`}
            />
            <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              9:16
            </span>
            <span className="absolute right-2 top-2 rounded-full border border-primary/40 bg-background/85 px-2 py-0.5 text-[11px] font-semibold">
              {reelIndex + 1} / {heroReels.length}
            </span>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-primary/40 bg-background/85 px-1.5 py-1">
              <span className="inline-flex items-center gap-1 pl-0.5 text-[9px] font-semibold leading-none">
                <Play className="size-2.5" aria-hidden /> {duration}
              </span>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={paused ? "Play reel" : "Pause reel"}
                className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110"
              >
                {paused ? (
                  <Play className="size-2.5" aria-hidden />
                ) : (
                  <Pause className="size-2.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={toggleMuted}
                aria-label={muted ? "Unmute reel" : "Mute reel"}
                className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110"
              >
                {muted ? (
                  <VolumeX className="size-2.5" aria-hidden />
                ) : (
                  <Volume2 className="size-2.5" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Caption
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              Behind the scenes of the autumn capsule shoot — full reel drops today. #studio #bts
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {platforms.slice(0, 3).map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-primary-foreground"
              >
                <p.icon className="size-4" aria-hidden />
                <span className="truncate text-xs font-semibold">{p.name}</span>
                <Check className="ml-auto size-3.5" aria-hidden />
              </div>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Link
              to="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
            >
              Publish Now
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-primary/60 px-4 py-2 text-sm font-semibold transition-transform hover:scale-[1.03]"
            >
              Schedule
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  useReveal();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="mesh-vanilla relative overflow-hidden px-4 pb-20 pt-[76px]">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto mt-16 grid md:mt-24 max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/50 px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3.5" aria-hidden /> One upload · five platforms
            </span>
            <h1 className="mt-5 text-[clamp(2.5rem,6vw,4rem)] font-bold leading-[1.05]">
              Upload Once.
              <br />
              Publish Everywhere.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Connect your social accounts, upload one image or video, and publish or schedule your
              content across multiple platforms from one simple dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
              >
                Start Publishing <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-md border border-primary/60 px-6 py-3 text-sm font-semibold hover:bg-accent"
              >
                See How It Works
              </a>
            </div>
          </div>
          <HeroMock />
        </div>
      </section>

      <section id="platforms" className="reveal surface-strong px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {platforms.map((p) => (
            <Link
              key={p.key}
              to="/login"
              aria-label={`Connect ${p.name} — sign in to continue`}
              className="group flex items-center gap-2 rounded-full px-3 py-1.5 opacity-90 transition-[transform,opacity] duration-150 ease-out hover:-translate-y-1 hover:opacity-100 focus-visible:-translate-y-1 focus-visible:outline-none active:translate-y-0"
            >
              <p.icon
                className="size-5 transition-transform duration-150 ease-out group-hover:scale-125 group-hover:rotate-6 group-focus-visible:scale-125"
                aria-hidden
              />
              <span className="text-sm font-semibold">{p.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="reveal max-w-2xl text-[clamp(1.9rem,4vw,2.5rem)] font-bold">
            Three steps from raw file to published everywhere
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <article
                key={s.n}
                className={`reveal rounded-3xl p-7 transition-transform duration-150 ease-out hover:-translate-y-1.5 active:translate-y-0 ${i === 1 ? "surface-strong" : "surface-light"}`}
                style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
              >
                <p className="text-5xl font-bold opacity-40">{s.n}</p>
                <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-85">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="reveal text-[clamp(1.9rem,4vw,2.5rem)] font-bold">
            Built for people who post daily
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article
                key={f.title}
                className="reveal rounded-2xl border border-border p-5 transition-transform duration-150 ease-out hover:-translate-y-1"
              >
                <f.icon className="size-6" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="reveal text-[clamp(1.9rem,4vw,2.5rem)] font-bold">Simple plans</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <Link
                key={plan.name}
                to="/login"
                aria-label={`Choose the ${plan.name} plan — log in to continue`}
                className={`reveal flex flex-col rounded-3xl p-7 transition-transform duration-150 ease-out hover:-translate-y-1.5 active:translate-y-0 ${plan.strong ? "surface-strong shadow-lift" : "surface-light"}`}
              >
                <p className="text-sm font-semibold uppercase tracking-wide opacity-70">
                  {plan.name}
                </p>
                <p className="mt-3 text-4xl font-bold">
                  {plan.price}
                  <span className="text-base font-medium opacity-70">/mo</span>
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <span
                  className={`mt-7 rounded-md px-4 py-2.5 text-center text-sm font-semibold ${
                    plan.strong
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  Choose {plan.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="reveal surface-strong mx-4 mb-16 rounded-4xl px-6 py-16 text-center md:mx-auto md:max-w-6xl">
        <h2 className="mx-auto max-w-2xl text-[clamp(1.9rem,4vw,2.6rem)] font-bold">
          Stop uploading the same content again and again.
        </h2>
        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary-foreground px-6 py-3 text-sm font-semibold text-primary"
        >
          Create Your First Post <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <footer className="surface-strong px-4 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground text-sm font-bold text-primary">
                PF
              </span>
              <span className="text-lg font-semibold">PostFlow</span>
            </div>
            <p className="mt-3 max-w-xs text-sm opacity-80">
              One publishing workspace for creators, small businesses and agencies.
            </p>
          </div>
          {[
            { title: "Product", links: ["Features", "Platforms", "Pricing", "How It Works"] },
            { title: "Support", links: ["Help Centre", "Contact Us", "Status", "API Docs"] },
            { title: "Legal", links: ["Privacy Policy", "Terms", "Security", "Cookies"] },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm opacity-80">
                {col.links.map((l) =>
                  l === "Privacy Policy" ? (
                    <li key={l}>
                      <Link to="/privacy" className="hover:underline">
                        {l}
                      </Link>
                    </li>
                  ) : (
                    <li key={l}>{l}</li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-primary-foreground/25 pt-6 text-xs opacity-70">
          © 2026 PostFlow. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
