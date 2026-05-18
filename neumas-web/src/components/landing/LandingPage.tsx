/* Server component — composed of server + client sub-sections */
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { TrustStrip } from "./TrustStrip";
import { Problem } from "./Problem";
import { HowItWorks } from "./HowItWorks";
import { ValueStack } from "./ValueStack";
import { Intelligence } from "./Intelligence";
import { UseCases } from "./UseCases";
import { ProductShowcase } from "./ProductShowcase";
import { FAQ } from "./FAQ";
import { FinalCTA } from "./FinalCTA";
import { Footer } from "./Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <Problem />
        <HowItWorks />
        <ValueStack />
        <Intelligence />
        <UseCases />
        <ProductShowcase />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
