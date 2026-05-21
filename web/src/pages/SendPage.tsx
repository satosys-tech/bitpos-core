import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiPost } from "@/lib/api";

export default function SendPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [amountSats, setAmountSats] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!destination.trim()) { setError("Destination is required"); return; }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { destination: destination.trim() };
      if (amountSats) body.amountSats = Number(amountSats);
      if (memo) body.memo = memo;
      await apiPost(`/api/accounts/${account!.id}/pay`, body);
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Payment Sent!</h2>
          <p className="text-muted-foreground text-sm">Redirecting to wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-5 pt-6 safe-top">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Send</h1>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Destination</label>
          <textarea
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Lightning address (user@domain), LNURL, or bolt11 invoice"
            rows={3}
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Amount (sats)</label>
          <input
            type="number"
            value={amountSats}
            onChange={(e) => setAmountSats(e.target.value)}
            placeholder="Optional for bolt11 invoices with amount"
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Memo</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional note"
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <button onClick={handleSend} disabled={loading || !destination.trim()}
          className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-all mt-4">
          {loading ? "Sending..." : "Send Payment"}
        </button>
      </div>
    </div>
  );
}
