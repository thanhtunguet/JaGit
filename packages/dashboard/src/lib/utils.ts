import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(tokens: number): string {
  if (tokens < 10000) {
    return tokens.toLocaleString();
  }
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}M`;
  }
  return `${(tokens / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}k`;
}
