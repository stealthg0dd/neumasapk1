import type { PublicPageContent } from "@/lib/public-site";

const commonTrustFaq = [
  {
    question: "Is my private receipt and pantry data visible on public pages?",
    answer:
      "No. Public pages are for product and company information. Household receipt images, line items, pantry state, and account-level activity stay in authenticated surfaces and are not published as public content.",
  },
  {
    question: "Is Neumas claiming formal compliance certifications on this page?",
    answer:
      "No. Neumas describes current practices and intent without claiming certifications or compliance attestations that are not yet formally achieved.",
  },
  {
    question: "Does Neumas guarantee perfect AI analysis from every receipt?",
    answer:
      "No. OCR and classification quality can vary by receipt quality, retailer format, and language variation. Neumas is explicit about these limits and supports human review where needed.",
  },
  {
    question: "How can I contact Neumas for legal, privacy, or partnership questions?",
    answer:
      "Use the public contact path at /contact or email info@neumas.ai. The team uses that path for product, legal, and partner inquiries.",
  },
];

export const prompt89Pages: PublicPageContent[] = [
  {
    path: "/about",
    title: "About Neumas",
    description:
      "What Neumas is building for households in Singapore and Southeast Asia: practical receipt intelligence, pantry visibility, and stockout prediction.",
    h1: "A serious early-stage team focused on household grocery intelligence.",
    eyebrow: "About",
    intro:
      "Neumas is building a practical intelligence layer between grocery purchase and grocery consumption. Most apps stop at list writing or checkout. We focus on the operational gap inside the home: what actually entered the household, what is likely still available, what will run low next, and what should be on the next shopping list. We are early-stage, but we are not experimental theater. The product is designed around real workflows used by households in Singapore and Southeast Asia, where shopping can span supermarkets, convenience stores, wet markets, and delivery channels in the same week.",
    keywords: ["about neumas", "grocery intelligence startup", "pantry ai singapore"],
    sections: [
      {
        title: "The problem we are solving",
        body:
          "Households already generate useful grocery data, but it is trapped in paper receipts, chat reminders, and individual memory. That fragmentation causes repeated friction: duplicate purchases, last-minute stockouts, avoidable waste, and poor confidence in weekly planning. Neumas treats grocery operations as an information problem first. If households can maintain a reliable system of record from what they already do, the downstream experience becomes calmer. Shopping lists become grounded in reality. Pantry visibility becomes shared rather than personal. Consumption trends become useful rather than abstract.",
      },
      {
        title: "Why receipts are our starting signal",
        body:
          "Receipt capture is not glamorous, but it is operationally credible. The household has already done the hard work by shopping. A receipt is proof that items entered the household system. From there, Neumas applies extraction and normalization to produce structured data that can support pantry state, replenishment timing, and category-level insights. We do not claim receipts are perfect. We do claim they are one of the lowest-friction, highest-coverage signals available in real homes. That is why the workflow begins there.",
      },
      {
        title: "How we think about product quality",
        body:
          "Our standard is practical reliability, not marketing novelty. A feature is only useful if a household can trust it under ordinary conditions: blurred photos, mixed item naming, changing retailer formats, and variable shopping cadence. We design for graceful behavior when confidence is low. That means transparent status, review paths, and predictable fallback behavior instead of silent failures. We avoid fake precision and avoid claims we cannot operationally support. Trust is earned through clear boundaries and repeatable outcomes, not inflated metrics.",
      },
      {
        title: "Singapore and Southeast Asia context",
        body:
          "The region combines high mobile adoption with highly fragmented grocery behavior. A household might buy essentials from one chain, produce from a wet market, and urgent items from a convenience store. Packaging sizes, naming conventions, and language contexts can vary across neighborhoods and borders. We build with that diversity in mind. The goal is not to impose a single perfect taxonomy. The goal is to provide enough structure to make planning reliable without making data entry a second job.",
      },
      {
        title: "Who we serve today",
        body:
          "Neumas is household-first. We are designed for people who want less friction in grocery planning and less uncertainty in pantry state. We also publish transparent research and trust documentation so potential partners, investors, and technical reviewers can evaluate our approach before any account is created. Our public layer is intentionally crawlable without JavaScript because discoverability and credibility matter at this stage. Private household data remains private and is not part of that public surface.",
      },
      {
        title: "What to expect from us next",
        body:
          "As an early-stage company, we iterate fast, but we keep our claims conservative. You should expect clearer extraction review, stronger household-level forecasting, and better planning workflows over time. You should not expect invented customer logos, inflated benchmarks, or claims of universal receipt perfection. Our posture is simple: public information should be detailed and verifiable, private data should remain private, and product decisions should map to real household operations.",
      },
    ],
    faq: commonTrustFaq,
    ctaTitle: "Evaluate Neumas with full context",
    ctaBody:
      "Read how the system works, review our trust pages, and contact the team if you are assessing fit for your household or organization.",
    relatedLinks: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence research" },
      { href: "/security", label: "Security" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/contact",
    title: "Contact Neumas",
    description:
      "Public contact path for product, privacy, security, and partnership questions about Neumas.",
    h1: "Contact the Neumas team.",
    eyebrow: "Contact",
    intro:
      "This is the public contact layer for Neumas. We keep it simple on purpose: one obvious path for product questions, trust and policy queries, pilot discussions, and investor diligence. You should not need an account to verify that a company is reachable. You should also not need to expose private household data to start a conversation. Use this page to reach us when you are evaluating the platform, reviewing legal and security posture, or planning a partnership in Singapore or Southeast Asia.",
    keywords: ["contact neumas", "neumas support", "neumas partnerships"],
    sections: [
      {
        title: "What this contact channel is for",
        body:
          "Use this channel for pre-sales questions, partnership inquiries, media requests, legal notices, security questions, and investor diligence. If you are a household user evaluating Neumas, this path is also appropriate for understanding onboarding, limitations, and pricing direction. We designed the page to be explicit about scope so people know where to go without guessing. Public contact should be low-friction and legible because trust starts before signup.",
      },
      {
        title: "What this contact channel is not",
        body:
          "This page is not a public endpoint for private support actions such as account recovery, sensitive identity verification, or authenticated data export. Those flows are handled in private support processes to reduce exposure risk. If you submit sensitive account details through public email, we may ask you to continue in a safer authenticated path. The rule is straightforward: company communication can be public, private household data handling should not be.",
      },
      {
        title: "Questions we can answer clearly",
        body:
          "We can explain what data Neumas collects from receipts, how that data supports pantry and stockout workflows, how we think about AI analysis limitations, and what protections separate public pages from private user data. We can also explain regional design assumptions for Singapore and Southeast Asia. We will not manufacture precision, fake customer references, or unsupported compliance claims. If we do not know yet, we will say so directly.",
      },
      {
        title: "Partnership and pilot conversations",
        body:
          "For partner teams exploring household grocery intelligence, this contact channel is the right first step. We can discuss public-facing product capabilities, pilot boundaries, data minimization expectations, and rollout assumptions. We prefer a practical framing: what decisions will improve if household pantry visibility is better, and what evidence is needed to justify integration effort. That keeps discussions useful and avoids over-promising during early-stage evaluation.",
      },
      {
        title: "Response expectations",
        body:
          "We aim to respond with clear next steps, relevant links, and practical boundaries. A useful response usually includes one of three paths: a product walkthrough path, a trust/policy clarification path, or a partnership discovery path. We keep replies specific to your question to reduce unnecessary follow-up. If your request touches regulated or legal interpretation topics, we may provide scope-limited answers and suggest formal counsel where appropriate.",
      },
      {
        title: "How to reach us",
        body:
          "Email info@neumas.ai. Include context about your use case, timeline, and region so we can route your message quickly. If you are referencing policy or security topics, include the relevant page URL and question so the response can be precise. If you are assessing the platform for Singapore or broader Southeast Asia operations, mention your target markets and workflow constraints so we can respond in practical terms rather than generic product language.",
      },
    ],
    faq: commonTrustFaq,
    ctaTitle: "Email: info@neumas.ai",
    ctaBody: "Tell us what you are evaluating, and we will respond with focused, practical guidance.",
    relatedLinks: [
      { href: "/about", label: "About Neumas" },
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      { href: "/responsible-ai", label: "Responsible AI" },
    ],
  },
  {
    path: "/privacy",
    title: "Privacy at Neumas",
    description:
      "How Neumas handles receipt and pantry data, and how public content is separated from private household information.",
    h1: "Privacy boundaries designed for real household data.",
    eyebrow: "Privacy",
    intro:
      "Neumas handles data that can reveal meaningful details about household life: food preferences, shopping cadence, budget behavior, and presence patterns. That is why privacy is treated as a product architecture issue, not only a legal page. Our public website is crawlable by design so users and researchers can evaluate us without login. Private receipt and inventory data are not part of that public layer. This page explains what we collect, why we collect it, and what boundaries we maintain.",
    keywords: ["neumas privacy", "receipt data privacy", "household inventory privacy"],
    sections: [
      {
        title: "Data collected from receipts",
        body:
          "When users upload receipts, Neumas may process line items, quantities, prices, totals, timestamps, and retailer identifiers. Depending on receipt format, additional fields such as item abbreviations, promotions, and payment context can appear. We use these signals to build pantry state, spending visibility, and stockout prediction. We do not frame this as invisible tracking. It is user-provided data submitted to operate the product workflow, and we keep the scope tied to that workflow.",
      },
      {
        title: "Data collected from account usage",
        body:
          "Like most cloud products, Neumas may process account identifiers, session metadata, and operational telemetry needed for reliability and abuse prevention. We treat this as service infrastructure data, not marketing theater. Telemetry helps us diagnose failures, understand system health, and protect account integrity. It is not an excuse to expose household details publicly. We separate operational logs from public content and avoid publishing user-specific activity in any public-facing channel.",
      },
      {
        title: "What remains private",
        body:
          "Private receipt images, extracted line-item details tied to accounts, pantry records, prediction histories, and household-specific shopping plans remain in authenticated surfaces. They are not published in public pages, sitemap narratives, or AI crawler summaries. Our public pages describe capabilities and policy posture only. This separation is non-negotiable for trust: discoverability should apply to company information, not to private household records.",
      },
      {
        title: "How privacy relates to AI analysis",
        body:
          "AI analysis in Neumas is task-scoped: extraction, normalization, and prediction support for grocery workflows. We do not describe AI as omniscient. Models can misread low-quality images or ambiguous item labels. Because of that, privacy and quality are connected. If uncertain results are treated as certainty, trust degrades quickly. We design for transparent uncertainty, reviewability, and clear correction paths so users can keep control over what data enters long-term household memory.",
      },
      {
        title: "Regional relevance and practical expectations",
        body:
          "In Singapore and Southeast Asia, households often mix formal retail channels with informal and semi-structured purchasing contexts. Privacy expectations are high, but workflow convenience is equally important. We therefore design for minimal user burden while preserving clear boundaries. Public resources remain open and indexable for evaluation. Private operations remain authenticated. If policy or implementation changes over time, we aim to document them plainly rather than hiding them in obscure release notes.",
      },
      {
        title: "Your choices and contact path",
        body:
          "If you need clarification about data handling, you can contact us via the public path at /contact. If your inquiry requires account-specific action, we will direct you to a safer authenticated process. We keep this page practical rather than legalistic because privacy decisions are made during product use, not only during policy reading. The key principle is simple: collect what is needed to run grocery intelligence workflows and avoid unnecessary exposure.",
      },
    ],
    faq: commonTrustFaq,
    relatedLinks: [
      { href: "/security", label: "Security" },
      { href: "/data-processing", label: "Data processing" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/terms",
    title: "Neumas Terms",
    description: "Public terms summary for accessing and evaluating Neumas.",
    h1: "Straightforward terms for a practical product.",
    eyebrow: "Terms",
    intro:
      "These terms explain how Neumas public and authenticated services should be used at a high level. We keep this page readable because terms should help people understand responsibilities, not hide them. Public pages are designed for open discovery. Authenticated product areas involve account-level obligations, acceptable-use expectations, and data handling boundaries. We are an early-stage company and avoid pretending to have enterprise-scale legal machinery where it does not exist yet.",
    keywords: ["neumas terms", "grocery app terms", "ai service terms"],
    sections: [
      {
        title: "Public content use",
        body:
          "Neumas public pages can be viewed, indexed, and referenced for informational purposes. They exist to describe the product, trust posture, and research direction for users, investors, and partners. Public content should not be interpreted as personal advice, guaranteed outcomes, or legal commitments beyond what is explicitly stated. We publish conservative claims and expect readers to evaluate them critically, which is part of why this content is crawlable without requiring a login.",
      },
      {
        title: "Authenticated usage expectations",
        body:
          "When users access authenticated product areas, they are expected to use the service lawfully and responsibly. Uploading receipt data implies authorization to process that data for pantry, prediction, and planning workflows. Abuse, unauthorized access attempts, and actions intended to degrade service reliability are not permitted. These expectations exist to protect both individual households and overall platform stability. We keep this boundary explicit because trust depends on predictable behavior from both provider and user.",
      },
      {
        title: "No guarantee of perfect AI outcomes",
        body:
          "Neumas uses AI components for extraction and prediction support, and those components can make mistakes. Receipt quality, retailer format differences, and naming ambiguity can reduce accuracy. Users should treat outputs as decision support rather than unquestionable fact. We design review and correction paths to keep the system useful in real conditions. We do not promise perfect automation. We do commit to improving reliability and making limitations visible.",
      },
      {
        title: "Availability and change management",
        body:
          "As an early-stage service, features may evolve as we improve reliability and fit. We aim to communicate meaningful changes through product and policy updates. Public pages can change as research and product scope evolve. Authenticated features can be adjusted to protect service quality or user safety. Our goal is not surprise. Our goal is to keep changes legible and grounded in operational reality, especially for users in Singapore and Southeast Asia relying on day-to-day grocery workflows.",
      },
      {
        title: "Intellectual property and brand use",
        body:
          "Neumas branding, product materials, and site content are owned by the company unless otherwise indicated. Reasonable referencing for analysis, review, and commentary is generally acceptable, but misrepresentation, deceptive framing, or unauthorized implication of endorsement is not. We avoid fake customer references ourselves and expect the same discipline from third parties discussing Neumas. Clear attribution and honest context help everyone evaluate the product responsibly.",
      },
      {
        title: "Questions, disputes, and practical resolution",
        body:
          "If you have terms questions, contact us first through /contact. Most concerns can be resolved faster with clear context and direct communication than with adversarial escalation. If legal interpretation is needed, formal counsel may be appropriate. This terms page is a public summary and not a substitute for jurisdiction-specific legal advice. We keep this practical because most users want clarity on daily usage and data boundaries rather than abstract legal language.",
      },
    ],
    faq: commonTrustFaq,
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/security",
    title: "Security at Neumas",
    description:
      "Security approach for Neumas public content and private household receipt and inventory data.",
    h1: "Security for household-grade data, without security theater.",
    eyebrow: "Security",
    intro:
      "Security at Neumas starts with scope clarity. Public pages should be easy to crawl and evaluate. Private household data should remain in authenticated systems with strict access boundaries. We do not claim certifications we have not earned. We do not claim impossible guarantees. We focus on practical controls: least exposure, separation of public and private surfaces, and operational discipline around data handling. For users in Singapore and Southeast Asia, this translates into trustworthy defaults without adding unnecessary friction.",
    keywords: ["neumas security", "receipt app security", "household data protection"],
    sections: [
      {
        title: "Public versus private surfaces",
        body:
          "Our marketing, research, glossary, compare, and trust pages are intentionally public and indexable. They explain what Neumas does and how it approaches privacy and AI limitations. Authenticated dashboards, receipt uploads, pantry records, and account settings are private surfaces. This separation is fundamental: visibility should improve product understanding, not leak user data. We design crawler guidance and metadata to reinforce this distinction.",
      },
      {
        title: "Data minimization and access discipline",
        body:
          "Security is improved when systems process only what they need. Receipt and inventory processing is scoped to product functionality. Internal access is controlled by role and operational necessity. We avoid broad data exposure patterns and avoid placing sensitive account context in public diagnostics. The objective is to reduce blast radius if a component fails while preserving sufficient observability for reliability work.",
      },
      {
        title: "Application and infrastructure posture",
        body:
          "Neumas uses standard modern web controls and infrastructure practices, including authenticated API surfaces for private data and explicit separation of public routes. We monitor operational signals to detect failures and regressions, and we use staged quality gates to reduce accidental breakage. We do not present this as a guarantee against all threats. We present it as an ongoing engineering responsibility with transparent boundaries.",
      },
      {
        title: "Third-party components and managed services",
        body:
          "Like most cloud products, Neumas depends on managed platforms and third-party software. We evaluate dependencies based on reliability and fit, and we avoid disclosing sensitive implementation details that would increase attack surface. This page describes principles, not exploit maps. If a security topic requires confidential handling, we move that discussion to a controlled channel via /contact.",
      },
      {
        title: "Security and AI limitations",
        body:
          "AI quality issues can become security and trust issues when outputs are treated as certainty. We therefore keep uncertainty visible and preserve review paths. A wrong extraction should be correctable and auditable. A temporary provider issue should degrade gracefully instead of failing silently. Security in this context includes user trust in system behavior under imperfect conditions, not only perimeter controls.",
      },
      {
        title: "Reporting and communication",
        body:
          "If you identify a potential vulnerability or sensitive issue, contact us through the public channel and include enough technical detail for triage. Do not post private user data publicly. We prioritize responsible disclosure behavior and practical remediation. As the platform matures, we will continue expanding public documentation, but we will not overstate maturity or claim compliance evidence we do not yet have.",
      },
    ],
    faq: commonTrustFaq,
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/data-processing", label: "Data processing" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/data-processing",
    title: "Data Processing at Neumas",
    description:
      "What Neumas processes from receipts and usage, and how that processing supports pantry and prediction workflows.",
    h1: "Data processing explained in operational terms.",
    eyebrow: "Data Processing",
    intro:
      "This page explains how Neumas processes data in plain operational language. The goal is to help households, partners, and reviewers understand inputs, transformations, and outputs without legal jargon or inflated claims. Neumas is built around receipt-driven grocery workflows, so processing starts with user-provided documents and moves through extraction, normalization, inventory updates, and planning recommendations. Each step exists to support a concrete user outcome.",
    keywords: ["data processing neumas", "receipt processing", "pantry data pipeline"],
    sections: [
      {
        title: "Input layer: what enters the system",
        body:
          "Primary inputs include uploaded receipt images and related user actions. Receipts can contain line-item text, quantities, totals, retailer details, and timestamps. Additional inputs include account metadata needed for authentication and session handling. We do not frame this as hidden harvesting. These inputs are provided directly by users or generated as normal service telemetry needed to run a cloud product safely.",
      },
      {
        title: "Extraction and normalization",
        body:
          "After upload, AI-assisted extraction interprets receipt fields and maps them into structured records. Because retail receipts are inconsistent, normalization is required to reduce naming drift and unit mismatch. This is where uncertainty can appear, especially with low-quality images or uncommon item naming. Neumas aims to surface uncertainty rather than hide it. Processing quality is improved by correction loops and repeated household context over time.",
      },
      {
        title: "Inventory and planning transformations",
        body:
          "Structured receipt data updates pantry inventory views and contributes to consumption modeling. The system can estimate likely depletion windows and propose shopping priorities. These transformations are designed for practical planning, not speculative profiling. We care about whether eggs or cooking oil are likely to run low soon, not about generating intrusive household narratives. Processing scope remains tied to grocery operations.",
      },
      {
        title: "Storage and exposure boundaries",
        body:
          "Processed records tied to a household account remain in authenticated data surfaces. Public website pages do not expose account-level records. We keep the public information layer separate so users and crawlers can understand the product without touching private data. This is both a trust and a governance choice: openness for company information, strict boundaries for user data.",
      },
      {
        title: "Regional considerations",
        body:
          "For Singapore and Southeast Asia, processing pipelines must handle heterogeneous receipt formats and multilingual retail contexts. We optimize for robustness rather than perfect uniformity. That means supporting common variation while preserving transparent error handling. As regional coverage expands, processing logic may evolve. We document key behavior in public trust pages to keep changes understandable.",
      },
      {
        title: "Retention, deletion, and practical governance",
        body:
          "Data lifecycle decisions should align with user value and safety. We treat retention and deletion as operational responsibilities, not footer afterthoughts. If users have account-specific processing questions, we route those through secure support channels. Public pages provide policy and architectural clarity, while account actions remain authenticated. This two-layer model helps maintain trust without reducing product utility.",
      },
    ],
    faq: commonTrustFaq,
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/responsible-ai",
    title: "Responsible AI at Neumas",
    description:
      "How Neumas uses AI responsibly for receipt extraction and pantry prediction, with clear limits and human-review paths.",
    h1: "Responsible AI means useful outputs with visible limits.",
    eyebrow: "Responsible AI",
    intro:
      "Neumas uses AI to reduce grocery planning friction, not to create opaque decision systems. Responsible AI in our context means three things: task-bounded use, transparent uncertainty, and practical user control. We apply models to receipt extraction, normalization, and prediction support because those are repetitive tasks where automation helps. We do not claim perfect understanding of every receipt. We do not hide uncertainty. We design the system so users can review, correct, and trust outcomes over time.",
    keywords: ["responsible ai neumas", "receipt ai limits", "grocery ai governance"],
    sections: [
      {
        title: "Task-bounded AI usage",
        body:
          "AI components are used for specific grocery workflow tasks: reading receipts, structuring item records, and estimating replenishment timing. We avoid framing AI as a general household oracle. This task boundary keeps the product understandable and reduces risk from overreach. Users should know exactly what the model is helping with and where judgment remains with the household.",
      },
      {
        title: "Transparency over false certainty",
        body:
          "Receipt quality can vary widely. When confidence is low, pretending certainty can pollute pantry history and reduce trust. We therefore prioritize transparent status communication, review paths, and explicit fallback behavior. The practical result is that users can see when analysis is pending, degraded, or failed and decide what to do next. That behavior is often more valuable than hidden automation.",
      },
      {
        title: "Human-in-the-loop correction",
        body:
          "Responsible AI requires correction mechanisms. If an extraction is wrong, users must be able to fix it without friction. If predictions drift, the system should adapt with fresh data and corrected assumptions. We treat corrections as part of the product loop, not as user failure. Over time, this improves relevance and reduces repeated errors, especially for household-specific item naming and purchase patterns.",
      },
      {
        title: "Avoiding harmful claims",
        body:
          "We do not publish fabricated customer outcomes, fake precision metrics, or universal performance claims. Early-stage credibility comes from accurate boundaries and clear iteration signals. We describe what the system does today and where uncertainty exists. This is important for users and equally important for investors or partners assessing execution discipline.",
      },
      {
        title: "Regional and language realities",
        body:
          "In Singapore and Southeast Asia, receipt formats, language mixes, and item naming conventions are diverse. Responsible AI requires acknowledging this diversity rather than masking it with generic benchmarks. We optimize for practical robustness and clear user feedback. Regional expansion should improve coverage incrementally, with transparent communication about capabilities and limitations.",
      },
      {
        title: "Governance posture",
        body:
          "Responsible AI is an ongoing engineering and policy practice. We use public trust pages to document behavior and intent, and we keep private user data outside public content surfaces. If you have AI governance questions, use /contact so we can respond with scope-specific detail. Our core principle remains stable: useful automation, explicit limits, and user-visible control.",
      },
    ],
    faq: commonTrustFaq,
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      { href: "/data-processing", label: "Data processing" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/research/ai-grocery-intelligence",
    title: "AI Grocery Intelligence",
    description:
      "Research on why household grocery intelligence needs receipt-native workflows, interpretable prediction, and practical regional design.",
    h1: "AI grocery intelligence is a workflow discipline, not a chatbot gimmick.",
    eyebrow: "Research",
    intro:
      "AI grocery intelligence is often marketed as a convenience feature, but the harder challenge is operational consistency. A household needs a system that remembers what came in, estimates what is likely left, and recommends what to buy next with minimal effort. Neumas approaches this as an intelligence pipeline grounded in receipts and pantry state, not as one-off recommendation prompts. This matters in Singapore and Southeast Asia, where shopping channels and product naming can vary significantly week to week.",
    keywords: ["ai grocery intelligence", "receipt-driven intelligence", "household replenishment research"],
    sections: [
      {
        title: "From transaction to household memory",
        body:
          "Checkout data captures what was purchased, not what remains at home. The core research question is how to bridge that gap without requiring manual inventory logging. Receipt-native ingestion provides a practical first step because it captures item-level purchase evidence at low user cost. Once structured, this data can become household memory: a durable record that supports planning decisions over time rather than one-time app interactions.",
      },
      {
        title: "Why prediction must be interpretable",
        body:
          "A useful stockout signal should answer simple questions: what item is at risk, how soon, and why. If prediction outputs are opaque, households cannot trust them and will revert to manual habits. Interpretable signals such as expected depletion windows and confidence-aware recommendations are therefore a design requirement, not a cosmetic feature. AI should reduce cognitive load, not add a second layer of uncertainty.",
      },
      {
        title: "The role of error-tolerant architecture",
        body:
          "Real receipts are messy: abbreviations, unclear line breaks, inconsistent units, and varying retailer taxonomies. An intelligence system that assumes clean data will fail quickly outside controlled demos. Research in this area should emphasize error tolerance: schema drift handling, confidence scoring, fallback paths, and correction loops. These mechanisms are what make AI usable under normal household conditions.",
      },
      {
        title: "Regional complexity in Southeast Asia",
        body:
          "Household grocery behavior in Southeast Asia often spans physical and digital channels, with irregular purchasing cadence driven by family routines, promotions, and location-specific convenience. Intelligence models must handle this variety without forcing rigid onboarding. A region-aware design should accept partial data, improve incrementally, and prioritize decision support that remains useful even when coverage is imperfect.",
      },
      {
        title: "Economic value beyond convenience",
        body:
          "The value of grocery intelligence is not only faster list writing. It includes reduced duplicate purchases, fewer emergency runs, better use of perishable items, and more stable household budgeting. These outcomes emerge when data quality and workflow fit align. Overstating savings without evidence is unhelpful. A more honest posture is to show how the system changes planning behavior and decision confidence.",
      },
      {
        title: "Neumas research direction",
        body:
          "Neumas continues to evaluate how receipt extraction quality, pantry state modeling, and recommendation framing affect real household outcomes. We publish this as practical research because trust grows when methods are explained openly. Our direction is clear: build reliable household memory from real purchase signals, keep prediction interpretable, and maintain strict separation between public educational content and private user data.",
      },
    ],
    faq: [
      {
        question: "Why does Neumas emphasize receipts instead of manual pantry entry?",
        answer: "Because manual entry does not scale for most households. Receipt-native workflows capture high-value data with much lower effort.",
      },
      {
        question: "Is this research claiming perfect prediction accuracy?",
        answer: "No. It focuses on practical reliability and interpretable outputs rather than absolute certainty claims.",
      },
      {
        question: "How is Southeast Asia relevance reflected?",
        answer: "By designing for fragmented retail behavior, mixed formats, and variable item naming common across the region.",
      },
      {
        question: "Where can I read related methods?",
        answer: "See the compare pages, glossary pages, and Responsible AI documentation linked below.",
      },
    ],
    relatedLinks: [
      { href: "/research/receipt-intelligence", label: "Receipt intelligence research" },
      { href: "/research/household-consumption-patterns", label: "Household consumption patterns" },
      { href: "/compare/manual-shopping-list-vs-ai-grocery-autopilot", label: "Manual list vs AI autopilot" },
      { href: "/glossary/stockout-prediction", label: "Glossary: stockout prediction" },
    ],
  },
  {
    path: "/research/receipt-intelligence",
    title: "Receipt Intelligence Research",
    description: "How receipt intelligence works in practice and why it is foundational for reliable pantry automation.",
    h1: "Receipt intelligence: the most practical ingestion layer for household grocery AI.",
    eyebrow: "Research",
    intro:
      "Receipt intelligence sounds narrow, but it is foundational. Without reliable ingestion, inventory forecasting and smart list generation quickly collapse into guesswork. For household products, ingestion must be low-friction and resilient to noisy inputs. Neumas treats receipts as operational evidence that groceries entered the home. This page explains why that evidence matters, what can go wrong, and how robust systems handle ambiguity without misleading users.",
    keywords: ["receipt intelligence", "grocery ocr research", "receipt to pantry"],
    sections: [
      { title: "Receipts as proof of entry", body: "The receipt marks a handoff from retailer system to household system. That moment is where inventory state begins. In practical terms, a receipt provides timestamps, retailer context, item lines, and quantity clues that can seed structured records. It does not capture consumption, but it creates a defensible baseline. For AI products, this baseline is more dependable than asking users to recreate history manually." },
      { title: "Why OCR quality is only step one", body: "Raw OCR text is noisy and rarely ready for planning workflows. Item abbreviations, store-specific naming, and formatting variance demand normalization. A useful receipt intelligence engine includes canonicalization, unit handling, confidence scoring, and human-review pathways. Without these layers, small extraction errors compound into poor inventory estimates and low trust." },
      { title: "Error classes that matter", body: "In household grocery data, the most harmful errors are often not dramatic. Misread units, merged line items, and incorrect category mapping can silently distort downstream recommendations. Research should categorize these failure modes and prioritize mitigation based on user impact. A wrong pantry count for a staple can be more damaging than a missed non-essential item because it changes immediate planning behavior." },
      { title: "Human review as reliability infrastructure", body: "Review is not a sign of weak AI; it is a reliability mechanism. Good systems expose uncertain fields and allow quick correction. This improves current accuracy and strengthens future normalization for the same household context. In regions with diverse retail formats, review loops are especially important because edge cases are frequent and high-confidence assumptions are risky." },
      { title: "Regional implications for Singapore and Southeast Asia", body: "Receipt formats across the region range from highly structured prints to compact, abbreviation-heavy slips. Multilingual contexts and mixed channel purchasing increase variability. A robust approach is to optimize for graceful degradation: provide partial value even when some fields are uncertain, and recover through progressive correction instead of binary pass/fail behavior." },
      { title: "Practical research outcome", body: "Receipt intelligence should be evaluated by workflow outcomes: fewer manual edits over time, better pantry confidence, and improved planning relevance. Neumas focuses on these outcomes rather than publishing inflated benchmark numbers detached from household reality. The objective is to make grocery management calmer, not to win isolated OCR contests." },
    ],
    faq: [
      { question: "Does Neumas require special receipt formats?", answer: "No. It is built to handle common real-world grocery receipts with varying structure." },
      { question: "Can users correct extraction results?", answer: "Yes. Correction is part of the reliability model and helps improve ongoing data quality." },
      { question: "Is receipt intelligence enough for full pantry accuracy?", answer: "It is a strong baseline, and accuracy improves further when combined with household usage patterns." },
      { question: "How is this linked to stockout prediction?", answer: "Structured receipt history provides the input signal for depletion and replenishment estimation." },
    ],
    relatedLinks: [
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence" },
      { href: "/research/smart-pantry-automation", label: "Smart pantry automation" },
      { href: "/compare/receipt-scanner-vs-inventory-intelligence", label: "Receipt scanner vs inventory intelligence" },
      { href: "/glossary/receipt-intelligence", label: "Glossary: receipt intelligence" },
    ],
  },
  {
    path: "/research/household-consumption-patterns",
    title: "Household Consumption Patterns",
    description: "Research on modeling household grocery consumption patterns for better planning and lower food waste.",
    h1: "Consumption patterns are the missing input to smarter grocery planning.",
    eyebrow: "Research",
    intro:
      "Household grocery planning fails when it relies on static assumptions. Consumption changes with routines, guests, school schedules, dietary shifts, and seasonality. Neumas research focuses on converting receipt history and pantry state into usable consumption patterns that support practical decisions. The goal is not to overfit personal behavior; the goal is to provide enough forward visibility that households can shop with confidence and reduce waste.",
    keywords: ["household consumption patterns", "grocery demand modeling", "pantry usage trends"],
    sections: [
      { title: "Pattern signals that are actually useful", body: "The most useful signals are repeat frequency, interval variance, category-level velocity, and event-driven demand shifts. These signals can indicate whether an item is stable, bursty, or context-dependent. A planning system should surface this in understandable terms. If a household cannot interpret the signal, it cannot act on it." },
      { title: "Avoiding false precision", body: "Consumption modeling can tempt products to produce exact-looking numbers that overstate certainty. In practice, a range-based estimate with context is often better than a single precise date. Neumas emphasizes decision usefulness: what to prioritize now, what can wait, and what is uncertain. This reduces overreaction and avoids misplaced trust." },
      { title: "Household heterogeneity", body: "No two households consume identically, even in similar demographics. Some buy in bulk monthly, others top up daily. Some optimize price promotions, others optimize convenience. Models need to adapt to these patterns without forcing rigid templates. That is why household-local history matters more than generic assumptions." },
      { title: "Food waste and overbuying dynamics", body: "Waste is often caused by uncertainty rather than intention. When households cannot trust pantry memory, they buy safety duplicates. Consumption modeling helps reduce this by clarifying likely on-hand state and near-term demand. The impact is operational: fewer forgotten perishables and fewer emergency substitutions." },
      { title: "Southeast Asia operational context", body: "Across Singapore and neighboring markets, mixed-channel shopping and varied package sizing complicate pattern detection. A model trained on one rigid channel can underperform quickly. Regional robustness requires flexible normalization and confidence-aware output. The user experience should remain stable even when input patterns are irregular." },
      { title: "Neumas modeling principle", body: "Modeling should improve choices, not replace judgment. We treat consumption patterns as planning support for shopping and pantry maintenance. Users retain control, especially when confidence is low or lifestyle shifts occur. This keeps the product practical and reduces the risk of automation-induced mistakes." },
    ],
    faq: [
      { question: "Do patterns adapt if my routine changes?", answer: "Yes. Pattern models are updated as new receipts and usage signals enter the system." },
      { question: "Can this eliminate all food waste?", answer: "No tool can eliminate all waste, but better visibility and timing can reduce avoidable waste significantly." },
      { question: "Why not just use static shopping templates?", answer: "Templates help, but they do not adapt to changing consumption rhythms and household events." },
      { question: "Is this relevant outside Singapore?", answer: "Yes, but Neumas is tuned with Singapore and Southeast Asia workflows as primary design inputs." },
    ],
    relatedLinks: [
      { href: "/research/reducing-food-waste-with-ai", label: "Reducing food waste with AI" },
      { href: "/research/smart-pantry-automation", label: "Smart pantry automation" },
      { href: "/glossary/pantry-inventory", label: "Glossary: pantry inventory" },
      { href: "/compare/manual-shopping-list-vs-ai-grocery-autopilot", label: "Manual list vs AI autopilot" },
    ],
  },
  {
    path: "/research/reducing-food-waste-with-ai",
    title: "Reducing Food Waste with AI",
    description: "Practical analysis of how AI-supported pantry and planning workflows can reduce avoidable household food waste.",
    h1: "Reducing food waste with AI starts with better household visibility.",
    eyebrow: "Research",
    intro:
      "Food waste in households is often framed as behavior failure, but many cases are information failures. People buy duplicates because they are unsure what is on hand. Perishables expire because consumption timing is unclear. Neumas explores how AI can reduce this uncertainty through receipt-based pantry memory and forward-looking planning cues. The goal is practical: fewer avoidable discards and fewer reactive grocery runs.",
    keywords: ["food waste ai", "household waste reduction", "pantry planning"],
    sections: [
      { title: "Waste drivers in household operations", body: "Common drivers include overbuying for safety, forgotten perishables, and uncoordinated multi-person shopping. These issues are amplified when pantry state is fragmented across memory and messaging apps. AI can help only if it first improves the household record of what entered the home and what is likely still usable." },
      { title: "Planning lead time as a waste lever", body: "When households receive timely restock and usage signals, they can consume items before replacement purchase. This reduces overlap between old and new stock, especially for short-life goods. The economic and environmental benefits come from timing quality, not from aggressive optimization tricks." },
      { title: "Confidence-aware recommendations", body: "Waste reduction recommendations should reflect uncertainty. If extraction confidence is low, the system should avoid overconfident instructions. Transparent confidence and review workflows keep users engaged and reduce bad decisions from incorrect data. This is one of the most practical forms of responsible AI in household products." },
      { title: "Behavior change without friction", body: "Most households will not sustain heavy manual logging. Waste reduction tools must fit existing routines, which is why receipt-native ingestion is powerful. The less extra effort required, the more likely users are to maintain a high-quality inventory memory that supports better planning." },
      { title: "Regional implications", body: "In Southeast Asia, mixed shopping channels and variable package sizes can increase accidental overbuying. Regional-aware normalization and category handling help reduce this effect. A one-size-fits-all waste model can miss local realities such as frequent top-up behavior and market-driven purchase variability." },
      { title: "What Neumas can and cannot claim", body: "Neumas can support better decisions through clearer pantry state and planning signals. Neumas does not claim to eliminate waste entirely or guarantee fixed percentages for every household. Honest scope is important: good systems improve probability of better outcomes; they do not remove uncertainty from everyday life." },
    ],
    faq: [
      { question: "Is food waste reduction automatic?", answer: "It is supported, not automatic. Better visibility helps households make better choices." },
      { question: "Does this require scanning every item?", answer: "No. The workflow is receipt-centric to reduce user effort." },
      { question: "Are waste metrics publicly shared by household?", answer: "No. Household-level private data is not published on public pages." },
      { question: "Where do I start?", answer: "Start by understanding the workflow at /how-it-works and reviewing pantry glossary terms." },
    ],
    relatedLinks: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/research/household-consumption-patterns", label: "Household consumption patterns" },
      { href: "/glossary/pantry-inventory", label: "Glossary: pantry inventory" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/research/smart-pantry-automation",
    title: "Smart Pantry Automation",
    description: "Research on building reliable smart pantry automation from receipts, inventory state, and replenishment signals.",
    h1: "Smart pantry automation requires systems thinking, not single features.",
    eyebrow: "Research",
    intro:
      "Smart pantry automation is often presented as a convenience app concept, but it is really an operations system with multiple dependencies: ingestion quality, normalization quality, state updates, prediction reliability, and user trust. Neumas treats automation as a layered architecture. If one layer degrades, the system should fail gracefully instead of producing misleading certainty. This approach is essential for practical adoption in households across Singapore and Southeast Asia.",
    keywords: ["smart pantry automation", "pantry ai architecture", "inventory automation"],
    sections: [
      { title: "Automation layer 1: ingestion reliability", body: "No automation survives poor input quality. Receipt ingestion must handle blur, variable formats, and inconsistent item naming. The objective is dependable baseline capture, not perfect extraction in every case. Systems should communicate confidence and route uncertain inputs to review." },
      { title: "Automation layer 2: inventory state management", body: "Inventory is a stateful problem. Purchases increase stock, consumption reduces stock, and uncertainty accumulates when assumptions drift. A smart pantry system needs explicit update logic and correction pathways so state can remain useful over time. This is where many lightweight grocery apps fail." },
      { title: "Automation layer 3: predictive planning", body: "Prediction turns static inventory into forward guidance. Effective guidance is simple: what is likely to run low, when, and what to buy next. Overly complex model outputs reduce adoption. The right level of detail is one that supports decisions in minutes, not dashboards in hours." },
      { title: "Automation layer 4: user trust loop", body: "Users trust automation when behavior is predictable and transparent. Status labels, retry pathways, and clear fallback messages are critical. Silent failure and fake confidence break trust quickly. The trust loop is therefore a technical requirement, not a copywriting preference." },
      { title: "Southeast Asia design constraints", body: "Automation must account for diverse retail patterns and regional variability. Homes may alternate between large weekly shops and frequent top-ups. Item categories and pack sizes can shift across channels. A resilient automation stack needs adaptive logic rather than rigid assumptions." },
      { title: "Outcome framing for early-stage products", body: "For early-stage teams, the right claim is progressive reliability. Automation quality improves with data depth and correction feedback. Neumas does not claim full autonomy today. We claim a practical path to better pantry visibility and smarter planning with transparent limitations." },
    ],
    faq: [
      { question: "Is smart pantry automation fully hands-off?", answer: "Not always. Human review is important for low-confidence extraction and edge cases." },
      { question: "What is the biggest technical risk?", answer: "State drift from noisy inputs; this is why correction loops and confidence handling are essential." },
      { question: "Can automation work for multi-person households?", answer: "Yes, when shared state is centralized and updates are consistent." },
      { question: "How does Neumas avoid overclaiming?", answer: "By documenting boundaries clearly and focusing on practical workflow improvements." },
    ],
    relatedLinks: [
      { href: "/research/receipt-intelligence", label: "Receipt intelligence research" },
      { href: "/compare/receipt-scanner-vs-inventory-intelligence", label: "Receipt scanner vs inventory intelligence" },
      { href: "/glossary/pantry-inventory", label: "Glossary: pantry inventory" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    path: "/compare/manual-shopping-list-vs-ai-grocery-autopilot",
    title: "Manual Shopping List vs AI Grocery Autopilot",
    description: "Detailed comparison between manual list workflows and AI-assisted grocery autopilot systems.",
    h1: "Manual list writing versus AI grocery autopilot: what actually changes.",
    eyebrow: "Compare",
    intro:
      "Manual lists are familiar, flexible, and low-tech. They are also fragile when household complexity increases. AI grocery autopilot is useful only if it improves real workflow outcomes: less forgetting, less duplication, better timing, and lower cognitive load. This comparison page outlines where manual methods still work, where they break, and where an AI-assisted approach like Neumas provides practical advantages without pretending to remove all uncertainty.",
    keywords: ["manual shopping list vs ai", "grocery autopilot comparison", "household planning"],
    sections: [
      { title: "Manual lists: strengths and limits", body: "Manual lists are fast for simple, low-variance shopping. They are easy to share and require no setup. The limitation appears over time: lists are often rebuilt from memory, disconnected from pantry state, and inconsistent across household members. This leads to repeated omissions and duplicates, especially in busy weeks." },
      { title: "AI autopilot model", body: "An AI autopilot approach starts from data rather than memory. Receipts and pantry history provide a baseline. The system suggests likely needs based on consumption patterns and stockout risk. Users still review and adjust, but they no longer start from an empty page. This changes planning from reconstruction to validation." },
      { title: "Error modes compared", body: "Manual workflows fail through omission and coordination gaps. AI workflows fail through extraction uncertainty and modeling drift. The better system is not the one with no errors, but the one with visible errors and fast correction paths. In practice, confidence-aware AI with review can outperform memory-based list writing in medium and high-complexity households." },
      { title: "Time and cognitive load", body: "Manual list creation consumes recurring attention. People repeatedly scan kitchen shelves, ask household members, and second-guess previous purchases. AI-assisted workflows shift this effort toward exception handling. Users spend less time rebuilding context and more time approving recommendations. This is often the largest day-to-day benefit." },
      { title: "Regional shopping realities", body: "In Singapore and Southeast Asia, mixed-channel shopping increases complexity. A manual list may not capture differences in what is bought where and when. AI systems that ingest receipts across channels can maintain a fuller picture. This matters for staples purchased in different places at different frequencies." },
      { title: "When to use which approach", body: "For very small, stable households, manual lists may remain sufficient. As household size, dietary variation, and shopping channel diversity increase, AI-assisted planning tends to deliver stronger operational value. Neumas is designed for this crossover point: where memory-based planning starts to break under real-life complexity." },
    ],
    faq: [
      { question: "Is AI autopilot fully automatic purchasing?", answer: "No. It is decision support for planning and prioritization, with user control over final choices." },
      { question: "Do manual lists still have value?", answer: "Yes, especially for simple recurring purchases; many households may combine both methods." },
      { question: "What is the first practical upgrade?", answer: "Start from receipt-driven suggestions instead of a blank list each week." },
      { question: "Can this reduce duplicate buys?", answer: "It can, by grounding recommendations in pantry and purchase history rather than memory alone." },
    ],
    relatedLinks: [
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence research" },
      { href: "/research/household-consumption-patterns", label: "Household consumption patterns" },
      { href: "/glossary/stockout-prediction", label: "Glossary: stockout prediction" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    path: "/compare/receipt-scanner-vs-inventory-intelligence",
    title: "Receipt Scanner vs Inventory Intelligence",
    description: "Comparison of simple receipt scanning tools and full inventory intelligence systems.",
    h1: "A receipt scanner is not the same thing as inventory intelligence.",
    eyebrow: "Compare",
    intro:
      "Many products can scan receipts. Fewer can maintain a reliable household inventory model and turn that model into useful planning guidance. This page compares two categories often confused in market messaging: basic receipt scanner tools versus inventory intelligence systems. Neumas belongs to the second category because scanning is only the ingestion step, not the final value.",
    keywords: ["receipt scanner vs inventory intelligence", "grocery ai compare", "pantry systems"],
    sections: [
      { title: "Category 1: receipt scanner", body: "Receipt scanners typically focus on text extraction and storage. They can help with expense tracking or document retrieval. They are useful but limited for pantry planning because they stop before state modeling and prediction. A scanned receipt alone does not answer what is currently on hand." },
      { title: "Category 2: inventory intelligence", body: "Inventory intelligence systems use receipt extraction as input to build an evolving pantry state, estimate depletion, and recommend replenishment actions. They include normalization, confidence handling, and decision-support layers. This architecture supports weekly planning, not just archival search." },
      { title: "Data quality requirements", body: "Both categories need extraction quality, but inventory intelligence has stricter downstream requirements. Small ingestion errors can compound in stateful systems if not corrected. That is why review workflows and schema resilience are core to inventory products. They are less optional than in document-only tools." },
      { title: "User outcomes compared", body: "Receipt scanners mainly answer: what did I buy? Inventory intelligence aims to answer: what do I still have, what is running low, and what should I buy next? The second outcome set is operationally richer and more valuable for households managing budget and waste." },
      { title: "Regional fit considerations", body: "In Southeast Asia, receipt variability makes pure scanning useful but insufficient. Household planning requires robust normalization across retailers and naming styles. Inventory intelligence systems that tolerate variation and uncertainty generally provide better practical value than scanner-only tools." },
      { title: "Choosing the right level", body: "If your goal is record keeping, a scanner may be enough. If your goal is proactive grocery management, inventory intelligence is the better fit. Neumas is designed for the latter while keeping user effort low by starting from ordinary receipt behavior." },
    ],
    faq: [
      { question: "Does Neumas still use receipt scanning?", answer: "Yes. Scanning is the input, followed by normalization, inventory updates, and prediction support." },
      { question: "Can scanners become intelligence systems?", answer: "Only if they add reliable state management and planning logic beyond document extraction." },
      { question: "Is inventory intelligence overkill for small households?", answer: "It depends on complexity and planning pain; simpler homes may choose lighter workflows." },
      { question: "Where can I learn core terms?", answer: "See the glossary pages for stockout prediction, receipt intelligence, and pantry inventory." },
    ],
    relatedLinks: [
      { href: "/research/receipt-intelligence", label: "Receipt intelligence research" },
      { href: "/research/smart-pantry-automation", label: "Smart pantry automation" },
      { href: "/glossary/receipt-intelligence", label: "Glossary: receipt intelligence" },
      { href: "/glossary/pantry-inventory", label: "Glossary: pantry inventory" },
    ],
  },
  {
    path: "/glossary",
    title: "Neumas Glossary",
    description: "Core terms used in Neumas: stockout prediction, receipt intelligence, pantry inventory, and related concepts.",
    h1: "Glossary for practical grocery intelligence terms.",
    eyebrow: "Glossary",
    intro:
      "This glossary defines the core terms used across Neumas public documentation. It is written for users, investors, and partners who want practical clarity without jargon inflation. These definitions reflect how the terms are used in real product workflows, not abstract theory. If you are evaluating the platform for Singapore or broader Southeast Asia use, this glossary provides a common vocabulary for product and policy discussions.",
    keywords: ["neumas glossary", "grocery ai terms", "pantry intelligence definitions"],
    sections: [
      { title: "Why terminology discipline matters", body: "In early-stage AI products, terminology can drift quickly and create confusion. A scanner feature may be described as intelligence, and a rough estimate may be called a prediction engine. Clear definitions reduce misunderstanding and improve trust. This is especially important when private data handling and AI limitations are involved." },
      { title: "How to use this glossary", body: "Use glossary pages when reading research and compare content. Definitions are linked to product workflows so terms map to concrete behavior. This helps teams evaluate capability honestly rather than relying on buzzwords. If a term is unclear in context, contact us and we will refine the definition." },
      { title: "Term scope in Neumas", body: "Terms in this glossary are scoped to household grocery operations. They are not intended as universal AI definitions. A term like stockout prediction, for example, refers to household replenishment timing rather than enterprise warehouse optimization. Scope clarity keeps communication practical." },
      { title: "Public education versus private data", body: "Glossary content is public by design and safe for indexing. It does not include private user examples or account-specific traces. We separate educational clarity from user-data exposure to maintain trust. Definitions describe system behavior without revealing household-level records." },
      { title: "Regional context", body: "Definitions are framed with Singapore and Southeast Asia workflows in mind, where purchase channels and receipt formats can vary. Regional reality influences how these terms are operationalized in product design." },
      { title: "Next glossary entries", body: "Start with stockout prediction, receipt intelligence, and pantry inventory. These three terms anchor most Neumas workflows and explain the difference between simple scanning tools and integrated grocery intelligence." },
    ],
    faq: [
      { question: "Is this glossary purely marketing language?", answer: "No. It is designed as operational documentation tied to actual workflow behavior." },
      { question: "Are these definitions fixed forever?", answer: "They may evolve as product capabilities evolve, and updates will be documented transparently." },
      { question: "Do glossary pages include private user examples?", answer: "No. They are public educational pages with no account-level data." },
      { question: "Where should I go after the glossary?", answer: "Compare pages and research pages provide deeper implementation context." },
    ],
    relatedLinks: [
      { href: "/glossary/stockout-prediction", label: "Stockout prediction" },
      { href: "/glossary/receipt-intelligence", label: "Receipt intelligence" },
      { href: "/glossary/pantry-inventory", label: "Pantry inventory" },
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence research" },
    ],
  },
  {
    path: "/glossary/stockout-prediction",
    title: "Glossary: Stockout Prediction",
    description: "Definition and practical interpretation of stockout prediction in Neumas household workflows.",
    h1: "Stockout prediction",
    eyebrow: "Glossary",
    intro:
      "In Neumas, stockout prediction means estimating when a household item is likely to run low based on available purchase and inventory signals. It does not mean guaranteed depletion timing. The purpose is practical planning support: helping users prioritize restocking before an item becomes unavailable during meal prep or daily routines.",
    keywords: ["stockout prediction definition", "pantry stockout meaning", "grocery forecasting term"],
    sections: [
      { title: "Definition in plain language", body: "Stockout prediction is a forward estimate of depletion risk for specific items. It uses historical purchase rhythm, recent inventory updates, and contextual signals to approximate when attention is needed." },
      { title: "What stockout prediction is not", body: "It is not a guarantee, not a financial forecast, and not a perfect reflection of real-time consumption. It is decision support with uncertainty." },
      { title: "Why it matters in households", body: "Missing staples creates stress, unplanned trips, and costly convenience substitutions. Early warning improves planning quality and reduces reactive purchases." },
      { title: "How Neumas applies it", body: "Neumas surfaces risk levels and timing cues so users can act in context. Signals are designed to be understandable rather than statistically opaque." },
      { title: "Regional nuances", body: "In Singapore and Southeast Asia, variable purchase channels and package sizes can affect model confidence. Good systems acknowledge this rather than hiding uncertainty." },
      { title: "Responsible interpretation", body: "Users should treat predictions as guidance and combine them with household context. Confidence and review paths help prevent overreaction to uncertain signals." },
    ],
    faq: [
      { question: "Does a stockout signal mean I have zero inventory now?", answer: "Not necessarily. It indicates elevated risk within a near-term planning window." },
      { question: "Can users override suggestions?", answer: "Yes. User judgment remains central to final shopping decisions." },
      { question: "Why do predictions sometimes change week to week?", answer: "New receipts and usage patterns update the model and improve relevance." },
      { question: "Where do I see this in practice?", answer: "See compare and research pages for workflow examples." },
    ],
    relatedLinks: [
      { href: "/glossary", label: "Glossary index" },
      { href: "/research/household-consumption-patterns", label: "Consumption patterns research" },
      { href: "/compare/manual-shopping-list-vs-ai-grocery-autopilot", label: "Manual list vs AI autopilot" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    path: "/glossary/receipt-intelligence",
    title: "Glossary: Receipt Intelligence",
    description: "Definition of receipt intelligence and its role in Neumas data ingestion.",
    h1: "Receipt intelligence",
    eyebrow: "Glossary",
    intro:
      "Receipt intelligence in Neumas refers to the process of converting raw grocery receipts into structured, usable household data. It includes extraction, normalization, and confidence-aware handling so that receipts can support pantry and planning workflows rather than just archival storage.",
    keywords: ["receipt intelligence definition", "receipt ai meaning", "ocr grocery term"],
    sections: [
      { title: "Definition in plain language", body: "Receipt intelligence is the ingestion engine that turns a receipt image into item-level records a household can act on." },
      { title: "What it includes", body: "OCR interpretation, item normalization, quantity/unit parsing, retailer context handling, and uncertainty visibility." },
      { title: "What it does not include", body: "It does not imply perfect extraction from every receipt and does not by itself create full inventory intelligence." },
      { title: "Why it matters", body: "Without reliable ingestion, downstream inventory and stockout workflows become unreliable. Receipt intelligence is foundational." },
      { title: "Regional relevance", body: "Diverse receipt formats in Singapore and Southeast Asia make normalization and confidence handling especially important." },
      { title: "Practical usage in Neumas", body: "Users upload receipts; Neumas processes them into structured records that update pantry state and support planning." },
    ],
    faq: [
      { question: "Is receipt intelligence the same as a scanner app?", answer: "No. It is a broader pipeline designed to support inventory and planning workflows." },
      { question: "Can users edit wrong fields?", answer: "Yes. Correction is part of the reliability model." },
      { question: "Does it work with every receipt perfectly?", answer: "No. Quality depends on input and format variability." },
      { question: "Where can I compare approaches?", answer: "See the receipt scanner versus inventory intelligence comparison page." },
    ],
    relatedLinks: [
      { href: "/glossary", label: "Glossary index" },
      { href: "/research/receipt-intelligence", label: "Receipt intelligence research" },
      { href: "/compare/receipt-scanner-vs-inventory-intelligence", label: "Scanner vs intelligence" },
      { href: "/glossary/pantry-inventory", label: "Pantry inventory" },
    ],
  },
  {
    path: "/glossary/pantry-inventory",
    title: "Glossary: Pantry Inventory",
    description: "Definition of pantry inventory in Neumas and how it supports planning decisions.",
    h1: "Pantry inventory",
    eyebrow: "Glossary",
    intro:
      "Pantry inventory in Neumas is the evolving household record of what has likely been purchased and remains available. It is not an exact real-time sensor feed. It is a practical state model built from receipts, updates, and correction loops to support smarter planning.",
    keywords: ["pantry inventory definition", "household inventory meaning", "grocery state model"],
    sections: [
      { title: "Definition in plain language", body: "Pantry inventory is the household memory layer that tracks likely on-hand goods and category state over time." },
      { title: "How it is built", body: "It is built from structured receipt data, update logic, and user correction where needed." },
      { title: "How it is used", body: "It supports stockout prediction, shopping list prioritization, and reduction of duplicate purchases." },
      { title: "What it is not", body: "It is not a perfect real-time count and should not be interpreted as absolute truth in every moment." },
      { title: "Regional context", body: "In Singapore and Southeast Asia, mixed shopping channels make a shared pantry memory especially useful for coordination." },
      { title: "Operational value", body: "A useful pantry model reduces planning friction by replacing guesswork with a consistent baseline." },
    ],
    faq: [
      { question: "Do I need to manually enter every pantry item?", answer: "No. Neumas is designed to reduce manual entry by starting from receipts." },
      { question: "Can inventory drift from reality?", answer: "Yes. Drift can happen, which is why review and correction pathways are important." },
      { question: "Is pantry inventory private?", answer: "Yes. Household inventory data remains in authenticated private surfaces." },
      { question: "Where can I see this in broader context?", answer: "Read smart pantry automation and stockout prediction research pages." },
    ],
    relatedLinks: [
      { href: "/glossary", label: "Glossary index" },
      { href: "/research/smart-pantry-automation", label: "Smart pantry automation" },
      { href: "/glossary/stockout-prediction", label: "Stockout prediction" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];
