import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { CreditCard, Snowflake, Trash2, Plus, Copy, Eye, EyeOff, RefreshCw, Pencil, Check, X, KeyRound, Shield, ShieldOff, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "@/lib/api";
import PinPad from "@/components/PinPad";
import { cn } from "@/lib/utils";

interface CardInfo {
  id: string;
  name?: string | null;
  note?: string | null;
  status: "active" | "frozen" | "cancelled";
  perTapLimitSats: number;
  dailyLimitSats: number;
  pinEnabled: boolean;
  pinLocked: boolean;
  pinLimitMsats?: number | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

function shortId(id: string) { return id.replace(/-/g, "").slice(-8).replace(/(.{4})(.{4})/, "$1 $2"); }
function label(card: CardInfo) { return card.name ?? shortId(card.id); }

export default function CardPage() {
  const { account, entity } = useAuth();
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"provision" | "keys" | "pin" | null>(null);
  const [provisionUrl, setProvisionUrl] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [cardKeys, setCardKeys] = useState<{ k0: string; k1: string; k2: string; k3: string; k4: string; lnurlwTemplate: string } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [wipeData, setWipeData] = useState<{ wipeKeys: unknown; newProvisionUrl: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!account?.id) return;
    const data = await apiGet<CardInfo[]>(`/api/accounts/${account.id}/cards`).catch(() => []);
    setCards(data);
    setLoading(false);
  }, [account?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (provisionUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, provisionUrl, { width: 220, margin: 2, color: { dark: "#ffffff", light: "#0a0a0a" } }).catch(() => {});
    }
  }, [provisionUrl]);

  const issueCard = async () => {
    if (!account?.id) return;
    setIssuing(true);
    try {
      const data = await apiPost<{ cardId: string; provisionUrl: string; status: string }>(`/api/accounts/${account.id}/cards`);
      await refresh();
      setSelectedId(data.cardId);
      setProvisionUrl(data.provisionUrl);
      setModal("provision");
    } catch { /* ignore */ } finally { setIssuing(false); }
  };

  const toggleFreeze = async (card: CardInfo) => {
    const newStatus = card.status === "frozen" ? "active" : "frozen";
    await apiPatch(`/api/cards/${card.id}`, { status: newStatus });
    setCards((cs) => cs.map((c) => c.id === card.id ? { ...c, status: newStatus } : c));
  };

  const cancelCard = async (cardId: string) => {
    if (!confirm("Cancel this card? This cannot be undone.")) return;
    await apiDelete(`/api/cards/${cardId}`);
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    if (selectedId === cardId) setSelectedId(null);
  };

  const viewKeys = async (cardId: string) => {
    setPinError(""); setPin(""); setCardKeys(null); setModal("keys");
  };

  const submitViewKeys = async (p: string) => {
    setKeysLoading(true);
    try {
      const data = await apiPost<typeof cardKeys>(`/api/cards/${cardId}/keys`, { pin: p });
      setCardKeys(data);
    } catch { setPinError("Incorrect PIN"); setPin(""); } finally { setKeysLoading(false); }
  };

  const handleUnlock = async (cardId: string) => {
    const p = prompt("Enter your account PIN to unlock card:");
    if (!p) return;
    try {
      await apiPut(`/api/cards/${cardId}/pin/unlock`, { entityPin: p });
      setCards((cs) => cs.map((c) => c.id === cardId ? { ...c, pinLocked: false } : c));
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to unlock"); }
  };

  const cardId = selectedId ?? "";

  return (
    <div className="px-5 pt-8 pb-6 safe-top min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bolt Cards</h1>
        <button onClick={issueCard} disabled={issuing}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 active:scale-95 transition-all">
          <Plus className="w-4 h-4" />
          {issuing ? "Issuing..." : "New Card"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No cards yet. Issue your first Bolt Card!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.filter((c) => c.status !== "cancelled").map((card) => (
            <div key={card.id}
              className={cn("bg-card border rounded-2xl p-4 cursor-pointer transition-colors hover:bg-card/80",
                selectedId === card.id ? "border-primary" : "border-border")}
              onClick={() => setSelectedId(selectedId === card.id ? null : card.id)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{label(card)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{shortId(card.id)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {card.pinLocked && <Lock className="w-4 h-4 text-destructive" />}
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", card.status === "frozen" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>
                    {card.status}
                  </span>
                </div>
              </div>

              {selectedId === card.id && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p>Per-tap: <span className="text-foreground font-mono">{card.perTapLimitSats.toLocaleString()} sats</span></p>
                    <p>Daily: <span className="text-foreground font-mono">{card.dailyLimitSats.toLocaleString()} sats</span></p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={async (e) => { e.stopPropagation(); try { const data = await apiPost<{ provisionUrl: string }>(`/api/cards/${card.id}/provision`); setSelectedId(card.id); setProvisionUrl(data.provisionUrl); setModal("provision"); } catch { alert("Failed to generate provision token"); } }}
                      className="flex items-center gap-2 justify-center bg-muted rounded-xl py-2.5 text-xs font-medium hover:bg-muted/80 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Re-provision
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); viewKeys(card.id); }}
                      className="flex items-center gap-2 justify-center bg-muted rounded-xl py-2.5 text-xs font-medium hover:bg-muted/80 transition-colors">
                      <KeyRound className="w-3.5 h-3.5" /> View Keys
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleFreeze(card); }}
                      className="flex items-center gap-2 justify-center bg-muted rounded-xl py-2.5 text-xs font-medium hover:bg-muted/80 transition-colors">
                      {card.status === "frozen" ? <><ShieldOff className="w-3.5 h-3.5" /> Unfreeze</> : <><Snowflake className="w-3.5 h-3.5" /> Freeze</>}
                    </button>
                    {card.pinLocked ? (
                      <button onClick={(e) => { e.stopPropagation(); handleUnlock(card.id); }}
                        className="flex items-center gap-2 justify-center bg-yellow-500/10 text-yellow-400 rounded-xl py-2.5 text-xs font-medium hover:bg-yellow-500/20 transition-colors">
                        <Unlock className="w-3.5 h-3.5" /> Unlock PIN
                      </button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); cancelCard(card.id); }}
                        className="flex items-center gap-2 justify-center bg-destructive/10 text-destructive rounded-xl py-2.5 text-xs font-medium hover:bg-destructive/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Provision Modal */}
      {modal === "provision" && provisionUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-5">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-2 text-center">Provision Card</h2>
            <p className="text-xs text-muted-foreground text-center mb-4">Scan with the Bolt Card Creator app (NXP)</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-xl" />
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all text-center mb-4">{provisionUrl}</p>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard.writeText(provisionUrl)}
                className="flex-1 flex items-center gap-2 justify-center bg-muted rounded-xl py-3 text-sm font-medium hover:bg-muted/80 transition-colors">
                <Copy className="w-4 h-4" /> Copy URL
              </button>
              <button onClick={() => { setModal(null); setProvisionUrl(null); }}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Keys Modal */}
      {modal === "keys" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-5">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full">
            {!cardKeys ? (
              <>
                <h2 className="text-lg font-bold mb-2 text-center">Enter PIN to view keys</h2>
                {pinError && <p className="text-destructive text-sm text-center mb-2">{pinError}</p>}
                <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 4) submitViewKeys(v); }} disabled={keysLoading} />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Card Keys</h2>
                  <button onClick={() => setShowKeys(!showKeys)} className="text-xs text-primary">{showKeys ? "Hide" : "Show"}</button>
                </div>
                {Object.entries({ K0: cardKeys.k0, K1: cardKeys.k1, K2: cardKeys.k2, K3: cardKeys.k3, K4: cardKeys.k4 }).map(([k, v]) => (
                  <div key={k} className="mb-2">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-mono text-xs text-foreground break-all">{showKeys ? v : "•".repeat(32)}</p>
                  </div>
                ))}
              </>
            )}
            <button onClick={() => { setModal(null); setPin(""); setCardKeys(null); setPinError(""); }}
              className="w-full mt-4 bg-muted rounded-xl py-3 text-sm font-medium hover:bg-muted/80 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
