import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import { apiGet } from "@/lib/api";

interface Order {
  id: string;
  status: string;
  quantity: number;
  shippingName: string;
  amountSats: number;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  awaiting_payment: "text-yellow-400", confirmed: "text-blue-400", printing: "text-purple-400",
  shipped: "text-primary", delivered: "text-green-400", cancelled: "text-muted-foreground",
};

export default function ShopOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Order[]>("/api/shop/orders").then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 pt-8 pb-6 safe-top">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/business/shop")} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Your Orders</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <button key={order.id} onClick={() => navigate(`/business/shop/orders/${order.id}`)}
              className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl p-4 hover:bg-card/80 transition-colors text-left">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{order.quantity} Bolt Card{order.quantity > 1 ? "s" : ""}</p>
                <p className={`text-xs font-medium ${statusColor[order.status] ?? "text-muted-foreground"}`}>
                  {order.status.replace(/_/g, " ")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono-nums text-foreground">{order.amountSats.toLocaleString()} sats</p>
                <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
