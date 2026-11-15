"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS: Record<string, string[]> = {
  "/": ["What happens when I upload an invoice?", "Which test invoice should I try first?", "Why does a scanned invoice go to a person instead of being rejected?"],
  "/dashboard": ["Summarise what has been processed so far", "Why did invoices need a person?", "How much time has this saved?"],
  "/queue": ["Which item should I review first and why?", "What do I need to fix on the scanned invoice?", "What happens when I approve?"],
  "/how-it-works": ["Explain the four checks simply", "What is the difference between Reject and Review Required?", "How are duplicates caught?"],
};

export function ChatWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("chat:open", show);
    return () => window.removeEventListener("chat:open", show);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  const runId = path.startsWith("/runs/") ? path.split("/")[2] : (typeof window !== "undefined" ? (window as any).__currentRunId ?? null : null);
  const suggestions = SUGGESTIONS[path] ?? (path.startsWith("/runs/") ? ["Explain this decision in simple terms", "Which fields were hard to read?", "What should happen next with this invoice?"] : SUGGESTIONS["/"]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, page: path, run_id: runId }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setMsgs([...next, { role: "assistant", content: res.status === 401 ? "I need the demo passcode first. Enter it in the box that just opened, then ask again." : j.error ?? "Something went wrong. Please try again." }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: text }]);
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "I could not reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        data-tour="chat"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-expanded={open}
      >
        <span aria-hidden className="text-base leading-none">💬</span> {open ? "Close" : "Ask a question"}
      </button>
      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[min(560px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="font-semibold">Ask about this invoice agent</div>
            <div className="text-xs text-zinc-500">Answers come from the live data in this app. It explains; it cannot approve or change anything.</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-zinc-600">Try one of these:</p>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50">{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"}`}>
                  {m.content || <span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" /></span>}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 border-t border-zinc-100 p-3">
            <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask in plain English…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <button disabled={busy || !input.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
