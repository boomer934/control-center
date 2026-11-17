import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './capture';

interface Props {
  children: ReactNode;
}

/**
 * Catches errors thrown while rendering its subtree, reports them (the Errors Console sits
 * outside the boundary, so it keeps working) and shows a fallback instead of a blank window.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(window.api.errors, 'render-error', error, info.componentStack ?? '');
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <p className="shell-error" role="alert" data-testid="render-fallback">
          This view failed to render. The error is in the Errors Console.
        </p>
      );
    }
    return this.props.children;
  }
}
