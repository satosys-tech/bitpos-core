import { useNavigate } from "react-router-dom";
import { Terminal, ShoppingBag, FileText, BarChart2 } from "lucide-react";

const sections = [
  { label: "POS Terminal", icon: Terminal, href: "/business/pos", description: "Accept Lightning payments" },
  { label: "Card Shop", icon: ShoppingBag, href: "/business/shop", description: "Order Bolt Cards" },
];

export default function BusinessPage() {
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-8 pb-6 safe-top">
      <h1 className="text-2xl font-bold mb-6">Business</h1>
      <div className="space-y-3">
        {sections.map(({ label, icon: Icon, href, description }) => (
          <button key={href} onClick={() => navigate(href)}
            className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:bg-card/80 transition-colors active:scale-[0.98] text-left">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
