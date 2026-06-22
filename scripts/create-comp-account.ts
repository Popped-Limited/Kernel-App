/**
 * Create a complimentary (no-Stripe) account.
 *
 * Mirrors the inserts in app/api/signup/route.ts (auth user → organisation →
 * member → SALSA baseline seed) but skips the Stripe checkout step entirely
 * and stamps subscription_status='comp' so the org is never gated and never
 * billed. The SubscriptionGate only blocks 'cancelled'/'unpaid', so 'comp'
 * grants full, permanent access.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/create-comp-account.ts \
 *     --email=katie@beacon-compliance.co.uk \
 *     --name="Katie Young" \
 *     --org="Beacon Compliance" \
 *     --password=Beacon123
 *
 * Safe to re-run: bails out if a user with that email already exists.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { seedSalsaBaseline } from "@/lib/seed/salsa-baseline";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const email    = arg("email")?.trim().toLowerCase();
  const name     = arg("name")?.trim();
  const orgName  = arg("org")?.trim();
  const password = arg("password");

  if (!email || !name || !orgName || !password) {
    console.error("Missing args. Required: --email --name --org --password");
    console.error('Example: npx tsx --env-file=.env.local scripts/create-comp-account.ts \\');
    console.error('  --email=a@b.com --name="Jane Doe" --org="Acme Ltd" --password=Secret123');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  // Guard: don't create a duplicate if this email already exists.
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const existing = list?.users.find(u => u.email?.toLowerCase() === email);
  if (existing) {
    console.error(`✗ A user with ${email} already exists (id ${existing.id}). Aborting.`);
    process.exit(1);
  }

  // 1. Auth user (auto-confirmed, no email verification).
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name: name },
    email_confirm: true,
  });
  if (userError || !userData.user) {
    throw new Error(`Failed to create auth user: ${userError?.message}`);
  }
  const userId = userData.user.id;
  console.log(`✓ Auth user created: ${userId}`);

  // 2. Organisation — comp status, no Stripe.
  const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = `${baseSlug}-${Date.now()}`;
  const { data: org, error: orgError } = await supabaseAdmin
    .from("organisations")
    .insert({
      name:                orgName,
      slug,
      plan:                "unpopped",
      referral_source:     null,
      subscription_status: "comp",         // complimentary — bypasses the gate, never billed
    })
    .select("id")
    .single();
  if (orgError || !org) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(`Failed to create organisation: ${orgError?.message}`);
  }
  console.log(`✓ Organisation created: ${org.id} (subscription_status=comp)`);

  // 3. Link as admin.
  const { error: memberError } = await supabaseAdmin
    .from("organisation_members")
    .insert({ organisation_id: org.id, user_id: userId, role: "admin" });
  if (memberError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    await supabaseAdmin.from("organisations").delete().eq("id", org.id);
    throw new Error(`Failed to link member: ${memberError.message}`);
  }
  console.log(`✓ Member linked as admin`);

  // 4. Seed SALSA baseline (best-effort, same as signup).
  try {
    const seeded = await seedSalsaBaseline(org.id);
    console.log(`✓ Seeded SALSA baseline: ${seeded.checklists} checklists, ${seeded.questions} questions, ${seeded.trainingItems} training items`);
    if (seeded.errors.length) console.error("  (with errors):", seeded.errors);
  } catch (seedErr) {
    console.error("SALSA baseline seeding threw (account still created):", seedErr);
  }

  console.log("\n✅ Done.");
  console.log(`   Login: ${email}`);
  console.log(`   Password: ${password}  (ask them to change it on first login)`);
  console.log(`   Org: ${orgName} (${org.id}) — complimentary, no Stripe.`);
}

main().catch(err => { console.error(err); process.exit(1); });
