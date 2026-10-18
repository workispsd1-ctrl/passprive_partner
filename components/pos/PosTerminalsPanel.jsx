"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Lock, MonitorSmartphone, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const COLUMNS = "id, label, status, pairing_expires_at, device_model, app_version, locked_until, paired_at, last_login_at, revoked_at, created_at";
const BRAND_GRADIENT = { background: "linear-gradient(91.59deg, #FF4800 2.56%, #FFA680 97.05%)" };

function stamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB", { timeZone: "Indian/Mauritius" });
}

function isLocked(t) {
  return t.locked_until && new Date(t.locked_until) > new Date();
}

function StatusPill({ terminal }) {
  const locked = terminal.status === "active" && isLocked(terminal);
  const label = locked ? "Locked" : terminal.status === "active" ? "Active" : terminal.status === "pending" ? "Waiting to pair" : "Revoked";
  const tone = locked
    ? "bg-amber-100 text-amber-700"
    : terminal.status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : terminal.status === "pending"
        ? "bg-sky-100 text-sky-700"
        : "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

export default function PosTerminalsPanel({ restaurantId = null, storeId = null }) {
  const merchant = { p_restaurant_id: restaurantId, p_store_id: storeId };
  const [pinStatus, setPinStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!restaurantId && !storeId) return;
    setLoading(true);
    const filterColumn = restaurantId ? "restaurant_id" : "store_id";
    const [statusRes, listRes] = await Promise.all([
      supabaseBrowser.rpc("pos_pin_status", { p_restaurant_id: restaurantId, p_store_id: storeId }),
      supabaseBrowser
        .from("pos_terminals")
        .select(COLUMNS)
        .eq(filterColumn, restaurantId || storeId)
        .order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    if (statusRes.error || listRes.error) {
      toast.error((statusRes.error || listRes.error).message || "Failed to load POS terminals.");
      return;
    }
    setPinStatus(statusRes.data?.[0] || { has_pin: false });
    const now = new Date();
    setTerminals((listRes.data || []).filter((t) => t.status !== "pending" || new Date(t.pairing_expires_at) > now));
  }, [restaurantId, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pairing) return;
    const ms = new Date(pairing.expires_at).getTime() - Date.now();
    const timer = setTimeout(() => {
      setPairing(null);
      load();
    }, Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [pairing, load]);

  const savePin = async () => {
    if (pin !== pinConfirm) {
      toast.error("PINs do not match.");
      return;
    }
    setSavingPin(true);
    const { error } = await supabaseBrowser.rpc("pos_set_pin", { ...merchant, p_pin: pin });
    setSavingPin(false);
    if (error) {
      toast.error(error.message || "Failed to save PIN.");
      return;
    }
    setPin("");
    setPinConfirm("");
    toast.success("POS PIN saved. Use it on every linked terminal.");
    load();
  };

  const createPairing = async () => {
    setCreating(true);
    const { data, error } = await supabaseBrowser.rpc("pos_create_pairing", { ...merchant, p_label: label });
    setCreating(false);
    if (error) {
      toast.error(error.message || "Failed to create pairing code.");
      return;
    }
    setPairing(data);
    setLabel("");
    load();
  };

  const act = async (terminal, fn, confirmText, success) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(terminal.id);
    const { error } = await supabaseBrowser.rpc(fn, { p_terminal_id: terminal.id });
    setBusyId("");
    if (error) {
      toast.error(error.message || "Action failed.");
      return;
    }
    toast.success(success);
    load();
  };

  const pinValid = /^\d{4,6}$/.test(pin) && pin === pinConfirm;
  const code = pairing?.code ? `${pairing.code.slice(0, 4)}-${pairing.code.slice(4)}` : "";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#FFE2D6] bg-[#FFF7F4] p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/80 text-[#FF4800] flex items-center justify-center">
            <MonitorSmartphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">POS Terminals</h1>
            <p className="mt-1 text-sm text-gray-700">
              Link a POS machine once with a pairing code. After that, staff unlock it with your POS PIN.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <KeyRound className="h-4 w-4" />
            POS PIN
          </div>
          <p className="mb-4 text-xs text-gray-600">
            {pinStatus?.has_pin ? `PIN set. Last changed ${stamp(pinStatus.updated_at)}.` : "No PIN set yet. Terminals cannot be unlocked until you set one."}
            {" "}Avoid easy PINs like 1234 or 1111. Changing it also unlocks any locked terminal.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={pinStatus?.has_pin ? "New PIN (4-6 digits)" : "PIN (4-6 digits)"}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF4800]"
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Confirm PIN"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF4800]"
            />
          </div>
          <button
            type="button"
            onClick={savePin}
            disabled={savingPin || !pinValid}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
            style={BRAND_GRADIENT}
          >
            {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {pinStatus?.has_pin ? "Change PIN" : "Set PIN"}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Plus className="h-4 w-4" />
            Link a terminal
          </div>
          <p className="mb-4 text-xs text-gray-600">Generate a one-time code and enter it on the POS machine within 15 minutes.</p>
          {pairing ? (
            <div className="rounded-xl border border-[#FFE2D6] bg-[#FFF7F4] p-4 text-center">
              <div className="font-mono text-3xl font-bold tracking-[0.2em] text-gray-900">{code}</div>
              <p className="mt-2 text-xs text-gray-600">Expires {stamp(pairing.expires_at)}. Works once.</p>
              <button type="button" onClick={() => setPairing(null)} className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 40))}
                placeholder="Terminal name, e.g. Front counter"
                className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF4800]"
              />
              <button
                type="button"
                onClick={createPairing}
                disabled={creating}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
                style={BRAND_GRADIENT}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Generate code
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <span className="text-sm font-semibold text-gray-900">Linked terminals</span>
          <button type="button" onClick={load} className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Terminal</th>
                <th className="px-4 py-2 text-left">Device</th>
                <th className="px-4 py-2 text-left">Linked</th>
                <th className="px-4 py-2 text-left">Last unlock</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {terminals.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium text-gray-900">{t.label}</td>
                  <td className="px-4 py-2 text-gray-600">{[t.device_model, t.app_version && `v${t.app_version}`].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-4 py-2 text-gray-600">{stamp(t.paired_at)}</td>
                  <td className="px-4 py-2 text-gray-600">{stamp(t.last_login_at)}</td>
                  <td className="px-4 py-2"><StatusPill terminal={t} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {t.status === "active" && isLocked(t) ? (
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => act(t, "pos_unlock_terminal", null, "Terminal unlocked.")}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Unlock
                        </button>
                      ) : null}
                      {t.status !== "revoked" ? (
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() =>
                            act(t, "pos_revoke_terminal", `Revoke "${t.label}"? It will be signed out immediately and must be linked again.`, "Terminal revoked.")
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {t.status === "pending" ? "Cancel" : "Revoke"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && terminals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No terminals linked yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
