"use client";

import { useEffect, useRef, useState } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

type ChatMessage = { role: "user" | "assistant"; content: string };
export type PanelState = "closed" | "open" | "minimized";

// Shared with app/page.tsx, which reserves this much space on the right of
// the main content when the desktop panel is open — otherwise the
// position:fixed panel just sits on top of whatever content was already
// there, rather than the page making room for it.
export const ASK_PANEL_WIDTH = 400;

const SUGGESTIONS = [
  "How's my net worth trending?",
  "What's my biggest spending category this month?",
  "Am I too concentrated in any one holding?",
  "What's the case for and against NVDA right now?",
];

// Sent to the API, not stored — bounds token/cost growth on a long-running
// conversation without capping how much history the user sees on screen.
const MAX_HISTORY_SENT = 20;

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 5.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.5l-3.8 2.7v-2.7H5a2 2 0 0 1-2-2v-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 2.5c.3 2.6 1.1 4.3 2.3 5.5S15 9.7 17.5 10c-2.6.3-4.3 1.1-5.5 2.3S10.3 15 10 17.5c-.3-2.6-1.1-4.3-2.3-5.5S5 10.3 2.5 10c2.6-.3 4.3-1.1 5.5-2.3S9.7 5 10 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 16V4M10 4l-5 5M10 4l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The round trigger sits in the header next to Account (present on every
// tab), but the message state and the in-flight fetch live here at the top
// level regardless of whether the panel is visually open — minimizing (or
// just switching tabs, since this never unmounts) never drops an in-progress
// streamed response the way conditionally mounting the conversation would.
// `panel` is controlled by the parent (app/page.tsx) rather than owned here,
// so the page layout can react to it — see ASK_PANEL_WIDTH above.
export function AskWidget({ panel, setPanel }: { panel: PanelState; setPanel: (p: PanelState | ((p: PanelState) => PanelState)) => void }) {
  const [messages, setMessages] = usePersistedState<ChatMessage[]>("assistant.messages", []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (panel === "open") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, panel]);

  useEffect(() => {
    if (panel === "open") textareaRef.current?.focus();
  }, [panel]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY_SENT) }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((prev) => prev.slice(0, -1));
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const toggle = () => setPanel((p) => (p === "open" ? "closed" : "open"));

  const conversationBody = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${T.line}`, flexShrink: 0, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(34,181,115,0.14)", color: T.gain,
            }}
          >
            <SparkleIcon size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Ascentic Assistant
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Your real numbers, on tap
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Clear conversation"
              style={{ fontFamily: "inherit", fontSize: 11.5, color: T.inkSoft, background: "none", border: `1px solid ${T.line}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setPanel("minimized")}
            title="Minimize"
            aria-label="Minimize"
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${T.line}`, borderRadius: "50%", color: T.inkSoft, cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}
          >
            −
          </button>
          <button
            onClick={() => setPanel("closed")}
            title="Close"
            aria-label="Close"
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${T.line}`, borderRadius: "50%", color: T.inkSoft, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, color: T.ink }}>What do you want to know?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    fontFamily: "inherit", fontSize: 12.5, textAlign: "left", padding: "9px 12px",
                    background: T.headerBg, border: `1px solid ${T.line}`, borderRadius: 10, cursor: "pointer", color: T.ink,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "user" ? (
                  <div
                    style={{
                      maxWidth: "85%", background: T.gain, color: "#fff", borderRadius: "14px 14px 2px 14px",
                      padding: "8px 12px", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div
                    style={{
                      maxWidth: "95%", fontSize: 13.5, lineHeight: 1.6, color: T.ink, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: T.headerBg, border: `1px solid ${T.line}`, borderRadius: "2px 14px 14px 14px", padding: "10px 13px",
                    }}
                  >
                    {m.content || (sending && i === messages.length - 1 ? <span style={{ color: T.inkSoft, fontFamily: mono }}>…</span> : null)}
                  </div>
                )}
              </div>
            ))}
            {error && <div style={{ fontSize: 12, color: T.loss, fontFamily: mono }}>{error}</div>}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, padding: 12, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your portfolio…"
          rows={1}
          disabled={sending}
          style={{
            flex: 1, fontFamily: "inherit", fontSize: 13.5, padding: "9px 11px", resize: "none",
            border: `1px solid ${T.line}`, borderRadius: 999, background: T.card, color: T.ink, maxHeight: 110,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          aria-label="Send"
          style={{
            width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: sending || !input.trim() ? "default" : "pointer", background: T.gain, color: "#fff", border: "none",
            borderRadius: "50%", padding: 0, opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          {sending ? <span style={{ fontSize: 13, fontFamily: mono }}>…</span> : <SendIcon />}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: T.ink, fontFamily: mono, padding: "0 16px 12px", flexShrink: 0 }}>
        Not a licensed financial advisor.
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={toggle}
        title="Ask"
        aria-label="Ask"
        style={{
          width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: panel === "open" ? T.gain : "none", color: panel === "open" ? "#fff" : T.inkSoft,
          border: `1px solid ${panel === "open" ? T.gain : T.line}`, cursor: "pointer", flexShrink: 0, padding: 0,
        }}
      >
        <ChatIcon />
      </button>

      {panel === "open" && !isMobile && (
        <div
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: `min(${ASK_PANEL_WIDTH}px, 100vw)`, zIndex: 200,
            background: T.paper, borderLeft: `1px solid ${T.line}`, boxShadow: "-16px 0 32px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column",
          }}
        >
          {conversationBody}
        </div>
      )}

      {panel === "open" && isMobile && (
        <>
          <div onClick={() => setPanel("minimized")} style={{ position: "fixed", inset: 0, background: "rgba(10,12,10,0.5)", zIndex: 199 }} />
          <div
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, top: "10vh", zIndex: 200,
              background: T.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18,
              boxShadow: "0 -12px 32px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 999, background: T.line }} />
            </div>
            {conversationBody}
          </div>
        </>
      )}

      {panel === "minimized" && (
        <button
          onClick={() => setPanel("open")}
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", alignItems: "center", gap: 8,
            background: T.gain, color: "#fff", border: "none", borderRadius: 999, padding: "10px 16px 10px 12px",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          }}
        >
          <ChatIcon size={15} />
          Ask
        </button>
      )}
    </>
  );
}
