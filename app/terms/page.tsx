import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Kernel",
  description: "The terms governing your use of the Kernel platform.",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: "14px", color: "#7A7050", marginBottom: "64px" }}>
          Last updated: May 2026
        </p>

        <div style={{ fontSize: "16px", lineHeight: "1.8", color: "#3A3520" }}>

          <p style={{ marginBottom: "32px" }}>
            These Terms of Service ("Terms") govern your access to and use of the Kernel platform
            ("the Service"), operated by Kernel ("we", "us", "our"). By creating an account or
            using the Service, you agree to be bound by these Terms. Please read them carefully.
          </p>

          <Section title="1. The Service">
            <p>
              Kernel provides cloud-based food compliance management software, including QR code
              checklists, digital audit trails, production records, batch tracking, inventory
              management, traceability tools, goods in/out logging, and related features. We
              reserve the right to update, improve, or modify the Service at any time, and will
              communicate any material changes to you.
            </p>
          </Section>

          <Section title="2. Your account">
            <p style={{ marginBottom: "12px" }}>
              To use the Service, you must register for an account. You agree to:
            </p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>Provide accurate, current, and complete information at registration</li>
              <li>Keep your account credentials secure and confidential</li>
              <li>Notify us immediately of any unauthorised access to your account</li>
              <li>Take responsibility for all activity that occurs under your account</li>
            </ul>
          </Section>

          <Section title="3. Acceptable use">
            <p style={{ marginBottom: "12px" }}>You agree not to use the Service to:</p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>Violate any applicable laws or regulations</li>
              <li>Upload, transmit, or store any content that is unlawful, harmful, or fraudulent</li>
              <li>Attempt to gain unauthorised access to any part of the Service or another user's data</li>
              <li>Reverse engineer, decompile, or copy any part of the platform</li>
              <li>Introduce malicious code, viruses, or any software intended to disrupt the Service</li>
              <li>Resell or redistribute the Service without our express written consent</li>
            </ul>
          </Section>

          <Section title="4. Free trial">
            <p style={{ marginBottom: "12px" }}>
              New accounts are eligible for a <strong>7-day free trial</strong> of the full Kernel
              platform. The trial is subject to the following conditions:
            </p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>No payment card is required to start a trial.</li>
              <li>The trial provides full access to all features from day one.</li>
              <li>Free trials are available to new customers only — one trial per business.</li>
              <li>At the end of the 7-day period, you will be asked to provide payment details to continue. If you choose not to subscribe, your account will be deactivated and your data retained for 30 days before deletion.</li>
              <li>We reserve the right to modify or withdraw the free trial offer at any time for new sign-ups.</li>
            </ul>
          </Section>

          <Section title="5. Payment and cancellation">
            <p style={{ marginBottom: "12px" }}>
              The Service is offered at <strong>£99 per month</strong> (plus VAT where applicable),
              billed monthly in advance.
            </p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>Payment is collected at the start of each billing period via your chosen payment method.</li>
              <li>You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period — you will retain full access until then.</li>
              <li>We do not offer refunds for partial months.</li>
              <li>If a payment fails, we will notify you and provide a reasonable period to update your payment details before suspending access.</li>
              <li>We reserve the right to adjust pricing with 30 days' written notice.</li>
            </ul>
          </Section>

          <Section title="6. Your data">
            <p>
              You retain full ownership of all compliance records, production data, supplier
              information, and any other business data you enter into Kernel. We process this data
              solely to provide the Service and do not claim any rights over it.
            </p>
            <p style={{ marginTop: "16px" }}>
              On cancellation, you may export your data at any time during your active subscription.
              Following termination, we will retain your data for 30 days before permanent deletion,
              in accordance with our Privacy Policy. We are not liable for data loss after this period.
            </p>
          </Section>

          <Section title="7. Intellectual property">
            <p>
              The Kernel platform — including its design, code, features, and content — is owned by
              Kernel and protected by intellectual property law. These Terms grant you a limited,
              non-exclusive, non-transferable licence to use the Service for your internal business
              purposes only. No other rights are granted.
            </p>
          </Section>

          <Section title="8. Service availability">
            <p>
              We aim to maintain high availability and reliability of the Service, but we do not
              guarantee uninterrupted or error-free operation. We will provide reasonable advance
              notice of planned maintenance where possible. We are not liable for losses arising
              from temporary unavailability beyond our reasonable control.
            </p>
          </Section>

          <Section title="9. Limitation of liability">
            <p style={{ marginBottom: "12px" }}>
              To the maximum extent permitted by applicable law:
            </p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>Our total liability to you for any claim arising under these Terms is limited to the total fees paid in the 12 months preceding the claim.</li>
              <li>We are not liable for any indirect, consequential, incidental, or special losses, including loss of profit, revenue, or data.</li>
              <li>Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.</li>
            </ul>
          </Section>

          <Section title="10. Indemnity">
            <p>
              You agree to indemnify and hold harmless Kernel and its personnel from any claims,
              losses, or damages (including reasonable legal costs) arising from your use of the
              Service in breach of these Terms, or from any content you submit to the platform.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              Either party may terminate the agreement at any time. You may do so by cancelling
              your subscription. We reserve the right to suspend or terminate your account
              immediately — without notice — if we reasonably believe you have breached these Terms,
              or if continued access poses a security risk. On termination, your right to use the
              Service ceases immediately, subject to any rights to access data during the retention
              period described in Section 6.
            </p>
          </Section>

          <Section title="12. Changes to these Terms">
            <p>
              We may update these Terms from time to time. Where changes are material, we will
              notify you by email at least 14 days before they take effect. Continued use of the
              Service after that date constitutes acceptance of the updated Terms. If you do not
              agree to the changes, you may cancel your subscription before they take effect.
            </p>
          </Section>

          <Section title="13. Governing law and disputes">
            <p>
              These Terms are governed by the laws of England and Wales. Any disputes arising under
              or in connection with these Terms shall be subject to the exclusive jurisdiction of
              the courts of England and Wales.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              For any questions about these Terms, please contact:
            </p>
            <div style={{
              background: "#EDE5D0",
              borderRadius: "12px",
              padding: "24px",
              marginTop: "16px",
              fontSize: "15px",
            }}>
              <p style={{ marginBottom: "4px" }}><strong>Kernel</strong></p>
              <p style={{ marginBottom: "4px", color: "#7A7050" }}>
                <a href="mailto:support@kernelapp.co.uk" style={{ color: "#C89A18" }}>support@kernelapp.co.uk</a>
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
