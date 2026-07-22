import { useState } from "react";
import { NavLink } from "react-router-dom";

const nav = [
  {
    group: "Main",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        ),
      },
      {
        label: "Bookings",
        path: "/bookings",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
      },
      {
        label: "Fleet Management",
        path: "/fleet",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M3 11l2-5h14l2 5M5 11h14M5 17v2m14-2v2" />
          </svg>
        ),
      },
      {
        label: "Customers",
        path: "/customers",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m10-4a4 4 0 11-8 0 4 4 0 018 0zM7 10a4 4 0 110-8 4 4 0 010 8z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Operations",
    items: [
      {
        label: "Car Tracking",
        path: "/car-tracking",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        ),
      },
      {
        label: "GPS Setup",
        path: "/gps-setup",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <ellipse cx="12" cy="12" rx="3" ry="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4M3.5 3.5a13 13 0 000 17M20.5 3.5a13 13 0 010 17" />
          </svg>
        ),
      },
      {
        label: "Maintenance",
        path: "/maintenance",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        ),
      },
      {
        label: "Inventory",
        path: "/inventory",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
          </svg>
        ),
      },
      {
        label: "Vehicle Documentation",
        path: "/vehicle-documentation",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Reports",
    items: [
      {
        label: "Analytics",
        path: "/analytics",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        label: "Payments",
        path: "/payments",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        ),
      },
      {
        label: "Reports",
        path: "/reports",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "System",
    items: [
      {
        label: "Audit Log",
        path: "/audit-log",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
      },
      {
        label: "User Logs",
        path: "/user-logs",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        label: "Transaction Logs",
        path: "/transaction-logs",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 2.5 2 2.5-2 3.5 2z" />
          </svg>
        ),
      },
      {
        label: "Settings",
        path: "/settings",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Archives",
    items: [
      {
        label: "User Log Archive",
        path: "/archives/user-log",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
      {
        label: "Payments Archive",
        path: "/archives/payments",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
      {
        label: "Booking Archive",
        path: "/archives/bookings",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
      {
        label: "Transaction Log Archive",
        path: "/archives/transaction-log",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
      {
        label: "Audit Logs Archive",
        path: "/archives/audit-log",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
      {
        label: "Reviews Archive",
        path: "/archives/reviews",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      id="sidebar"
      className={`h-screen flex-shrink-0 sticky top-0 flex flex-col px-3 py-5 transition-all duration-300 ease-smooth ${collapsed ? "w-20" : "w-64"
        }`}
      style={{
        background:
          "linear-gradient(180deg, #16526a 0%, #1A5F7A 100%)",
      }}
    >
      {/* Top */}
      <div
        id="sidebarTop"
        className="flex items-center justify-between mb-8"
      >
        {/* Logo */}
        <div
          id="sidebarLogo"
          className={`${collapsed ? "hidden" : "block"} px-2`}
        >
          <h1 className="text-arl-cta text-2xl font-bold font-display leading-tight">
            ARL{" "}
            <span className="text-arl-light">
              Car Rental
            </span>
          </h1>

          <p className="text-arl-secondary text-xs tracking-[0.2em] uppercase mt-1 opacity-70">
            Management System
          </p>
        </div>

        {/* Mini Logo */}
        {collapsed && (
          <div
            id="sidebarMiniLogo"
            className="mx-auto text-xl font-bold text-arl-cta font-display outline-white/20 outline-2 outline-offset-2 rounded-lg px-1"
          >
            ARL
          </div>
        )}

        {/* Toggle */}
        <button
          id="sidebarToggleBtn"
          onClick={() => setCollapsed(!collapsed)}
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition border border-white/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""
              }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {/* Box */}
            <rect x="3" y="4" width="18" height="16" rx="2" />

            {/* Arrow (sidebar collapse indicator) */}
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14 8l-4 4 4 4"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav
        id="sidebarNav"
        className="flex flex-col gap-6 flex-1 overflow-y-auto scrollbar-hide"
      >
        {nav.map((section) => (
          <div key={section.group}>
            {/* Group Label */}
            {!collapsed && (
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-white/40 mb-2 px-2">
                {section.group}
              </p>
            )}

            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      [
                        "flex items-center rounded-xl text-sm font-medium transition-all duration-200",
                        collapsed
                          ? "justify-center px-2 py-3"
                          : "gap-3 px-3 py-2.5",
                        isActive
                          ? "bg-white/15 text-white shadow-sm"
                          : "text-white/60 hover:bg-white/10 hover:text-white",
                      ].join(" ")
                    }
                    title={collapsed ? item.label : ""}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={
                            isActive
                              ? "text-arl-secondary"
                              : "text-white/50"
                          }
                        >
                          {item.icon}
                        </span>

                        {!collapsed && item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        id="sidebarFooter"
        className="pt-4 mt-4 border-t border-white/10"
      >
        {!collapsed ? (
          <p className="text-xs text-white/40 px-2">
            ARL Admin Panel v1.0
          </p>
        ) : (
          <div className="text-center text-white/30 text-xs">
            v1
          </div>
        )}
      </div>
    </aside>
  );
}