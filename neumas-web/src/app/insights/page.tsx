"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { InsightsMarketingHeader } from "@/components/insights/InsightsMarketingHeader";

type Post = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  created_at: string;
  view_count: number;
};

const FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All" },
  { id: "grocery-trends", label: "Grocery Trends" },
  { id: "food-waste", label: "Food Waste" },
  { id: "ai-intelligence", label: "AI Intelligence" },
  { id: "budgeting", label: "Budgeting" },
];

function categoryBadgeClass(cat: string): string {
  switch (cat) {
    case "grocery-trends":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "food-waste":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "ai-intelligence":
      return "bg-purple-50 text-purple-800 border-purple-100";
    case "budgeting":
      return "bg-amber-50 text-amber-900 border-amber-100";
    case "sustainability":
      return "bg-teal-50 text-teal-800 border-teal-100";
    default:
      return "bg-gray-50 text-gray-700 border-gray-100";
  }
}

export default function InsightsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL("/api/insights/posts", window.location.origin);
      u.searchParams.set("limit", "30");
      if (category) u.searchParams.set("category", category);
      const res = await fetch(u.toString());
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <InsightsMarketingHeader />

      <header className="px-4 py-16 text-center sm:px-6">
        <span className="inline-block rounded-full bg-blue-50 px-3 py-1 font-mono text-xs font-medium text-blue-600">
          NEUMAS INSIGHTS
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Grocery intelligence, researched weekly
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-500 sm:text-base">
          Our AI agent researches the latest grocery trends, food waste data, and household economics —
          published every week.
        </p>
      </header>

      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-4 pb-8 sm:px-6">
        {FILTERS.map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            onClick={() => setCategory(f.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              category === f.id
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="py-12 text-center text-gray-500">No articles yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.id}
                href={`/insights/${p.slug}`}
                className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-blue-100 hover:shadow-md"
              >
                <span
                  className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${categoryBadgeClass(p.category)}`}
                >
                  {p.category.replace(/-/g, " ")}
                </span>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-gray-900 group-hover:text-blue-700">
                  {p.title}
                </h2>
                <p className="mb-4 mt-2 line-clamp-3 text-sm text-gray-500">{p.summary}</p>
                <div className="flex items-center justify-between text-sm">
                  <time dateTime={p.created_at} className="text-gray-400">
                    {new Date(p.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <span className="font-medium text-blue-600">Read →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
