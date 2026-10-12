import fs from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import prefix from "postcss-prefix-selector";
const from = new URL("../src/styles.css", import.meta.url);
const result = await postcss([tailwind()]).process(await fs.readFile(from, "utf8"), { from: from.pathname });
const scoped = await postcss([prefix({
  prefix: ":where(.agent-chat-ui)",
  transform(prefix, selector, prefixed) {
    // Preflight's root selectors and theme variables belong to the chat instance.
    if (selector === ":root" || selector === ":host" || selector === "html") return prefix;
    // Keep Tailwind nesting and already-scoped instance selectors intact.
    if (selector.includes("&") || selector.startsWith(".agent-chat-ui")) return selector;
    return prefixed;
  },
})]).process(result.css, { from: undefined });
await fs.writeFile(new URL("../dist/styles.css", import.meta.url), scoped.css);
