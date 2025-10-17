import { Toaster } from "@/renderer/ui/sonner"
import { ThemeProvider } from "@/renderer/ui/theme-provider"
import { BrowserChrome } from "@/renderer/components/BrowserChrome"
import { InternalRouter, useIsInternalPage } from "@/renderer/router/InternalRouter"
import { ErrorBoundary } from "@/renderer/components/ErrorBoundary"

function App() {
  const isInternalPage = useIsInternalPage()

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme={isInternalPage ? "light" : "dark"} storageKey="vite-ui-theme">
        {isInternalPage ? (
          <InternalRouter />
        ) : (
          <BrowserChrome />
        )}
      <Toaster position="top-center" richColors />
    </ThemeProvider>
   </ErrorBoundary>
  )
}

export default App
