import { AgentProvider } from './AgentContext';
import { AgentHeader } from './AgentHeader';
import { ChatArea } from './ChatArea';
import { ChatFooter } from './ChatFooter';

function AgentViewContent() {
  return (
     <main className='h-full flex flex-col'>
      <AgentHeader />

      <ChatArea />
      
      <ChatFooter />
     </main>
  );
}

export default function AgentView() {
  return (
    <AgentProvider>
      <AgentViewContent />
    </AgentProvider>
  );
}
