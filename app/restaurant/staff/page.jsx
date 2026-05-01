"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, Loader2, Eye, Pencil, Trash2, KeyRound, QrCode } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "restaurant_cashier", label: "Cashier" },
  { value: "restaurant_kitchen", label: "Kitchen" },
  { value: "restaurant_bearer", label: "Bearer" },
];

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

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#771FA8]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function RestaurantStaffPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("restaurant_cashier");
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [editingMember, setEditingMember] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [members, setMembers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [revokingDeviceId, setRevokingDeviceId] = useState("");
  const [viewMember, setViewMember] = useState(null);
  const [setupUrl, setSetupUrl] = useState("");
  const [restaurantId, setRestaurantId] = useState("");

  const loadMembers = async () => {
    setLoadingMembers(true);
    setLoadingDevices(true);
    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    try {
      const res = await fetch("/api/restaurant/staff", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setMembers([]);
        setDevices([]);
        return;
      }
      setMembers(json.members || []);
      setSetupUrl(String(json?.setup_url || ""));
      setRestaurantId(String(json?.restaurant_id || ""));

      const devRes = await fetch("/api/restaurant/staff-devices", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const devJson = await devRes.json();
      if (devRes.ok && devJson?.ok) {
        setDevices(devJson.devices || []);
      } else {
        setDevices([]);
      }
    } catch {
      setMembers([]);
      setDevices([]);
    } finally {
      setLoadingMembers(false);
      setLoadingDevices(false);
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

      const res = await fetch("/api/restaurant/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          pin,
          role,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create staff.");

      toast.success("Staff PIN login created.");
      setFullName("");
      setPhone("");
      setPin("");
      setRole("restaurant_cashier");
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

    const res = await fetch("/api/restaurant/staff", {
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

  const onResetPin = async (member) => {
    const nextPin = window.prompt(`Enter new 4-6 digit PIN for ${member.full_name}:`, "");
    if (!nextPin) return;

    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/restaurant/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "reset_pin", user_id: member.user_id, pin: nextPin }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      toast.error(json?.error || "Failed to reset PIN.");
      return;
    }
    toast.success("PIN reset successful.");
  };

  const onDelete = async (member) => {
    const yes = window.confirm(`Delete staff login for ${member.full_name || member.email}?`);
    if (!yes) return;
    const { data: sess } = await supabaseBrowser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/restaurant/staff", {
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

  const onRevokeDevice = async (deviceId) => {
    const yes = window.confirm("Revoke this device? It will require QR scan again.");
    if (!yes) return;
    setRevokingDeviceId(deviceId);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/restaurant/staff-devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_id: deviceId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to revoke device.");
      toast.success("Device revoked.");
      await loadMembers();
    } catch (e) {
      toast.error(e?.message || "Failed to revoke device.");
    } finally {
      setRevokingDeviceId("");
    }
  };

  const roleLabel = (value) => ROLE_OPTIONS.find((r) => r.value === value)?.label || value;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/80 text-[#771FA8] flex items-center justify-center">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Restaurant Staff</h1>
            <p className="mt-1 text-sm text-gray-700">Create role-based PIN logins and manage staff access.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-semibold text-gray-900">Add Staff Member</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Staff name" />
            <Field label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            <Field label="PIN (4-6 digits)" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter PIN" />
            <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onCreate}
              disabled={loading || !fullName.trim() || !/^\d{4,6}$/.test(pin)}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create Staff PIN Login
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <QrCode className="h-4 w-4" />
            Staff QR Setup
          </div>
          <p className="text-xs text-gray-600">New device: scan this QR, then enter PIN. Paired devices need PIN only.</p>
          {setupUrl ? (
            <>
              <img alt="Staff setup QR" className="mt-3 h-40 w-40 rounded-xl border border-gray-200" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupUrl)}`} />
              <p className="mt-2 text-[11px] break-all text-gray-500">{setupUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.open(setupUrl, "_blank", "noopener,noreferrer")}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Open Link
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(setupUrl);
                      toast.success("Setup link copied.");
                    } catch {
                      toast.error("Unable to copy link.");
                    }
                  }}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Copy Link
                </button>
              </div>
            </>
          ) : (
            <div className="mt-3 h-40 w-40 rounded-xl bg-gray-100 animate-pulse" />
          )}
          {restaurantId ? <p className="mt-2 text-xs text-gray-500">Restaurant ID: {restaurantId}</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Current Staff</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
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
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="ml-auto h-7 w-24 rounded bg-gray-200" /></td>
                </tr>
              ))
            ) : null}
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">{m.full_name}</td>
                <td className="px-4 py-2">{m.phone}</td>
                <td className="px-4 py-2 capitalize">{roleLabel(m.role)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setViewMember(m)} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-700 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                    <button type="button" onClick={() => openEditModal(m)} className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => onResetPin(m)} className="rounded-lg border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-700 hover:bg-indigo-100"><KeyRound className="h-4 w-4" /></button>
                    <button type="button" onClick={() => onDelete(m)} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loadingMembers && members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">No staff members yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Paired Devices</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Device ID</th>
              <th className="px-4 py-2 text-left">Last Paired</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingDevices ? (
              [...Array(3)].map((_, idx) => (
                <tr key={`dev-sk-${idx}`} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-56 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-36 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="ml-auto h-7 w-24 rounded bg-gray-200" /></td>
                </tr>
              ))
            ) : null}
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono text-xs">{d.device_id}</td>
                <td className="px-4 py-2">{d.last_paired_at ? new Date(d.last_paired_at).toLocaleString() : "-"}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${d.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {d.is_active ? "Active" : "Revoked"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    disabled={!d.is_active || revokingDeviceId === d.device_id}
                    onClick={() => onRevokeDevice(d.device_id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {revokingDeviceId === d.device_id ? "Revoking..." : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
            {!loadingDevices && devices.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">No paired devices yet.</td>
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
              <p><span className="font-semibold">Phone:</span> {viewMember.phone}</p>
              <p><span className="font-semibold">Role:</span> {roleLabel(viewMember.role)}</p>
            </div>
            <button type="button" onClick={() => setViewMember(null)} className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold bg-red-600 text-white cursor-pointer">Close</button>
          </div>
        </div>
      ) : null}

      {editingMember ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(119,31,168,.18)] bg-white p-5">
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
