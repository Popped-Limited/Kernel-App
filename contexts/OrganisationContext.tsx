"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface OrgContext { orgId: string | null; loading: boolean; }
const Ctx = createContext<OrgContext>({ orgId: null, loading: true });

export function OrganisationProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      supabase
        .from("organisation_members")
        .select("organisation_id")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          setOrgId(data?.organisation_id ?? null);
          setLoading(false);
        });
    });
    // Also listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setOrgId(null); setLoading(false); return; }
      supabase
        .from("organisation_members")
        .select("organisation_id")
        .eq("user_id", session.user.id)
        .single()
        .then(({ data }) => {
          setOrgId(data?.organisation_id ?? null);
          setLoading(false);
        });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={{ orgId, loading }}>{children}</Ctx.Provider>;
}

export const useOrganisation = () => useContext(Ctx);
