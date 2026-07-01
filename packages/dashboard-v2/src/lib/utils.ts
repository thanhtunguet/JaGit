import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(n: number): string {
  if (n === 0) return "0";
  const isNegative = n < 0;
  const absN = Math.abs(n);

  if (absN < 1000) {
    return (isNegative ? "-" : "") + absN.toLocaleString();
  }

  const suffixes = ["", "k", "M", "B"];
  let exponent = Math.floor(Math.log10(absN) / 3);
  if (exponent >= suffixes.length) {
    exponent = suffixes.length - 1;
  }

  let shortValue = absN / Math.pow(1000, exponent);
  let intDigits = Math.floor(shortValue).toString().length;
  let fractionDigits = intDigits === 1 ? 3 : intDigits === 2 ? 2 : intDigits === 3 ? 1 : 0;

  let roundedValue = parseFloat(shortValue.toFixed(fractionDigits));

  if (roundedValue >= 1000 && exponent < suffixes.length - 1) {
    exponent++;
    shortValue = absN / Math.pow(1000, exponent);
    intDigits = Math.floor(shortValue).toString().length;
    fractionDigits = intDigits === 1 ? 3 : intDigits === 2 ? 2 : intDigits === 3 ? 1 : 0;
    roundedValue = parseFloat(shortValue.toFixed(fractionDigits));
  }

  return (isNegative ? "-" : "") + roundedValue.toString() + suffixes[exponent];
}

export function formatBaseTokens(bt: number | null): string {
  if (bt == null) return "—";
  if (bt === 0) return "0 BT";
  const isNegative = bt < 0;
  const absN = Math.abs(bt);

  if (absN < 1000) {
    return (isNegative ? "-" : "") + absN.toLocaleString() + " BT";
  }

  const suffixes = ["", "k", "M", "B"];
  let exponent = Math.floor(Math.log10(absN) / 3);
  if (exponent >= suffixes.length) {
    exponent = suffixes.length - 1;
  }

  let shortValue = absN / Math.pow(1000, exponent);
  let intDigits = Math.floor(shortValue).toString().length;
  let fractionDigits = intDigits === 1 ? 3 : intDigits === 2 ? 2 : intDigits === 3 ? 1 : 0;

  let roundedValue = parseFloat(shortValue.toFixed(fractionDigits));

  if (roundedValue >= 1000 && exponent < suffixes.length - 1) {
    exponent++;
    shortValue = absN / Math.pow(1000, exponent);
    intDigits = Math.floor(shortValue).toString().length;
    fractionDigits = intDigits === 1 ? 3 : intDigits === 2 ? 2 : intDigits === 3 ? 1 : 0;
    roundedValue = parseFloat(shortValue.toFixed(fractionDigits));
  }

  return (isNegative ? "-" : "") + roundedValue.toString() + suffixes[exponent] + " BT";
}
