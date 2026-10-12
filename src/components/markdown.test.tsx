import { describe, expect, it } from "vitest";

import { citationNumber, hostOf } from "./markdown";

describe("citation detection", () => {
  it("recognises [[n]](url) and [n](url) link text", () => {
    expect(citationNumber("[1]")).toBe("1");
    expect(citationNumber("12")).toBe("12");
    expect(citationNumber(["[", "3", "]"])).toBe("3");
    expect(citationNumber(" [4] ")).toBe("4");
  });
  it("ignores ordinary links", () => {
    expect(citationNumber("pilot programs")).toBeNull();
    expect(citationNumber("[1] and more")).toBeNull();
    expect(citationNumber("2026")).toBeNull();
  });
  it("hostOf strips www and tolerates bad urls", () => {
    expect(hostOf("https://www.iea.org/reports/x")).toBe("iea.org");
    expect(hostOf("/relative")).toBe("");
    expect(hostOf(undefined)).toBe("");
  });
});

describe("Markdown rendering", () => {
  it("single tildes mean 'about', not strikethrough; double tildes still strike", async () => {
    const { render } = await import("@testing-library/react");
    const { Markdown } = await import("./markdown");
    const { container } = render(<Markdown text={"Sesimbra, ~45 min out (~$250–350 pp/night). ~~old~~"} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toContain("~45 min out (~$250–350 pp/night)");
    const struck = [...container.querySelectorAll("del, s")].map((d) => d.textContent);
    expect(struck).toEqual(["old"]);
  });
});
