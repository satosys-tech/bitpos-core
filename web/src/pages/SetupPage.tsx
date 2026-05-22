import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { apiPost, apiGet } from "@/lib/api";

type Step = "welcome" | "connect" | "handle" | "pin" | "confirm";
type TunnelMode = "quick" | "named" | "manual";

interface NwcTestResult { connected: boolean; balanceSats?: number; error?: string; }
interface SetupStatus {
  configured: boolean;
  nwcConfigured: boolean;
  domain: string;
  publicUrl: string;
  lnAddressHost: string;
  tunnelMode: TunnelMode;
}

function TunnelBadge({ mode }: { mode: TunnelMode }) {
  if (mode === "quick") {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Quick tunnel
      </span>
    );
  }
  if (mode === "named") {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-500/15 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Named tunnel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      Manual domain
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="text-xs text-primary hover:underline ml-1 shrink-0"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function SetupPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [nwcUrl, setNwcUrl] = useState("");
  const [nwcResult, setNwcResult] = useState<NwcTestResult | null>(null);
  const [nwcTesting, setNwcTesting] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [handle, setHandle] = useState("me");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    apiGet<SetupStatus>("/api/setup-status")
      .then((s) => {
        if (s.configured) {
          navigate("/login", { replace: true });
          return;
        }
        setSetupStatus(s);
      })
      .catch(() => {});
  }, [navigate]);

  const envNwcConfigured = setupStatus?.nwcConfigured ?? false;
  const lnAddressHost = setupStatus?.lnAddressHost ?? "yourdomain";
  const tunnelMode = setupStatus?.tunnelMode ?? "manual";
  const isLocalhost = setupStatus?.domain?.startsWith("localhost") ?? true;

  const testNwc = async () => {
    setNwcTesting(true);
    setNwcResult(null);
    try {
      const data = await apiPost<NwcTestResult>("/api/nwc-test", { nwcUrl });
      setNwcResult(data);
    } catch (e) {
      setNwcResult({ connected: false, error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setNwcTesting(false);
    }
  };

  const completeSetup = async (finalPin: string) => {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { pin: finalPin, handle };
      if (!envNwcConfigured && nwcUrl) body.nwcUrl = nwcUrl;
      const data = await apiPost<{ token: string; entity: { id: string; handle: string }; account: { id: string; balanceSats: number } }>("/api/setup", body);
      setAuth(data.token, data.entity, data.account);
      navigate("/business/pos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setConfirmPin("");
      setPin("");
      setStep("pin");
      setLoading(false);
    }
  };

  const lnPreview = `${handle || "handle"}@${lnAddressHost}`;

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
                <li>1. Connect a Lightning wallet via Nostr Wallet Connect</li>
                <li>2. Choose a handle for your Lightning address</li>
                <li>3. Set a 4-digit PIN to lock the app</li>
              </ul>
            </div>

            {setupStatus && (
              <div className={`bg-card rounded-2xl p-4 border text-left space-y-2 ${
                isLocalhost ? "border-amber-500/30" : "border-border"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Public URL</span>
                  <TunnelBadge mode={tunnelMode} />
                </div>
                {isLocalhost ? (
                  <div className="text-xs text-amber-400 space-y-1">
                    <p className="font-medium">No public URL detected</p>
                    <p className="text-muted-foreground">
                      LN addresses and card provisioning require a public HTTPS URL.
                      Restart with <code className="bg-muted px-1 rounded">CLOUDFLARE_TUNNEL_TOKEN</code> for a stable
                      address, or let the server auto-generate a quick tunnel.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-xs text-foreground font-mono truncate">{setupStatus.publicUrl}</span>
                      <CopyButton text={setupStatus.publicUrl} />
                    </div>
                    {tunnelMode === "quick" && (
                      <p className="text-xs text-amber-400">
                        URL changes each restart. Set up a named tunnel for a permanent Lightning address.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <button onClick={() => setStep(envNwcConfigured ? "handle" : "connect")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base active:scale-[0.98] transition-all">
              Get Started
            </button>
          </div>
        )}

        {step === "connect" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Connect your wallet</h2>
              <p className="text-sm text-muted-foreground">
                Paste your NWC connection string. You can get one from{" "}
                <a className="text-primary underline" href="https://getalby.com/alby-hub" target="_blank" rel="noreferrer">Alby Hub</a>,
                or any wallet that supports{" "}
                <a className="text-primary underline" href="https://nwc.dev" target="_blank" rel="noreferrer">Nostr Wallet Connect</a>.
              </p>
            </div>
            <textarea
              value={nwcUrl}
              onChange={(e) => { setNwcUrl(e.target.value.trim()); setNwcResult(null); }}
              placeholder="nostr+walletconnect://..."
              rows={4}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground break-all"
            />
            <p className="text-xs text-muted-foreground -mt-2">
              Required permissions: <span className="text-foreground">pay_invoice</span>, <span className="text-foreground">make_invoice</span>, <span className="text-foreground">lookup_invoice</span>, <span className="text-foreground">get_balance</span>.
            </p>

            {nwcResult && (
              <div className={`rounded-xl p-3 border text-sm ${nwcResult.connected ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                {nwcResult.connected ? (
                  <>
                    <p className="font-semibold">Wallet connected</p>
                    {nwcResult.balanceSats !== undefined && (
                      <p className="text-xs opacity-80 mt-0.5">Balance: {nwcResult.balanceSats.toLocaleString()} sats</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Could not reach wallet</p>
                    <p className="text-xs opacity-80 mt-0.5 break-all">{nwcResult.error}</p>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={testNwc}
                disabled={!nwcUrl.startsWith("nostr+walletconnect://") || nwcTesting}
                className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:bg-muted/80 transition-colors"
              >
                {nwcTesting ? "Testing..." : nwcResult?.connected ? "Re-test" : "Test connection"}
              </button>
              <button
                onClick={() => setStep("handle")}
                disabled={!nwcResult?.connected}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "handle" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Choose a handle</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This becomes your Lightning address
              </p>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="satoshi"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Lightning address</p>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-sm font-mono text-primary truncate">{lnPreview}</span>
                <CopyButton text={lnPreview} />
              </div>
              {tunnelMode === "quick" && !isLocalhost && (
                <p className="text-xs text-amber-400">
                  Quick tunnel URL — changes each restart. Set up a named tunnel for a permanent address.
                </p>
              )}
              {isLocalhost && (
                <p className="text-xs text-amber-400">
                  Running on localhost — LN address won't resolve externally. Set DOMAIN or CLOUDFLARE_TUNNEL_TOKEN to get a public URL.
                </p>
              )}
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
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 4) { setError(""); setStep("confirm"); } }} maxLength={4} />
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
                  if (v !== pin) { setError("PINs don't match - try again"); setConfirmPin(""); setStep("pin"); setPin(""); return; }
                  await completeSetup(v);
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
