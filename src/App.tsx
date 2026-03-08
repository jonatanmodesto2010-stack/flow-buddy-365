import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useVersionCheck } from "./hooks/useVersionCheck";
import { Loader2 } from "lucide-react";

// Lazy load all pages
const Clients = React.lazy(() => import("./pages/Clients"));
const Calendar = React.lazy(() => import("./pages/Calendar"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Profile = React.lazy(() => import("./pages/Profile"));
const VisualTimeline = React.lazy(() => import("./pages/VisualTimeline"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Manual = React.lazy(() => import("./pages/Manual"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOrganizations = React.lazy(() => import("./pages/admin/AdminOrganizations"));
const AdminOrganizationDetail = React.lazy(() => import("./pages/admin/AdminOrganizationDetail"));
const AdminPlans = React.lazy(() => import("./pages/admin/AdminPlans"));
const AdminSubscriptions = React.lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminInvoices = React.lazy(() => import("./pages/admin/AdminInvoices"));
const SubscriptionPage = React.lazy(() => import("./pages/Subscription"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const AppContent = () => {
  useVersionCheck();
  
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Clients />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/visual-timeline" element={<VisualTimeline />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/manual" element={<Manual />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/organizations" element={<AdminOrganizations />} />
          <Route path="/admin/organizations/:id" element={<AdminOrganizationDetail />} />
          <Route path="/admin/plans" element={<AdminPlans />} />
          <Route path="/admin/subscriptions" element={<AdminSubscriptions />} />
          <Route path="/admin/invoices" element={<AdminInvoices />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
