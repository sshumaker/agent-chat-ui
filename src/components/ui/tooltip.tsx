"use client";

import { Tooltip as T } from "radix-ui";
import type * as React from "react";
import { useContext } from "react";
import { PortalContext } from "../branding";

import { cn } from "../../lib/utils";

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  delay,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
}) {
  return (
    <T.Root delayDuration={delay}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal container={useContext(PortalContext)}>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn("z-50 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-card animate-fade-in")}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
