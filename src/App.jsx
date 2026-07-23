import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import AuthPage from "./pages/AuthPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Fleet from "./pages/Fleet";
import Customers from "./pages/Customers";
import CarTracking from "./pages/CarTracking/CarTracking";
import DeviceTrack from "./pages/DeviceTrack";
import Maintenance from "./pages/Maintenance";
import Inventory from "./pages/Inventory";
import Analytics from "./pages/Analytics";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";
import UserLogs from "./pages/UserLogs";
import TransactionLogs from "./pages/TransactionLogs";
import Settings from "./pages/Settings";
import VehicleDocumentation from "./pages/VehicleDocs";
import UserLogArchivePage from "./pages/UserLogArchivePage";
import PaymentsArchivePage from "./pages/PaymentsArchivePage";
import BookingArchivePage from "./pages/BookingArchivePage";
import TransactionLogArchivePage from "./pages/TransactionLogArchivePage";
import AuditLogsArchivePage from "./pages/AuditLogsArchivePage";
import ReviewsArchivePage from "./pages/ReviewsArchivePage";

// Wraps any route — redirects to /login if not authenticated
function ProtectedRoute({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return children;
}

// The main dashboard shell (sidebar + header + page content)
function DashboardLayout({ children }) {
    return (
        <div className="flex min-h-screen bg-arl-light">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <Routes>
            {/* Public route */}
            <Route
                path="/login"
                element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
            />

            {/* Protected routes */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <DashboardLayout><Dashboard /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/bookings" element={
                <ProtectedRoute>
                    <DashboardLayout><Bookings /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/fleet" element={
                <ProtectedRoute>
                    <DashboardLayout><Fleet /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/customers" element={
                <ProtectedRoute>
                    <DashboardLayout><Customers /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/car-tracking" element={
                <ProtectedRoute>
                    <DashboardLayout><CarTracking /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/gps-setup" element={
                <ProtectedRoute>
                    <DashboardLayout><DeviceTrack /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/maintenance" element={
                <ProtectedRoute>
                    <DashboardLayout><Maintenance /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/inventory" element={
                <ProtectedRoute>
                    <DashboardLayout><Inventory /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/vehicle-documentation" element={
                <ProtectedRoute>
                    <DashboardLayout><VehicleDocumentation /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/analytics" element={
                <ProtectedRoute>
                    <DashboardLayout><Analytics /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/payments" element={
                <ProtectedRoute>
                    <DashboardLayout><Payments /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/reports" element={
                <ProtectedRoute>
                    <DashboardLayout><Reports /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/audit-log" element={
                <ProtectedRoute>
                    <DashboardLayout><AuditLog /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/settings" element={
                <ProtectedRoute>
                    <DashboardLayout><Settings /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/user-logs" element={
                <ProtectedRoute>
                    <DashboardLayout><UserLogs /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/transaction-logs" element={
                <ProtectedRoute>
                    <DashboardLayout><TransactionLogs /></DashboardLayout>
                </ProtectedRoute>
            } />

            {/* Archive routes */}
            <Route path="/archives/user-log" element={
                <ProtectedRoute>
                    <DashboardLayout><UserLogArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/payments" element={
                <ProtectedRoute>
                    <DashboardLayout><PaymentsArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/bookings" element={
                <ProtectedRoute>
                    <DashboardLayout><BookingArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/transaction-log" element={
                <ProtectedRoute>
                    <DashboardLayout><TransactionLogArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/audit-log" element={
                <ProtectedRoute>
                    <DashboardLayout><AuditLogsArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/reviews" element={
                <ProtectedRoute>
                    <DashboardLayout><ReviewsArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ThemeProvider>
                    <CurrencyProvider>
                        <AppRoutes />
                    </CurrencyProvider>
                </ThemeProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}