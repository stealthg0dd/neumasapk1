import { AuthRedirectIfLoggedIn } from "@/components/auth-redirect";
import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Public homepage — server component so all content is present in raw HTML
 * for web crawlers, LLM scrapers, and social preview bots.
 *
 * Auth redirect is handled by the lightweight client component below,
 * which re-hydrates on the client and pushes logged-in users to /dashboard
 * without blocking the initial server render.
 */
export default function RootPage() {
  return (
    <>
      <AuthRedirectIfLoggedIn />
      <LandingPage />
    </>
  );
}
