import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const page = getPublicPage("/data-processing");

export const metadata = page ? buildPublicMetadata(page) : {};

export default function DataProcessingPage() {
  if (!page) notFound();
  return <PublicPage page={page} />;
}
