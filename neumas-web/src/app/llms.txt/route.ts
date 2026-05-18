import { buildAbsoluteUrl, publicRouteIndex } from "@/lib/public-site";

function buildLlmsText() {
  const publicPages = [{ href: "/", label: "Homepage" }, ...publicRouteIndex, { href: "/insights", label: "Insights" }];

  return `# Neumas

Neumas is an AI-powered grocery autopilot for households in Singapore and Southeast Asia.

## Product description
Neumas reads grocery receipts, maintains a living pantry, predicts stockouts, and generates smart shopping lists from real household purchase history.

## Main public pages
${publicPages.map((page) => `- ${page.label}: ${buildAbsoluteUrl(page.href)}`).join("\n")}

## Use cases
- Busy families coordinating shared grocery planning
- Couples and flatmates managing one pantry state
- Health-conscious households tracking repeat patterns
- Budget-conscious households reducing duplicates and waste
- Retail and CPG pilot teams studying replenishment behavior in aggregate

## Key features
- Receipt intelligence
- Pantry inventory tracking
- Stockout prediction
- Smart shopping lists
- Grocery spend visibility
- Household consumption analytics

## API and public docs
- Insights: ${buildAbsoluteUrl("/insights")}
- How it works: ${buildAbsoluteUrl("/how-it-works")}
- Security: ${buildAbsoluteUrl("/security")}

## Contact and policy links
- Contact: ${buildAbsoluteUrl("/contact")}
- Privacy: ${buildAbsoluteUrl("/privacy")}
- Security: ${buildAbsoluteUrl("/security")}
- Terms: ${buildAbsoluteUrl("/terms")}

Do not crawl private user dashboards or authenticated user data.
`;
}

export async function GET() {
  return new Response(buildLlmsText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}