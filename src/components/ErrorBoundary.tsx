import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
  // Changing this (e.g. the route path) clears a caught error, so navigating
  // away from a broken board recovers without a full reload.
  resetKey?: string;
}

interface State {
  error: Error | null;
}

// Catches render errors below it so one broken card or board can't blank the
// whole app. React only supports this as a class component.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A real deployment would report to Sentry or similar here.
    console.error('Weave crashed while rendering', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" role="alert">
        <h2 className="empty-title">Something went wrong here</h2>
        <p>This part of Weave hit an unexpected error. Your boards are safe — try again, or head back to the workspace.</p>
        <div className="empty-actions">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <a className="btn btn-secondary" href="/">
            Back to workspace
          </a>
        </div>
      </div>
    );
  }
}
