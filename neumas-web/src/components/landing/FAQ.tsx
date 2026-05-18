import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What exactly is Neumas?",
    a: "Neumas is an AI-powered grocery autopilot for households. You scan your grocery receipts, and Neumas automatically tracks your pantry inventory, predicts when you'll run out of items, and generates a smart shopping list based on your household's real consumption patterns. No manual entry, no spreadsheets.",
  },
  {
    q: "How do I add my groceries to Neumas?",
    a: "Just take a photo of your grocery receipt — from NTUC, Cold Storage, Sheng Siong, Giant, Fairprice, or any supermarket — and upload it. Neumas reads every item, quantity, and price automatically. You can also upload PDFs or digital receipts. There's nothing to type.",
  },
  {
    q: "How does Neumas predict when I'll run out of something?",
    a: "Neumas tracks how quickly each item disappears from your pantry based on how often you buy it and how much you buy each time. Over a few weeks, it builds a consumption model specific to your household — so it knows that your family goes through 5kg of rice in about 2 weeks, and it predicts that before it runs out.",
  },
  {
    q: "What supermarkets and retailers does Neumas support?",
    a: "Neumas can read receipts from any retailer in Singapore and Southeast Asia — NTUC FairPrice, Cold Storage, Sheng Siong, Giant, Fairprice Finest, Don Don Donki, Mustafa Centre, and more. If it's a printed or digital receipt, Neumas can read it. Wet market and hawker purchases can also be added manually.",
  },
  {
    q: "Does Neumas work for households with dietary restrictions or special diets?",
    a: "Yes. Neumas tracks every item you buy, so it learns your household's specific diet over time — whether you're vegetarian, halal, gluten-free, or keto. Your shopping list will reflect the foods your household actually eats, not generic suggestions.",
  },
  {
    q: "How accurate is the AI extraction?",
    a: "For clean supermarket receipts, Neumas achieves above 95% accuracy on item extraction. For handwritten receipts or delivery notes, accuracy is above 85%. Every extraction is confidence-scored — lower confidence items are flagged for a quick review before they're added to your pantry.",
  },
  {
    q: "Can multiple people in my household use Neumas?",
    a: "Yes. Neumas is built for shared households. Everyone in your family or flatmate group can scan receipts and see the same pantry. You can share your shopping list with the whole household — so whoever is at the supermarket can see exactly what's needed.",
  },
  {
    q: "How does Neumas help me reduce food waste?",
    a: "Neumas tracks expiry risk based on when you bought items and your typical usage rate. When something is close to expiring, you'll get a heads-up so you can use it before it goes bad. It also helps you avoid over-buying by showing you what you already have before you shop.",
  },
  {
    q: "Can Neumas track my grocery spending?",
    a: "Yes. Neumas builds a full picture of your household's grocery spending over time — by supermarket, by food category, and by item. You can see which retailer you spend the most at, which categories are taking up the biggest share of your budget, and where you can save.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes. Your receipt data and pantry information are private to your household. Neumas does not share or sell your personal data. We comply with PDPA (Personal Data Protection Act) in Singapore and applicable data protection regulations across Southeast Asia. You can delete your data at any time.",
  },
  {
    q: "Does Neumas work in Malaysia and other Southeast Asian countries?",
    a: "Yes. Neumas is designed for households across Southeast Asia. It works with receipts from Malaysian supermarkets (Jaya Grocer, Lotus's, Aeon, Mydin, Village Grocer) and other regional retailers. The app is available in English, with more languages coming soon.",
  },
  {
    q: "Is Neumas free to use?",
    a: "Neumas has a free tier that covers the core features — receipt scanning, pantry tracking, and basic shopping lists. A premium plan unlocks advanced analytics, spending intelligence, multi-household support, and unlimited receipt history. No credit card required to start.",
  },
];

export function FAQ() {
  return (
    <section
      id="faq"
      aria-label="Frequently asked questions about Neumas"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-3xl">
        {/* Heading */}
        <div className="mb-12 text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            FAQ
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Questions answered.
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-gray-500">
            Everything you need to know about Neumas before you start.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-2">
          {FAQS.map((item, idx) => (
            <details
              key={idx}
              className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]"
            >
              <summary
                className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-5 text-left [&::-webkit-details-marker]:hidden"
              >
                <span className="text-[14px] font-semibold text-gray-900 leading-snug pr-2">
                  {item.q}
                </span>
                <ChevronDown
                  className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-gray-100 px-6 pb-5 pt-4">
                <p className="text-[14px] leading-relaxed text-gray-500">{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
