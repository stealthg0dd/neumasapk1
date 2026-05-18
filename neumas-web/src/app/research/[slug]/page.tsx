import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const researchSlugs = [
  "ai-grocery-intelligence",
  "receipt-intelligence",
  "household-consumption-patterns",
  "reducing-food-waste-with-ai",
  "smart-pantry-automation",
  "household-consumption-analytics",
];

export function generateStaticParams() {
  return researchSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/research/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/research/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}