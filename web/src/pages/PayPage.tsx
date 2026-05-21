import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import PinPad from "@/components/PinPad";

interface SessionStatus {
  amountSats: number;
  status: "pending" | "authorized" | "failed" | "expired" | "processing";
  expiresAt: string;
  cardLabel?: string | null;
}

export default function PayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [resultMsg, setResultMsg] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/pin-session/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setLoadError(data.error);
        else setSession(data);
      })
      .catch(() => setLoadError("Failed to load session"));
  }, [sessionId]);

  const handlePin = async (val: string) => {
    if (!sessionId || val.length < 4) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/pin-session/${sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: val }),
      });
      const data = await r.json();
      if (data.status === "OK") { setResult("ok"); }
      else { setResult("error"); setResultMsg(data.reason ?? "Payment failed"); setPin(""); setSubmitting(false); }
    } catch { setResult("error"); setResultMsg("Network error"); setSubmitting(false); }
  };

  if (loadError) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
      <h2 className="text-lg font-bold mb-2">Session Not Found</h2>
      <p className="text-muted-foreground text-sm">{loadError}</p>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (result === "ok" || session.status === "authorized") return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <CheckCircle2 className="w-16 h-16 text-green-400 mb-4" />
      <h2 className="text-xl font-bold mb-2">Payment Approved</h2>
      <p className="text-muted-foreground text-sm">{session.amountSats.toLocaleString()} sats</p>
    </div>
  );

  if (session.status === "expired") return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <XCircle className="w-12 h-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-bold mb-2">Session Expired</h2>
      <p className="text-muted-foreground text-sm">Please tap your card again</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-1">Enter Card PIN</h1>
        <p className="text-muted-foreground text-sm mb-2">
          {session.cardLabel ? `Card: ${session.cardLabel}` : "Bolt Card payment"}
        </p>
        <p className="text-3xl font-bold font-mono-nums text-primary mb-8">{session.amountSats.toLocaleString()} sats</p>
        {result === "error" && <p className="text-destructive text-sm mb-4">{resultMsg}</p>}
        <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 4) handlePin(v); }} disabled={submitting} />
      </div>
    </div>
  );
}
