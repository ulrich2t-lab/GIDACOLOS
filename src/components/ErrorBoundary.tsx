import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { FirestoreErrorInfo } from '../lib/firestoreError';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  details: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', details: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    try {
      const parsed = JSON.parse(error.message) as FirestoreErrorInfo;
      if (parsed && typeof parsed.error === 'string' && 'operationType' in parsed) {
        return {
          hasError: true,
          message: parsed.error,
          details: parsed,
        };
      }
    } catch {
      // Not a structured FirestoreErrorInfo JSON payload
    }
    return {
      hasError: true,
      message: error.message || 'Une erreur inattendue est survenue.',
      details: null,
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '', details: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isQuotaError = this.state.message.includes('Quota exceeded');

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 className="text-lg font-semibold">Interruption de session</h2>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {isQuotaError
              ? 'Le quota quotidien gratuit Firestore a été atteint. Il sera réinitialisé demain.'
              : 'Une erreur de synchronisation ou d’autorisation est survenue lors de la communication avec la base de données.'}
          </p>

          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 mb-6 text-xs font-mono text-slate-600 dark:text-slate-400 break-words">
            {this.state.details
              ? `${this.state.details.operationType.toUpperCase()} (${this.state.details.path ?? 'racine'}) : ${this.state.details.error}`
              : this.state.message}
          </div>

          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Recharger la plateforme</span>
          </button>
        </div>
      </div>
    );
  }
}
