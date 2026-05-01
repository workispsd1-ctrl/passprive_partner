"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const DEVICE_KEY = "staff_device_id";

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = `dev_${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export default function StaffPinPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [deviceId, setDeviceId] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState(true);
  const [error, setError] = useState("");
  const queryRestaurantId = params.get("restaurant_id") || "";

  useEffect(() => {
    let mounted = true;

    async function initPairing() {
      try {
        setPairing(true);
        const devId = getDeviceId();
        if (!mounted) return;
        setDeviceId(devId);

        if (queryRestaurantId) {
          const pairRes = await fetch("/api/staff/device-pair", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pair", restaurant_id: queryRestaurantId, device_id: devId }),
          });
          const pairJson = await pairRes.json();
          if (!pairRes.ok || !pairJson?.ok) {
            throw new Error(pairJson?.error || "Failed to pair device.");
          }
          if (mounted) setRestaurantId(String(pairJson?.restaurant_id || queryRestaurantId));
          return;
        }

        const res = await fetch("/api/staff/device-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", device_id: devId }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Unable to resolve paired restaurant.");
        }
        if (mounted) setRestaurantId(String(json?.restaurant_id || ""));
      } catch (err) {
        if (mounted) setError(err?.message || "Unable to initialize pairing.");
      } finally {
        if (mounted) setPairing(false);
      }
    }

    initPairing();

    return () => {
      mounted = false;
    };
  }, [queryRestaurantId]);

  const isPaired = useMemo(() => Boolean(restaurantId), [restaurantId]);

  const onClearPair = async () => {
    setError("");
    try {
      if (deviceId) {
        await fetch("/api/staff/device-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unpair", device_id: deviceId }),
        });
      }
    } finally {
      setRestaurantId("");
    }
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!restaurantId) {
      setError("Scan the restaurant QR first.");
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter a valid 4-6 digit PIN.");
      return;
    }

    setLoading(true);

    try {
      const checkRes = await fetch("/api/staff/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId, pin, device_id: deviceId }),
      });

      const checkJson = await checkRes.json();
      if (!checkRes.ok || !checkJson?.ok || !checkJson?.email) {
        throw new Error(checkJson?.error || "Invalid PIN.");
      }

      const { data, error: signErr } = await supabaseBrowser.auth.signInWithPassword({
        email: checkJson.email,
        password: pin,
      });

      if (signErr || !data?.session) {
        throw new Error(signErr?.message || "Unable to sign in.");
      }

      router.replace("/callback");
    } catch (err) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F5FB] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[rgba(119,31,168,.15)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Staff PIN Login</h1>
        <p className="mt-1 text-sm text-gray-600">
          {pairing
            ? "Checking device pairing..."
            : isPaired
              ? "Device paired. Enter PIN to continue."
              : "Scan restaurant QR to pair this device first."}
        </p>

        {!pairing && !isPaired ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            QR pairing required. Ask admin to open Restaurant Staff page and scan the setup QR.
          </div>
        ) : null}

       

        <form className="mt-5 space-y-4" onSubmit={onLogin}>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 4-6 digit PIN"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#771FA8]"
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={!isPaired || loading || pairing}
            className="h-11 w-full rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
          >
            {loading ? "Signing in..." : "Login with PIN"}
          </button>

          <button
            type="button"
            onClick={onClearPair}
            className="h-11 w-full rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700"
          >
            Use Different Restaurant QR
          </button>
        </form>
      </div>
    </div>
  );
}
