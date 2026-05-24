"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface OrgContext {
  orgId: string | null;
  orgName: string | null;
  role: "admin" | "manager" | "staff" | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  loading: boolean;
}
const Ctx = createContext<OrgContext>({
  orgId: null, orgName: null, role: null,
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
    const { data } = await supabase
      .from("organisation_members")
      .select(`
        organisation_id, role,
        organisations ( name, subscription_status, trial_ends_at, stripe_customer_id )
      `)
      .eq("user_id", userId)
      .single();

    const org = (data as any)?.organisations;
    setOrgId(data?.organisation_id ?? null);
    setRole((data?.role as "admin" | "manager" | "staff") ?? null);
    setOrgName(org?.name ?? null);
    setSubscriptionStatus(org?.subscription_status ?? null);
    setTrialEndsAt(org?.trial_ends_at ?? null);
    setStripeCustomerId(org?.stripe_customer_id ?? null);
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
    <Ctx.Provider value={{ orgId, orgName, role, subscriptionStatus, trialEndsAt, stripeCustomerId, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useOrganisation = () => useContext(Ctx);
