import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Scale } from "lucide-react";
import { Brand } from "@/components/brand";
import { LegalLinks, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/components/legal-links";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — FleetGuard" },
      {
        name: "description",
        content:
          "Flat month-to-month subscription terms, 72-hour free trial, plan limits, and US FMCSA compliance responsibilities for FleetGuard.",
      },
      { property: "og:title", content: "Terms of Service — FleetGuard" },
      {
        property: "og:description",
        content:
          "All-inclusive flat pricing, 3-day free trial rules, and carrier compliance terms for FleetGuard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

const TERMS_SECTIONS = [
  {
    title: "1. Agreement to Terms",
    body: [
      "By creating an account or accessing FleetGuard, you agree to be bound by these Terms of Service on behalf of your motor carrier, fleet operation, or third-party safety compliance agency.",
    ],
  },
  {
    title: "2. 72-Hour Free Trial & All-Inclusive Flat Pricing",
    body: [
      "Every new FleetGuard account receives a full 72-hour (3-day) free trial starting from your registration timestamp. After 72 hours, dashboard access locks automatically until a flat 30-day subscription is activated.",
      "All-Inclusive Standard Rate — 100% Flat Pricing. No Per-Driver Fees. Zero Hidden Charges:",
      "• STARTER PLAN ($99/month flat): Small Fleet Owners (1–10 trucks), 1 DOT Company, Single Owner Login only, Unlimited Drivers, Driver Magic Links, and 1-Click DOT Audit.",
      "• PLATINUM DIRECTORS PLAN ($299/month flat): Medium Fleets (11–30 trucks), 1 DOT Company, Owner + Internal Safety Manager Logins locked to the same 1 DOT company, Unlimited Drivers, Priority Alerts, and Fleet Safety Score.",
      "• DIAMOND AGENCY PLAN ($1,499/month flat): 3rd-Party Compliance & Safety Agencies, Unlimited Trucks, Multi-Company Master Dropdown (up to 50 distinct DOT Companies), Multiple Agency Staff Logins, and White-Label Audit Reports.",
      "Billing is strictly month-to-month with no auto-renewing lock-in contracts or surprise per-driver surcharges. Plan activations are arranged directly by contacting erorx72@gmail.com.",
    ],
  },
  {
    title: "3. Tier Integrity, Anti-Agency & Anti-Tampering Rules",
    body: [
      "Unique USDOT Registration: Each USDOT number may be registered once across FleetGuard to prevent duplicate squatting.",
      "Single-Company DOT Lock (Starter & Platinum): Once a carrier USDOT number is registered under Starter or Platinum, the company record cannot be swapped or deleted to cycle multiple client carriers without an active Diamond Agency Plan.",
      "Monthly Truck Quota & Immutable VIN Lock: Vehicle Identification Numbers (VINs) are immutable once saved to preserve audit integrity, and monthly truck creation quotas cannot be reset by deleting trucks mid-cycle.",
      "Concurrent Session Safeguard: Each login credential permits at most two (2) concurrent active devices. Signing in on a third device automatically terminates the oldest session.",
    ],
  },
  {
    title: "4. FMCSA & DOT Compliance Disclaimer",
    body: [
      "FleetGuard provides compliance tracking, automated expiration alerts, driver upload workflows, and printable DOT audit summaries to assist your safety program.",
      "Your motor carrier, designated safety director, and drivers remain solely responsible for verifying the authenticity, legibility, and legal validity of uploaded CDLs, DOT medical examiner certificates, annual inspections, MVRs, and insurance policies under 49 CFR regulations.",
      "FleetGuard is not a law firm or government agency and does not guarantee roadside inspection passage or FMCSA safety rating outcomes.",
    ],
  },
  {
    title: "5. Acceptable Use & Account Termination",
    body: [
      "You agree not to bypass tier constraints, tamper with subscription timestamps, share login credentials across unrelated organizations, or upload malicious files.",
      "We reserve the right to suspend accounts that attempt unauthorized API manipulation, fraudulent USDOT registration, or abuse of public driver upload links.",
    ],
  },
  {
    title: "6. Limitation of Liability & Support",
    body: [
      "To the maximum extent permitted by applicable US law, FleetGuard's total aggregate liability for any claim arising out of or relating to the service is limited to the subscription fees paid by you in the thirty (30) days preceding the claim.",
      "For billing activation, cancellation, or legal inquiries, contact support anytime at erorx72@gmail.com.",
    ],
  },
];

function TermsPage() {
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
              <Link to="/privacy">Privacy Policy</Link>
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
            Legal & Billing Terms
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            FleetGuard Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective November 2026 · Flat Month-to-Month Subscription · Governed by United States
            Law
          </p>
        </header>

        <div className="mt-10 space-y-8">
          {TERMS_SECTIONS.map((section) => (
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
              <Scale className="size-4 text-primary" />
              Need Billing Activation or Legal Help?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Email our team directly at {SUPPORT_EMAIL} for fast human support.
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
