import { Component, type ReactNode } from "react";

type Props = {
  label?: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`,
      error,
      info?.componentStack,
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200 space-y-2">
        <div className="font-bold uppercase tracking-wider text-xs text-rose-300">
          Terjadi error{this.props.label ? ` di ${this.props.label}` : ""}
        </div>
        <div className="font-mono text-[11px] break-words">
          {error.name}: {error.message}
        </div>
        {error.stack && (
          <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap break-words">
            {error.stack}
          </pre>
        )}
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 inline-flex items-center rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30"
        >
          Coba lagi
        </button>
      </div>
    );
  }
}
