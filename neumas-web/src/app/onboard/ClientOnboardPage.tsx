"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Upload,
  CheckCircle2,
  ArrowRight,
  Loader2,
  X,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { postScanUpload, getScanStatus, googleComplete } from "@/lib/api/endpoints";
import { setOnboardingComplete } from "@/lib/onboarding";
import { saveSession } from "@/lib/auth-session";
import { useAuthStore, selectIsAuthenticated } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 4;

function StepWelcome({ orgName, setOrgName, onNext }: { orgName: string; setOrgName: (v: string) => void; onNext: () => void; }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-gray-900">Welcome to Neumas Control</h1>
        <p className="mt-2 text-[15px] text-gray-500">Let's get your workspace configured. This takes about 3 minutes.</p>
      </div>
      <div className="rounded-2xl bg-[#f0f7fb] p-5">
        <p className="mb-4 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">What you'll get today</p>
        <ul className="space-y-2.5">
          {[
            "Live inventory populated from your first invoice",
            "AI stockout forecast within 24 hours",
            "Spend by category and vendor tracking",
            "Weekly procurement report, automatically generated",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0071a3]" />
              <span className="text-[13px] text-gray-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-gray-700">Organisation name</label>
        <input
          type="text"
          autoFocus
          autoComplete="organization"
          placeholder="e.g. Greenleaf F&B Group"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={!orgName.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] disabled:opacity-50"
      >
        Set up my workspace
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

interface Outlet { name: string; type: string; }
const OUTLET_TYPES = ["Restaurant", "Café", "Hotel", "Catering", "Bar", "Other"];
function StepOutlets({ outlets, setOutlets, onNext, onBack }: { outlets: Outlet[]; setOutlets: (v: Outlet[]) => void; onNext: () => void; onBack: () => void; }) {
  function addOutlet() { setOutlets([...outlets, { name: "", type: "Restaurant" }]); }
  function removeOutlet(idx: number) { setOutlets(outlets.filter((_, i) => i !== idx)); }
  function updateOutlet(idx: number, key: keyof Outlet, val: string) { setOutlets(outlets.map((o, i) => (i === idx ? { ...o, [key]: val } : o))); }
  const valid = outlets.length > 0 && outlets.every((o) => o.name.trim());
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold text-gray-900">Map your outlets</h2>
        <p className="mt-1.5 text-[14px] text-gray-500">Add each location that receives deliveries or uses inventory. You can add more later.</p>
      </div>
      <div className="space-y-3">
        {outlets.map((o, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <MapPin className="h-4 w-4 shrink-0 text-[#0071a3]" />
            <input type="text" placeholder={`Outlet name (e.g. Main Kitchen)`} value={o.name} onChange={(e) => updateOutlet(idx, "name", e.target.value)} className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400" />
            <select value={o.type} onChange={(e) => updateOutlet(idx, "type", e.target.value)} className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 outline-none">
              {OUTLET_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            {outlets.length > 1 && (
              <button type="button" onClick={() => removeOutlet(idx)} className="shrink-0 rounded-lg p-1 text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addOutlet} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700">+ Add another outlet</button>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-50">Back</button>
        <button type="button" onClick={onNext} disabled={!valid} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white transition-all hover:bg-[#005f8a] disabled:opacity-50">Continue<ArrowRight className="h-4 w-4" /></button>
      </div>
      <button type="button" onClick={onNext} className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2">Skip for now — I'll add outlets later</button>
    </div>
  );
}

function StepUpload({ onNext, onBack, onSkip }: { onNext: () => void; onBack: () => void; onSkip: () => void; }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetFile = useCallback(() => { setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); setDone(false); }, [preview]);
  const onFileSelected = useCallback((f: File) => { const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"]; if (!allowed.includes(f.type)) { toast.error("Upload a JPEG, PNG, WebP, or PDF."); return; } if (f.size > 15 * 1024 * 1024) { toast.error("File must be under 15 MB."); return; } resetFile(); setFile(f); if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f)); }, [resetFile]);
  async function runScan() { if (!file) return; setBusy(true); try { const res = await postScanUpload(file, "receipt"); const sid = res.scan_id ?? res.id ?? null; if (!sid) { toast.error("Could not start scan."); setBusy(false); return; } toast.success("Document queued — extracting line items…"); pollRef.current = setInterval(async () => { try { const s = await getScanStatus(sid); if (s.status === "completed" || s.status === "failed") { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setBusy(false); if (s.status === "completed") { setDone(true); toast.success(`Extracted ${s.items_detected ?? 0} items — inventory updated.`); } else { toast.error(s.error_message ?? "Extraction failed."); } } } catch { /* keep polling */ } }, 2000); } catch (err) { captureUIError("onboard_upload", err); setBusy(false); } }
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold text-gray-900">Upload your first invoice</h2>
        <p className="mt-1.5 text-[14px] text-gray-500">Drop any supplier invoice or delivery note. Our AI extracts every line item and posts it to inventory automatically.</p>
      </div>
      {done ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="text-[16px] font-semibold text-emerald-800">Document processed successfully</p>
          <p className="mt-1 text-[13px] text-emerald-700">Your inventory has been updated. Head to the dashboard to see your data.</p>
        </div>
      ) : (
        <>
          <div role="button" tabIndex={0} aria-label="Upload file" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") (e.target as HTMLElement).click(); }} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFileSelected(f); }} onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/jpeg,image/png,image/webp,application/pdf"; inp.onchange = () => { if (inp.files?.[0]) onFileSelected(inp.files[0]); }; inp.click(); }} className={cn("flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors", dragging ? "border-[#0071a3] bg-[#f0f7fb]" : file ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-gray-300")}>{preview ? (<img src={preview} alt="Preview" className="max-h-40 rounded-xl object-contain" />) : (<><Camera className="h-8 w-8 text-gray-300" /><div className="text-center"><p className="text-[14px] font-medium text-gray-600">{file ? file.name : "Drop invoice or click to upload"}</p><p className="mt-0.5 text-[12px] text-gray-400">JPEG, PNG, PDF · up to 15 MB</p></div></>)}
          </div>
          {file && !done && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Upload className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="truncate text-[13px] text-gray-700">{file.name}</p>
              </div>
              <button type="button" onClick={resetFile} className="ml-2 text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50">Back</button>
        {done ? (
          <button type="button" onClick={onNext} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a]">
            Go to dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : file ? (
          <button type="button" onClick={runScan} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a] disabled:opacity-60">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <>Extract & post to inventory</>}
          </button>
        ) : (
          <button type="button" disabled className="flex-1 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white opacity-40">Upload a document first</button>
        )}
      </div>
      <button type="button" onClick={onSkip} className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2">Skip — I'll upload later from the dashboard</button>
    </div>
  );
}

function StepReady({ orgName, onFinish }: { orgName: string; onFinish: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#0071a3]/10">
        <CheckCircle2 className="h-10 w-10 text-[#0071a3]" />
      </div>
      <div>
        <h2 className="text-[24px] font-bold text-gray-900">{orgName ? `${orgName} is ready.` : "Your workspace is ready."}</h2>
        <p className="mt-2 text-[15px] text-gray-500">Head to your dashboard to see live inventory, upload more documents, and let the AI start building your procurement intelligence.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 text-left">
        <p className="mb-4 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">Activation milestones</p>
        <div className="space-y-3">
          {[
            { label: "Upload 3+ documents", desc: "Unlocks category spend breakdown" },
            { label: "First AI forecast", desc: "Appears within 24 hours of data" },
            { label: "Review & approve a document", desc: "Posts to live inventory" },
            { label: "Generate first weekly report", desc: "Full procurement summary" },
          ].map((m, i) => (
            <div key={m.label} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 font-mono text-[11px] text-gray-500">{i + 1}</span>
              <div>
                <p className="text-[13px] font-semibold text-gray-800">{m.label}</p>
                <p className="text-[11px] text-gray-400">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={onFinish} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-4 text-[15px] font-semibold text-white shadow-sm hover:bg-[#005f8a] transition-colors">Open my dashboard<ArrowRight className="h-4 w-4" /></button>
    </div>
  );
}

export default function ClientOnboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const supabaseJwt = searchParams?.get("supabase_jwt");
  const isGoogleOnboarding = Boolean(supabaseJwt);
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [outlets, setOutlets] = useState([{ name: "", type: "Restaurant" }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (hasHydrated && !isAuth) { router.replace("/auth"); } }, [hasHydrated, isAuth, router]);
  async function finish() {
    if (isGoogleOnboarding && supabaseJwt) {
      setBusy(true);
      try {
        const resp = await googleComplete(supabaseJwt, {
          org_name: orgName,
          property_name: outlets[0]?.name || "Main Property",
          role: "admin",
        });
        saveSession(resp);
        setOnboardingComplete();
        router.replace("/dashboard");
      } catch (err) {
        toast.error("Failed to complete Google onboarding. Please try again.");
        setBusy(false);
      }
    } else {
      setOnboardingComplete();
      router.replace("/dashboard");
    }
  }
  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }
  if (!isAuth && !isGoogleOnboarding) return null;
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]"><div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" /></div>}>
      <div className="min-h-screen bg-[#f5f5f7]">
        <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
            <span className="text-[16px] font-bold tracking-tight text-[#0071a3]">NEUMAS CONTROL</span>
            <div className="flex items-center gap-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span key={i} className={cn("h-2 rounded-full transition-all", i + 1 < step ? "w-4 bg-[#0071a3]" : i + 1 === step ? "w-4 bg-[#0071a3]" : "w-2 bg-gray-200")}/>
              ))}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-14">
          <p className="mb-6 font-mono text-[11px] font-medium tracking-widest text-gray-400 uppercase">Step {step} of {TOTAL_STEPS} ·{" "}{step === 1 ? "Welcome" : step === 2 ? "Outlets" : step === 3 ? "First document" : "Ready"}</p>
          <div className="rounded-3xl border border-black/[0.06] bg-white p-8 shadow-sm">
            {step === 1 && (<StepWelcome orgName={orgName} setOrgName={setOrgName} onNext={() => setStep(2)} />)}
            {step === 2 && (<StepOutlets outlets={outlets} setOutlets={setOutlets} onNext={() => setStep(3)} onBack={() => setStep(1)} />)}
            {step === 3 && (<StepUpload onNext={() => setStep(4)} onBack={() => setStep(2)} onSkip={() => setStep(4)} />)}
            {step === 4 && <StepReady orgName={orgName} onFinish={finish} />}
            {busy && (<div className="absolute inset-0 flex items-center justify-center bg-white/80 z-50"><Loader2 className="h-8 w-8 animate-spin text-[#0071a3]" /></div>)}
          </div>
          {step < TOTAL_STEPS && (<p className="mt-6 text-center text-[12px] text-gray-400">Need help?{" "}<Link href="mailto:hello@neumas.io" className="underline hover:text-gray-600">Email us</Link></p>)}
        </div>
      </div>
    </Suspense>
  );
}
