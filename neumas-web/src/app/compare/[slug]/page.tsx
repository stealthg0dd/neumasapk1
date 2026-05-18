import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const compareSlugs = [
  "manual-shopping-list-vs-ai-grocery-autopilot",
  "receipt-scanner-vs-inventory-intelligence",
];

export function generateStaticParams() {
  return compareSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/compare/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/compare/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
