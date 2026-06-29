import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Kernel — Food safety & production records for small food businesses",
  description:
    "Kernel is compliance software for small food makers: HACCP & food safety records, " +
    "production logs, traceability, SOPs, staff training and stock — all in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Kernel — Food safety & production records for small food businesses",
    description:
      "Compliance, production records and traceability for small food businesses, in one place.",
    url: "/",
  },
};

export default function Page() {
  return <HomeClient />;
}
