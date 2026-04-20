export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    // Listen for Supabase sign-in event
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        try {
          // Try to complete Google onboarding (returns 422 if user is new)
          try {
            const loginResp = await googleComplete(session.access_token);
            saveSession(loginResp);
            router.replace("/dashboard");
          } catch (err: any) {
            // If 422, redirect to onboarding with JWT
            if (err?.response?.status === 422) {
              router.replace(`/onboard?supabase_jwt=${encodeURIComponent(session.access_token)}`);
            } else {
              router.replace("/login?error=oauth_complete_failed");
            }
          }
        } catch (err) {
          router.replace("/login?error=oauth_complete_failed");
        }
      }
    });
    unsub = () => sub.subscription.unsubscribe();

    // If already signed in, trigger the flow immediately
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          try {
            const loginResp = await googleComplete(session.access_token);
            saveSession(loginResp);
            router.replace("/dashboard");
          } catch (err: any) {
            if (err?.response?.status === 422) {
              router.replace(`/onboard?supabase_jwt=${encodeURIComponent(session.access_token)}`);
            } else {
              router.replace("/login?error=oauth_complete_failed");
            }
          }
        } catch (err) {
          router.replace("/login?error=oauth_complete_failed");
        }
      }
    });

    return () => {
      unsub?.();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#64748b] text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#64748b] text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
