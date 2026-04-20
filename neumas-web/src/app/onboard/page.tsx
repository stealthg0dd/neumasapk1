import { Suspense } from "react";
import ClientOnboardPage from "./ClientOnboardPage";

export default function OnboardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]"><div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" /></div>}>
      <ClientOnboardPage />
    </Suspense>
  );
}