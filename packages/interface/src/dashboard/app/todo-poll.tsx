import { createContext, useContext } from 'react';
import type { TodoPage } from '../lib/api-types';
import type { PollingState } from '../lib/use-polling';

/**
 * Issue #514: the shell's badge and the To-do page read the same endpoint,
 * and each polled it on its own, so the landing page sent two To-do
 * requests on two timers. The shell now runs the one poll and hands its
 * state to the page through this context.
 */
const TodoPollContext = createContext<PollingState<TodoPage> | null>(null);

export const TodoPollProvider = TodoPollContext.Provider;

export function useTodoPoll(): PollingState<TodoPage> {
  const poll = useContext(TodoPollContext);
  if (poll === null) throw new Error('useTodoPoll must be used inside the app shell');
  return poll;
}
