"use client";

const KEY = "demo-passcode";

export function getPasscode(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function setPasscode(v: string) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
}

/** Fetch with the demo passcode. On 401, asks the global passcode dialog to open. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-demo-passcode", getPasscode());
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("need-passcode"));
  return res;
}
