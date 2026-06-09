"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface OrgContext {
  orgId: string | null;
  orgName: string | null;
  setOrgName: (name: string) => void;
  role: "admin" | "manager" | "staff" | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  loading: boolean;
}
const Ctx = createContext<OrgContext>({
  orgId: null, orgName: null, setOrgName: () => {}, role: null,
  subscriptionStatus: null, trialEndsAt: null, stripeCustomerId: null,
  loading: true,
});

export function OrganisationProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId]                         = useState<string | null>(null);
  const [orgName, setOrgName]                     = useState<string | null>(null);
  const [role, setRole]                           = useState<"admin" | "manager" | "staff" | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt]             = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId]   = useState<string | null>(null);
  const [loading, setLoading]                     = useState(true);

  async function fetchOrg(userId: string) {
    // Fetch membership first — this always works with existing RLS
    const { data: memberData } = await supabase
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", userId)
      .single();

    setOrgId(memberData?.organisation_id ?? null);
    setRole((memberData?.role as "admin" | "manager" | "staff") ?? null);

    // Fetch org details separately — belt-and-braces in case RLS blocks the join
    if (memberData?.organisation_id) {
      const { data: orgData } = await supabase
        .from("organisations")
        .select("name, subscription_status, trial_ends_at, stripe_customer_id")
        .eq("id", memberData.organisation_id)
        .single();

      setOrgName(orgData?.name ?? null);
      setSubscriptionStatus(orgData?.subscription_status ?? null);
      setTrialEndsAt(orgData?.trial_ends_at ?? null);
      setStripeCustomerId(orgData?.stripe_customer_id ?? null);
    }

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

  return (
    <Ctx.Provider value={{ orgId, orgName, setOrgName, role, subscriptionStatus, trialEndsAt, stripeCustomerId, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useOrganisation = () => useContext(Ctx);
