import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { apiPost } from "@/lib/api";

type Step = "welcome" | "handle" | "pin" | "confirm";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [handle, setHandle] = useState("me");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleSetup = async () => {
    if (pin !== confirmPin) { setError("PINs don't match"); setConfirmPin(""); return; }
    setLoading(true);
    setError("");
    try {
      const data = await apiPost<{ token: string; entity: { id: string; handle: string }; account: { id: string; balanceSats: number } }>("/api/setup", { pin, handle });
      setAuth(data.token, data.entity, data.account);
      navigate("/business/pos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">bit<span className="text-primary">POS</span></h1>
          <p className="text-muted-foreground text-sm">Self-hosted Lightning POS</p>
        </div>

        {step === "welcome" && (
          <div className="space-y-6 text-center">
            <div className="bg-card rounded-2xl p-6 border border-border space-y-3 text-left">
              <p className="text-sm text-foreground font-medium">Welcome! Let's get you set up.</p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>✓ Your NWC wallet is connected via the <code className="text-primary">NWC_URL</code> environment variable</li>
                <li>✓ You'll create a 4-digit PIN to secure your account</li>
                <li>✓ A Lightning address will be created for receiving payments</li>
              </ul>
            </div>
            <button onClick={() => setStep("handle")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base active:scale-[0.98] transition-all">
              Get Started
            </button>
          </div>
        )}

        {step === "handle" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Choose a handle</h2>
              <p className="text-sm text-muted-foreground mb-4">This becomes your Lightning address: <span className="text-primary">{handle || "..."}</span>@yourdomain</p>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="satoshi"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
            <button onClick={() => setStep("pin")} disabled={handle.trim().length < 1}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-all">
              Continue
            </button>
          </div>
        )}

        {step === "pin" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-1">Create your PIN</h2>
              <p className="text-sm text-muted-foreground">Choose a 4-digit PIN to secure your wallet</p>
            </div>
            <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 4) setStep("confirm"); }} maxLength={4} />
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-1">Confirm your PIN</h2>
              <p className="text-sm text-muted-foreground">Enter the same PIN again to confirm</p>
            </div>
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <PinPad
              value={confirmPin}
              onChange={async (v) => {
                setConfirmPin(v);
                if (v.length === 4) {
                  if (v !== pin) { setError("PINs don't match — try again"); setConfirmPin(""); setStep("pin"); setPin(""); }
                  else {
                    setLoading(true);
                    setError("");
                    try {
                      const data = await apiPost<{ token: string; entity: { id: string; handle: string }; account: { id: string; balanceSats: number } }>("/api/setup", { pin: v, handle });
                      setAuth(data.token, data.entity, data.account);
                      navigate("/business/pos");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Setup failed");
                      setLoading(false);
                    }
                  }
                }
              }}
              maxLength={4}
              disabled={loading}
            />
            {loading && <p className="text-center text-sm text-muted-foreground animate-pulse">Setting up...</p>}
          </div>
        )}
      </div>
    </div>
  );
}
