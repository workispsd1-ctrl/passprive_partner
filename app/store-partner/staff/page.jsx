"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, Loader2, Eye, Pencil, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

function Field({ label, ...props }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input
        {...props}
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#771FA8]"
      />
    </label>
  );
}

export default function StoreStaffPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [editingMember, setEditingMember] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [members, setMembers] = useState([]);
  const [viewMember, setViewMember] = useState(null);

  const loadMembers = async () => {
    setLoadingMembers(true);
    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    try {
      const res = await fetch("/api/store/staff", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setMembers([]);
        return;
      }
      setMembers(json.members || []);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const onCreate = async () => {
    setLoading(true);

    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/store/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email,
          password,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create staff.");

      toast.success("Staff login created successfully.");
      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
      await loadMembers();
    } catch (e) {
      toast.error(e?.message || "Failed to create staff.");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (member) => {
    setEditingMember(member);
    setEditName(member.full_name === "-" ? "" : member.full_name);
    setEditPhone(member.phone === "-" ? "" : member.phone);
  };

  const onEditSave = async () => {
    if (!editingMember) return;
    setSavingEdit(true);
    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
      setSavingEdit(false);
      return;
    }

    const res = await fetch("/api/store/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: editingMember.user_id, full_name: editName, phone: editPhone }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      toast.error(json?.error || "Failed to update staff.");
      setSavingEdit(false);
      return;
    }
    toast.success("Staff member updated.");
    setEditingMember(null);
    await loadMembers();
    setSavingEdit(false);
  };

  const onDelete = async (member) => {
    const yes = window.confirm(`Delete staff login for ${member.full_name || member.email}?`);
    if (!yes) return;
    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/store/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: member.user_id }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      toast.error(json?.error || "Failed to delete staff.");
      return;
    }
    toast.success("Staff member deleted.");
    await loadMembers();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/80 text-[#771FA8] flex items-center justify-center">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Store Staff</h1>
            <p className="mt-1 text-sm text-gray-700">Create staff logins and manage team members.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 text-sm font-semibold text-gray-900">Add Staff Member</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Staff name" />
          <Field label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
          <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onCreate}
            disabled={loading || !email || password.length < 6}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create Staff Login
          </button>
          <span className="text-xs font-semibold text-gray-600">Role: Cashier</span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Current Staff</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingMembers ? (
              [...Array(4)].map((_, idx) => (
                <tr key={`sk-${idx}`} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-40 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="ml-auto h-7 w-20 rounded bg-gray-200" /></td>
                </tr>
              ))
            ) : null}
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">{m.full_name}</td>
                <td className="px-4 py-2">{m.email}</td>
                <td className="px-4 py-2">{m.phone}</td>
                <td className="px-4 py-2 capitalize">{m.role}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setViewMember(m)} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-700 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                    <button type="button" onClick={() => openEditModal(m)} className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => onDelete(m)} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loadingMembers && members.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No staff members yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {viewMember ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <div className="text-sm font-semibold text-gray-900">Staff Details</div>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              <p><span className="font-semibold">Name:</span> {viewMember.full_name}</p>
              <p><span className="font-semibold">Email:</span> {viewMember.email}</p>
              <p><span className="font-semibold">Phone:</span> {viewMember.phone}</p>
              <p><span className="font-semibold">Role:</span> {viewMember.role}</p>
            </div>
            <button type="button" onClick={() => setViewMember(null)} className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold">Close</button>
          </div>
        </div>
      ) : null}
      {editingMember ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-5">
            <div className="text-sm font-semibold text-gray-900">Edit Staff Member</div>
            <div className="mt-3 grid gap-3">
              <Field label="Full name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Staff name" />
              <Field label="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onEditSave}
                disabled={savingEdit}
                className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
              >
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
              <button type="button" onClick={() => setEditingMember(null)} className="h-9 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
