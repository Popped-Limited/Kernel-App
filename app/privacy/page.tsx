import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Kernel",
  description: "How Kernel collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <div style={{ background: "#F7F2E8", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{
        padding: "20px 52px",
        borderBottom: "0.5px solid rgba(200,168,75,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontFamily: "var(--font-instrument-serif), Georgia, serif",
          fontSize: "22px",
          color: "#1C1A10",
          textDecoration: "none",
        }}>
          Kernel
        </Link>
        <Link href="/" style={{ fontSize: "13px", color: "#7A7050", textDecoration: "none" }}>
          ← Back to home
        </Link>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "72px 32px 120px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#C89A18", marginBottom: "16px" }}>
          Legal
        </p>
        <h1 style={{
          fontFamily: "var(--font-instrument-serif), Georgia, serif",
          fontSize: "clamp(36px, 5vw, 56px)",
          letterSpacing: "-0.02em",
          color: "#1C1A10",
          lineHeight: 1.05,
          marginBottom: "12px",
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: "14px", color: "#7A7050", marginBottom: "64px" }}>
          Last updated: May 2026
        </p>

        <div style={{ fontSize: "16px", lineHeight: "1.8", color: "#3A3520" }}>

          <p style={{ marginBottom: "32px" }}>
            Kernel is operated by Kernel Ltd ("we", "us", "our"), a company registered in England
            and Wales. We are committed to protecting your personal data and operating in compliance
            with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.
            This policy explains what data we collect, why we collect it, and what rights you have
            over it.
          </p>

          <Section title="1. Who is responsible for your data?">
            <p>
              Kernel Ltd is the data controller for personal data processed through the Kernel
              platform. If you have any questions about how we handle your data, please contact us
              at <a href="mailto:privacy@kernelapp.co.uk" style={{ color: "#C89A18" }}>privacy@kernelapp.co.uk</a>.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <p style={{ marginBottom: "12px" }}>We collect and process the following categories of data:</p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li><strong>Account information:</strong> your name, email address, and business name when you register for an account.</li>
              <li><strong>Compliance records:</strong> checklists, production records, batch logs, audit trails, goods in/out records, and any other food compliance data you enter into the platform.</li>
              <li><strong>Supplier data:</strong> supplier names, contact information, and approval records you add to the system.</li>
              <li><strong>Usage data:</strong> log files, IP addresses, device information, and information about how you interact with the platform, used to maintain security and improve the service.</li>
              <li><strong>Payment information:</strong> billing details processed securely by our payment provider. We do not store payment card details directly.</li>
            </ul>
          </Section>

          <Section title="3. Lawful basis for processing">
            <p style={{ marginBottom: "12px" }}>We process your data on the following lawful bases under UK GDPR:</p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li><strong>Performance of a contract:</strong> processing your account and compliance records is necessary to deliver the Kernel service you have signed up for.</li>
              <li><strong>Legitimate interests:</strong> security monitoring, fraud prevention, and service improvement, where these interests are not overridden by your rights.</li>
              <li><strong>Legal obligation:</strong> where we are required by law to process or retain data.</li>
            </ul>
          </Section>

          <Section title="4. How we use your data">
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>Providing, maintaining, and improving the Kernel platform</li>
              <li>Sending service notifications, including missed check alerts you have configured</li>
              <li>Responding to support requests and account queries</li>
              <li>Billing and subscription management</li>
              <li>Complying with legal and regulatory obligations</li>
            </ul>
          </Section>

          <Section title="5. Data retention">
            <p>
              We retain your account and compliance data for the duration of your active subscription.
              Following cancellation or termination, we retain data for up to 6 years in accordance
              with standard commercial record-keeping requirements under English law. After this period,
              data is permanently deleted. You may request earlier deletion where we have no legal
              obligation to retain the data — see Section 8 for your rights.
            </p>
          </Section>

          <Section title="6. Sub-processors and third parties">
            <p style={{ marginBottom: "12px" }}>
              We use the following third-party sub-processors to operate the Kernel platform. Each
              is bound by appropriate data processing agreements:
            </p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li><strong>Supabase Inc.</strong> — database hosting and user authentication. Data is stored within the EU.</li>
              <li><strong>Vercel Inc.</strong> — platform hosting and content delivery. Data is processed in the EU/UK.</li>
            </ul>
            <p style={{ marginTop: "16px" }}>
              We do not sell your data to third parties or use it for advertising purposes.
            </p>
          </Section>

          <Section title="7. International data transfers">
            <p>
              Your data is stored and processed within the EU and UK by our sub-processors. Where
              any transfer outside the UK or EEA is required, we ensure appropriate safeguards are
              in place in accordance with UK GDPR requirements.
            </p>
          </Section>

          <Section title="8. Your rights under UK GDPR">
            <p style={{ marginBottom: "12px" }}>You have the following rights in relation to your personal data:</p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li><strong>Right of access:</strong> to request a copy of the personal data we hold about you.</li>
              <li><strong>Right to rectification:</strong> to request correction of inaccurate or incomplete data.</li>
              <li><strong>Right to erasure:</strong> to request deletion of your data where we have no legal obligation to retain it.</li>
              <li><strong>Right to restriction:</strong> to request that we limit how we use your data in certain circumstances.</li>
              <li><strong>Right to data portability:</strong> to receive your data in a structured, machine-readable format.</li>
              <li><strong>Right to object:</strong> to object to processing based on legitimate interests.</li>
            </ul>
            <p style={{ marginTop: "16px" }}>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@kernelapp.co.uk" style={{ color: "#C89A18" }}>privacy@kernelapp.co.uk</a>.
              We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. Complaints">
            <p>
              If you are unhappy with how we handle your data, you have the right to lodge a complaint
              with the UK Information Commissioner's Office (ICO) at{" "}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: "#C89A18" }}>ico.org.uk</a>.
              We would, however, appreciate the opportunity to address any concerns directly first.
            </p>
          </Section>

          <Section title="10. Cookies">
            <p>
              Kernel uses strictly necessary cookies for authentication and session management only.
              These cookies are essential for the platform to function and cannot be disabled. We do
              not use advertising, tracking, or analytics cookies.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. Where changes are material, we
              will notify you by email. The date at the top of this page reflects when the policy
              was last updated.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For any questions about this Privacy Policy or how we handle your data, please contact:
            </p>
            <div style={{
              background: "#EDE5D0",
              borderRadius: "12px",
              padding: "24px",
              marginTop: "16px",
              fontSize: "15px",
            }}>
              <p style={{ marginBottom: "4px" }}><strong>Kernel Ltd</strong></p>
              <p style={{ marginBottom: "4px", color: "#7A7050" }}>
                <a href="mailto:privacy@kernelapp.co.uk" style={{ color: "#C89A18" }}>privacy@kernelapp.co.uk</a>
              </p>
              <p style={{ color: "#7A7050" }}>kernelapp.co.uk</p>
            </div>
          </Section>

        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "0.5px solid rgba(200,168,75,0.2)",
        padding: "32px 52px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "13px",
        color: "#7A7050",
      }}>
        <span>© 2026 Kernel</span>
        <div style={{ display: "flex", gap: "24px" }}>
          <Link href="/privacy" style={{ color: "#7A7050", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "#7A7050", textDecoration: "none" }}>Terms</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "44px" }}>
      <h2 style={{
        fontFamily: "var(--font-instrument-serif), Georgia, serif",
        fontSize: "22px",
        letterSpacing: "-0.01em",
        color: "#1C1A10",
        marginBottom: "16px",
        paddingBottom: "12px",
        borderBottom: "0.5px solid rgba(200,168,75,0.3)",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
