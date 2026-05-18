import { buildAbsoluteUrl, homepageFaqs, publicPages, siteConfig } from "@/lib/public-site";

function buildLlmsFullText() {
  return `# Neumas Full Public Brief

## Company overview
Neumas is an AI-powered grocery autopilot for households in Singapore and Southeast Asia. The public site explains the product, research, privacy stance, and feature set without requiring login.

## Problem
Most households still manage groceries with memory, notes, and fragmented receipts. That leads to duplicate purchases, hidden pantry stock, surprise stockouts, and poor spending visibility.

## Product workflow
1. A household uploads or photographs a grocery receipt.
2. Neumas extracts line items and retailer details.
3. Pantry records update automatically.
4. Consumption patterns are inferred from purchase history.
5. The system predicts likely stockouts and generates a smart shopping list.

## Features
- Receipt intelligence
- Pantry inventory
- Stockout prediction
- Smart shopping lists
- Grocery spend visibility
- Household consumption analytics

## Personas
- Busy families
- Couples and flatmates
- Health-conscious households
- Budget-conscious households
- Retail and CPG pilot partners using aggregate household signals

## FAQs
${homepageFaqs.map((item) => `- Q: ${item.question}\n  A: ${item.answer}`).join("\n")}

## Privacy stance
Public pages are crawlable and contain only company, product, research, and policy information. Private dashboards, authenticated uploads, settings, and user data should not be crawled.

## Technical high-level architecture
- Frontend: Next.js App Router with server-rendered public pages
- Backend: FastAPI APIs and async workers
- Data: Supabase PostgreSQL
- AI workflow: receipt extraction, normalization, pantry updates, forecast generation

## Public route index
- Homepage: ${buildAbsoluteUrl("/")}
- Insights: ${buildAbsoluteUrl("/insights")}
${publicPages.map((page) => `- ${page.title}: ${buildAbsoluteUrl(page.path)}`).join("\n")}

## Contact
- Email: ${siteConfig.contactEmail}
- Contact page: ${buildAbsoluteUrl("/contact")}

No secrets, private environment variables, or authenticated data are included in this document.
`;
}

export async function GET() {
  return new Response(buildLlmsFullText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}