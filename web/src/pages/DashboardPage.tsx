import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Download, CreditCard, ArrowDownLeft, ArrowUpRight, RefreshCw, Copy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";

interface Transaction {
  id: string;
  direction: "in" | "out";
  amountSats: number;
  type: string;
  memo?: string | null;
  counterpartHandle?: string | null;
  counterpartLnAddress?: string | null;
  createdAt: string;
  status: string;
}

function txLabel(tx: Transaction) {
  if (tx.counterpartHandle) return `@${tx.counterpartHandle}`;
  if (tx.counterpartLnAddress) return tx.counterpartLnAddress;
  if (tx.memo) return tx.memo;
  const map: Record<string, string> = {
    receive: "Received", send: "Sent", internal_receive: "Received", internal_send: "Sent",
  };
  return map[tx.type] ?? tx.type;
}

export default function DashboardPage() {
  const { account, updateAccount } = useAuth();
  const navigate = useNavigate();
  const [balanceSats, setBalanceSats] = useState(account?.balanceSats ?? 0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lnAddress, setLnAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLnCopy, setShowLnCopy] = useState(false);

  const refresh = useCallback(async () => {
    if (!account?.id) return;
    setLoading(true);
    try {
      const [bal, txs, lnA] = await Promise.all([
        apiGet<{ balanceSats: number }>(`/api/accounts/${account.id}/balance`),
        apiGet<Transaction[]>(`/api/accounts/${account.id}/transactions?limit=20`),
        apiGet<{ lightningAddress: string }>(`/api/accounts/${account.id}/lightning-address`).catch(() => null),
      ]);
      setBalanceSats(bal.balanceSats);
      updateAccount({ ...account, balanceSats: bal.balanceSats });
      setTransactions(txs);
      if (lnA) setLnAddress(lnA.lightningAddress);
    } finally {
      setLoading(false);
    }
  }, [account?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const copyAddress = () => {
    if (!lnAddress) return;
    navigator.clipboard.writeText(lnAddress).then(() => { setShowLnCopy(true); setTimeout(() => setShowLnCopy(false), 2000); });
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 pt-10 pb-8 safe-top bg-gradient-to-b from-card/50 to-transparent">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted-foreground text-sm mb-1">Balance</p>
            <p className="text-4xl font-bold font-mono-nums tracking-tight">{balanceSats.toLocaleString()} <span className="text-lg font-medium text-muted-foreground">sats</span></p>
          </div>
          <button onClick={refresh} disabled={loading} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {lnAddress && (
          <button onClick={copyAddress} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <Copy className="w-3.5 h-3.5" />
            <span className="font-mono text-xs">{showLnCopy ? "Copied!" : lnAddress}</span>
          </button>
        )}
      </div>

      <div className="px-5 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Send", icon: Send, action: () => navigate("/send") },
            { label: "Receive", icon: Download, action: () => navigate("/receive") },
            { label: "Card", icon: CreditCard, action: () => navigate("/bolt-card") },
          ].map(({ label, icon: Icon, action }) => (
            <button key={label} onClick={action}
              className="flex flex-col items-center gap-2 bg-card border border-border rounded-2xl py-4 px-3 hover:bg-card/80 transition-colors active:scale-95">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Activity</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">No transactions yet</p>
            <p className="text-muted-foreground text-xs mt-1">Fund your wallet to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between bg-card rounded-xl px-4 py-3 border border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.direction === "in" ? "bg-green-500/10" : "bg-muted"}`}>
                    {tx.direction === "in"
                      ? <ArrowDownLeft className="w-4 h-4 text-green-400" />
                      : <ArrowUpRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{txLabel(tx)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className={`text-sm font-semibold font-mono-nums ${tx.direction === "in" ? "text-green-400" : "text-foreground"}`}>
                  {tx.direction === "in" ? "+" : "-"}{tx.amountSats.toLocaleString()} sats
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
