// Vehicles — empty for now. Receives the selected period from Reports.jsx:
//   { period, year, month, week, day }   period = daily | weekly | monthly | yearly, month 1-12
export default function Vehicles({ period, year, month, week, day }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center text-sm text-gray-400">
      Vehicles — nothing here yet.
    </div>
  );
}