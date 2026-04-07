"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { loadChatMessages, sendChatMessage } from "@/lib/fantasy-chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatMessageRecord } from "@/types/fantasy";

export interface LeagueChatClientProps {
  leagueId: string;
}

export function LeagueChatClient({ leagueId }: LeagueChatClientProps) {
  const { session } = useFantasyAuth();
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const result = await loadChatMessages(leagueId);
        if (!cancelled) {
          setMessages(result);
          setTimeout(scrollToBottom, 100);
        }
      } catch {
        if (!cancelled) setError("Unable to load messages.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    // Subscribe to new messages via Supabase Realtime
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`chat:${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "fantasy_chat_messages",
          filter: `league_id=eq.${leagueId}`,
        },
        async () => {
          // Reload messages on new insert
          const updated = await loadChatMessages(leagueId);
          if (!cancelled) {
            setMessages(updated);
            setTimeout(scrollToBottom, 100);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [leagueId, session, scrollToBottom]);

  async function handleSend() {
    if (!draft.trim() || isSending) return;

    setIsSending(true);
    setError("");

    try {
      const msg = await sendChatMessage(leagueId, draft);
      if (msg) {
        setMessages((prev) => [...prev, msg]);
        setDraft("");
        setTimeout(scrollToBottom, 50);
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      signedOutDescription="Sign in to use league chat."
      signedOutTitle="Sign in"
    >
      {() => (
        <section className="space-y-5">
          <MotionReveal>
            <SurfaceCard
              eyebrow="League chat"
              title="Talk trash, celebrate wins"
              description="Messages are visible to all league members."
            >
              <div className="flex max-h-[28rem] min-h-[16rem] flex-col">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {isLoading ? (
                    <EmptyState title="Loading messages" description="Fetching the conversation." />
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-muted">No messages yet. Be the first to talk!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <ScrollReveal key={msg.id}>
                        <div
                          className={[
                            "rounded-[1.1rem] border px-4 py-3",
                            msg.user_id === session?.user.id
                              ? "border-brand/30 bg-brand/8 ml-8"
                              : "border-line bg-panel-soft mr-8",
                          ].join(" ")}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-strong">
                              {msg.display_name}
                            </p>
                            <time className="text-[0.6rem] text-muted">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-foreground">{msg.body}</p>
                        </div>
                      </ScrollReveal>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                {error ? (
                  <p className="mt-2 text-sm text-danger">{error}</p>
                ) : null}

                <form
                  className="mt-4 flex gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    className="field-control flex-1 rounded-full border border-line bg-white/6 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-brand-strong/40 focus:outline-none"
                  />
                  <Button
                    type="submit"
                    size="md"
                    disabled={!draft.trim() || isSending}
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </div>
            </SurfaceCard>
          </MotionReveal>
        </section>
      )}
    </FantasyAuthGate>
  );
}
