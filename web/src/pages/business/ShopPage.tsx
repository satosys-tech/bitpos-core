import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingBag, ChevronRight, ArrowLeft } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

interface Design { id: string; name: string; description?: string; priceEurCents: number; active: boolean; }
interface Quote { amountSats: number; shippingUsdCents: number; totalUsdCents: number; }

const COUNTRIES = ["US","GB","DE","FR","NL","BE","CH","AT","ES","IT","CA","AU","JP","SG","NZ","SE","NO","DK","FI","PL","CZ","HU","SK","RO","PT","IE","GR","HR","BG","LT","LV","EE","CY","MT"];

export default function ShopPage() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [step, setStep] = useState<"designs" | "shipping" | "confirm" | "done">("designs");
  const [qty, setQty] = useState(1);
  const [country, setCountry] = useState("US");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [shipping, setShipping] = useState({ name: "", email: "", address1: "", city: "", postalCode: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Design[]>("/api/shop/designs").then((d) => { setDesigns(d.filter((x) => x.active)); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const getQuote = async () => {
    if (!selectedDesign) return;
    setQuoteLoading(true);
    try {
      const q = await apiGet<Quote>(`/api/shop/quote?designId=${selectedDesign.id}&quantity=${qty}&country=${country}`);
      setQuote(q);
    } catch { } finally { setQuoteLoading(false); }
  };

  useEffect(() => { if (step === "shipping") getQuote(); }, [step, qty, country]);

  const placeOrder = async () => {
    setSubmitting(true); setError("");
    try {
      const data = await apiPost<{ orderId: string; status: string }>("/api/shop/orders", {
        designId: selectedDesign?.id,
        quantity: qty,
        shippingName: shipping.name,
        shippingEmail: shipping.email,
        shippingPhone: shipping.phone,
        shippingAddress1: shipping.address1,
        shippingCity: shipping.city,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: country,
      });
      setOrderId(data.orderId);
      setStep("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Order failed"); }
    finally { setSubmitting(false); }
  };

  if (step === "done") return (
    <div className="px-5 pt-8 safe-top text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
        <ShoppingBag className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-xl font-bold mb-2">Order Placed!</h2>
      <p className="text-muted-foreground text-sm mb-6">Your Bolt Cards are on their way via bitpos.app fulfillment</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => navigate(`/business/shop/orders/${orderId}`)} className="bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-semibold">Track Order</button>
        <button onClick={() => { setStep("designs"); setSelectedDesign(null); setQty(1); setOrderId(null); }} className="bg-muted rounded-xl px-5 py-3 text-sm font-medium">New Order</button>
      </div>
    </div>
  );

  return (
    <div className="px-5 pt-8 pb-6 safe-top min-h-full">
      <div className="flex items-center gap-3 mb-6">
        {step !== "designs" && (
          <button onClick={() => setStep(step === "confirm" ? "shipping" : "designs")} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-2xl font-bold">Card Shop</h1>
        <button onClick={() => navigate("/business/shop/orders")} className="ml-auto text-sm text-primary">Orders</button>
      </div>

      {step === "designs" && (
        <>
          {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-3">
              {designs.map((d) => (
                <button key={d.id} onClick={() => { setSelectedDesign(d); setStep("shipping"); }}
                  className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl p-4 hover:bg-card/80 transition-colors text-left">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === "shipping" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Shipping for <span className="text-foreground font-medium">{selectedDesign?.name}</span></p>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Quantity</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 bg-muted rounded-lg font-bold text-lg">−</button>
              <span className="text-lg font-semibold w-8 text-center">{qty}</span>
              <button onClick={() => setQty(Math.min(20, qty + 1))} className="w-10 h-10 bg-muted rounded-lg font-bold text-lg">+</button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {[
            { key: "name", label: "Full Name", type: "text" },
            { key: "email", label: "Email", type: "email" },
            { key: "phone", label: "Phone (optional)", type: "tel" },
            { key: "address1", label: "Address", type: "text" },
            { key: "city", label: "City", type: "text" },
            { key: "postalCode", label: "Postal Code", type: "text" },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs text-muted-foreground mb-1">{label}</label>
              <input type={type} value={(shipping as Record<string, string>)[key]} onChange={(e) => setShipping((s) => ({ ...s, [key]: e.target.value }))}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground" />
            </div>
          ))}
          {quote && !quoteLoading && (
            <div className="bg-muted rounded-xl p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold font-mono-nums">{quote.amountSats.toLocaleString()} sats</span></div>
            </div>
          )}
          <button onClick={() => setStep("confirm")} disabled={!shipping.name || !shipping.address1 || !shipping.city || !shipping.postalCode}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-all">
            Review Order
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
            <p className="font-semibold">{selectedDesign?.name} × {qty}</p>
            <p className="text-sm text-muted-foreground">{shipping.name}</p>
            <p className="text-sm text-muted-foreground">{shipping.address1}, {shipping.city} {shipping.postalCode}, {country}</p>
            {quote && <p className="text-sm font-semibold font-mono-nums text-primary mt-2">{quote.amountSats.toLocaleString()} sats</p>}
          </div>
          <p className="text-xs text-muted-foreground text-center">Your shipping address will be sent to bitpos.app for fulfillment. Payment comes from your connected wallet.</p>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <button onClick={placeOrder} disabled={submitting}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 active:scale-[0.98] transition-all">
            {submitting ? "Placing Order..." : "Confirm & Pay"}
          </button>
        </div>
      )}
    </div>
  );
}
