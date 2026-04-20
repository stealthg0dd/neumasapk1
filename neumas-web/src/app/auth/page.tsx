'use client'

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { login } from "@/lib/api/endpoints";
import { selectHasSession, useAuthStore } from "@/lib/store/auth";
import { track, identifyUser, captureUIError } from "@/lib/analytics";
import { signInWithGoogle } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type FormData = z.infer<typeof schema>;

export default function AuthPage() {
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
        userId: res.profile.user_id,
        email: res.profile.email,
        orgId: res.profile.org_id,
        propertyId: res.profile.property_id,
      });
      toast.success("Welcome back!");
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error("Login failed. Please try again.");
      captureUIError("auth_login", err);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#fafafa]">
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="w-full max-w-md"
      >
        <Card className="border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg shadow-black/5 rounded-2xl">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-[#0071a3] tracking-tight">Neumas</div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Sign in to Neumas</h1>
            </div>

            <button
              type="button"
              className="w-full h-11 rounded-xl border border-[var(--border)] bg-white text-sm font-medium text-[var(--text-primary)] flex items-center justify-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors"
              onClick={handleGoogleSignIn}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-[var(--glass-bg)] px-2 text-[var(--text-muted)]">or email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-[var(--text-primary)]">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-11 rounded-xl border-[var(--border)] bg-white focus-visible:ring-2 focus-visible:ring-[#0071a3]/35"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-[#ff3b30]">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-[var(--text-primary)]">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-11 pr-10 rounded-xl border-[var(--border)] bg-white focus-visible:ring-2 focus-visible:ring-[#0071a3]/35"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    tabIndex={-1}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-[#ff3b30]">{errors.password.message}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-[#0071a3] hover:bg-[#005a82] text-white font-semibold"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-[var(--text-secondary)]">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-[#0071a3] font-medium hover:underline">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
