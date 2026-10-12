"use client";

import type { ArtifactInfo } from "../../model";
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, FileIcon, FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { CodeBlock, Markdown } from "../markdown";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Spinner } from "../ui/spinner";
import { Tooltip } from "../ui/tooltip";
import type { ArtifactAccess } from "../../adapter";
import { artifactLabel, artifactView, formatBytes } from "../../lib/view-model";
import { cn } from "../../lib/utils";

function useTextContent(url: string | null, loadText: ArtifactAccess["loadText"]) {
  const [state, setState] = useState<{ url: string | null; text: string | null; error: string | null }>({ url: null, text: null, error: null });
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    (loadText ? loadText(url, ctrl.signal) : fetch(url, { signal: ctrl.signal }).then(async (r) => {
      if (!r.ok) throw new Error(`Couldn't load the file (${r.status})`);
      return r.text();
    }))
      .then((text) => setState({ url, text, error: null }))
      .catch((e: Error) => e.name !== "AbortError" && setState({ url, text: null, error: e.message }));
    return () => ctrl.abort();
  }, [url, loadText]);
  // A stale body (previous version) stays on screen until the new one lands, so updates don't flash.
  return { text: state.text, error: state.url === url ? state.error : null, loading: state.url !== url };
}

function Viewer({ access, artifact, onText }: { access: ArtifactAccess; artifact: ArtifactInfo; onText: (t: string | null) => void }) {
  const { view, language } = artifactView(artifact.mime, artifact.name);
  const url = access.url(artifact);
  const textual = view === "markdown" || view === "code" || view === "text" || view === "html";
  const { text, error, loading } = useTextContent(textual ? url : null, access.loadText);
  useEffect(() => onText(textual ? text : null), [text, textual, onText]);

  if (view === "image")
    return <img src={url} alt={artifact.name} className="mx-auto max-w-full rounded-xl border border-border bg-surface" />;
  if (view === "pdf") return <iframe src={url} title={artifact.name} className="h-full min-h-[70vh] w-full rounded-xl border border-border bg-white" />;
  if (view === "download")
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileIcon className="size-10 text-faint" />
        <p className="text-sm text-muted-foreground">This file type can&apos;t be previewed.</p>
        <Button asChild variant="outline" size="sm">
          <a href={access.url(artifact, { download: true })} download={artifact.name}>
            <DownloadIcon /> Download {artifact.name}
          </a>
        </Button>
      </div>
    );
  if (error) return <p className="py-10 text-center text-sm text-danger">{error}</p>;
  if (text === null)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  return (
    <div className={cn("transition-opacity", loading && "opacity-60")} data-testid="document-body">
      {view === "markdown" ? <Markdown text={text} className="prose-doc" /> : null}
      {view === "code" ? <CodeBlock code={text} language={language} /> : null}
      {view === "text" ? <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{text}</pre> : null}
      {view === "html" ? <iframe srcDoc={text} sandbox="" title={artifact.name} className="h-[70vh] w-full rounded-xl border border-border bg-white" /> : null}
    </div>
  );
}

/**
 * "v2", or "Updated · v2" once a newer version lands while the document is open. Keyed by
 * artifact, so the version it was opened at is its initial state; the highlight is a CSS
 * animation keyed by version, so it replays on each update without timers.
 */
function VersionBadge({ version }: { version: number }) {
  const [openedAt] = useState(version);
  const updated = version > openedAt;
  return (
    <span
      key={version}
      data-testid="document-version"
      className={cn("shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground", updated && "animate-version-flash")}
    >
      {updated ? `Updated · v${version}` : `v${version}`}
    </span>
  );
}

function iconFor(a: ArtifactInfo) {
  const { view } = artifactView(a.mime, a.name);
  return view === "image" ? ImageIcon : view === "download" ? FileIcon : FileTextIcon;
}

export function DocumentsPanel({
  access,
  artifacts,
  activeId,
  onSelect,
  onClose,
  className,
}: {
  access: ArtifactAccess;
  artifacts: ArtifactInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const active = artifacts.find((a) => a.artifact_id === activeId) ?? artifacts[artifacts.length - 1];
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside aria-label="Documents" data-testid="documents-panel" className={cn("flex min-h-0 flex-col border-l border-border bg-surface", className)}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        {active ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted" aria-label="Choose document">
                {(() => {
                  const Icon = iconFor(active);
                  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
                })()}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" data-testid="document-title">
                    {artifactLabel(active)}
                  </span>
                </span>
                <VersionBadge key={active.artifact_id} version={active.version} />
                {artifacts.length > 1 ? <ChevronDownIcon className="size-3.5 shrink-0 text-faint" /> : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {[...artifacts].reverse().map((a) => {
                const Icon = iconFor(a);
                return (
                  <DropdownMenuItem key={a.artifact_id} onSelect={() => onSelect(a.artifact_id)}>
                    <Icon />
                    <span className="min-w-0 flex-1 truncate">{artifactLabel(a)}</span>
                    <span className="text-xs text-faint">{formatBytes(a.size)}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="px-2 text-sm font-medium">Documents</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {active && text !== null ? (
            <Tooltip content={copied ? "Copied" : "Copy"}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy document"
                onClick={() =>
                  void navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </Tooltip>
          ) : null}
          {active ? (
            <Tooltip content="Download">
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={access.url(active, { download: true })} download={active.name} aria-label="Download document">
                  <DownloadIcon />
                </a>
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip content="Close">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close documents">
              <XIcon />
            </Button>
          </Tooltip>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
        {active ? (
          <Viewer key={active.artifact_id} access={access} artifact={active} onText={setText} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <FileTextIcon className="size-8 text-faint" />
            <p className="text-sm text-muted-foreground">Files the assistant creates will appear here.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
