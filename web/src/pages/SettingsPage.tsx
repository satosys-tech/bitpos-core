import { useState } from "react";
import { LogOut, ChevronRight, Key, User, Building } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiPut } from "@/lib/api";
import PinPad from "@/components/PinPad";

type Section = null | "pin" | "handle" | "business";

export default function SettingsPage() {
  const { entity, account, logout } = useAuth();
  const [section, setSection] = useState<Section>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinStep, setPinStep] = useState<"current" | "new">("current");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinError, setPinError] = useState("");
  const [newHandle, setNewHandle] = useState(entity?.handle ?? "");
  const [handleLoading, setHandleLoading] = useState(false);
  const [handleSuccess, setHandleSuccess] = useState(false);
  const [businessName, setBusinessName] = useState(account?.businessName ?? "");
  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessSuccess, setBusinessSuccess] = useState(false);

  const handlePinChange = async (p: string) => {
    if (pinStep === "current") { setCurrentPin(p); setPinStep("new"); }
    else {
      setPinLoading(true); setPinError("");
      try {
        await apiPut("/api/auth/pin", { currentPin, newPin: p });
        setPinSuccess(true);
        setTimeout(() => { setSection(null); setPinSuccess(false); setPinStep("current"); setCurrentPin(""); setNewPin(""); }, 1500);
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Failed to change PIN");
        setPinStep("current"); setCurrentPin(""); setNewPin("");
      } finally { setPinLoading(false); }
    }
  };

  const saveHandle = async () => {
    setHandleLoading(true);
    try { await apiPut("/api/auth/handle", { handle: newHandle }); setHandleSuccess(true); setTimeout(() => setHandleSuccess(false), 2000); }
    catch { }
    finally { setHandleLoading(false); }
  };

  const saveBusinessName = async () => {
    setBusinessLoading(true);
    try { await apiPut("/api/auth/business-name", { businessName }); setBusinessSuccess(true); setTimeout(() => setBusinessSuccess(false), 2000); }
    catch { }
    finally { setBusinessLoading(false); }
  };

  const sections = [
    { id: "pin" as Section, icon: Key, label: "Change PIN", description: "Update your account PIN" },
    { id: "handle" as Section, icon: User, label: "Lightning Handle", description: entity?.handle ?? "" },
    { id: "business" as Section, icon: Building, label: "Business Name", description: "Used on POS receipts" },
  ];

  return (
    <div className="px-5 pt-8 pb-6 safe-top min-h-full">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-2 mb-6">
        {sections.map(({ id, icon: Icon, label, description }) => (
          <button key={id} onClick={() => setSection(section === id ? null : id)}
            className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:bg-card/80 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {/* Expanded sections */}
      {section === "pin" && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <h3 className="font-semibold mb-4 text-center">{pinStep === "current" ? "Enter current PIN" : "Enter new PIN"}</h3>
          {pinError && <p className="text-destructive text-sm text-center mb-3">{pinError}</p>}
          {pinSuccess ? <p className="text-green-400 text-sm text-center">PIN changed!</p> : (
            <PinPad value={pinStep === "current" ? currentPin : newPin} onChange={handlePinChange} disabled={pinLoading} />
          )}
        </div>
      )}

      {section === "handle" && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-3">
          <h3 className="font-semibold">Lightning Handle</h3>
          <input type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="satoshi"
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <button onClick={saveHandle} disabled={handleLoading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
            {handleSuccess ? "Saved!" : handleLoading ? "Saving..." : "Save Handle"}
          </button>
        </div>
      )}

      {section === "business" && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-3">
          <h3 className="font-semibold">Business Name</h3>
          <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
            placeholder="My Lightning Shop"
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <button onClick={saveBusinessName} disabled={businessLoading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
            {businessSuccess ? "Saved!" : businessLoading ? "Saving..." : "Save Name"}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button onClick={() => { if (confirm("Sign out?")) logout(); }}
          className="w-full flex items-center gap-4 px-5 py-4 text-destructive hover:bg-destructive/5 transition-colors">
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="font-medium text-sm">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        bitPOS OSS — self-hosted Lightning POS
      </p>
    </div>
  );
}
