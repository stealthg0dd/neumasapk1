import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const glossarySlugs = ["stockout-prediction", "receipt-intelligence", "pantry-inventory"];

export function generateStaticParams() {
  return glossarySlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/glossary/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function GlossaryTermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/glossary/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
