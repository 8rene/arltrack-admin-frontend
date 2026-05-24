import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SYMBOLS = { PHP: "₱", USD: "$", EUR: "€" };

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem("preferredCurrency") || "PHP"
  );
  const [rates, setRates] = useState({ PHP: 1, USD: null, EUR: null });
  const [ratesLoading, setRatesLoading] = useState(true);

  // Fetch live rates once on mount
  useEffect(() => {
    setRatesLoading(true);
    fetch("https://open.er-api.com/v6/latest/PHP")
      .then((r) => r.json())
      .then((data) => {
        if (data?.rates) {
          setRates({ PHP: 1, USD: data.rates.USD, EUR: data.rates.EUR });
        }
      })
      .catch(() => {})
      .finally(() => setRatesLoading(false));
  }, []);

  const setCurrency = (c) => {
    setCurrencyState(c);
    localStorage.setItem("preferredCurrency", c);
    // Dispatch custom event so any component can react
    window.dispatchEvent(new CustomEvent("currencyChange", { detail: c }));
  };

  // Convert a PHP amount to the selected currency
  const convert = useCallback((phpAmount) => {
    const n = Number(phpAmount) || 0;
    if (currency === "PHP" || !rates[currency]) return n;
    return n * rates[currency];
  }, [currency, rates]);

  // Format a PHP amount in the selected currency
  const fmt = useCallback((phpAmount) => {
    const n = convert(phpAmount);
    const sym = SYMBOLS[currency] || "₱";
    if (currency === "PHP") {
      return `${sym}${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currency, convert]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, ratesLoading, convert, fmt, SYMBOLS }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
