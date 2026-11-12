import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { LegalLinks, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/components/legal-links";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — FleetGuard" },
      {
        name: "description",
        content:
          "How FleetGuard encrypts, protects, and manages USDOT carrier data, driver qualification files, CDLs, and DOT medical certificates.",
      },
      { property: "og:title", content: "Privacy Policy — FleetGuard" },
      {
        property: "og:description",
        content:
          "Encryption, row-level isolation, and data retention practices for US trucking compliance records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS = [
  {
    title: "1. Scope & Who We Serve",
    body: [
      "FleetGuard provides FMCSA and US Department of Transportation (DOT) compliance recordkeeping software for motor carriers, owner-operators, safety directors, and third-party safety compliance agencies.",
      "This Privacy Policy explains what compliance, driver qualification, equipment, and account data we collect, how it is protected, and how authorized fleet owners can manage or delete records.",
    ],
  },
  {
    title: "2. Information We Collect",
    body: [
      "Account & Carrier Profile Data: When you register, we collect your name, work email address, password hash (or federated sign-in token), company legal name, DBA name, physical address, and USDOT number. Official USDOT lookups query public US FMCSA SAFER records on your behalf.",
      "Driver Qualification File (DQF) Records (49 CFR Part 391): Driver full names, hire dates, phone numbers, Commercial Driver's License (CDL) expiration dates, DOT Medical Examiner's Certificate expiration dates, Motor Vehicle Records (MVRs), Drug & Alcohol Clearinghouse queries, and uploaded document images or PDFs.",
      "Equipment & Inspection Records (49 CFR Part 396): Unit numbers, Vehicle Identification Numbers (VINs decoded via US NHTSA vPIC), license plates, cab card registrations, annual DOT inspection reports, and insurance certificates.",
      "Security & Session Logs: Minimal session identifiers used strictly to enforce our two-device concurrent login safeguard and prevent unauthorized account sharing.",
    ],
  },
  {
    title: "3. Driver Magic Link Uploads",
    body: [
      "Fleet managers can generate time-bound, cryptographically random Driver Magic Links so drivers can photograph and submit a CDL or DOT medical card from a mobile device without creating a password.",
      "Uploaded files are placed into an isolated private pending-review bucket and never overwrite an approved compliance document until an authorized company owner or agency staff member explicitly reviews and approves the submission.",
    ],
  },
  {
    title: "4. Encryption, Row-Level Isolation & Security",
    body: [
      "All network traffic between your browser and FleetGuard is encrypted in transit using TLS 1.2+.",
      "Uploaded CDL, medical card, and inspection files are stored in private, encrypted cloud object storage accessed exclusively through short-lived signed URLs scoped to your company identifier.",
      "Database tables enforce strict PostgreSQL Row-Level Security (RLS) so each motor carrier or authorized safety agency staff member can access only the companies explicitly assigned to their account.",
      "We enforce a strict two-concurrent-device session limit per login credential to protect sensitive driver PII from unauthorized access.",
    ],
  },
  {
    title: "5. No Data Resale & Limited Third-Party Sharing",
    body: [
      "FleetGuard does not sell, rent, or broker driver qualification files, contact lists, phone numbers, or carrier inspection records to freight brokers, insurance marketers, or advertising networks.",
      "Data is transmitted only to essential infrastructure providers required to store your files securely and query official public US government registries (FMCSA SAFER carrier lookup and NHTSA vPIC VIN decoder) when you initiate a lookup.",
    ],
  },
  {
    title: "6. Retention, Audits & Your Rights",
    body: [
      "Active fleet compliance records remain accessible while your trial or subscription is active, and you can export full CSV audit logs or printable DOT audit reports at any time.",
      "To request data export, correction, or permanent account deletion upon closing a carrier profile (subject to applicable FMCSA statutory retention rules), email erorx72@gmail.com from your registered owner email address.",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Brand />
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft /> Back to Home
              </Link>
            </Button>
            <Button asChild variant="surface" size="sm">
              <Link to="/terms">Terms of Service</Link>
            </Button>
            <Button asChild variant="signal" size="sm">
              <a href={SUPPORT_MAILTO}>
                <Mail /> Contact Support
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Legal & Compliance
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            FleetGuard Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective November 2026 · United States FMCSA & DOT Compliance Platform · Zero data
            brokering
          </p>
        </header>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="surface-card p-6 md:p-7">
              <h2 className="font-display text-xl font-bold text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="surface-card mt-10 flex flex-col justify-between gap-4 border-primary/25 bg-accent/40 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
              <LockKeyhole className="size-4 text-primary" />
              Privacy or Security Questions?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reach our compliance & security desk directly at {SUPPORT_EMAIL}.
            </p>
          </div>
          <Button asChild variant="signal" className="shrink-0">
            <a href={SUPPORT_MAILTO}>
              <Mail /> Contact Support ({SUPPORT_EMAIL})
            </a>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FleetGuard. DOT compliance, simplified.</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
