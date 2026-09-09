"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";

export class WhiteboardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error("[whiteboard] client error", error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="rounded-xl border border-[var(--br-border)] bg-surface p-6 text-sm"><h2 className="font-bold">The whiteboard needs to reconnect</h2><p className="mt-2 text-[var(--br-text-muted)]">Your live class is still available. Reload the board to reconnect without leaving the class.</p><button type="button" className="mt-4 min-h-11 rounded-lg bg-[var(--br-brand)] px-4 font-bold text-on-dark" onClick={() => this.setState({ failed: false })}>Reconnect board</button></section>;
  }
}
