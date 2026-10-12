"use client";

import { BotIcon } from "lucide-react";
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
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
const BrandingContext = createContext<ChatBranding & { agentName: string }>({ agentName: "Assistant" });
export const PortalContext = createContext<HTMLElement | null>(null);
export const useChatBranding = () => useContext(BrandingContext);

/** Also wraps separately composed primitives and keeps portals in the instance theme. */
export function ChatProvider({ children, branding = {}, theme, appearance = "light", className, style }: {
  children: ReactNode;
  branding?: ChatBranding;
  theme?: ChatTheme;
  appearance?: "light" | "dark";
  className?: string;
  style?: CSSProperties;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <BrandingContext.Provider value={{ ...branding, agentName: branding.agentName ?? "Assistant" }}>
      <PortalContext.Provider value={container}>
        <TooltipProvider>
          <div ref={setContainer} className={cn("agent-chat-ui", appearance === "dark" && "dark", className)} style={{ ...theme, ...style }}>
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
