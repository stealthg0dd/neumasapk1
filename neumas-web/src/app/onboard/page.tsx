'use client'

"use client";

/**
 * Onboard page — org + property setup for first-time Google OAuth users.
 *
 * Reached after /auth/callback detects the user has no Neumas DB record.
 * The pending Supabase session is stored in sessionStorage under the key
 * "oauth_pending_session" and consumed here.
 *
 * On success: calls POST /api/auth/google/complete → saves auth → /dashboard.
 * If session is missing (direct navigation): redirects to /login.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Building2, MapPin, Zap, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/store/auth";
import { post } from "@/lib/api/client";
import type { LoginResponse } from "@/lib/api/types";
import { slideUp, scaleIn } from "@/lib/design-system";
import { track, identifyUser } from "@/lib/analytics";

// ── Schemas ────────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  org_name: z.string().min(2, "At least 2 characters").max(255),
  org_type: z.string().min(1, "Select a type"),
});

const step2Schema = z.object({
  property_name: z.string().min(2, "At least 2 characters").max(255),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;

const ORG_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "hotel",      label: "Hotel" },
  { value: "cafe",       label: "Café / Bakery" },
  { value: "bar",        label: "Bar / Pub" },
  { value: "catering",   label: "Catering" },
  { value: "other",      label: "Other" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function OnboardPage() {
  const router = useRouter();
  const { saveAuth } = useAuthStore();
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState<Step1 | null>(null);
  const [pendingSession, setPendingSession] = useState<{
    access_token: string;
    refresh_token: string | null;
    expires_in: number;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("oauth_pending_session");
    if (!raw) {
      router.replace("/login?error=no_session");
      return;
    }
    try {
      setPendingSession(JSON.parse(raw));
    } catch {
      router.replace("/login?error=invalid_session");
    }
  }, [router]);

  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema) });

  function handleStep1(data: Step1) {
    setOrg(data);
    setStep(1);
  }

  async function handleStep2(data: Step2) {
    if (!pendingSession || !org) return;

    try {
      // Ensure the Axios interceptor has the token during this request.
      localStorage.setItem("neumas_access_token", pendingSession.access_token);

      const res = await post<LoginResponse>("/api/auth/google/complete", {
        org_name: org.org_name,
        property_name: data.property_name,
      });

      sessionStorage.removeItem("oauth_pending_session");

      saveAuth({
        access_token: pendingSession.access_token,
        refresh_token: pendingSession.refresh_token,
        expires_in: pendingSession.expires_in,
        profile: res.profile,
      });

      track("user_signed_in", { email: res.profile.email });
      identifyUser({
        userId:     res.profile.user_id,
        email:      res.profile.email,
        orgId:      res.profile.org_id,
        propertyId: res.profile.property_id,
      });

      toast.success("Account created! Welcome to Neumas.");
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ?? "Failed to complete setup.";
      toast.error(msg);
    }
  }

  // Show nothing until we confirm the session exists
  if (!pendingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold gradient-text">Neumas</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[
            { label: "Organization", icon: Building2 },
            { label: "Property",     icon: MapPin },
          ].map((s, i) => {
            const done   = i < step;
            const active = i === step;
            const Icon   = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                    done   ? "bg-cyan-500 text-white"                               : "",
                    active ? "bg-cyan-500/20 border border-cyan-500 text-cyan-400" : "",
                    !done && !active ? "bg-surface-1 border border-border/50 text-muted-foreground" : "",
                  ].join(" ")}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={["text-xs font-medium hidden sm:inline", active ? "text-cyan-400" : "text-muted-foreground"].join(" ")}>
                  {s.label}
                </span>
                {i < 1 && <div className={["h-px w-8 transition-all", done ? "bg-cyan-500" : "bg-border/40"].join(" ")} />}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="step0" variants={slideUp} initial="hidden" animate="visible" exit={{ opacity: 0, y: -16 }}>
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">About your organization</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  You&apos;re almost there. Tell us about your business.
                </p>
              </div>

              <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-4" noValidate>
                <FormField label="Organization name" error={form1.formState.errors.org_name?.message}>
                  <Input
                    autoFocus
                    placeholder="The Grand Hotel"
                    className="bg-surface-1 border-border/60 h-11"
                    {...form1.register("org_name")}
                  />
                </FormField>

                <FormField label="Type" error={form1.formState.errors.org_type?.message}>
                  <select
                    className="w-full h-11 px-3 rounded-md bg-surface-1 border border-border/60 text-sm text-foreground focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                    {...form1.register("org_type")}
                  >
                    <option value="">Select type…</option>
                    {ORG_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </FormField>

                <Button
                  type="submit"
                  className="w-full h-11 gradient-primary text-white font-semibold hover:opacity-90 transition-all"
                >
                  <span className="flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></span>
                </Button>
              </form>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step1" variants={scaleIn} initial="hidden" animate="visible" exit={{ opacity: 0, y: -16 }}>
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Your first property</h1>
                <p className="text-muted-foreground mt-1 text-sm">Add more properties later from settings.</p>
              </div>

              <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-4" noValidate>
                <FormField label="Property name" error={form2.formState.errors.property_name?.message}>
                  <Input
                    autoFocus
                    placeholder="Main Kitchen"
                    className="bg-surface-1 border-border/60 h-11"
                    {...form2.register("property_name")}
                  />
                </FormField>

                <Button
                  type="submit"
                  disabled={form2.formState.isSubmitting}
                  className="w-full h-11 gradient-primary text-white font-semibold hover:opacity-90 transition-all"
                >
                  {form2.formState.isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Finish setup
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground/80">{label}</label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
