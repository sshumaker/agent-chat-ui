"use client";
import type { ReactNode } from "react";
import { useChatBranding } from "../branding";

export interface ChatSuggestion { text: string; icon?: ReactNode }
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
export function EmptyGreeting({ name }: { name?: string }) {
  const brand = useChatBranding();
  const first = name?.split(/\s+/)[0];
  return <div className="mb-7 text-center animate-rise">
    <h1 className="font-heading text-[2rem] leading-tight font-medium tracking-tight text-foreground sm:text-[2.4rem]" suppressHydrationWarning>
      {brand.greeting === undefined ? `${greeting()}${first ? `, ${first}` : ""}` : brand.greeting}
    </h1>
    <p className="mt-2 text-[15px] text-muted-foreground">{brand.tagline === undefined ? "How can I help?" : brand.tagline}</p>
  </div>;
}
export function SuggestionChips({ suggestions = [], onPick, disabled }: { suggestions?: ChatSuggestion[]; onPick: (text: string) => void; disabled?: boolean }) {
  if (!suggestions.length) return null;
  return <div className="mt-5 flex flex-wrap justify-center gap-2 animate-fade-in" aria-label="Suggestions">
    {suggestions.map(({ text, icon }) => <button key={text} type="button" disabled={disabled} onClick={() => onPick(text)} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-muted-foreground shadow-card transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50">
      {icon ? <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center text-faint [&_svg]:size-4">{icon}</span> : null}{text}
    </button>)}
  </div>;
}
