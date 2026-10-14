"use client";

import { BotIcon } from "lucide-react";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { TooltipProvider } from "./ui/tooltip";
import { cn } from "../lib/utils";

export interface ChatBranding {
  agentName?: string;
  avatar?: ReactNode;
  greeting?: ReactNode;
  tagline?: ReactNode;
  /** null hides the footer. */
  footer?: ReactNode;
  placeholder?: string;
}
export type ChatTheme = CSSProperties & { [variable: `--${string}`]: string | number | undefined };
/** "system" follows the viewer's light/dark setting, live. */
export type ChatAppearance = "light" | "dark" | "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";
function useSystemDark(enabled: boolean): boolean {
  const query = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null);
  const [dark, setDark] = useState(() => Boolean(enabled && query()?.matches));
  useEffect(() => {
    const mq = enabled ? query() : null;
    if (!mq) return;
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [enabled]);
  return dark;
}
const BrandingContext = createContext<ChatBranding & { agentName: string }>({ agentName: "Assistant" });
export const PortalContext = createContext<HTMLElement | null>(null);
export const useChatBranding = () => useContext(BrandingContext);

/** Also wraps separately composed primitives and keeps portals in the instance theme. */
export function ChatProvider({ children, branding = {}, theme, appearance = "light", className, style }: {
  children: ReactNode;
  branding?: ChatBranding;
  theme?: ChatTheme;
  appearance?: ChatAppearance;
  className?: string;
  style?: CSSProperties;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const systemDark = useSystemDark(appearance === "system");
  const dark = appearance === "dark" || (appearance === "system" && systemDark);
  return (
    <BrandingContext.Provider value={{ ...branding, agentName: branding.agentName ?? "Assistant" }}>
      <PortalContext.Provider value={container}>
        <TooltipProvider>
          <div ref={setContainer} className={cn("agent-chat-ui", dark && "dark", className)} style={{ ...theme, ...style }}>
            {children}
          </div>
        </TooltipProvider>
      </PortalContext.Provider>
    </BrandingContext.Provider>
  );
}

export function AgentAvatar({ className, active }: { className?: string; active?: boolean }) {
  const { avatar } = useChatBranding();
  return <span aria-hidden className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent", active && "animate-pulse-soft", className)}>
    {avatar === undefined ? <BotIcon className="size-3.5" /> : avatar}
  </span>;
}
