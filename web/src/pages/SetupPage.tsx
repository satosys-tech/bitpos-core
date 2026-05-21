import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { apiPost, apiGet } from "@/lib/api";

type Step = "welcome" | "nwc-check" | "handle" | "pin" | "confirm";

interface NwcStatus { connected: boolean; balanceSats?: number; error?: string; }

export default function SetupPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [handle, setHandle] = useState("me");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nwcStatus, setNwcStatus] = useState<NwcStatus | null>(null);
  const [nwcChecking, setNwcChecking] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const checkNwc = async () => {
    setNwcChecking(true);
    setNwcStatus(null);
    try {
      const data = await apiGet<NwcStatus>("/api/nwc-status");
      setNwcStatus(data);
    } catch {
      setNwcStatus({ connected: false, error: "Could not reach server" });
    } finally {
      setNwcChecking(false);
    }
  };

  useEffect(() => {
    if (step === "nwc-check") checkNwc();
  }, [step]);

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
                <li>✓ Connect your NWC wallet via the <code className="text-primary">NWC_URL</code> environment variable</li>
                <li>✓ We'll verify your wallet connection before continuing</li>
                <li>✓ You'll create a 4-digit PIN to secure your account</li>
                <li>✓ A Lightning address will be created for receiving payments</li>
              </ul>
            </div>
            <button onClick={() => setStep("nwc-check")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base active:scale-[0.98] transition-all">
              Get Started
            </button>
          </div>
        )}

        {step === "nwc-check" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-1">Checking wallet connection</h2>
              <p className="text-sm text-muted-foreground">Verifying your NWC_URL is reachable…</p>
            </div>
            {nwcChecking && (
              <div className="flex justify-center py-6">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {nwcStatus && (
              <div className={`rounded-2xl p-4 border text-sm ${nwcStatus.connected ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                {nwcStatus.connected ? (
                  <>
                    <p className="font-semibold mb-1">✓ Wallet connected</p>
                    {nwcStatus.balanceSats !== undefined && (
                      <p className="text-xs opacity-80">Balance: {nwcStatus.balanceSats.toLocaleString()} sats</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold mb-1">✗ Wallet not reachable</p>
                    <p className="text-xs opacity-80">{nwcStatus.error ?? "Check your NWC_URL and restart."}</p>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-3">
              {nwcStatus && !nwcStatus.connected && (
                <button onClick={checkNwc} disabled={nwcChecking}
                  className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50">
                  Retry
                </button>
              )}
              {nwcStatus?.connected && (
                <button onClick={() => setStep("handle")}
                  className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold active:scale-[0.98] transition-all">
                  Continue
                </button>
              )}
            </div>
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
                  if (v !== pin) { setError("PINs don't match - try again"); setConfirmPin(""); setStep("pin"); setPin(""); }
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
