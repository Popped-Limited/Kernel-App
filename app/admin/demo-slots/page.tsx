import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DemoSlotsManager from "@/components/DemoSlotsManager";

export const metadata = { title: "Demo availability — Kernel" };

export default async function DemoSlotsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // Only accessible to support@kernelapp.co.uk
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== "support@kernelapp.co.uk") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-serif text-brown">Demo availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open the times you&apos;re free for demos. Customers pick one from the &ldquo;Book a demo&rdquo; button;
          you&apos;ll get an email with a calendar invite when they do.
        </p>
      </div>
      <DemoSlotsManager />
    </div>
  );
}
