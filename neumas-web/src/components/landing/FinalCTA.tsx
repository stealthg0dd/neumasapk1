/* Server component */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section
      id="get-started"
      aria-label="Start using Neumas"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <div
          className="relative overflow-hidden rounded-3xl bg-[#0071a3] px-8 py-16 text-center shadow-2xl shadow-[#0071a3]/20 sm:px-14 sm:py-20"
        >
          {/* Soft radial highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 20%, rgba(255,255,255,0.12) 0%, transparent 70%)",
            }}
          />

          <p className="relative mb-4 font-mono text-[11px] font-medium tracking-[0.18em] text-white/60 uppercase">
            Free to start · No credit card
          </p>
          <h2 className="relative text-[36px] font-bold leading-tight tracking-tight text-white sm:text-[50px]">
            Scan your first receipt.
            <br />
            Know your pantry today.
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/75">
            Join households across Singapore and Southeast Asia who have replaced
            guesswork with living pantry intelligence — starting with one photo.
          </p>

          <div className="relative mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth"
              className="group inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[14px] font-semibold text-[#0071a3] shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Scan your first receipt
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-8 py-3.5 text-[14px] font-semibold text-white transition-all hover:border-white/40 hover:bg-white/10 hover:-translate-y-0.5"
            >
              See how it works
            </a>
          </div>

          <p className="relative mt-6 text-[12px] text-white/50">
            Free to start · No hardware needed · Works with any receipt · Built for Singapore &amp; SEA
          </p>
        </div>
      </div>
    </section>
  );
}
