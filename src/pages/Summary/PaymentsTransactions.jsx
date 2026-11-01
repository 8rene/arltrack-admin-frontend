// Payments & Transactions — empty for now. Question this tab will answer: "Where did the cash go?"
// Receives the selected period from Reports.jsx: { period, year, month, week, day }
//   period = daily | weekly | monthly | yearly, month 1-12
export default function PaymentsTransactions({ period, year, month, week, day }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center text-sm text-gray-400">
      Payments & Transactions — nothing here yet.
    </div>
  );
}