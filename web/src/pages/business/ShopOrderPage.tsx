import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import { apiGet } from "@/lib/api";

interface Order {
  id: string;
  status: string;
  quantity: number;
  shippingName: string;
  shippingCountry: string;
  amountSats: number;
  createdAt: string;
  remoteStatus?: { trackingNumber?: string; trackingUrl?: string; status?: string } | null;
}

export default function ShopOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiGet<Order>(`/api/shop/orders/${id}`).then(setOrder).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!order) return <div className="px-5 pt-8 safe-top text-center text-muted-foreground">Order not found</div>;

  const statusColor: Record<string, string> = {
    awaiting_payment: "text-yellow-400", confirmed: "text-blue-400", printing: "text-purple-400",
    shipped: "text-primary", delivered: "text-green-400", cancelled: "text-destructive",
  };

  return (
    <div className="px-5 pt-8 pb-6 safe-top">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/business/shop/orders")} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Order #{order.id.slice(-8).toUpperCase()}</h1>
      </div>

      <div className="space-y-3">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{order.quantity} Bolt Card{order.quantity > 1 ? "s" : ""}</p>
              <p className={`text-sm font-medium ${statusColor[order.status] ?? "text-muted-foreground"}`}>{order.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-1 text-sm">
            <p className="text-muted-foreground">Ship to: <span className="text-foreground">{order.shippingName}, {order.shippingCountry}</span></p>
            <p className="text-muted-foreground">Amount: <span className="text-foreground font-mono-nums">{order.amountSats.toLocaleString()} sats</span></p>
            <p className="text-muted-foreground">Placed: <span className="text-foreground">{new Date(order.createdAt).toLocaleDateString()}</span></p>
          </div>
        </div>

        {order.remoteStatus?.trackingNumber && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm font-medium mb-1">Tracking</p>
            <p className="text-sm text-muted-foreground font-mono">{order.remoteStatus.trackingNumber}</p>
            {order.remoteStatus.trackingUrl && (
              <a href={order.remoteStatus.trackingUrl} target="_blank" rel="noopener noreferrer"
                className="text-primary text-sm mt-2 block hover:underline">
                Track Package →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
