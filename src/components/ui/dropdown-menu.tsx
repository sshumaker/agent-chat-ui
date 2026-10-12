"use client";

import { DropdownMenu as M } from "radix-ui";
import type * as React from "react";
import { useContext } from "react";
import { PortalContext } from "../branding";

import { cn } from "../../lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal container={useContext(PortalContext)}>
      <M.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-40 rounded-xl border border-border bg-surface p-1 shadow-card animate-fade-in", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, variant, ...props }: React.ComponentProps<typeof M.Item> & { variant?: "danger" }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground",
        variant === "danger" && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs text-muted-foreground", className)} {...props} />;
}
