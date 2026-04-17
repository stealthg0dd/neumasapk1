/* Server component */
import { ShieldCheck, Users, FileText, Download, Lock, Eye } from "lucide-react";

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Multi-tenant access control",
    desc: "Each organisation is fully isolated. Role-based permissions let you control who sees what — by outlet, team, or function.",
  },
  {
    icon: Users,
    title: "Row-level security",
    desc: "Data isolation is enforced at the database layer, not just the application. A staff member at Outlet A cannot access Outlet B's data.",
  },
  {
    icon: Eye,
    title: "Full audit trail",
    desc: "Every document upload, inventory change, alert action, and export is logged with timestamp, user, and change delta. Nothing disappears silently.",
  },
  {
    icon: FileText,
    title: "Review before posting",
    desc: "No AI extraction posts to your inventory without a human checkpoint. Low-confidence items always route to a review queue first.",
  },
  {
    icon: Download,
    title: "Full data exportability",
    desc: "Your data is yours. Export inventory, documents, spend history, and audit logs at any time in standard formats.",
  },
  {
    icon: Lock,
    title: "Privacy by design",
    desc: "Document images and sensitive supplier data are encrypted at rest and in transit. We do not train models on your proprietary data.",
  },
];

export function Security() {
  return (
    <section
      id="security"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            Operator trust
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Built for operators
            <br />
            who need control.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Procurement data is commercially sensitive. Neumas is designed so that
            your team, your auditors, and your finance function can always trust what they see.
          </p>
        </div>

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071a3]/8">
                  <Icon className="h-5 w-5 text-[#0071a3]" />
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">{p.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{p.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Compliance note */}
        <div className="mt-10 rounded-2xl border border-black/[0.05] bg-[#f5f5f7] px-7 py-6">
          <div className="flex flex-wrap items-center justify-center gap-8 text-center">
            {[
              { label: "PDPA compliant", sub: "Singapore & Malaysia" },
              { label: "GDPR aligned", sub: "EU operations" },
              { label: "TLS 1.3 encryption", sub: "All data in transit" },
              { label: "Encryption at rest", sub: "AES-256" },
            ].map((b) => (
              <div key={b.label}>
                <p className="text-[13px] font-semibold text-gray-800">{b.label}</p>
                <p className="mt-0.5 font-mono text-[10px] text-gray-400">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
