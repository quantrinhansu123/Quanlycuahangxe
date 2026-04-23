import React, { type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || 'Lỗi không xác định' };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-foreground">
          <h1 className="text-lg font-bold mb-2">Đã xảy ra lỗi giao diện</h1>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">{this.state.message}</p>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.href = '/';
            }}
          >
            Tải lại trang chủ
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
