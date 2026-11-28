import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "অপ্রত্যাশিত একটি সমস্যা হয়েছে।",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("App ErrorBoundary caught:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="dm-login-page">
          <div className="dm-access-denied" role="alert">
            <AlertTriangle
              size={38}
              className="dm-text-rose"
              aria-hidden="true"
            />
            <h2>সাময়িক সমস্যা হয়েছে</h2>
            <p>
              ডাটা লোড বা প্রদর্শনে সমস্যা হয়েছে। অনুগ্রহ করে পেজটি পুনরায় লোড
              করুন।
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="dm-btn dm-btn-primary"
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span>পুনরায় লোড করুন</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
