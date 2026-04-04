"use client";

/**
 * React class-based error boundary for neumas-web.
 *
 * Captures unhandled render errors to Sentry and displays a user-friendly
 * fallback UI that includes a trace ID the user can cite when contacting
 * support.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 */

import React from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: React.ReactNode;
  /** Optional fallback; receives traceId and reset callback. */
  fallback?: (traceId: string | null, reset: () => void) => React.ReactNode;
}

interface State {
  hasError: boolean;
  traceId: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, traceId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: errorInfo.componentStack });
      const eventId = Sentry.captureException(error);
      this.setState({ traceId: eventId ?? null });
    });
  }

  reset = () => {
    this.setState({ hasError: false, traceId: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.traceId, this.reset);
    }

    return <DefaultErrorFallback traceId={this.state.traceId} reset={this.reset} />;
  }
}

function DefaultErrorFallback({
  traceId,
  reset,
}: {
  traceId: string | null;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified automatically.
          If the problem persists, please contact support and provide the trace ID
          below.
        </p>
        {traceId && (
          <code className="block rounded bg-muted px-3 py-2 text-xs font-mono text-muted-foreground break-all">
            Trace ID: {traceId}
          </code>
        )}
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
