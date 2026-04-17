"use client";
import React from "react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-white flex flex-col items-center justify-start font-sans">
      <header className="w-full max-w-5xl mx-auto px-6 pt-16 pb-8 flex flex-col items-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4 tracking-tight text-center">
          Your procurement, on autopilot
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 mb-8 text-center max-w-2xl">
          Neumas turns your receipts and invoices into real-time inventory, alerts, and AI-powered reorder intelligence. Purpose-built for foodservice operators.
        </p>
        <div className="flex gap-4 mb-8">
          <Link href="/pilot" className="px-6 py-3 rounded-lg bg-black text-white font-semibold shadow hover:bg-gray-900 transition">Start 14-day Pilot</Link>
          <a href="https://cal.com/neumas/demo" target="_blank" rel="noopener" className="px-6 py-3 rounded-lg border border-gray-300 text-gray-900 font-semibold hover:bg-gray-100 transition">Book Demo</a>
        </div>
        <div className="bg-white/80 rounded-xl shadow p-6 mt-4 w-full max-w-2xl">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">How it works</h2>
          <ol className="list-decimal list-inside text-gray-700 space-y-1">
            <li>Snap a photo or upload a receipt/invoice</li>
            <li>Neumas extracts line items and updates your inventory</li>
            <li>Get instant alerts for low stock, price changes, and more</li>
            <li>AI recommends reorders and optimizes your spend</li>
          </ol>
        </div>
      </header>
      <section className="w-full max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-12">
        <div className="bg-white/90 rounded-xl shadow p-8 flex flex-col items-start">
          <h3 className="text-xl font-bold mb-2 text-gray-900">14-Day Pilot</h3>
          <p className="text-gray-700 mb-4">Try Neumas with your team. No credit card required. Full support included.</p>
          <ul className="list-disc list-inside text-gray-700 mb-4">
            <li>Unlimited uploads</li>
            <li>All features unlocked</li>
            <li>Personalized onboarding</li>
            <li>Cancel anytime</li>
          </ul>
          <Link href="/pilot" className="mt-auto px-5 py-2 rounded bg-black text-white font-semibold hover:bg-gray-900 transition">Start Pilot</Link>
        </div>
        <div className="bg-white/90 rounded-xl shadow p-8 flex flex-col items-start">
          <h3 className="text-xl font-bold mb-2 text-gray-900">Who is Neumas for?</h3>
          <ul className="list-disc list-inside text-gray-700 mb-4">
            <li>Restaurants</li>
            <li>Caterers</li>
            <li>Central kitchens</li>
            <li>Hotels</li>
            <li>Food-service operators</li>
          </ul>
          <p className="text-gray-700">If you manage inventory, purchasing, or food costs, Neumas is built for you.</p>
        </div>
      </section>
    </main>
  );
}
