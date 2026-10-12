import type { Attachment } from "../../model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "../ui/tooltip";
import type { Outgoing } from "../../lib/outgoing";
import { deferred } from "../../test/render";

import { Composer, type ComposerProps } from "./composer";

const att = (name: string): Attachment => ({ id: `f-${name}`, name, mime: "text/plain", size: 5 });

function setup(props: Partial<ComposerProps> = {}) {
  const onSubmit = vi.fn();
  const upload = vi.fn(async (f: File) => att(f.name));
  render(
    <TooltipProvider>
      <Composer busy={false} onSubmit={onSubmit} upload={upload} {...props} />
    </TooltipProvider>,
  );
  const box = screen.getByRole("textbox", { name: "Message" });
  return { onSubmit, upload, box };
}

describe("Composer", () => {
  it("Enter sends and clears; Shift+Enter inserts a newline", async () => {
    const { box, onSubmit } = setup();
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(box).toHaveValue("line one\nline two");
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("line one\nline two", []);
    expect(box).toHaveValue("");
  });

  it("does not send empty or whitespace-only messages", async () => {
    const { box, onSubmit } = setup();
    await userEvent.type(box, "   {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("does not send while an IME composition is in progress", () => {
    const { box, onSubmit } = setup();
    fireEvent.change(box, { target: { value: "日本" } });
    fireEvent.compositionStart(box);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(box);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("日本", []);
  });

  it("while busy: Stop is offered, and typing queues", async () => {
    const onStop = vi.fn();
    const { box, onSubmit } = setup({ busy: true, onStop });
    expect(box).toHaveAttribute("placeholder", expect.stringMatching(/send when/));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Queue message/ })).not.toBeInTheDocument();
    await userEvent.type(box, "follow up");
    expect(screen.getByRole("button", { name: "Queue message" })).toBeEnabled();
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("follow up", []);
  });

  it("shows queued messages as queued", () => {
    const queued: Outgoing[] = [{ cid: "a", text: "and then summarise", attachments: [], status: "queued", baseUserCount: 1 }];
    setup({ busy: true, onStop: () => {}, queued });
    expect(screen.getByTestId("queued-message")).toHaveTextContent("and then summarise");
    expect(screen.getByTestId("queued-message")).toHaveTextContent(/Queued/);
  });

  it("attachments: chips go uploading → ready and ride along with the message", async () => {
    const d = deferred<Attachment>();
    const upload = vi.fn(() => d.promise);
    const { box, onSubmit } = setup({ upload });
    await userEvent.upload(screen.getByTestId("file-input"), new File(["a,b"], "sales.csv", { type: "text/csv" }));
    const chip = screen.getByTestId("attachment-chip");
    expect(chip).toHaveAttribute("data-status", "uploading");
    await userEvent.type(box, "analyse");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await act(async () => d.resolve(att("sales.csv")));
    expect(chip).toHaveAttribute("data-status", "ready");
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("analyse", [att("sales.csv")]);
    expect(screen.queryByTestId("attachment-chip")).not.toBeInTheDocument();
  });

  it("a failed upload shows an error chip that can be removed, and is not sent", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("too big"));
    const { box, onSubmit } = setup({ upload });
    await userEvent.upload(screen.getByTestId("file-input"), new File(["x"], "huge.bin"));
    await waitFor(() => expect(screen.getByTestId("attachment-chip")).toHaveAttribute("data-status", "error"));
    expect(screen.getByTestId("attachment-chip")).toHaveTextContent("too big");
    await userEvent.type(box, "hi{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("hi", []);
    await userEvent.click(screen.getByRole("button", { name: "Remove huge.bin" }));
    expect(screen.queryByTestId("attachment-chip")).not.toBeInTheDocument();
  });

  it("an attachment alone can be sent", async () => {
    const { onSubmit } = setup();
    await userEvent.upload(screen.getByTestId("file-input"), new File(["x"], "notes.txt"));
    await waitFor(() => expect(screen.getByTestId("attachment-chip")).toHaveAttribute("data-status", "ready"));
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSubmit).toHaveBeenCalledWith("", [att("notes.txt")]);
  });

  it("pasting files attaches them", async () => {
    const { box, upload } = setup();
    const file = new File(["png"], "shot.png", { type: "image/png" });
    fireEvent.paste(box, { clipboardData: { files: [file], getData: () => "" } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith(file));
    expect(await screen.findByText("shot.png")).toBeInTheDocument();
  });
});
