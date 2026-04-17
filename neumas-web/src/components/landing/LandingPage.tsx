"use client";

import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { TrustStrip } from "./TrustStrip";
import { Problem } from "./Problem";
import { HowItWorks } from "./HowItWorks";
import { ValueStack } from "./ValueStack";
import { Intelligence } from "./Intelligence";
import { ProductShowcase } from "./ProductShowcase";
import { Pilot } from "./Pilot";
import { Security } from "./Security";
import { FAQ } from "./FAQ";
import { FinalCTA } from "./FinalCTA";
import { Footer } from "./Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <Hero />
      <TrustStrip />
      <Problem />
      <HowItWorks />
      <ValueStack />
      <Intelligence />
      <ProductShowcase />
      <Pilot />
      <Security />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
