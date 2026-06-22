"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { useGuidedTour } from "@/lib/useGuidedTour";

interface TeamMember {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  food_safety_cert_path: string | null;
  food_safety_cert_expiry: string | null;
  active: boolean;
  created_at: string;
}

function emptyMember(): Omit<TeamMember, "id" | "created_at"> {
  return {
    name: "", position: null, email: null, phone: null, address: null,
    next_of_kin_name: null, next_of_kin_phone: null,
    food_safety_cert_path: null, food_safety_cert_expiry: null, active: true,
  };
}

function certStatus(member: TeamMember): { label: string; cls: string } {
  if (!member.food_safety_cert_expiry) return { label: "No cert uploaded", cls: "bg-gray-100 text-gray-500" };
  const expiry = new Date(member.food_safety_cert_expiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: "Expired", cls: "bg-red-100 text-red-700" };
  if (diffDays <= 60) return { label: `Expires in ${diffDays}d`, cls: "bg-amber-100 text-amber-700" };
  return {
    label: `Valid to ${expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    cls: "bg-brand/30 text-brown",
  };
}

export default function StaffPage() {
  const { orgId } = useOrganisation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);


  async function load() {
    const { data } = await supabase.from("team_members").select("*").order("name");
    setMembers((data ?? []) as TeamMember[]);
    setLoading(false);
  }

  useEffect(() => { if (orgId) load(); }, [orgId]);

  useGuidedTour({
    tourKey: "staff",
    ready: !loading,
    orgId,
    openPanel: openAdd,
    steps: [
      {
        element: '[data-tour="add-staff"]',
        popover: {
          title: "Add your team",
          description:
            "Keep a record of everyone who works in your kitchen here. Click Next and I'll open the form.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tour="staff-name"]',
        popover: {
          title: "Name & role",
          description: "Enter the person's name and their job title.",
          side: "right",
        },
      },
      {
        element: '[data-tour="staff-cert"]',
        popover: {
          title: "Training certificates",
          description:
            "Upload their food-safety certificate and set its expiry — Kernel warns you before it lapses.",
          side: "left",
        },
      },
      {
        element: '[data-tour="staff-save"]',
        popover: {
          title: "Save the member",
          description:
            "Hit Save. Tip: to give someone a login to Kernel, head to Account → Users.",
          side: "top",
        },
      },
    ],
  });

  function openAdd() {
    setEditing(emptyMember() as TeamMember);
    setIsNew(true);
    setError("");
  }

  function openEdit(m: TeamMember) {
    setEditing({ ...m });
    setIsNew(false);
    setError("");
  }

  function close() { setEditing(null); }

  async function save() {
    if (!editing || !editing.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");

    const payload = {
      name: editing.name.trim(),
      position: editing.position?.trim() || null,
      email: editing.email?.trim() || null,
      phone: editing.phone?.trim() || null,
      address: editing.address?.trim() || null,
      next_of_kin_name: editing.next_of_kin_name?.trim() || null,
      next_of_kin_phone: editing.next_of_kin_phone?.trim() || null,
      food_safety_cert_path: editing.food_safety_cert_path,
      food_safety_cert_expiry: editing.food_safety_cert_expiry || null,
      active: editing.active,
      organisation_id: orgId,
    };

    if (isNew) {
      const { error: e } = await supabase.from("team_members").insert(payload);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("team_members").update(payload).eq("id", editing.id);
      if (e) { setError(e.message); setSaving(false); return; }
    }

    await load();
    setSaving(false);
    close();
  }

  async function toggleActive(m: TeamMember) {
    await supabase.from("team_members").update({ active: !m.active }).eq("id", m.id);
    load();
  }

  async function uploadCert(file: File) {
    if (!editing) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `certs/${editing.id || crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("team-documents").upload(path, file, { upsert: true });
    if (upErr) { setError("Upload failed: " + upErr.message); setUploading(false); return; }
    setEditing(e => e ? { ...e, food_safety_cert_path: path } : e);
    setUploading(false);
  }

  async function viewCert(path: string) {
    const { data } = await supabase.storage.from("team-documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const active = members.filter(m => m.active);
  const inactive = members.filter(m => !m.active);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 max-w-5xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">{active.length} active member{active.length !== 1 ? "s" : ""}</p>
        </div>
        <button data-tour="add-staff" onClick={openAdd} className="btn-primary">+ Add Staff Member</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">No staff members yet. Add your first one above.</div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          <div className="space-y-2">
            {active.map(m => <MemberCard key={m.id} member={m} onEdit={openEdit} onToggle={toggleActive} onViewCert={viewCert} />)}
          </div>

          {/* Inactive */}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">Inactive</p>
              <div className="space-y-2 opacity-60">
                {inactive.map(m => <MemberCard key={m.id} member={m} onEdit={openEdit} onToggle={toggleActive} onViewCert={viewCert} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit / Add panel */}
      {editing && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative ml-auto w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{isNew ? "Add Staff Member" : "Edit Staff Member"}</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              {/* Personal */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Personal Details</p>
                <div className="space-y-3">
                  <div>
                    <label className="label">Full name *</label>
                    <input data-tour="staff-name" className="input" value={editing.name} onChange={e => setEditing(v => v ? { ...v, name: e.target.value } : v)} placeholder="e.g. Jane Smith" />
                  </div>
                  <div>
                    <label className="label">Position / Job title</label>
                    <input className="input" value={editing.position ?? ""} onChange={e => setEditing(v => v ? { ...v, position: e.target.value } : v)} placeholder="e.g. Production Assistant" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={editing.email ?? ""} onChange={e => setEditing(v => v ? { ...v, email: e.target.value } : v)} placeholder="jane@example.com" />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input className="input" type="tel" value={editing.phone ?? ""} onChange={e => setEditing(v => v ? { ...v, phone: e.target.value } : v)} placeholder="07700 900000" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Address</label>
                    <textarea className="input resize-none" rows={2} value={editing.address ?? ""} onChange={e => setEditing(v => v ? { ...v, address: e.target.value } : v)} placeholder="123 Street, City, Postcode" />
                  </div>
                </div>
              </section>

              {/* Next of kin */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Next of Kin</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name</label>
                    <input className="input" value={editing.next_of_kin_name ?? ""} onChange={e => setEditing(v => v ? { ...v, next_of_kin_name: e.target.value } : v)} placeholder="e.g. John Smith" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" type="tel" value={editing.next_of_kin_phone ?? ""} onChange={e => setEditing(v => v ? { ...v, next_of_kin_phone: e.target.value } : v)} placeholder="07700 900000" />
                  </div>
                </div>
              </section>

              {/* Training cert */}
              <section data-tour="staff-cert">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Training Certificates</p>
                <div className="space-y-3">
                  {editing.food_safety_cert_path ? (
                    <div className="flex items-center gap-3 rounded-lg bg-brand/10 border border-brand/30 px-4 py-3">
                      <svg className="h-5 w-5 text-brown shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                      <span className="flex-1 text-sm text-brown font-medium truncate">Certificate uploaded</span>
                      <button
                        type="button"
                        onClick={() => setEditing(v => v ? { ...v, food_safety_cert_path: null } : v)}
                        className="text-xs text-gray-400 hover:text-red-600 transition"
                      >Remove</button>
                    </div>
                  ) : (
                    <div>
                      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadCert(f); }} />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="btn-ghost w-full text-sm"
                      >
                        {uploading ? "Uploading…" : "Upload certificate (PDF or image)"}
                      </button>
                    </div>
                  )}
                  <div>
                    <label className="label">Expiry date</label>
                    <input className="input" type="date" value={editing.food_safety_cert_expiry ?? ""}
                      onChange={e => setEditing(v => v ? { ...v, food_safety_cert_expiry: e.target.value } : v)} />
                  </div>
                </div>
              </section>

              {/* Active toggle */}
              {!isNew && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-gray-700 font-medium">Active</span>
                  <button
                    type="button"
                    onClick={() => setEditing(v => v ? { ...v, active: !v.active } : v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editing.active ? "bg-brand-dark" : "bg-gray-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editing.active ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={close} className="btn-ghost">Cancel</button>
              <button data-tour="staff-save" onClick={save} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : isNew ? "Add Member" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MemberCard({ member, onEdit, onToggle, onViewCert }: {
  member: TeamMember;
  onEdit: (m: TeamMember) => void;
  onToggle: (m: TeamMember) => void;
  onViewCert: (path: string) => void;
}) {
  const cert = certStatus(member);
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      {/* Avatar */}
      <div className="h-10 w-10 rounded-full bg-brand/30 flex items-center justify-center shrink-0">
        <span className="text-brown font-semibold text-sm">{member.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{member.name}</p>
        <p className="text-xs text-gray-500">{member.position ?? "—"}{member.email ? ` · ${member.email}` : ""}</p>
      </div>

      {/* Cert badge */}
      <span className={`hidden sm:inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cert.cls}`}>{cert.label}</span>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {member.food_safety_cert_path && (
          <button onClick={() => onViewCert(member.food_safety_cert_path!)} className="btn-ghost text-xs py-1 px-2">View cert</button>
        )}
        <button onClick={() => onEdit(member)} className="btn-ghost text-xs py-1 px-2">Edit</button>
        <button
          onClick={() => onToggle(member)}
          className={`text-xs px-2 py-1 rounded border transition ${member.active ? "border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500" : "border-brand/30 text-brown hover:bg-brand/10"}`}
        >
          {member.active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}
