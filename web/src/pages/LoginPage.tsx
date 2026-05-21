import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { apiPost } from "@/lib/api";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
          disabled={loading}
        />
      </div>
    </div>
  );
}
