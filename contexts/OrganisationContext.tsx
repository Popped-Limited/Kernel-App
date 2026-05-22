"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface OrgContext {
  orgId: string | null;
  role: "admin" | "manager" | "staff" | null;
  loading: boolean;
}
const Ctx = createContext<OrgContext>({ orgId: null, role: null, loading: true });

export function OrganisationProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole]   = useState<"admin" | "manager" | "staff" | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchOrg(userId: string) {
    const { data } = await supabase
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", userId)
      .single();
    setOrgId(data?.organisation_id ?? null);
    setRole((data?.role as "admin" | "manager" | "staff") ?? null);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      fetchOrg(user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setOrgId(null); setRole(null); setLoading(false); return; }
      fetchOrg(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={{ orgId, role, loading }}>{children}</Ctx.Provider>;
}

export const useOrganisation = () => useContext(Ctx);
