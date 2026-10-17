import { useState } from "react";
import PaymentEntriesPanel from "./PaymentEntriesPanel";
import { prettyLabel, formatValue } from "./ArchiveDetailModal";

// Everything archived together with one booking, shown as tabs inside the booking's View dialog.
// Each tab loads the first time it is opened and is kept, so switching back does not refetch.
// Read-only: Restore and permanent delete happen on the booking itself.

const money = (n) => `\u20b1${(Number(n) || 0).toLocaleString("en-PH")}`;

// kind: "single" = one record, "inspection" = four groups of rows, "list" = several records with a Details toggle.
const TABS = [
  {
    key: "payment", label: "Payment", endpoint: "payment", kind: "single",
    empty: "No linked payment archive found for this booking.",
    labels: { paymentsArchivesId: "Archive ID", bookingID: "Booking ID", userID: "User ID" },
  },
  {
    key: "inspection", label: "Inspection", endpoint: "vehicle-inspection", kind: "inspection",
    empty: "No vehicle inspection records found for this booking.",
  },
  {
    key: "session", label: "Session", endpoint: "booking-session", kind: "single",
    empty: "No linked booking session archive found for this booking.",
    labels: { bookingSessionArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID" },
  },
  {
    key: "penalties", label: "Penalties", endpoint: "penalties", kind: "list",
    summary: (r) => ({ main: r.penaltyID || r.id, sub: [r.status, money(r.amount)] }),
    labels: { penaltyArchivesId: "Archive ID", bookingID: "Booking ID", paymentID: "Payment ID", userID: "User ID", carID: "Car ID" },
  },
  {
    key: "refunds", label: "Refunds", endpoint: "refund-requests", kind: "list",
    summary: (r) => ({ main: r.refundRequestID || r.id, sub: [r.status, money(r.toRefundAmount)] }),
    labels: { refundArchivesId: "Archive ID", bookingID: "Booking ID", paymentID: "Payment ID" },
  },
  {
    key: "reviews", label: "Reviews", endpoint: "reviews", kind: "list",
    summary: (r) => ({ main: `${r.rating ?? "—"} / 5`, sub: [r.comment ? String(r.comment).slice(0, 80) : "No comment"] }),
    labels: { reviewsArchivesID: "Archive ID", bookingID: "Booking ID", userID: "User ID", carID: "Car ID" },
  },
  {
    key: "maintenance", label: "Maintenance", endpoint: "maintenance", kind: "list",
    summary: (r) => ({ main: r.description || r.maintenanceID || r.id, sub: [r.status, r.basis, money(r.totalCost)] }),
    labels: { maintenanceArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID" },
  },
];

const INSPECTION_GROUPS = [
  ["inventoryBeforeTrip", "Parts — Before Trip"],
  ["inventoryAfterTrip", "Parts — After Trip"],
  ["vehicleDocumentationBeforeTrip", "Photos — Before Trip"],
  ["vehicleDocumentationAfterTrip", "Photos — After Trip"],
];

function Fields({ record, labels = {} }) {
  const entries = Object.entries(record || {});
  if (entries.length === 0) return <p className="text-sm text-gray-400">No details available.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex flex-col gap-0.5 border-b border-gray-50 pb-2 last:border-0 last:pb-0">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{labels[key] || prettyLabel(key)}</span>
          <span className="text-sm text-gray-700 break-all whitespace-pre-wrap">{formatValue(key, val)}</span>
        </div>
      ))}
    </div>
  );
}

function ListRows({ tab, rows }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const id = r.id ?? i;
        const { main, sub = [] } = tab.summary(r);
        const isOpen = openId === id;
        return (
          <div key={id} className="border border-gray-100 rounded-xl bg-gray-50/60">
            <div className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{main}</p>
                {sub.filter(Boolean).length > 0 && (
                  <p className="text-xs text-gray-500 truncate">{sub.filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 whitespace-nowrap"
              >
                {isOpen ? "Hide" : "Details"}
              </button>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-white rounded-b-xl">
                <Fields record={r} labels={tab.labels} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabBody({ tab, state }) {
  if (!state || state.loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (state.error) return <p className="text-sm text-red-500">{state.error}</p>;

  if (tab.kind === "single") {
    if (!state.data) return <p className="text-sm text-gray-400">{state.message || tab.empty}</p>;
    return (
      <div className="space-y-4">
        <Fields record={state.data} labels={tab.labels} />
        {tab.key === "payment" && (
          <div className="pt-3 border-t border-gray-100">
            <PaymentEntriesPanel
              query={{ paymentID: state.data.paymentID || state.data.originalId }}
              title="All money movements on this payment"
            />
          </div>
        )}
      </div>
    );
  }

  if (tab.kind === "inspection") {
    const data = state.data || {};
    const groups = INSPECTION_GROUPS.filter(([key]) => (data[key] || []).length > 0);
    if (groups.length === 0) return <p className="text-sm text-gray-400">{state.message || tab.empty}</p>;
    return (
      <div className="space-y-5">
        {groups.map(([key, label]) => (
          <div key={key}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
            <div className="space-y-2">
              {data[key].map((row, i) => (
                <div key={row.id ?? i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60 text-xs text-gray-700">
                  <pre className="whitespace-pre-wrap break-all font-sans">{JSON.stringify(row, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const rows = Array.isArray(state.data) ? state.data : [];
  if (rows.length === 0) return <p className="text-sm text-gray-400">{state.message || "Nothing was archived with this booking."}</p>;
  return <ListRows tab={tab} rows={rows} />;
}

export default function BookingArchiveLinkedTabs({ bookingArchivesId, token }) {
  const [active, setActive] = useState(null);
  const [cache, setCache]   = useState({}); // tab key -> { loading, data, error, message }

  const load = async (tab) => {
    setCache((c) => ({ ...c, [tab.key]: { loading: true } }));
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}/${tab.endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { /* HTML error page from the server */ }
      if (!res.ok) throw new Error(json.message || `Could not load (${res.status}).`);
      setCache((c) => ({ ...c, [tab.key]: { loading: false, data: json.data ?? null, message: json.message } }));
    } catch (err) {
      setCache((c) => ({ ...c, [tab.key]: { loading: false, error: err.message } }));
    }
  };

  const select = (tab) => {
    setActive(tab.key);
    const cached = cache[tab.key];
    if (!cached || cached.error) load(tab); // load once; retry only after a failure
  };

  const activeTab = TABS.find((t) => t.key === active);

  return (
    <div className="pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Archived with this booking</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => select(tab)}
            className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap ${
              active === tab.key
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab ? (
        <TabBody tab={activeTab} state={cache[activeTab.key]} />
      ) : (
        <p className="text-sm text-gray-400">Pick a tab to see what was archived with this booking.</p>
      )}
    </div>
  );
}