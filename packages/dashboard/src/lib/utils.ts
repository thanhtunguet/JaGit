import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(tokens: number): string {
  if (tokens < 10000) {
    return tokens.toLocaleString();
  }

  const format = (val: number, suffix: string) => {
    const intDigits = Math.trunc(val).toString().length;
    let fractionDigits = 3;
    if (intDigits === 2) fractionDigits = 2;
    else if (intDigits >= 3) fractionDigits = 1;
    
    return `${val.toLocaleString(undefined, { maximumFractionDigits: fractionDigits })}${suffix}`;
  };

  if (tokens >= 1_000_000_000) {
    return format(tokens / 1_000_000_000, "B");
  }
  if (tokens >= 1_000_000) {
    return format(tokens / 1_000_000, "M");
  }
  return format(tokens / 1_000, "k");
}

export function formatBaseTokens(bt: number | null): string {
  if (bt == null) return "—";
  return formatTokens(bt);
}
