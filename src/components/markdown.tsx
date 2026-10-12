"use client";

import { code } from "@streamdown/code";
import { memo } from "react";
import { defaultRemarkPlugins, Streamdown, type StreamdownProps } from "streamdown";

import { Tooltip } from "./ui/tooltip";
import { cn } from "../lib/utils";

const PLUGINS = { code };
const CONTROLS = { code: { copy: true, download: false }, table: false, image: false } as const;
const LINK_SAFETY = { enabled: false } as const;
// GFM reads a pair of single tildes as strikethrough; models write "~45 min (~$250)" to mean
// "about", so only "~~double~~" strikes through.
const [gfm] = defaultRemarkPlugins.gfm as [NonNullable<StreamdownProps["remarkPlugins"]>[number], object];
const REMARK_PLUGINS: StreamdownProps["remarkPlugins"] = [
  ...Object.entries(defaultRemarkPlugins).map(([name, plugin]) => (name === "gfm" ? [gfm, { singleTilde: false }] : plugin)),
] as StreamdownProps["remarkPlugins"];

/** "[1]" or "1" as a link's whole text marks a citation; returns the number, else null. */
export function citationNumber(children: React.ReactNode): string | null {
  const flat = (Array.isArray(children) ? children : [children]).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : null));
  if (flat.some((c) => c === null)) return null;
  const m = /^\s*\[?(\d{1,3})\]?\s*$/.exec(flat.join(""));
  return m ? m[1]! : null;
}

export function hostOf(href: string | undefined): string {
  try {
    return href ? new URL(href).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** Citations ("[[1]](url)" or "[1](url)") render as numbered chips showing the domain on hover; every link opens in a new tab. */
function Anchor({ href, children, node: _node, ...rest }: React.ComponentProps<"a"> & { node?: unknown }) {
  const n = citationNumber(children);
  if (n !== null) {
    const host = hostOf(href);
    return (
      <Tooltip content={host || href || "Source"}>
        <a
          {...rest}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Source ${n}${host ? `: ${host}` : ""}`}
          data-testid="citation"
          className="citation-chip mx-0.5 inline-flex h-[1.4em] min-w-[1.4em] -translate-y-px items-center justify-center rounded-full bg-muted px-1.5 align-middle text-[0.72em] leading-none font-medium text-muted-foreground no-underline! transition-colors hover:bg-accent-soft hover:text-accent-foreground"
        >
          {n}
        </a>
      </Tooltip>
    );
  }
  return (
    <a {...rest} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

const COMPONENTS = { a: Anchor } as unknown as StreamdownProps["components"];

export const Markdown = memo(function Markdown({ text, streaming = false, className }: { text: string; streaming?: boolean; className?: string }) {
  return (
    <Streamdown
      className={cn("prose-chat", className)}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={PLUGINS}
      controls={CONTROLS}
      linkSafety={LINK_SAFETY}
      remarkPlugins={REMARK_PLUGINS}
      components={COMPONENTS}
      shikiTheme={["github-light", "github-dark"]}
      lineNumbers={false}
      parseIncompleteMarkdown
    >
      {text}
    </Streamdown>
  );
});

/** A highlighted code block with a copy button, via the same renderer as chat replies. */
export function CodeBlock({ code: source, language = "text", className }: { code: string; language?: string; className?: string }) {
  const fence = source.includes("```") ? "~~~~" : "```";
  return <Markdown className={cn("text-[13px]", className)} text={`${fence}${language}\n${source.replace(/\n$/, "")}\n${fence}`} />;
}
