import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import SetupPage from "@/pages/SetupPage";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import SendPage from "@/pages/SendPage";
import ReceivePage from "@/pages/ReceivePage";
import CardPage from "@/pages/CardPage";
import BusinessPage from "@/pages/BusinessPage";
import PosPage from "@/pages/business/PosPage";
import ShopPage from "@/pages/business/ShopPage";
import ShopOrderPage from "@/pages/business/ShopOrderPage";
import ShopOrdersPage from "@/pages/business/ShopOrdersPage";
import SettingsPage from "@/pages/SettingsPage";
import PayPage from "@/pages/PayPage";
import NotFound from "@/pages/not-found";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading, setupRequired } = useAuth();
  if (loading) return <Spinner />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token, loading, setupRequired } = useAuth();
  if (loading) return <Spinner />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (token) return <Navigate to="/business/pos" replace />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout active="wallet"><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/send" element={<ProtectedRoute><SendPage /></ProtectedRoute>} />
      <Route path="/receive" element={<ProtectedRoute><ReceivePage /></ProtectedRoute>} />
      <Route path="/bolt-card" element={<ProtectedRoute><Layout active="card"><CardPage /></Layout></ProtectedRoute>} />
      <Route path="/business/pos" element={<ProtectedRoute><PosPage /></ProtectedRoute>} />
      <Route path="/business/shop/orders/:id" element={<ProtectedRoute><Layout active="business"><ShopOrderPage /></Layout></ProtectedRoute>} />
      <Route path="/business/shop/orders" element={<ProtectedRoute><Layout active="business"><ShopOrdersPage /></Layout></ProtectedRoute>} />
      <Route path="/business/shop" element={<ProtectedRoute><Layout active="business"><ShopPage /></Layout></ProtectedRoute>} />
      <Route path="/business" element={<ProtectedRoute><Layout active="business"><BusinessPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout active="settings"><SettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/pay/:sessionId" element={<PayPage />} />
      <Route path="/" element={<Navigate to="/business/pos" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}
