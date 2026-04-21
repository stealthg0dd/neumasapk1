import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { InsightsMarketingHeader } from "@/components/insights/InsightsMarketingHeader";
import { BACKEND_URL } from "@/lib/backend-url";

type Post = {
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  created_at: string;
};

async function fetchPost(slug: string): Promise<Post | null> {
  const url = `${BACKEND_URL}/api/insights/posts/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<Post>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) {
    return { title: "Article | Neumas Insights" };
  }
  return {
    title: `${post.title} | Neumas Insights`,
    description: post.summary,
  };
}

export default async function InsightArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <InsightsMarketingHeader />

      <article className="mx-auto max-w-[720px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-700">
            {post.category.replace(/-/g, " ")}
          </span>
          <time dateTime={post.created_at}>
            {new Date(post.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{post.title}</h1>
        <p className="mt-4 text-xl text-gray-500">{post.summary}</p>

        <div className="mt-10 max-w-none space-y-4 text-base leading-relaxed text-gray-800 [&_a]:text-blue-600 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_li]:my-1 [&_ol]:my-4 [&_p]:my-4 [&_ul]:my-4">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>

        <div className="mt-16 rounded-2xl bg-blue-50 p-8 text-center">
          <p className="text-lg font-semibold text-gray-900">Ready to put AI to work in your kitchen?</p>
          <p className="mt-2 text-sm text-gray-600">
            Neumas predicts what you&apos;ll run out of before you do.
          </p>
          <Link
            href="/auth"
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Start free trial →
          </Link>
        </div>

        <p className="mt-10 text-center">
          <Link href="/insights" className="text-sm font-medium text-blue-600 hover:underline">
            ← All insights
          </Link>
        </p>
      </article>
    </div>
  );
}
