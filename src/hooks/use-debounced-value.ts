import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stopped changing for `delay` ms. Used for
 * search inputs and filters so typing never triggers a render/fetch per keypress.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
