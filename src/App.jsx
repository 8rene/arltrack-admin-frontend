import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import AuthPage from "./pages/AuthPage";
import Sidebar, { NAV_SECTIONS } from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import DriverDashboard from "./pages/DriverDashboard";
import Bookings from "./pages/Bookings";
import Fleet from "./pages/Fleet";
import Users from "./pages/Users";
import CarTracking from "./pages/CarTracking/CarTracking";
import DeviceTrack from "./pages/DeviceTrack";
import DriverDispatch from "./pages/DriverDispatch";
import Maintenance from "./pages/Maintenance";
import Inventory from "./pages/Inventory";
import Analytics from "./pages/Analytics";
import Payments from "./pages/Payments";
import RefundRequests from "./pages/RefundRequests";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";
import UserLogs from "./pages/UserLogs";
import TransactionLogs from "./pages/TransactionLogs";
import Settings from "./pages/Settings";
import VehicleDocumentation from "./pages/VehicleDocs";
import UserLogArchivePage from "./pages/UserLogArchivePage";
import PaymentsArchivePage from "./pages/PaymentsArchivePage";
import UserArchivePage from "./pages/UserArchivePage";
import BookingArchivePage from "./pages/BookingArchivePage";
import TransactionLogArchivePage from "./pages/TransactionLogArchivePage";
import AuditLogsArchivePage from "./pages/AuditLogsArchivePage";
import ReviewsArchivePage from "./pages/ReviewsArchivePage";
import Reviews from "./pages/Reviews";
import MyTrips from "./pages/MyTrips";
import Account from "./pages/Account";
import { canAccess, homePathFor } from "./config/pagePermissions";
import PreviewRoleBanner from "./components/PreviewRoleBanner";

// Wraps any route — redirects to /login if not authenticated, and to the
// user's own home page if they're logged in but their role can't access
// this particular path (so a hidden sidebar link can't be bypassed by
// just typing the URL directly).
//
// Uses effectiveRole (real role, or an Admin's active "view as" preview —
// see AuthContext.jsx) so previewing e.g. Driver also blocks navigating to
// pages Driver can't see, making the preview feel real. This never changes
// actual backend authorization — only which frontend routes are reachable.
function ProtectedRoute({ children }) {
    const { user, effectiveRole } = useAuth();
    const { pathname } = useLocation();
    if (!user) return <Navigate to="/login" replace />;
    if (!canAccess(effectiveRole, pathname)) {
        return <Navigate to={homePathFor(effectiveRole)} replace />;
    }
    return children;
}

// Path -> { label, group } built straight from the sidebar's own nav
// structure, so header titles can never drift out of sync with it.
const PAGE_META = Object.fromEntries(
    NAV_SECTIONS.flatMap((section) =>
        section.items.map((item) => [item.path, { label: item.label, group: section.group }])
    )
);

// The main dashboard shell (sidebar + header + page content)
function DashboardLayout({ children }) {
    const { pathname } = useLocation();
    const meta = PAGE_META[pathname];
    // Main pages show their own name (Dashboard, Bookings, ...). Everything
    // else (Operations, Reports, System, Archives) shows the section name,
    // since those pages are sub-items of that section rather than top-level.
    const title = !meta ? "Dashboard" : meta.group === "Main" ? meta.label : meta.group;

    return (
        <div className="flex min-h-screen bg-arl-light">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header title={title} />
                <PreviewRoleBanner />
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}

function AppRoutes() {
    const { user, effectiveRole } = useAuth();

    return (
        <Routes>
            {/* Public route */}
            <Route
                path="/login"
                element={user ? <Navigate to={homePathFor(user.role)} replace /> : <AuthPage />}
            />

            {/* Protected routes */}
            <Route
                path="/"
                element={<Navigate to={user ? homePathFor(user.role) : "/login"} replace />}
            />

            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <DashboardLayout>
                        {effectiveRole === "Driver" ? <DriverDashboard /> : <Dashboard />}
                    </DashboardLayout>
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
            <Route path="/users" element={
                <ProtectedRoute>
                    <DashboardLayout><Users /></DashboardLayout>
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
            <Route path="/driver-dispatch" element={
                <ProtectedRoute>
                    <DashboardLayout><DriverDispatch /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/maintenance" element={
                <ProtectedRoute>
                    <DashboardLayout><Maintenance /></DashboardLayout>
                </ProtectedRoute>
            } />
            {/* Inventory = the parts catalog (name/type/serial), edited
                occasionally — grouped under "System" in the sidebar.
                Vehicle Documentation below is the per-trip Good/Damaged
                status + photos + Past Trips history. Deliberately kept
                separate rather than merged into one page or into Settings. */}
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
            <Route path="/refund-requests" element={
                <ProtectedRoute>
                    <DashboardLayout><RefundRequests /></DashboardLayout>
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
            <Route path="/reviews" element={
                <ProtectedRoute>
                    <DashboardLayout><Reviews /></DashboardLayout>
                </ProtectedRoute>
            } />
            <Route path="/archives/users" element={
                <ProtectedRoute>
                    <DashboardLayout><UserArchivePage /></DashboardLayout>
                </ProtectedRoute>
            } />

            {/* Driver routes */}
            <Route path="/my-trips" element={
                <ProtectedRoute>
                    <DashboardLayout><MyTrips /></DashboardLayout>
                </ProtectedRoute>
            } />
            {/* History is now a tab on /my-trips (?tab=history) — this just
                catches old bookmarks/links to the page that used to live here. */}
            <Route path="/my-trips/history" element={<Navigate to="/my-trips?tab=history" replace />} />

            {/* Old bookmarks/links to the page that used to live here — Profile was renamed to Account. */}
            <Route path="/profile" element={<Navigate to="/account" replace />} />

            {/* Shared by every role */}
            <Route path="/account" element={
                <ProtectedRoute>
                    <DashboardLayout><Account /></DashboardLayout>
                </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to={user ? homePathFor(user.role) : "/login"} replace />} />
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