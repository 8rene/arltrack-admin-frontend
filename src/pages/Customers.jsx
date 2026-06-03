import { useState, useEffect, useCallback } from "react";
import {
  collection, getDocs, query, where, doc, updateDoc,
  deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../fireabase";

const CUSTOMER_ROLE_ID = "9vD6ZU1s2qUtmyu0RXKD";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  Users: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  CheckCircle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Moon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  IdCard: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M14 9h4M14 12h4M14 15h2" />
    </svg>
  ),
  Flag: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  Refresh: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Trash: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  ),
  Edit: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  ArrowRight: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Close: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Check: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  AlertTriangle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Document: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
};

function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Customers() {
  const [tab, setTab]         = useState("customers");
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [userSnap, detailsSnap, addressSnap, docSnap, bookingsSnap] = await Promise.all([
        getDocs(query(collection(db, "user"), where("roleID", "==", CUSTOMER_ROLE_ID))),
        getDocs(collection(db, "userDetails")),
        getDocs(collection(db, "userAddress")),
        getDocs(collection(db, "userDocument")),
        getDocs(collection(db, "bookings")),
      ]);

      const detailsMap = Object.fromEntries(detailsSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const addressMap = Object.fromEntries(addressSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const docMap     = Object.fromEntries(docSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const bookingCount = {};
      bookingsSnap.docs.forEach(d => {
        const uid = d.data().userID;
        if (uid) bookingCount[uid] = (bookingCount[uid] || 0) + 1;
      });

      const merged = userSnap.docs.map(d => ({
        id: d.id, ...d.data(),
        details:      detailsMap[d.id] || {},
        address:      addressMap[d.id] || {},
        document:     docMap[d.id]     || {},
        bookingCount: bookingCount[d.id] || 0,
      }));

      setUsers(merged);
    } catch (e) {
      console.error("Customers fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const pendingDocs = users
    .filter(u => u.isVerified !== true)
    .sort((a, b) => {
      const aT = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const bT = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return bT - aT;
    });
  const verifiedCount = users.filter(u => u.isVerified === true).length;
  const flaggedCount  = users.filter(u => u.isFlagged === true).length;

  const RefreshBtn = () => (
    <button onClick={fetchUsers}
      className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
      <Icons.Refresh className="w-4 h-4" />
      Refresh
    </button>
  );

  return (
    <div className="p-4 space-y-5 font-sans">
      {/* STAT CARDS */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard title="Total"       value={users.length}  Icon={Icons.Users}       color="teal" />
        <StatCard title="Active"      value={users.filter(u => u.status?.toLowerCase() === "active").length}   Icon={Icons.CheckCircle} color="green" />
        <StatCard title="Inactive"    value={users.filter(u => u.status?.toLowerCase() === "inactive").length} Icon={Icons.Moon}        color="gray" />
        <StatCard title="ID Verified" value={verifiedCount} Icon={Icons.IdCard}      color="blue" />
        <StatCard title="Flagged"     value={flaggedCount}  Icon={Icons.Flag}        color="red" />
      </div>

      {/* TABS + REFRESH */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={() => setTab("customers")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === "customers" ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            <Icons.Users className="w-4 h-4" />
            Customers
            <span className="ml-1 opacity-70">{users.length}</span>
          </button>
          <button onClick={() => setTab("documents")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === "documents" ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            <Icons.IdCard className="w-4 h-4" />
            Customer Document
            <span className="ml-1 opacity-70 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">{pendingDocs.length}</span>
          </button>
        </div>
        <RefreshBtn />
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="bg-white rounded-2xl border p-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : tab === "customers" ? (
        <CustomersTab users={users} onRefresh={fetchUsers} />
      ) : (
        <DocumentsTab users={pendingDocs} onRefresh={fetchUsers} />
      )}
    </div>
  );
}

// ─── CUSTOMERS TAB ────────────────────────────────────────────────────────────
function CustomersTab({ users, onRefresh }) {
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilter] = useState("All");
  const [detailUser, setDetailUser]       = useState(null);
  const [editUser, setEditUser]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleDelete = async (user) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Delete failed");
      }
      setConfirmDelete(null);
      onRefresh();
    } catch (e) { console.error("Delete/archive error:", e); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const fullName = `${u.details?.firstName || ""} ${u.details?.lastName || ""}`.toLowerCase();
    const matchSearch = !search || fullName.includes(q) || (u.email || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "All" || (u.status || "").toLowerCase() === filterStatus || (filterStatus === "flagged" && u.isFlagged);
    return matchSearch && matchStatus;
  });

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400" />
        {["All", "active", "inactive", "locked", "flagged"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${filterStatus === s ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">All Customers <span className="text-gray-400 text-sm font-normal">({filtered.length})</span></h2>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-5 py-3 text-left">Contact</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  <th className="px-5 py-3 text-left">Bookings</th>
                  <th className="px-5 py-3 text-left">Account</th>
                  <th className="px-5 py-3 text-left">Joined</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const fn = u.details?.firstName || "";
                  const ln = u.details?.lastName  || "";
                  const fullName = `${fn} ${ln}`.trim() || u.username || u.email || "—";
                  const initials = ((fn[0] || u.email?.[0] || "?") + (ln[0] || "")).toUpperCase();
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 flex items-center gap-1">
                              {fullName}
                              {u.isFlagged && (
                                <Icons.Flag className="w-3.5 h-3.5 text-red-500 fill-red-500 stroke-red-500" />
                              )}
                            </p>
                            <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-gray-700">{u.phone || "—"}</p>
                        <p className="text-xs text-gray-400">{u.email || "—"}</p>
                      </td>
                      <td className="px-5 py-3">
                        {u.isVerified
                          ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 border border-green-200 text-green-700 font-medium">
                              <Icons.Check className="w-3 h-3" /> Verified
                            </span>
                          : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 inline-block" />Pending
                            </span>
                        }
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-700">{u.bookingCount}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium capitalize text-black ${
                          u.status?.toLowerCase() === "active"   ? "bg-blue-50 border border-blue-200" :
                          u.status?.toLowerCase() === "locked"   ? "bg-red-50 border border-red-200" :
                          "bg-gray-50 border border-gray-200"
                        }`}>{u.status || "—"}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setConfirmDelete(u)}
                            className="p-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            <Icons.Edit className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button onClick={() => setDetailUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
                            Details
                            <Icons.ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailUser    && <ViewDetailsModal user={detailUser} onClose={() => setDetailUser(null)} onEdit={() => { setDetailUser(null); setEditUser(detailUser); }} />}
      {editUser      && <EditUserModal   user={editUser}   onClose={() => setEditUser(null)}   onSaved={() => { setEditUser(null); onRefresh(); }} />}
      {confirmDelete && <ConfirmDeleteModal name={confirmDelete.details?.firstName || confirmDelete.username || "this user"} onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </>
  );
}

// ─── DOCUMENTS TAB ────────────────────────────────────────────────────────────
function DocumentsTab({ users, onRefresh }) {
  const [detailUser, setDetailUser] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);

  const handleVerify = async (user, approve) => {
    setLoadingId(user.id);
    try {
      await updateDoc(doc(db, "user", user.id), { isVerified: approve });
      onRefresh();
    } catch (e) { console.error("Verify error:", e); }
    finally { setLoadingId(null); }
  };

  const hasUploads = (u) => {
    const imgs = getDocImages(u.document || {});
    return Object.values(imgs).some(v => v && v.trim() !== "");
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">Pending ID Verifications <span className="text-gray-400 text-sm font-normal">({users.length})</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">Customers awaiting ID approval</p>
        </div>
        {users.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <Icons.CheckCircle className="w-7 h-7 text-green-500" />
              </div>
            </div>
            <p>No pending verifications</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-5 py-3 text-left">Document Type</th>
                  <th className="px-5 py-3 text-left">Document No.</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  <th className="px-5 py-3 text-left">Flagged</th>
                  <th className="px-5 py-3 text-left">Submitted</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const fn = u.details?.firstName || "";
                  const ln = u.details?.lastName  || "";
                  const fullName = `${fn} ${ln}`.trim() || u.username || u.email || "—";
                  const initials = ((fn[0] || u.email?.[0] || "?") + (ln[0] || "")).toUpperCase();
                  const uploaded = hasUploads(u);
                  const isLoading = loadingId === u.id;

                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{initials}</div>
                          <div>
                            <p className="font-semibold text-gray-800">{fullName}</p>
                            <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentType || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentNumber || "—"}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 inline-block" />Pending
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.isFlagged
                          ? <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-red-50 border border-red-200 text-black font-medium">
                              <Icons.Flag className="w-3 h-3 text-red-500 fill-red-500 stroke-red-500" />
                              Flagged
                            </span>
                          : <span className="text-gray-400 text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.document?.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setDetailUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            View IDs
                            <Icons.ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleVerify(u, false)} disabled={isLoading || !uploaded}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Icons.X className="w-3.5 h-3.5" />
                            {isLoading ? "..." : "Reject"}
                          </button>
                          <button onClick={() => handleVerify(u, true)} disabled={isLoading || !uploaded}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Icons.Check className="w-3.5 h-3.5" />
                            {isLoading ? "..." : "Approve"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailUser && (
        <DocDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onApprove={() => { handleVerify(detailUser, true);  setDetailUser(null); }}
          onReject={()  => { handleVerify(detailUser, false); setDetailUser(null); }}
        />
      )}
    </>
  );
}

// ─── VIEW DETAILS MODAL ───────────────────────────────────────────────────────
function ViewDetailsModal({ user, onClose, onEdit }) {
  const det  = user.details  || {};
  const addr = user.address  || {};
  const docu = user.document || {};
  const fullName = `${det.firstName || ""} ${det.middleName ? det.middleName + " " : ""}${det.lastName || ""}${det.suffix ? " " + det.suffix : ""}`.trim() || user.username || "—";

  const Field = ({ label, value }) => (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
  const Section = ({ title, children }) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2">
              {fullName}
              {user.isFlagged && <Icons.Flag className="w-4 h-4 text-red-500 fill-red-500 stroke-red-500" />}
            </h2>
            <p className="text-sm text-gray-400">@{user.username || "—"} · {user.email}</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">
              <Icons.Edit className="w-4 h-4" />
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-6">
          <Section title="Account">
            <Field label="Email"     value={user.email} />
            <Field label="Phone"     value={user.phone} />
            <Field label="Username"  value={user.username} />
            <Field label="Status"    value={user.status} />
            <Field label="ID Status" value={user.isVerified ? "✓ Verified" : "Pending"} />
            <Field label="Flagged"   value={user.isFlagged ? "Yes" : "No"} />
            <Field label="Joined"    value={fmtDate(user.createdAt)} />
          </Section>
          <Section title="Personal Details">
            <Field label="First Name"  value={det.firstName} />
            <Field label="Middle Name" value={det.middleName} />
            <Field label="Last Name"   value={det.lastName} />
            <Field label="Suffix"      value={det.suffix} />
            <Field label="Birth Date"  value={det.birthDate ? fmtDate(det.birthDate) : "—"} />
          </Section>
          <Section title="Address">
            <Field label="Street"       value={addr.street} />
            <Field label="Barangay"     value={addr.barangay} />
            <Field label="Municipality" value={addr.municipality} />
            <Field label="City"         value={addr.city} />
            <Field label="Province"     value={addr.province} />
            <Field label="Postal Code"  value={addr.postalCode} />
            <Field label="Village"      value={addr.village} />
            <Field label="Zip Code"     value={addr.zipCode} />
          </Section>
          <Section title="Document Info">
            <Field label="Document Type"   value={docu.documentType} />
            <Field label="Document Number" value={docu.documentNumber} />
            <Field label="ID Status"       value={user.isVerified ? "✓ Verified" : "Pending"} />
          </Section>
          {(() => {
            const imgs = getDocImages(docu);
            const hasAny = Object.values(imgs).some(v => v && v.trim() !== "");
            if (!hasAny) return null;
            return (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Uploaded Documents</h3>
                <div className="grid grid-cols-2 gap-3">
                  <DocImg label="Driver License"  url={imgs.driverLicense} />
                  <DocImg label="Government ID"   url={imgs.governmentId} />
                  <DocImg label="Document Image"  url={imgs.documentImage} />
                  <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function DocImg({ label, url }) {
  if (!url || (typeof url === "string" && url.trim() === "")) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <img src={url} alt={label} className="w-full h-36 object-cover rounded-xl border"
        onError={e => { e.target.style.display="none"; e.target.nextSibling && (e.target.nextSibling.style.display="flex"); }}
      />
      <div style={{display:"none"}} className="w-full h-36 border rounded-xl items-center justify-center text-xs text-gray-400 bg-gray-50">
        Could not load image
      </div>
    </div>
  );
}

function getDocImages(docu) {
  if (!docu) return {};
  return {
    driverLicense: docu.driverLicenseUrl || "",
    governmentId:  docu.governmentIdUrl  || "",
    documentImage: docu.documentImageUrl || "",
    selfieWithId:  docu.selfieWithIdUrl  || "",
  };
}

// ─── DOC DETAIL MODAL ─────────────────────────────────────────────────────────
function DocDetailModal({ user, onClose, onApprove, onReject }) {
  const det  = user.details  || {};
  const docu = user.document || {};
  const fullName = `${det.firstName || ""} ${det.lastName || ""}`.trim() || user.username || "—";
  const imgs = getDocImages(docu);
  const hasUploads = Object.values(imgs).some(v => v && v.trim() !== "");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{fullName}</h2>
            <p className="text-sm text-gray-400">@{user.username || "—"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[["Document Type", docu.documentType], ["Document No.", docu.documentNumber], ["ID Status", "Pending"]].map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-medium text-gray-800 mt-0.5">{val || "—"}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Uploaded IDs</h3>
            {!hasUploads ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No documents uploaded yet</p>
            ) : (
              <div className="space-y-3">
                <DocImg label="Driver License"  url={imgs.driverLicense} />
                <DocImg label="Government ID"   url={imgs.governmentId} />
                <DocImg label="Document Image"  url={imgs.documentImage} />
                <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Close</button>
            {hasUploads && (
              <>
                <button onClick={onReject}  className="flex items-center gap-2 px-5 py-2 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50">
                  <Icons.X className="w-4 h-4" /> Reject
                </button>
                <button onClick={onApprove} className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700">
                  <Icons.Check className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT USER MODAL ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    status:    user.status    || "active",
    isFlagged: user.isFlagged || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await updateDoc(doc(db, "user", user.id), { ...form, updatedAt: serverTimestamp() });
      onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Edit Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Read-only info */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <p className="text-xs text-gray-400 font-medium mb-2">Account Info (read-only)</p>
            <p className="text-gray-600"><span className="font-medium">Email:</span> {user.email || "—"}</p>
            <p className="text-gray-600"><span className="font-medium">Phone:</span> {user.phone || "—"}</p>
            <p className="text-gray-600"><span className="font-medium">Username:</span> {user.username || "—"}</p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
            </select>
          </div>

          {/* Flagged toggle */}
          <div className="flex items-center justify-between p-3 border rounded-xl">
            <div className="flex items-center gap-2">
              <Icons.Flag className={`w-4 h-4 ${form.isFlagged ? "text-red-500 fill-red-500 stroke-red-500" : "text-gray-400"}`} />
              <div>
                <p className="text-sm font-medium text-gray-700">Flag this customer</p>
                <p className="text-xs text-gray-400">Mark as suspicious or problematic</p>
              </div>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, isFlagged: !f.isFlagged }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.isFlagged ? "bg-red-500" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.isFlagged ? "left-6" : "left-0.5"}`} />
            </button>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRM DELETE ───────────────────────────────────────────────────────────
function ConfirmDeleteModal({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <Icons.Trash className="w-7 h-7 text-red-500" />
            </div>
          </div>
          <h3 className="font-bold text-gray-800 text-lg">Delete Customer?</h3>
          <p className="text-sm text-gray-500 mt-1">
            Delete <strong>{name}</strong>? Their data will be moved to the archive and cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}  className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">Delete & Archive</button>
        </div>
      </div>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ title, value, Icon, color }) {
  const colors = {
    teal:  "bg-teal-50 text-teal-600",
    green: "bg-green-50 text-green-600",
    gray:  "bg-gray-100 text-gray-500",
    blue:  "bg-blue-50 text-blue-600",
    red:   "bg-red-50 text-red-500",
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${colors[color] || colors.gray}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{title}</div>
      </div>
    </div>
  );
}