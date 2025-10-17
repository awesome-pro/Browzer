import { useEffect } from 'react';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { TabBar } from './TabBar';
import { NavigationBar } from './NavigationBar';
import { Sidebar } from './Sidebar';

/**
 * BrowserChrome - Main browser UI (tabs + navigation + resizable content)
 * 
 * This is the "Agent UI" WebContentsView that contains all browser controls
 * and manages the layout between web content and the agent sidebar
 */
export function BrowserChrome() {
  const browserAPI = useBrowserAPI();
  const { isVisible: isSidebarVisible, showSidebar } = useSidebarStore();

  // Auto-open sidebar when recording starts
  useEffect(() => {
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      showSidebar();
    });
    
    return () => unsubStart();
  }, [showSidebar]);

  return (
    <div className="w-screen h-screen flex flex-col">
      {/* Tab Bar */}
      <TabBar
        tabs={browserAPI.tabs}
        activeTabId={browserAPI.activeTabId}
        onTabClick={browserAPI.switchTab}
        onTabClose={browserAPI.closeTab}
        onNewTab={() => browserAPI.createTab()}
      />

      {/* Navigation Bar */}
      <NavigationBar
        activeTab={browserAPI.activeTab}
        onNavigate={(url) => {
          if (browserAPI.activeTabId) {
            browserAPI.navigate(browserAPI.activeTabId, url);
          }
        }}
        onBack={() => {
          if (browserAPI.activeTabId) {
            browserAPI.goBack(browserAPI.activeTabId);
          }
        }}
        onForward={() => {
          if (browserAPI.activeTabId) {
            browserAPI.goForward(browserAPI.activeTabId);
          }
        }}
        onReload={() => {
          if (browserAPI.activeTabId) {
            browserAPI.reload(browserAPI.activeTabId);
          }
        }}
        onStop={() => {
          if (browserAPI.activeTabId) {
            browserAPI.stop(browserAPI.activeTabId);
          }
        }}
      />

      <section className="relative flex-1 overflow-hidden">
        {isSidebarVisible && (
          <aside className='absolute right-0 top-0 bottom-0 w-[30%]'>
            <Sidebar />
          </aside>
        )}
      </section>
    </div>
  );
}
