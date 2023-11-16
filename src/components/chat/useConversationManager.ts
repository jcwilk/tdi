import { useEffect, useCallback, useMemo, useState } from 'react';
import { BehaviorSubject, concatMap, debounceTime, filter, from, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, ConversationMode, getLastMessage, isConversationMode, observeNewMessages } from '../../chat/conversation';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { RouterState } from '@remix-run/router';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import { editConversation, pruneConversation } from '../../chat/messagePersistence';
import { ParticipantRole } from '../../chat/participantSubjects';
import { ConversationSpec, RunningConversation, conversationToSpec, useConversationSlot } from './useConversationStore';
import { concatTap } from '../../chat/rxjsUtilities';
import { mirrorPinsToDB } from '../../chat/convoPinning';
import usePinSyncing from './usePinSyncing';

type NavigateState = {
  activeConversation?: string; // uuid
};

function navRoot(navigate: NavigateFunction, replace: boolean = false) {
  navigate('?', { replace: replace });
}

const rootSearchParams = new URLSearchParams();

function conversationToSearchParams(conversation: Conversation): URLSearchParams {
  const lastMessage = getLastMessage(conversation);

  if (!lastMessage) return rootSearchParams;

  const params = new URLSearchParams();

  params.append("ln", lastMessage.hash);
  params.append("model", conversation.model);
  params.append("functions", JSON.stringify(conversation.functions.map(f => f.name)));

  return params;
}

function navConversation(navigate: NavigateFunction, runningConversation: RunningConversation, replace: boolean = false) {
  const params = conversationToSearchParams(runningConversation.conversation);

  navigate(`?${params.toString()}`, { replace, state: { activeConversation: runningConversation.id } as NavigateState });
}

function routerStateToSlotId(routerState: RouterState): string {
  const state: NavigateState | undefined = routerState.location.state;
  return state?.activeConversation ?? routerState.location.key;
}

async function routerStateToConversationSpec(db: ConversationDB, routerState: RouterState): Promise<ConversationSpec | undefined> {
  const eventSearch = routerState.location.search;
  const eventParams = new URLSearchParams(eventSearch);
  const eventLeafNodeHash = eventParams.get('ln') ?? null;
  if (!eventLeafNodeHash) return undefined;

  const message = await db.getMessageByHash(eventLeafNodeHash);
  if (!message) return undefined;

  const rawModel: string = eventParams.get('model') ?? "";
  const model: ConversationMode = isConversationMode(rawModel) ? rawModel : 'gpt-4';
  const functionNames = JSON.parse(eventParams.get('functions') ?? '[]');
  const functions = getAllFunctionOptions().filter(f => functionNames.includes(f.name));

  return {
    tail: message,
    model,
    functions,
  };
}

const defaultSpecSettings = {
  model: "gpt-4" as ConversationMode,
  functions: [] as FunctionOption[],
};

export function useConversationsManager(db: ConversationDB) {
  const navigate = useNavigate();

  // Hack for getting access to the stream of nav events. Might be more appropriate to use a context for this.
  // However, I've already spent too much time on the navigation system so I'm exercising some restraint.
  const routerStream: BehaviorSubject<RouterState> = (window as any).$app.routerStream;

  const [activeConversationId, setActiveConversationId] = useState<string>(routerStateToSlotId(routerStream.value));

  const { runningConversation, setConversation, closeConversation, getNewSlot } = useConversationSlot(activeConversationId);

  const [leafMessage, setLeafMessage] = useState<MessageDB | undefined>(undefined);

  usePinSyncing(1000 * 60);

  const currentConversationSpec = useMemo(() => {
    if (!runningConversation || !leafMessage) return undefined;

    return conversationToSpec(runningConversation.conversation);
  }, [runningConversation, leafMessage]);

  // This handles receiving nav events (PUSH/POP) and adjusting or creating a conversation slot to match
  useEffect(() => {
    console.log("manager setup!")

    // Process any pending pins first, then start interpreting nav events afterwards
    const subscriptionPromise = mirrorPinsToDB(db).then(() => {
      return routerStream.pipe(
        //tap(routerState => console.log("router state", routerState)),
        filter(routerState => routerState.historyAction !== "REPLACE"),
        debounceTime(0),
        concatMap(async routerState => {
          const conversationSpec = await routerStateToConversationSpec(db, routerState);

          return [routerState, conversationSpec] as [RouterState, ConversationSpec | undefined];
        }),
        // This sets our slot to match the nav event for push and pop
        tap(([routerState, _conversationSpec]) => {
          const slotId = routerStateToSlotId(routerState);
          //console.log("setting active conversation id", slotId);
          setActiveConversationId(slotId);
        }),

        filter((args): args is [RouterState, ConversationSpec] => {
          const [routerState, conversationSpec] = args;
          return !!conversationSpec && routerState.historyAction === "POP"
        }),

        // This changes the conversation in the slot to match the nav event for pop
        concatTap(([routerState, conversationSpec]) => {
          const slotId = routerStateToSlotId(routerState);
          return from(setConversation(conversationSpec, slotId));
        })
      ).subscribe();
    });

    return () => {
      console.log("manager teardown!")
      subscriptionPromise.then(subscription => subscription.unsubscribe());
    }
  }, []);

  useEffect(() => {
    if (!runningConversation) {
      setLeafMessage(undefined);
      return;
    }

    setLeafMessage(getLastMessage(runningConversation.conversation));

    const subscription = observeNewMessages(runningConversation.conversation, false)
      .pipe(
        debounceTime(0), // only ever process the last message
        tap(message => {
          setLeafMessage(message);
          navConversation(navigate, runningConversation, true);
        })
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [runningConversation, navConversation, navigate]);

  const goBack = useCallback(() => {
    if (!runningConversation) return;

    closeConversation();
    navRoot(navigate);
  }, [navigate, closeConversation, runningConversation]);

  const minimize = useCallback(() => {
    if (!runningConversation) return;

    navRoot(navigate);
  }, [navigate, runningConversation]);

  const remix = useCallback(async (changedParams: {model?: ConversationMode, functions?: FunctionOption[], tail?: MessageDB}) => {
    if (!currentConversationSpec) return;

    const newSpec = { ...currentConversationSpec, ...changedParams };
    if (currentConversationSpec.model === 'paused') {
      const newRunningConversation = await setConversation(newSpec);
      navConversation(navigate, newRunningConversation, true);
    }
    else {
      const newRunningConversation = await getNewSlot(newSpec);
      navConversation(navigate, newRunningConversation);
    }
  }, [currentConversationSpec, navigate, getNewSlot, navConversation]);

  const openMessage = useCallback(async (message: MessageDB) => {
    if (!currentConversationSpec) {
      const newRunningConversation = await getNewSlot({ tail: message, ...defaultSpecSettings });
      //console.log("navigating!")
      navConversation(navigate, newRunningConversation);
      return;
    }

    remix({tail: message});
  }, [navigate, remix, currentConversationSpec, getNewSlot, defaultSpecSettings]);

  const switchToConversation = useCallback((runningConversation: RunningConversation) => {
    navConversation(navigate, runningConversation);
  }, [navigate, navConversation]);

  const changeModel = useCallback(async (model: ConversationMode) => {
    //console.log("changing model!", model)
    remix({model});
  }, [remix]);

  const changeFunctions = useCallback((functions: FunctionOption[]) => {
    remix({functions});
  }, [remix]);

  const editMessage = useCallback(async (messageToEdit: MessageDB, newContent: string, newRole: ParticipantRole) => {
    if (!runningConversation) return;

    const lastMessage = getLastMessage(runningConversation.conversation);

    const newLeafMessage = await editConversation(runningConversation.conversation.model, lastMessage, messageToEdit, {role: newRole, content: newContent});
    if(newLeafMessage.hash === lastMessage.hash) return;

    await openMessage(newLeafMessage);
  }, [openMessage, runningConversation]);

  const pruneMessage = useCallback(async (message: MessageDB) => {
    if (!runningConversation) return;

    const lastMessage = getLastMessage(runningConversation.conversation);

    const newLeafMessage = await pruneConversation(runningConversation.conversation.model, lastMessage, message);
    if(newLeafMessage.hash == lastMessage.hash) return;

    openMessage(newLeafMessage);
  }, [runningConversation, openMessage]);

  const openSha = useCallback(async (sha: string) => {
    const message = await db.getMessageByHash(sha);
    if (!message) return;

    openMessage(message);
  }, [db, openMessage]);

  return {
    runningConversation,
    goBack,
    minimize,
    editMessage,
    pruneMessage,
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions,
  };
}
