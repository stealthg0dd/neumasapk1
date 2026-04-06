"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, Building2, User, MapPin, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track, identifyUser, captureUIError } from "@/lib/analytics";
import { signup } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";
import { slideUp, scaleIn } from "@/lib/design-system";

const ParticleField = dynamic(
  () => import("@/components/three/ParticleField"),
  { ssr: false }
);

// ── Step schemas ───────────────────────────────────────────────────────────────

const step1Schema = z
  .object({
    email:    z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm:  z.string().min(8, "At least 8 characters"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

const step2Schema = z.object({
  org_name: z.string().min(2, "At least 2 characters").max(255),
  org_type: z.string().min(1, "Select a type"),
});

const step3Schema = z.object({
  property_name: z.string().min(2, "At least 2 characters").max(255),
  address:       z.string().optional(),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

// ── Org types ─────────────────────────────────────────────────────────────────

const ORG_TYPES = [
  { value: "restaurant",  label: "Restaurant" },
  { value: "hotel",       label: "Hotel" },
  { value: "cafe",        label: "Café / Bakery" },
  { value: "bar",         label: "Bar / Pub" },
  { value: "catering",    label: "Catering" },
  { value: "other",       label: "Other" },
];

// ── Step progress indicator ────────────────────────────────────────────────────

const STEPS = [
  { label: "Account",      icon: User },
  { label: "Organization", icon: Building2 },
  { label: "Property",     icon: MapPin },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done    = i < current;
        const active  = i === current;
        const Icon    = step.icon;
        return (
          <div key={step.label} className="flex items-center gap-2">
            <div
              className={[
                "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-xs font-semibold",
                done   ? "bg-cyan-500 text-white"           : "",
                active ? "bg-cyan-500/20 border border-cyan-500 text-cyan-400" : "",
                !done && !active ? "bg-surface-1 border border-border/50 text-muted-foreground" : "",
              ].join(" ")}
            >
              {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
            </div>
            <span
              className={[
                "text-xs font-medium hidden sm:inline",
                active ? "text-cyan-400" : done ? "text-foreground/60" : "text-muted-foreground",
              ].join(" ")}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "h-px flex-1 min-w-6 transition-all duration-500",
                  done ? "bg-cyan-500" : "bg-border/40",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router  = useRouter();
  const { saveAuth } = useAuthStore();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<Step1 & Step2 & Step3>>({});

  // Step 1
  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema) });
  // Step 2
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema) });
  // Step 3
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema) });

  async function handleStep1(data: Step1) {
    setFormData((prev) => ({ ...prev, ...data }));
    setStep(1);
  }

  async function handleStep2(data: Step2) {
    setFormData((prev) => ({ ...prev, ...data }));
    setStep(2);
  }

  async function handleStep3(data: Step3) {
    const merged = { ...formData, ...data };

    try {
      const res = await signup({
        email:         merged.email!,
        password:      merged.password!,
        org_name:      merged.org_name!,
        property_name: merged.property_name!,
      });
      saveAuth(res);
      track("user_signed_in", { email: merged.email! });
      identifyUser({
        userId:     res.profile.user_id,
        email:      res.profile.email,
        orgId:      res.profile.org_id,
        propertyId: res.profile.property_id,
      });
      toast.success("Account created! Welcome to Neumas.");
      router.replace("/dashboard");
    } catch (err: unknown) {
      captureUIError("signup", err);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 min-h-screen">
      {/* ── Left ─────────────────────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
        <div className="absolute inset-0">
          <ParticleField />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neutral-950 to-transparent" />

        <div className="relative z-10 text-center px-8 max-w-sm">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold gradient-text">Neumas</span>
            </div>
            <p className="text-neutral-400 text-lg leading-relaxed">
              Set up in under 3 minutes. Your AI inventory manager is ready to go.
            </p>

            <ul className="mt-8 space-y-3 text-left">
              {[
                "Scan receipts with your phone camera",
                "AI predicts stockouts before they happen",
                "Auto-generated shopping lists every week",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-neutral-400">
                  <Check className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>

      {/* ── Right — Multi-step form ───────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">Neumas</span>
          </div>

          <StepIndicator current={step} />

          {/* Step panels — animate between them */}
          <AnimatePresence mode="wait">
            {/* ─ Step 0 — Account ─────────────────────────────────────────── */}
            {step === 0 && (
              <motion.div key="step0" variants={slideUp} initial="hidden" animate="visible" exit={{ opacity: 0, y: -16 }}>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
                  <p className="text-muted-foreground mt-1 text-sm">Start with your email and password.</p>
                </div>

                <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-4" noValidate>
                  <Field label="Email" error={form1.formState.errors.email?.message}>
                    <Input
                      type="email"
                      autoFocus
                      autoComplete="email"
                      placeholder="you@company.com"
                      className="field-input-dark"
                      {...form1.register("email")}
                    />
                  </Field>

                  <Field label="Password" error={form1.formState.errors.password?.message}>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="field-input-dark"
                      {...form1.register("password")}
                    />
                  </Field>

                  <Field label="Confirm password" error={form1.formState.errors.confirm?.message}>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="field-input-dark"
                      {...form1.register("confirm")}
                    />
                  </Field>

                  <NextButton loading={form1.formState.isSubmitting} />
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/auth" className="text-[#0071a3] hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </motion.div>
            )}

            {/* ─ Step 1 — Organization ────────────────────────────────────── */}
            {step === 1 && (
              <motion.div key="step1" variants={scaleIn} initial="hidden" animate="visible" exit={{ opacity: 0, y: -16 }}>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">About your organization</h1>
                  <p className="text-muted-foreground mt-1 text-sm">This will be used to set up your workspace.</p>
                </div>

                <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-4" noValidate>
                  <Field label="Organization name" error={form2.formState.errors.org_name?.message}>
                    <Input
                      autoFocus
                      placeholder="The Grand Hotel"
                      className="field-input-dark"
                      {...form2.register("org_name")}
                    />
                  </Field>

                  <Field label="Type" error={form2.formState.errors.org_type?.message}>
                    <select
                      className="w-full h-11 px-3 rounded-md bg-surface-1 border border-border/60 text-sm text-foreground focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                      {...form2.register("org_type")}
                    >
                      <option value="">Select type…</option>
                      {ORG_TYPES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex gap-3 pt-1">
                    <BackButton onClick={() => setStep(0)} />
                    <NextButton loading={form2.formState.isSubmitting} />
                  </div>
                </form>
              </motion.div>
            )}

            {/* ─ Step 2 — Property ────────────────────────────────────────── */}
            {step === 2 && (
              <motion.div key="step2" variants={scaleIn} initial="hidden" animate="visible" exit={{ opacity: 0, y: -16 }}>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">Your first property</h1>
                  <p className="text-muted-foreground mt-1 text-sm">Add more properties later from settings.</p>
                </div>

                <form onSubmit={form3.handleSubmit(handleStep3)} className="space-y-4" noValidate>
                  <Field label="Property name" error={form3.formState.errors.property_name?.message}>
                    <Input
                      autoFocus
                      placeholder="Main Kitchen"
                      className="field-input-dark"
                      {...form3.register("property_name")}
                    />
                  </Field>

                  <Field label="Address (optional)" error={form3.formState.errors.address?.message}>
                    <Input
                      placeholder="123 Main St, City"
                      className="field-input-dark"
                      {...form3.register("address")}
                    />
                  </Field>

                  <div className="flex gap-3 pt-1">
                    <BackButton onClick={() => setStep(1)} />
                    <Button
                      type="submit"
                      disabled={form3.formState.isSubmitting}
                      className="flex-1 h-11 gradient-primary text-white font-semibold hover:opacity-90 transition-all active:scale-[0.98]"
                    >
                      {form3.formState.isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Creating account…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Create account
                          <Check className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Small helper sub-components ────────────────────────────────────────────────

function Field({
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

function NextButton({ loading }: { loading: boolean }) {
  return (
    <Button
      type="submit"
      disabled={loading}
      className="w-full h-11 gradient-primary text-white font-semibold hover:opacity-90 transition-all active:scale-[0.98]"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Continuing…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          Continue
          <ArrowRight className="w-4 h-4" />
        </span>
      )}
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-11 px-4 border-border/60 hover:bg-surface-1 transition-all"
    >
      <ArrowLeft className="w-4 h-4" />
    </Button>
  );
}
