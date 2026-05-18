import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const page = getPublicPage("/about");

export const metadata = page ? buildPublicMetadata(page) : {};

export default function AboutPage() {
  if (!page) notFound();
  return <PublicPage page={page} />;
}