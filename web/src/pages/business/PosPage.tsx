import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Wifi, Copy, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPost } from "@/lib/api";
import QRCode from "qrcode";

type Step = "amount" | "charging" | "success" | "error";
type Unit = "sats" | "usd";

const DIGITS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

export default function PosPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [unit] = useState<Unit>("sats");
  const [step, setStep] = useState<Step>("amount");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (invoice && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, invoice.toUpperCase(), { width: 250, margin: 2, color: { dark: "#ffffff", light: "#0a0a0a" } }).catch(() => {});
    }
  }, [invoice]);

  const clearPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  useEffect(() => () => clearPoll(), []);

  const startPoll = (paymentHash: string) => {
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 120) { clearPoll(); setPolling(false); return; }
      try {
        const bal = await apiGet<{ balanceSats: number }>(`/api/accounts/${account!.id}/balance`);
        const txs = await apiGet<{ id: string; status: string; paymentHash?: string }[]>(`/api/accounts/${account!.id}/transactions?limit=5`);
        const found = txs.find((t) => t.paymentHash === paymentHash && t.status === "completed");
        if (found) { clearPoll(); setPolling(false); setStep("success"); }
      } catch { /* ignore */ }
    }, 2000);
  };

  const handleCharge = async () => {
    if (!amount || Number(amount) < 1) return;
    setLoading(true);
    setError("");
    try {
      const amountSats = Math.round(Number(amount));
      const data = await apiPost<{ bolt11: string; paymentHash: string; amountSats: number }>(`/api/accounts/${account!.id}/invoice`, {
        amountSats,
        memo: "POS payment",
      });
      setInvoice(data.bolt11);
      setStep("charging");
      startPoll(data.paymentHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally { setLoading(false); }
  };

  const reset = () => {
    clearPoll();
    setStep("amount");
    setAmount("");
    setInvoice(null);
    setError("");
    setPolling(false);
  };

  const handleKey = (key: string) => {
    if (key === "⌫") { setAmount((a) => a.slice(0, -1)); }
    else if (amount.length < 9) { setAmount((a) => a + key); }
  };

  const copy = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (step === "success") return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <CheckCircle2 className="w-20 h-20 text-green-400 mb-6" />
      <h2 className="text-2xl font-bold mb-2">Payment Received!</h2>
      <p className="text-muted-foreground mb-2">{Number(amount).toLocaleString()} sats</p>
      <button onClick={reset} className="mt-8 bg-primary text-primary-foreground rounded-2xl px-8 py-4 font-semibold text-lg">New Charge</button>
    </div>
  );

  if (step === "error") return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <XCircle className="w-16 h-16 text-destructive mb-4" />
      <h2 className="text-xl font-bold mb-2">Error</h2>
      <p className="text-muted-foreground mb-4 text-sm">{error}</p>
      <button onClick={reset} className="bg-muted rounded-xl px-6 py-3 font-medium">Try Again</button>
    </div>
  );

  if (step === "charging") return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={reset} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center absolute top-6 left-5">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <p className="text-muted-foreground text-sm mb-2">Waiting for payment</p>
      <p className="text-3xl font-bold font-mono-nums text-primary mb-6">{Number(amount).toLocaleString()} sats</p>

      {invoice ? (
        <div className="bg-card rounded-2xl p-5 border border-border mb-4">
          <canvas ref={canvasRef} className="rounded-xl" />
        </div>
      ) : (
        <div className="w-52 h-52 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {polling && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Wifi className="w-3.5 h-3.5 animate-pulse" /> Listening for payment...
        </div>
      )}

      {invoice && (
        <button onClick={copy} className="flex items-center gap-2 bg-muted rounded-xl px-5 py-3 text-sm font-medium hover:bg-muted/80 transition-colors">
          {copied ? <><Check className="w-4 h-4 text-green-400" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Invoice</>}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-6 safe-top mb-2">
        <button onClick={() => navigate("/business")} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">POS Terminal</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <div className="text-center mb-4">
          <p className="text-6xl font-bold font-mono-nums tracking-tight min-h-[72px]">
            {amount || "0"}
          </p>
          <p className="text-muted-foreground mt-1">sats</p>
        </div>

        {error && <p className="text-destructive text-sm mb-4">{error}</p>}

        <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
          {DIGITS.map((d, i) => (
            <button key={i} onClick={() => d && handleKey(d)} disabled={d === ""}
              className="h-16 rounded-2xl bg-card border border-border text-xl font-semibold flex items-center justify-center active:scale-95 transition-all disabled:opacity-0">
              {d}
            </button>
          ))}
        </div>

        <button onClick={handleCharge} disabled={!amount || Number(amount) < 1 || loading}
          className="w-full max-w-xs bg-primary text-primary-foreground rounded-2xl py-5 text-xl font-bold disabled:opacity-40 active:scale-[0.98] transition-all">
          {loading ? "Generating..." : `Charge ${Number(amount || 0).toLocaleString()} sats`}
        </button>
      </div>
    </div>
  );
}
