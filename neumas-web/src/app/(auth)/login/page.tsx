'use client'

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api/endpoints";
import { selectHasSession, useAuthStore } from "@/lib/store/auth";
import { slideUp, staggerContainer } from "@/lib/design-system";
import { track, identifyUser, captureUIError } from "@/lib/analytics";
import { signInWithGoogle } from "@/lib/supabase";

// ── Dynamic 3D import (SSR disabled) ─────────────────────────────────────────
const ParticleField = dynamic(
  () => import("@/components/three/ParticleField"),
  { ssr: false }
);

// ── Zod schema ─────────────────────────────────────────────────────────────────

const schema = z.object({
  email:      z.string().email("Enter a valid email"),
  password:   z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { saveAuth } = useAuthStore();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const hasSession = useAuthStore(selectHasSession);
  const [showPwd, setShowPwd] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (hasHydrated && hasSession) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, hasSession, router]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // signInWithGoogle redirects the browser — execution stops here.
    } catch (err: unknown) {
      setGoogleLoading(false);
      const msg = (err as { message?: string })?.message ?? "Google sign-in failed.";
      toast.error(msg);
      captureUIError("google_signin", err);
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      const res = await login({ email: data.email, password: data.password });
      saveAuth(res);
      track("user_signed_in", { email: data.email });
      identifyUser({
        userId:     res.profile.user_id,
        email:      res.profile.email,
        orgId:      res.profile.org_id,
        propertyId: res.profile.property_id,
      });
      toast.success("Welcome back!");
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error("Login failed. Please try again.");
      captureUIError("login", err);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 min-h-screen">
      {/* ── Left — 3D animation panel ─────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
        {/* Particle canvas fills the panel */}
        <div className="absolute inset-0">
          <ParticleField />
        </div>

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neutral-950 to-transparent" />

        {/* Brand copy */}
        <div className="relative z-10 text-center px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold gradient-text tracking-tight">
                Neumas
              </span>
            </div>
            <p className="text-neutral-400 text-lg max-w-xs leading-relaxed">
              AI-powered inventory management for hospitality professionals.
            </p>
          </motion.div>

          <motion.div
            className="mt-12 grid grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {[
              { stat: "94%", label: "Waste reduction" },
              { stat: "3×",  label: "Faster ordering" },
              { stat: "$0",  label: "Setup cost" },
            ].map(({ stat, label }) => (
              <motion.div key={label} variants={slideUp} className="glass-card rounded-xl p-4">
                <div className="text-2xl font-bold gradient-text">{stat}</div>
                <div className="text-xs text-neutral-500 mt-1">{label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Right — Login form ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          className="w-full max-w-md"
          variants={slideUp}
          initial="hidden"
          animate="visible"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">Neumas</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Welcome back
            </h1>
            <p className="text-muted-foreground mt-2">
              Sign in to your account to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground/80"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@company.com"
                className="bg-surface-1 border-border/60 h-11 focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                {...register("email")}
              />
              <AnimatePresence>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-destructive"
                  >
                    {errors.email.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground/80"
                >
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="bg-surface-1 border-border/60 h-11 pr-11 focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-destructive"
                  >
                    {errors.password.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border/60 bg-surface-1 accent-cyan-500"
                {...register("rememberMe")}
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors">
                Remember me for 30 days
              </span>
            </label>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 gradient-primary text-white font-semibold tracking-wide hover:opacity-90 transition-all active:scale-[0.98] mt-2"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground tracking-wider">
                or continue with
              </span>
            </div>
          </div>

          {/* Social buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="glass-button h-11 rounded-lg flex items-center justify-center gap-2.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-surface-1/60 transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <span className="w-4 h-4 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                  G
                </span>
              )}
              Google
            </button>
            <button
              type="button"
              disabled
              className="glass-button h-11 rounded-lg flex items-center justify-center gap-2.5 text-sm font-medium text-foreground/60 cursor-not-allowed opacity-50"
            >
              <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                M
              </span>
              Microsoft
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-cyan-500 hover:text-cyan-400 font-medium transition-colors"
            >
              Create one free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
