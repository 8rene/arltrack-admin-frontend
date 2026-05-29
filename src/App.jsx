import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { canAccess } from "./utils/permissions";
import AuthPage from "./pages/AuthPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Fleet from "./pages/Fleet";
import Customers from "./pages/Customers";
import GPS from "./pages/GPS";
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

// Redirects to /login if not authenticated
function ProtectedRoute({ children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return children;
}

// Redirects to /dashboard if the user's role cannot access the given permission key
function RoleRoute({ permissionKey, children }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    const role = user?.role?.toLowerCase();
    if (!canAccess(role, permissionKey)) return <Navigate to="/dashboard" replace />;
    return children;
}

// Main dashboard shell: sidebar + header + page content
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
            {/* Public */}
            <Route
                path="/login"
                element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
            />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* ── Main ── */}
            <Route path="/dashboard" element={
                <RoleRoute permissionKey="dashboard">
                    <DashboardLayout><Dashboard /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/bookings" element={
                <RoleRoute permissionKey="bookings">
                    <DashboardLayout><Bookings /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/fleet" element={
                <RoleRoute permissionKey="fleet">
                    <DashboardLayout><Fleet /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/customers" element={
                <RoleRoute permissionKey="customers">
                    <DashboardLayout><Customers /></DashboardLayout>
                </RoleRoute>
            } />

            {/* ── Operations ── */}
            <Route path="/gps" element={
                <RoleRoute permissionKey="gps">
                    <DashboardLayout><GPS /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/maintenance" element={
                <RoleRoute permissionKey="maintenance">
                    <DashboardLayout><Maintenance /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/inventory" element={
                <RoleRoute permissionKey="inventory">
                    <DashboardLayout><Inventory /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/vehicle-documentation" element={
                <RoleRoute permissionKey="vehicle-documentation">
                    <DashboardLayout><VehicleDocumentation /></DashboardLayout>
                </RoleRoute>
            } />

            {/* ── Reports ── */}
            <Route path="/analytics" element={
                <RoleRoute permissionKey="analytics">
                    <DashboardLayout><Analytics /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/payments" element={
                <RoleRoute permissionKey="payments">
                    <DashboardLayout><Payments /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/reports" element={
                <RoleRoute permissionKey="reports">
                    <DashboardLayout><Reports /></DashboardLayout>
                </RoleRoute>
            } />

            {/* ── System ── */}
            <Route path="/audit-log" element={
                <RoleRoute permissionKey="audit-log">
                    <DashboardLayout><AuditLog /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/user-logs" element={
                <RoleRoute permissionKey="user-logs">
                    <DashboardLayout><UserLogs /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/transaction-logs" element={
                <RoleRoute permissionKey="transaction-logs">
                    <DashboardLayout><TransactionLogs /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/settings" element={
                <RoleRoute permissionKey="settings">
                    <DashboardLayout><Settings /></DashboardLayout>
                </RoleRoute>
            } />

            {/* ── Archives ── */}
            <Route path="/archives/user-log" element={
                <RoleRoute permissionKey="archives/user-log">
                    <DashboardLayout><UserLogArchivePage /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/archives/payments" element={
                <RoleRoute permissionKey="archives/payments">
                    <DashboardLayout><PaymentsArchivePage /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/archives/bookings" element={
                <RoleRoute permissionKey="archives/bookings">
                    <DashboardLayout><BookingArchivePage /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/archives/transaction-log" element={
                <RoleRoute permissionKey="archives/transaction-log">
                    <DashboardLayout><TransactionLogArchivePage /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/archives/audit-log" element={
                <RoleRoute permissionKey="archives/audit-log">
                    <DashboardLayout><AuditLogsArchivePage /></DashboardLayout>
                </RoleRoute>
            } />
            <Route path="/archives/reviews" element={
                <RoleRoute permissionKey="archives/reviews">
                    <DashboardLayout><ReviewsArchivePage /></DashboardLayout>
                </RoleRoute>
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
