// Revenue & Payments — empty for now. Receives the selected period from Reports.jsx:
//   { period, year, month, week, day }   period = daily | weekly | monthly | yearly, month 1-12
export default function RevenuePayments({ period, year, month, week, day }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center text-sm text-gray-400">
      Revenue & Payments — nothing here yet.
    </div>
  );
}