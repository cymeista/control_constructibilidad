import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

/** true cuando el viewport es menor que Tailwind `md` (768px). */
export function useIsBelowMd(): boolean {
  const [isBelowMd, setIsBelowMd] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsBelowMd(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isBelowMd;
}
