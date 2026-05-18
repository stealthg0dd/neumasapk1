import type { JsonLd } from "@/lib/public-site";

export function StructuredData({ data }: { data: JsonLd[] }) {
  return (
    <>
      {data.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </>
  );
}