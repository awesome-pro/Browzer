/**
 * ChatArea - Scrollable middle section showing chat messages or new chat form
 */

import { useAgent } from './AgentContext';
import { NewChatForm } from './NewChatForm';
import { SessionDetails } from './SessionDetails';
import { ExecutionStream } from './ExecutionStream';

export function ChatArea() {
  const { selectedSession, showNewChat } = useAgent();

  return (
    <div className="flex-1 overflow-y-auto">
      {showNewChat || !selectedSession ? (
        /* New Chat Form - Centered */
        <NewChatForm />
      ) : (
        /* Active Session View */
        <section className="h-full flex flex-col">
          <SessionDetails />
          <ExecutionStream />
        </section>
      )}
    </div>
  );
}
