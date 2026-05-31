"use client";

import { useEffect, useState } from "react";
import { useOrganisation } from "@/contexts/OrganisationContext";

interface Member {
  user_id:   string;
  role:      string;
  joined_at: string;
  email:     string;
  full_name: string | null;
  is_me:     boolean;
}

interface Invite {
  id:         string;
  email:      string;
  role:       string;
  expires_at: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin:   "Admin",
  manager: "Manager",
  staff:   "Staff",
};

const ROLE_BADGE: Record<string, string> = {
  admin:   "bg-brand/40 text-brown",
  manager: "bg-blue-100 text-blue-700",
  staff:   "bg-gray-100 text-gray-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function UsersPage() {
  const { role: myRole } = useOrganisation();
  const [members, setMembers]   = useState<Member[]>([]);
  const [invites, setInvites]   = useState<Invite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("staff");
  const [inviting, setInviting]           = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError]     = useState("");
  const [removing, setRemoving]           = useState<string | null>(null);
  const [changingRole, setChangingRole]   = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/org-members");
    const data = await res.json();
    if (data.error) { setError(data.error); } else {
      setMembers(data.members ?? []);
      setInvites(data.invites ?? []);
    }
    setLoading(false);
  }

  async function changeRole(userId: string, newRole: string) {
    setChangingRole(userId);
    const res = await fetch("/api/change-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Failed to change role"); }
    else { load(); }
    setChangingRole(null);
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from your organisation? They will lose access immediately.`)) return;
    setRemoving(userId);
    const res = await fetch("/api/remove-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Failed to remove member"); }
    else { load(); }
    setRemoving(null);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");

    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json();

    if (!res.ok) {
      setInviteError(data.error ?? "Failed to send invite");
    } else {
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      load();
    }
    setInviting(false);
  }

  if (loading) {
    return (
      <main className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-24 bg-brown/10 rounded" />
          <div className="h-32 bg-brown/10 rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-serif text-brown mb-1">Users</h1>
      <p className="text-sm text-brown/60 mb-8">Manage who has access to your Kernel account</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Current members */}
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-brown/10">
          <h2 className="text-sm font-semibold text-brown">Team members ({members.length})</h2>
        </div>
        <ul className="divide-y divide-brown/10">
          {members.map(m => (
            <li key={m.user_id} className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brown truncate">
                  {m.full_name ?? m.email}
                  {m.is_me && <span className="ml-2 text-xs text-brown/40">(you)</span>}
                </p>
                {m.full_name && (
                  <p className="text-xs text-brown/50 truncate">{m.email}</p>
                )}
                <p className="text-xs text-brown/40 mt-0.5">Joined {formatDate(m.joined_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {myRole === "admin" && !m.is_me ? (
                  <select
                    value={m.role}
                    disabled={changingRole === m.user_id}
                    onChange={e => changeRole(m.user_id, e.target.value)}
                    className={`text-xs font-medium rounded-full px-2.5 py-0.5 border-0 cursor-pointer focus:ring-2 focus:ring-brand/40 focus:outline-none ${ROLE_BADGE[m.role] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                ) : (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[m.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                )}
                {myRole === "admin" && !m.is_me && (
                  <button
                    onClick={() => removeMember(m.user_id, m.full_name ?? m.email)}
                    disabled={removing === m.user_id}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
                  >
                    {removing === m.user_id ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card mb-6">
          <div className="px-6 py-4 border-b border-brown/10">
            <h2 className="text-sm font-semibold text-brown">Pending invites</h2>
          </div>
          <ul className="divide-y divide-brown/10">
            {invites.map(inv => (
              <li key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-brown">{inv.email}</p>
                  <p className="text-xs text-brown/40">
                    Expires {formatDate(inv.expires_at)}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[inv.role] ?? "bg-gray-100 text-gray-600"}`}>
                  {ROLE_LABELS[inv.role] ?? inv.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite form — admin only */}
      {myRole === "admin" && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-brown mb-4">Invite someone</h2>
          <form onSubmit={sendInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="input"
                placeholder="colleague@yourbusiness.com"
                required
                disabled={inviting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="input"
                disabled={inviting}
              >
                <option value="admin">Admin — full access, can invite users</option>
                <option value="manager">Manager — can manage checklists and stock</option>
                <option value="staff">Staff — read-only, can complete checklists</option>
              </select>
            </div>

            {inviteError   && <p className="text-sm text-red-600">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-green-700">{inviteSuccess}</p>}

            <button type="submit" disabled={inviting || !inviteEmail.trim()} className="btn-primary px-5 py-2">
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </form>
          <p className="mt-3 text-xs text-brown/40">
            They&apos;ll receive an email with a link to join your Kernel account.
          </p>
        </div>
      )}
    </main>
  );
}
