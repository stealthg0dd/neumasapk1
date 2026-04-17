"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, Building2, Users, Workflow } from "lucide-react";

type Step = "form" | "success";

interface PilotFormData {
  companyName: string;
  contactName: string;
  email: string;
  outlets: string;
  businessType: string;
  currentWorkflow: string;
}

const BUSINESS_TYPES = [
  "Restaurant / Dining",
  "Hotel / Hospitality",
  "Catering / Events",
  "Food Manufacture",
  "Cafe / Bakery",
  "Retail / Grocery",
  "Other",
];

const OUTLET_OPTIONS = ["1", "2–5", "6–20", "21–50", "50+"];

const WORKFLOW_OPTIONS = [
  "Manual spreadsheets",
  "WhatsApp / messaging",
  "Paper-based",
  "Existing ERP/POS",
  "No formal process",
];

export default function PilotPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PilotFormData>({
    companyName: "",
    contactName: "",
    email: "",
    outlets: "1",
    businessType: "",
    currentWorkflow: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PilotFormData, string>>>({});

  function validate(): boolean {
    const e: Partial<Record<keyof PilotFormData, string>> = {};
    if (!form.companyName.trim()) e.companyName = "Required";
    if (!form.contactName.trim()) e.contactName = "Required";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email";
    if (!form.businessType) e.businessType = "Select a business type";
    if (!form.currentWorkflow) e.currentWorkflow = "Select your current workflow";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);

    // Store pilot intent locally (real submission would POST to CRM/backend)
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "neumas_pilot_intent",
          JSON.stringify({ ...form, submitted_at: new Date().toISOString() })
        );
      }
      // Small delay to feel like a real submission
      await new Promise((r) => setTimeout(r, 800));
      setStep("success");
    } finally {
      setBusy(false);
    }
  }

  function set(key: keyof PilotFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-lg">
          <div className="rounded-3xl border border-black/[0.06] bg-white p-10 shadow-sm text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h1 className="text-[24px] font-bold text-gray-900">You&apos;re on the list</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-500">
              We&apos;ve received your pilot request for{" "}
              <span className="font-semibold text-gray-800">{form.companyName}</span>. Our team
              will reach out to{" "}
              <span className="font-semibold text-gray-800">{form.email}</span> within one
              business day to schedule your onboarding call.
            </p>

            <div className="mt-8 rounded-2xl bg-[#f0f7fb] p-6 text-left">
              <p className="mb-4 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
                What happens next
              </p>
              <ol className="space-y-3">
                {[
                  "30-min onboarding call with your account manager",
                  "Secure workspace provisioned with your org settings",
                  "Upload your first batch of invoices or receipts",
                  "Live inventory and first AI forecast within 24 hours",
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0071a3] font-mono text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-[13px] text-gray-600">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071a3] px-7 py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a] transition-colors"
              >
                Sign in to your account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-7 py-3 text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Simple top bar */}
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="text-[16px] font-bold tracking-tight text-[#0071a3]">
            NEUMAS CONTROL
          </Link>
          <Link href="/auth" className="text-[13px] font-medium text-gray-500 hover:text-gray-800">
            Already a customer? Sign in →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-14">
        {/* Page heading */}
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#0071a3]/20 bg-[#f0f7fb] px-3.5 py-1.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0071a3]" />
            <span className="font-mono text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
              14-Day Pilot
            </span>
          </span>
          <h1 className="text-[32px] font-bold tracking-tight text-gray-900">
            Start your free pilot
          </h1>
          <p className="mt-3 text-[16px] text-gray-500">
            Zero setup cost. Full product access. First operational value within 24 hours.
          </p>
        </div>

        {/* Trust row */}
        <div className="mb-10 flex flex-wrap justify-center gap-6">
          {[
            { icon: Building2, text: "No hardware required" },
            { icon: Users, text: "Multi-outlet from day one" },
            { icon: Workflow, text: "Works with your existing process" },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2 text-[13px] text-gray-500">
              <Icon className="h-4 w-4 text-[#0071a3]" />
              {text}
            </span>
          ))}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-black/[0.06] bg-white p-8 shadow-sm space-y-6"
          noValidate
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Company name */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                Company name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="organization"
                placeholder="e.g. Greenleaf F&B Group"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:ring-2 focus:ring-[#0071a3]/20 ${
                  errors.companyName ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              />
              {errors.companyName && (
                <p className="mt-1 text-[11px] text-red-500">{errors.companyName}</p>
              )}
            </div>

            {/* Contact name */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                Contact name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:ring-2 focus:ring-[#0071a3]/20 ${
                  errors.contactName ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              />
              {errors.contactName && (
                <p className="mt-1 text-[11px] text-red-500">{errors.contactName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                Work email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="ops@yourcompany.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:ring-2 focus:ring-[#0071a3]/20 ${
                  errors.email ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>
              )}
            </div>
          </div>

          {/* Number of outlets */}
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-gray-700">
              Number of outlets / locations
            </label>
            <div className="flex flex-wrap gap-2">
              {OUTLET_OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => set("outlets", o)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                    form.outlets === o
                      ? "border-[#0071a3] bg-[#0071a3] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Business type */}
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-gray-700">
              Business type <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set("businessType", b)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                    form.businessType === b
                      ? "border-[#0071a3] bg-[#0071a3] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            {errors.businessType && (
              <p className="mt-1.5 text-[11px] text-red-500">{errors.businessType}</p>
            )}
          </div>

          {/* Current workflow */}
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-gray-700">
              Current inventory / procurement workflow <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => set("currentWorkflow", w)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                    form.currentWorkflow === w
                      ? "border-[#0071a3] bg-[#0071a3] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            {errors.currentWorkflow && (
              <p className="mt-1.5 text-[11px] text-red-500">{errors.currentWorkflow}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#0071a3] py-4 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Start my 14-day pilot →"}
          </button>

          <p className="text-center text-[11px] text-gray-400">
            No credit card required. No contract. Cancel any time.
          </p>
        </form>
      </div>
    </div>
  );
}
