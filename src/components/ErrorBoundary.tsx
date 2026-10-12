/**
 * Science of Gifts - Application Error Boundary (Phase 10, Part V)
 * Prevents full screen whiteouts on unexpected component exceptions and offers recovery paths.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Editorial Studio Caught Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 min-h-[400px] flex items-center justify-center p-6 bg-[#faf9f6]">
          <div className="max-w-md w-full bg-white border border-[#e5dfd3] rounded-2xl shadow-md p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                {this.props.fallbackTitle || 'Something went wrong in this workspace'}
              </h3>
              <p className="text-xs text-[#6e685f] leading-relaxed">
                Your writing data is preserved in local storage. You can reload this view or return to the Studio Dashboard.
              </p>
            </div>

            {this.state.error && (
              <div className="p-2.5 bg-[#f6f3eb] rounded-lg border border-[#e8e4db] text-[11px] text-[#5c5447] text-left font-mono truncate">
                {this.state.error.message || 'Unknown render exception'}
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-3.5 py-2 text-xs font-semibold text-[#1e232a] bg-[#f6f3eb] hover:bg-[#ede7db] rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try Again
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = window.location.pathname;
                }}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2e3743] rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" />
                Return to Studio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
