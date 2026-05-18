"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-4">
          <AlertCircle size={20} style={{ color: "var(--c-danger-ink)", opacity: 0.7 }} />
          <p className="text-[12px] font-medium" style={{ color: "var(--c-danger-ink)" }}>
            {this.props.title ?? "Виджет недоступен"}
          </p>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
