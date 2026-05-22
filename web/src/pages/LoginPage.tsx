import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { apiPost } from "@/lib/api";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { setAuth } = useAuth();

  const handlePinComplete = async (val: string) => {
    if (val.length < 4) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiPost<{ token: string; entity: { id: string; handle: string }; account: { id: string; balanceSats: number } }>("/api/auth/login", { pin: val });
      setAuth(data.token, data.entity, data.account);
    } catch {
      setError("Invalid PIN");
      setPin("");
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await apiPost("/api/setup/reset", { confirm: "wipe-everything" });
      // Reload — AuthContext will see setupRequired and route to /setup.
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-1">bit<span className="text-primary">POS</span></h1>
          <p className="text-muted-foreground text-sm">Enter your PIN to unlock</p>
        </div>
        {error && <p className="text-destructive text-sm text-center mb-4">{error}</p>}
        <PinPad
          value={pin}
          onChange={(v) => { setPin(v); if (v.length === 4) handlePinComplete(v); }}
          maxLength={4}
          disabled={loading || resetting}
        />

        <div className="mt-10 text-center">
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              Forgot PIN? Reset this device
            </button>
          ) : (
            <div className="space-y-3 bg-card border border-destructive/30 rounded-xl p-4 text-left">
              <p className="text-sm text-foreground font-semibold">Reset this bitPOS install?</p>
              <p className="text-xs text-muted-foreground">
                This wipes the handle, PIN, transaction history, and Bolt Card data on this device. Your sats are safe — they live in your connected Lightning wallet, not here.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  className="flex-1 bg-muted rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 bg-destructive text-destructive-foreground rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Yes, wipe it"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
