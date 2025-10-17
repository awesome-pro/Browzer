/**
 * ChatArea - Scrollable middle section showing recent sessions or active chat
 */

import { useAgent } from './AgentContext';
import { RecentSessions } from './RecentSessions';
import { SessionDetails } from './SessionDetails';
import { ConversationView } from './ConversationView';

export function ChatArea() {
  const { selectedSession, messages, toolExecutions } = useAgent();

  return (
    <div className="flex-1 overflow-y-auto">
      {!selectedSession ? (
        /* Empty State: Show Recent Sessions */
        <RecentSessions />
      ) : (
        /* Active Session View */
        <section className="h-full flex flex-col">
          <SessionDetails />
          <ConversationView 
            messages={messages} 
            toolExecutions={toolExecutions}
          />
        </section>
      )}
    </div>
  );
}
