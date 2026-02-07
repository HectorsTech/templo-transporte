import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy loading de páginas
const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Results = lazy(() => import('./pages/Results').then(module => ({ default: module.Results })));

// Ticket page needs special handling if it's not exported as default
// Assuming export function Ticket() {...}
const Ticket = lazy(() => import('./pages/Ticket').then(module => ({ default: module.Ticket })));

// Admin (Componentes pesados)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const Scanner = lazy(() => import('./pages/admin/Scanner').then(module => ({ default: module.Scanner })));

// AdminGuard might be default export or named export. Check file.
// Assuming named export based on previous usage: import { AdminGuard } from ...
const AdminGuard = lazy(() => import('./components/AdminGuard').then(module => ({ default: module.AdminGuard })));

// Loading Component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/resultados" element={<Results />} />
          <Route path="/boleto" element={<Ticket />} />
          <Route path="/admin" element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          } />
          <Route path="/admin/scanner" element={
            <AdminGuard>
              <Scanner />
            </AdminGuard>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;