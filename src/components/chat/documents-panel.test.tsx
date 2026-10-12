import type { ArtifactInfo } from "../../model";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "../ui/tooltip";

import { DocumentsPanel } from "./documents-panel";

vi.mock("../markdown", () => ({
  Markdown: ({ text }: { text: string }) => <div data-testid="md">{text}</div>,
  CodeBlock: ({ code, language }: { code: string; language?: string }) => <pre data-lang={language}>{code}</pre>,
}));

const art = (over: Partial<ArtifactInfo> = {}): ArtifactInfo => ({ artifact_id: "a1", name: "report.md", mime: "text/markdown", size: 100, path: "outputs/report.md", version: 1, ...over });

function panel(artifacts: ArtifactInfo[], activeId: string | null = "a1") {
  return (
    <TooltipProvider>
      <DocumentsPanel access={{ url: (a, options) => `/files/${a.artifact_id}?v=${a.version}${options?.download ? "&download=1" : ""}` }} artifacts={artifacts} activeId={activeId} onSelect={() => {}} onClose={() => {}} />
    </TooltipProvider>
  );
}

describe("DocumentsPanel", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => new Response(url.includes("v=2") ? "# Report v2" : "# Report v1"));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders markdown from the artifact content URL", async () => {
    render(panel([art()]));
    await waitFor(() => expect(screen.getByTestId("md")).toHaveTextContent("# Report v1"));
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/files/a1?v=1");
    expect(screen.getByTestId("document-version")).toHaveTextContent("v1");
  });

  it("refetches and flags the update when a new version arrives", async () => {
    const { rerender } = render(panel([art()]));
    await waitFor(() => expect(screen.getByTestId("md")).toHaveTextContent("v1"));
    rerender(panel([art({ version: 2 })]));
    await waitFor(() => expect(screen.getByTestId("md")).toHaveTextContent("v2"));
    expect(screen.getByTestId("document-version")).toHaveTextContent("Updated · v2");
  });

  it("code gets a language, images an <img>, PDFs an iframe, unknown types a download", async () => {
    const { rerender } = render(panel([art({ name: "a.py", mime: "text/x-python" })]));
    await waitFor(() => expect(document.querySelector("pre[data-lang='python']")).not.toBeNull());
    rerender(panel([art({ artifact_id: "a2", name: "chart.png", mime: "image/png" })], "a2"));
    expect(screen.getByRole("img", { name: "chart.png" })).toHaveAttribute("src", "/files/a2?v=1");
    rerender(panel([art({ artifact_id: "a3", name: "x.pdf", mime: "application/pdf" })], "a3"));
    expect(document.querySelector("iframe[title='x.pdf']")).not.toBeNull();
    rerender(panel([art({ artifact_id: "a4", name: "deck.key", mime: "application/octet-stream" })], "a4"));
    expect(screen.getByRole("link", { name: /Download deck.key/ })).toHaveAttribute("href", expect.stringContaining("download=1"));
  });

  it("shows a load error", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    render(panel([art()]));
    await waitFor(() => expect(screen.getByText(/Couldn't load the file \(500\)/)).toBeInTheDocument());
  });
});
