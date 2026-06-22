"use client";

import { OrganisationProvider } from "@/contexts/OrganisationContext";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <OrganisationProvider>{children}</OrganisationProvider>;
}
