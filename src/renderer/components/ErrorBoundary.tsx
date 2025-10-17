import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className='w-full h-full flex items-center justify-center p-8 bg-background'>
          <Card className='max-w-2xl w-full'>
            <CardHeader>
              <div className='flex items-center gap-3'>
                <AlertCircle className='w-8 h-8 text-destructive' />
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>
                    An error occurred while rendering this component
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              {this.state.error && (
                <div className='space-y-2'>
                  <h3 className='font-semibold text-sm'>Error Message:</h3>
                  <pre className='p-3 bg-muted rounded-md text-xs overflow-auto max-h-32'>
                    {this.state.error.toString()}
                  </pre>
                </div>
              )}

              {this.state.errorInfo && (
                <div className='space-y-2'>
                  <h3 className='font-semibold text-sm'>Component Stack:</h3>
                  <pre className='p-3 bg-muted rounded-md text-xs overflow-auto max-h-48'>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div className='flex gap-3 pt-4'>
                <Button onClick={this.handleReset} className='flex items-center gap-2'>
                  <RefreshCw className='w-4 h-4' />
                  Try Again
                </Button>
                <Button 
                  variant='outline' 
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
