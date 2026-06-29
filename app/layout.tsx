import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kernelapp.co.uk"),
  title: "Kernel — Food production & compliance for small food businesses",
  description:
    "Food production records, food safety compliance, traceability, SOPs and training — " +
    "built for small food makers. Kernel keeps you audit-ready in one place.",
  openGraph: {
    type: "website",
    siteName: "Kernel",
    url: "https://kernelapp.co.uk",
    title: "Kernel — Food production & compliance for small food businesses",
    description:
      "Food production records, food safety compliance, traceability, SOPs and training — built for small food makers.",
    images: [{ url: "/logo.png", width: 1080, height: 1080, alt: "Kernel" }],
  },
  twitter: {
    card: "summary",
    title: "Kernel — Food production & compliance for small food businesses",
    description:
      "Food production records, food safety compliance, traceability, SOPs and training — built for small food makers.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} ${inter.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
