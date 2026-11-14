"use client";

const KEY = "demo-passcode";

export function getPasscode(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function setPasscode(v: string) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
}
export function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-demo-passcode", getPasscode());
  return fetch(path, { ...init, headers });
}
