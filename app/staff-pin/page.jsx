"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// The pairing token the server gave this device. Only its hash is stored on the server.
const TOKEN_KEY = "passprive_device_token";
const NAME_KEY = "passprive_device_merchant";

const MESSAGES = {
  invalid_code: "That code is not valid. Scan the setup QR on the owner's Staff page again.",
  device_not_paired: "This device is no longer linked. Enter a new pairing code.",
  wrong_pin: "Wrong PIN.",
  not_in_plan: "Staff logins aren't included in this restaurant's service.",
};

function readStored(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStored(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

function messageFor(json) {
  if (json?.error === "locked" && json?.locked_until) {
    return `Too many wrong PINs. Try again after ${new Date(json.locked_until).toLocaleTimeString()}.`;
  }
  return MESSAGES[json?.error] || "Something went wrong. Please try again.";
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return json && typeof json === "object" ? json : { ok: false };
}

export default function StaffPinPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [deviceToken, setDeviceToken] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDeviceToken(readStored(TOKEN_KEY));
    setMerchantName(readStored(NAME_KEY));
    setReady(true);

    // The Staff page QR opens /staff-pin?code=...; pair straight away and drop the one-time code from the URL.
    const qrCode = new URLSearchParams(window.location.search).get("code") || "";
    if (qrCode) {
      window.history.replaceState(null, "", window.location.pathname);
      pairWith(qrCode);
    }
  }, []);

  function forgetDevice() {
    writeStored(TOKEN_KEY, "");
    writeStored(NAME_KEY, "");
    setDeviceToken("");
    setMerchantName("");
    setPin("");
  }

  async function onPair(e) {
    e.preventDefault();
    await pairWith(code);
  }

  async function pairWith(pairingCode) {
    setError("");
    setBusy(true);
    try {
      const json = await postJson("/api/pos/pair", {
        code: pairingCode.trim(),
        device_model: navigator.userAgent.slice(0, 80),
        app_version: "staff-web",
      });
      if (!json.ok || !json.device_token) {
        setError(messageFor(json));
        return;
      }
      writeStored(TOKEN_KEY, json.device_token);
      writeStored(NAME_KEY, json.merchant_name || "");
      setDeviceToken(json.device_token);
      setMerchantName(json.merchant_name || "");
      setCode("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your 4-6 digit PIN.");
      return;
    }
    setBusy(true);
    try {
      const json = await postJson("/api/staff/pin-login", { device_token: deviceToken, pin });
      if (!json.ok || !json.access_token) {
        if (json.error === "device_not_paired") forgetDevice();
        setPin("");
        setError(messageFor(json));
        return;
      }
      const { error: sessionErr } = await supabaseBrowser.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      });
      if (sessionErr) {
        setError("Something went wrong. Please try again.");
        return;
      }
      router.replace("/callback");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const paired = Boolean(deviceToken);
  const inputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF4800]";
  const primaryButton = {
    className: "h-11 w-full rounded-xl text-sm font-semibold text-white disabled:opacity-60",
    style: { background: "linear-gradient(91.59deg, #FF4800 2.56%, #FFA680 97.05%)" },
  };

  return (
    <div className="min-h-screen bg-[#F8F5FB] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[rgba(119,31,168,.15)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Staff PIN Login</h1>
        <p className="mt-1 text-sm text-gray-600">
          {!ready
            ? "Loading..."
            : paired
              ? `Linked to ${merchantName || "your restaurant"}. Enter your PIN.`
              : "Link this device once by scanning the setup QR on the owner's Staff page, or enter its code."}
        </p>

        {ready && !paired ? (
          <form className="mt-5 space-y-4" onSubmit={onPair}>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-gray-600">Pairing code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 14))}
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoComplete="off"
                className={`${inputClass} font-mono tracking-widest`}
              />
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button type="submit" disabled={busy || code.replace(/-/g, "").length < 8} {...primaryButton}>
              {busy ? "Linking..." : "Link this device"}
            </button>
          </form>
        ) : null}

        {ready && paired ? (
          <form className="mt-5 space-y-4" onSubmit={onLogin}>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-gray-600">PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 4-6 digit PIN"
                className={inputClass}
              />
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button type="submit" disabled={busy} {...primaryButton}>
              {busy ? "Signing in..." : "Login with PIN"}
            </button>
            <button
              type="button"
              onClick={forgetDevice}
              disabled={busy}
              className="h-11 w-full rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700"
            >
              Unlink this device
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
