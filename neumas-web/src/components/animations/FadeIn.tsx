"use client";

/**
 * FadeIn — Framer Motion entrance animation wrapper.
 *
 * Wraps any subtree with a configurable fade + optional directional slide.
 * Supports staggered lists when used inside a <StaggerList>.
 *
 * Usage:
 * ```tsx
 * // Simple fade
 * <FadeIn><Card>…</Card></FadeIn>
 *
 * // Slide up (default)
 * <FadeIn direction="up" delay={0.1}>…</FadeIn>
 *
 * // As a list item inside StaggerList
 * <StaggerList>
 *   {items.map(i => <FadeIn key={i.id} asChild>{…}</FadeIn>)}
 * </StaggerList>
 * ```
 */

import { motion, type Variants } from "framer-motion";
import { type ReactNode } from "react";

// ── Direction presets ──────────────────────────────────────────────────────

type Direction = "up" | "down" | "left" | "right" | "none";

const directionOffset: Record<Direction, { x?: number; y?: number }> = {
  up:    { y: 24 },
  down:  { y: -24 },
  left:  { x: 24 },
  right: { x: -24 },
  none:  {},
};

function buildVariants(direction: Direction, distance: number): Variants {
  const raw = directionOffset[direction];
  const offset: { x?: number; y?: number } = {};
  if (raw.x !== undefined) offset.x = (raw.x / 24) * distance;
  if (raw.y !== undefined) offset.y = (raw.y / 24) * distance;

  return {
    hidden: {
      opacity: 0,
      ...offset,
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
      },
    },
    exit: {
      opacity: 0,
      ...(offset.x !== undefined ? { x: offset.x / 2 } : {}),
      ...(offset.y !== undefined ? { y: offset.y / 2 } : {}),
      transition: { duration: 0.25, ease: "easeIn" },
    },
  };
}

// ── Component props ────────────────────────────────────────────────────────

interface FadeInProps {
  /** Content to animate */
  children: ReactNode;
  /** Slide direction. Default: "up" */
  direction?: Direction;
  /** Slide distance in px. Default: 24 */
  distance?: number;
  /** Animation delay in seconds. Default: 0 */
  delay?: number;
  /** Duration override in seconds. Ignored if you pass `transition`. */
  duration?: number;
  /** Whether to animate on scroll (viewport) vs immediately on mount. Default: false */
  inView?: boolean;
  /** Fraction of element visible before triggering (used with inView). Default: 0.15 */
  threshold?: number;
  /** Only trigger once (used with inView). Default: true */
  once?: boolean;
  /** Extra class on the wrapper div */
  className?: string;
  /** Render as a different HTML element. Passed to motion component. */
  as?: keyof HTMLElementTagNameMap;
}

// ── FadeIn component ───────────────────────────────────────────────────────

export function FadeIn({
  children,
  direction = "up",
  distance = 24,
  delay = 0,
  duration,
  inView = false,
  threshold = 0.15,
  once = true,
  className,
  as = "div",
}: FadeInProps) {
  const variants = buildVariants(direction, distance);

  // Merge delay/duration into the visible transition
  const mergedVariants: Variants = {
    ...variants,
    visible: {
      ...(variants.visible as object),
      transition: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(variants.visible as any).transition,
        delay,
        ...(duration !== undefined ? { duration } : {}),
      },
    },
  };

  const MotionEl = motion[as as keyof typeof motion] as typeof motion.div;

  if (inView) {
    return (
      <MotionEl
        className={className}
        variants={mergedVariants}
        initial="hidden"
        whileInView="visible"
        exit="exit"
        viewport={{ once, amount: threshold }}
      >
        {children}
      </MotionEl>
    );
  }

  return (
    <MotionEl
      className={className}
      variants={mergedVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </MotionEl>
  );
}

// ── StaggerList — orchestrates staggered child animations ─────────────────

interface StaggerListProps {
  children: ReactNode;
  /** Delay between each child in seconds. Default: 0.07 */
  stagger?: number;
  /** Initial delay before first child. Default: 0.1 */
  delayChildren?: number;
  className?: string;
  as?: keyof HTMLElementTagNameMap;
}

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren:  0.07,
      delayChildren:    0.1,
    },
  },
};

/**
 * Stagger container — wraps a list of FadeIn items.
 * Each child uses its own `variants` (e.g. slideUp) and gets
 * automatically staggered by the container.
 *
 * Usage:
 * ```tsx
 * <StaggerList>
 *   {items.map(item => (
 *     <FadeIn key={item.id} direction="up">
 *       <Card>{item.name}</Card>
 *     </FadeIn>
 *   ))}
 * </StaggerList>
 * ```
 */
export function StaggerList({
  children,
  stagger = 0.07,
  delayChildren = 0.1,
  className,
  as = "div",
}: StaggerListProps) {
  const variants: Variants = {
    ...staggerContainerVariants,
    visible: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };

  const MotionEl = motion[as as keyof typeof motion] as typeof motion.div;

  return (
    <MotionEl
      className={className}
      variants={variants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </MotionEl>
  );
}

// ── Default export for convenience ────────────────────────────────────────

export default FadeIn;
