import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiPost } from "@/lib/api";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";

export default function ReceivePage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [amountSats, setAmountSats] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<{ bolt11: string; amountSats: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (invoice && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, invoice.bolt11.toUpperCase(), { width: 240, margin: 2, color: { dark: "#ffffff", light: "#0a0a0a" } }).catch(() => {});
    }
  }, [invoice]);

  const handleGenerate = async () => {
    if (!amountSats || Number(amountSats) < 1) { setError("Enter an amount in sats"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await apiPost<{ bolt11: string; amountSats: number }>(`/api/accounts/${account!.id}/invoice`, {
        amountSats: Number(amountSats),
        memo: memo || undefined,
      });
      setInvoice(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.bolt11).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="min-h-screen bg-background px-5 pt-6 safe-top">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Receive</h1>
      </div>

      {!invoice ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Amount (sats)</label>
            <input type="number" value={amountSats} onChange={(e) => setAmountSats(e.target.value)}
              placeholder="1000" autoFocus
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground" />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Memo (optional)</label>
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What's this for?"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground" />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <button onClick={handleGenerate} disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-all mt-4">
            {loading ? "Generating..." : "Generate Invoice"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="bg-card rounded-2xl p-6 border border-border">
            <canvas ref={canvasRef} className="rounded-xl" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold font-mono-nums">{invoice.amountSats.toLocaleString()} sats</p>
          </div>
          <button onClick={copy}
            className="w-full flex items-center justify-center gap-2 bg-card border border-border rounded-xl py-3 font-medium text-sm hover:bg-card/80 transition-colors active:scale-95">
            {copied ? <><Check className="w-4 h-4 text-green-400" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Invoice</>}
          </button>
          <button onClick={() => setInvoice(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Generate New Invoice
          </button>
        </div>
      )}
    </div>
  );
}
