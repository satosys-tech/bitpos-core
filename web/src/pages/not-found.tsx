import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
      <p className="text-muted-foreground mb-8">Page not found</p>
      <button onClick={() => navigate("/")} className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium">
        Go Home
      </button>
    </div>
  );
}
