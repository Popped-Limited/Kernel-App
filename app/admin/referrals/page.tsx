import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = { title: "Beacon Referrals — Kernel" };

interface ReferredOrg {
  id: string;
  name: string;
  created_at: string;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}

export default async function BeaconReferralsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // Only accessible to support@kernelapp.co.uk
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== "support@kernelapp.co.uk") {
    redirect("/home");
  }

  const { data: orgs } = await supabase
    .from("organisations")
    .select("id, name, created_at, subscription_status, current_period_end, stripe_customer_id")
    .eq("referral_source", "beacon")
    .order("created_at", { ascending: false });

  const referred = (orgs ?? []) as ReferredOrg[];

  const statusBadge = (status: string | null) => {
    const map: Record<string, string> = {
      active:    "bg-green-100 text-green-800",
      trialing:  "bg-blue-100 text-blue-800",
      past_due:  "bg-yellow-100 text-yellow-800",
      cancelled: "bg-red-100 text-red-800",
      unpaid:    "bg-red-100 text-red-800",
    };
    return map[status ?? ""] ?? "bg-gray-100 text-gray-600";
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-serif text-brown">Beacon Compliance — Referred Customers</h1>
        <p className="text-sm text-gray-500 mt-1">
          7% commission on subscription fees from month 2 onwards, paid quarterly.
        </p>
      </div>

      {referred.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          No Beacon-referred customers yet.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{referred.length} customer{referred.length !== 1 ? "s" : ""} referred</p>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-brand-light text-brown text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Signed up</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Next renewal</th>
                  <th className="px-4 py-3 font-medium">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referred.map(org => (
                  <tr key={org.id} className="hover:bg-brand-cream/40">
                    <td className="px-4 py-3 font-medium text-brown">{org.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(org.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(org.subscription_status)}`}>
                        {org.subscription_status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {org.current_period_end
                        ? new Date(org.current_period_end).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short", year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {org.stripe_customer_id ? (
                        <a
                          href={`https://dashboard.stripe.com/customers/${org.stripe_customer_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brown underline hover:text-brown-light text-xs"
                        >
                          View in Stripe
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg bg-brand/10 border border-brand/30 px-4 py-3 text-sm text-brown">
            <p className="font-medium mb-1">Quarterly commission calculation</p>
            <p className="text-gray-600">
              Sum the subscription fees collected from <span className="font-medium">active</span> Beacon customers
              during the quarter (excluding their first month). Pay 7% of that total to Beacon Compliance
              within 30 days of quarter end. Each customer&apos;s Stripe link above shows their payment history.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
