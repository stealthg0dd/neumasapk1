"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const spring = { type: "spring" as const, stiffness: 420, damping: 28 };

export type GlassCardProps = React.ComponentProps<typeof Card> & {
  hover?: boolean;
};

/**
 * Glass surface + optional Framer Motion hover lift (Apple-style, subtle).
 */
export function GlassCard({
  className,
  children,
  hover = true,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      whileHover={
        hover
          ? { y: -1, transition: { type: "spring", stiffness: 420, damping: 28 } }
          : undefined
      }
      className="rounded-2xl"
    >
      <Card
        className={cn(
          "backdrop-blur-md border-[var(--glass-border)] bg-[var(--glass-bg)]",
          "rounded-2xl shadow-sm shadow-black/5 ring-0",
          className
        )}
        {...props}
      >
        {children}
      </Card>
    </motion.div>
  );
}
