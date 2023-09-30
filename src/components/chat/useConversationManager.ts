import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { BehaviorSubject, Subject, concatMap, debounceTime, filter, of, scan, tap, withLatestFrom } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, ConversationMode, createConversation, getLastMessage, isConversationMode, observeNewMessages, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/aiAgent';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { RouterState } from '@remix-run/router';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import { v4 as uuidv4 } from 'uuid';

type NavigateState = {
  activeConversation?: string; // uuid
  processReplace?: boolean,
  closeConversation?: boolean,
};

function buildParticipatedConversation(db: ConversationDB, messages: MessageDB[], model: ConversationMode = "gpt-3.5-turbo", functions: string[] = []): Conversation {
  const functionOptions = getAllFunctionOptions().filter(f => functions.includes(f.name));

  return addAssistant(createConversation(messages, model, functionOptions), db);
}

type ConversationAction =
  | { type: 'SET_ACTIVE'; payload: RunningConversation }
  | { type: 'ADD_ACTIVE'; payload: Conversation }
  | { type: 'SET_INACTIVE' }
  | { type: 'CLOSE'; payload: RunningConversation }
  ;

type ConversationState = {
  runningConversationMap: Map<string, RunningConversation>,
  activeRunningConversation: RunningConversation | null,
};

export type RunningConversation = {
  conversation: Conversation,
  id: string
}

// TODO: remove unused actions after we're done sorting out model/function changes
function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  console.log("dispatch!", action, state)
  switch (action.type) {
    case 'SET_ACTIVE':
      return {...state, activeRunningConversation: action.payload, runningConversationMap: new Map(state.runningConversationMap).set(action.payload.id, action.payload)};
    case 'ADD_ACTIVE':
      const newRunningConversation = {conversation: action.payload, id: uuidv4()};
      return {...state, activeRunningConversation: newRunningConversation, runningConversationMap: new Map(state.runningConversationMap).set(newRunningConversation.id, newRunningConversation)};
    case 'SET_INACTIVE':
      return {...state, activeRunningConversation: null};
    case 'CLOSE':
      const newMap = new Map(state.runningConversationMap);
      newMap.delete(action.payload.id);
      return {...state, activeRunningConversation: null, runningConversationMap: newMap};
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
}

function navRoot(navigate: NavigateFunction, replace: boolean = false, processReplace: boolean = false) {
  navigate('?', { replace: replace, state: { processReplace } as NavigateState });
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

function navMessage(navigate: NavigateFunction, message: MessageDB, replace: boolean = false) {
  const params = new URLSearchParams();

  params.append("ln", message.hash);

  navigate(`?${params.toString()}`, { replace, state: { processReplace: true } as NavigateState });
}

function navConversation(navigate: NavigateFunction, runningConversation: RunningConversation, replace: boolean = false) {
  const params = conversationToSearchParams(runningConversation.conversation);

  navigate(`?${params.toString()}`, { replace, state: { activeConversation: runningConversation.id } as NavigateState });
}

function navRemix(navigate: NavigateFunction, activeConversation: Conversation, remixParams: {model?: string, updatedFunctions?: FunctionOption[], hash?: string}) {
  const {model, updatedFunctions, hash} = remixParams;

  const newNavParams = conversationToSearchParams(activeConversation);

  if (model) newNavParams.set('model', model);
  if (updatedFunctions) newNavParams.set('functions', JSON.stringify(updatedFunctions.map(f => f.name)));
  if (hash) newNavParams.set('ln', hash);

  navigate(`?${newNavParams.toString()}`, { state: {} as NavigateState });
}

function navCloseConversation(navigate: NavigateFunction, runningConversation: RunningConversation) {
  const params = conversationToSearchParams(runningConversation.conversation);

  navigate(`?`, { state: { activeConversation: runningConversation.id, closeConversation: true } as NavigateState });
}

// NB: Hoisted this out of the useEffect and ditched the isMounted check for simplicity
async function handleNavEvent(db: ConversationDB, event: RouterState, currentRunningConversations: Map<string, RunningConversation>): Promise<ConversationAction | undefined> {
  const { historyAction, location: eventLocation } = event;
  const eventSearch = eventLocation.search;
  const state: NavigateState | null = eventLocation.state ?? null;
  const key = eventLocation.key;
  const eventConversationUuid = state?.activeConversation ?? null;
  const processReplace = state?.processReplace ?? false;
  const closeConversation = state?.closeConversation ?? false;
  const eventParams = new URLSearchParams(eventSearch);
  const eventLeafNodeHash = eventParams.get('ln') ?? null;

  console.log("handleNavEvent", event)

  if (state === null || key === "default") {
    // any logic around setting up the first navigation should go here
    // but this may not be the right mechanism to handle that
  }

  if (historyAction === "REPLACE" && !processReplace) {
    // no-op, this was just done to align the URL
    return;
  }

  if (eventConversationUuid) {
    const runningConversation = currentRunningConversations.get(eventConversationUuid);
    if (runningConversation) {
      if (closeConversation) {
        currentRunningConversations.delete(eventConversationUuid);
        teardownConversation(runningConversation.conversation);
        return { type: 'CLOSE', payload: runningConversation };
      }

      return { type: 'SET_ACTIVE', payload: runningConversation };
    }
  }

  if (eventLeafNodeHash) {
    const message = await db.getMessageByHash(eventLeafNodeHash);
    // NB: Everything happening here is read-only, so we don't need to worry about the component unmounting
    //if (!isMounted) return;

    if (message) {
      const conversationFromDb = await db.getConversationFromLeaf(message.hash);
      // NB: Everything happening here is read-only, so we don't need to worry about the component unmounting
      //if (!isMounted) return;

      const functionNames = JSON.parse(eventParams.get('functions') ?? '[]');
      const rawModel: string = eventParams.get('model') ?? "";
      const model: ConversationMode = isConversationMode(rawModel) ? rawModel : 'gpt-3.5-turbo';

      const conversation = buildParticipatedConversation(db, conversationFromDb, model, functionNames);
      if (eventConversationUuid) {
        return { type: 'SET_ACTIVE', payload: { conversation, id: eventConversationUuid } };
      }
      else {
        return { type: 'ADD_ACTIVE', payload: conversation };
      }
    }
  }

  return { type: 'SET_INACTIVE' };
}

const initialReducerState: ConversationState = {
  runningConversationMap: new Map<string, RunningConversation>(),
  activeRunningConversation: null
};

export function useConversationsManager(db: ConversationDB) {
  const navigate = useNavigate();

  const [activeRunningConversation, setActiveRunningConversation] = useState<RunningConversation | null>(null);
  const [runningConversationMap, setRunningConversationMap] = useState<Map<string, RunningConversation>>(new Map<string, RunningConversation>());

  const runningConversations = useMemo(() => {
    return Array.from(runningConversationMap.values());
  }, [runningConversationMap]);

  console.log("activeRunningConversation", activeRunningConversation)
  console.log("runningConversationMap", runningConversationMap)

  // The value of this state is only read from the prevValue of the setter
  const [_correctedHistory, setCorrectedHistory] = useState<boolean>(false);

  useEffect(() => {
    console.log("manager setup!")
    let isMounted = true

    const routerStream: Subject<RouterState> = (window as any).$app.routerStream;
    const reducerState: BehaviorSubject<ConversationState> = new BehaviorSubject(initialReducerState);

    const subscription = routerStream.pipe(
      withLatestFrom(reducerState),

      // Mapping and flattening nav events to actions
      concatMap(async ([event, reducerState]) => {
        // This is a bit of a hack to get around the fact that we can't await in a scan
        // I'm basically thinking of it as a paper-thin middleware to handle async precusory reads
        return await handleNavEvent(db, event, reducerState.runningConversationMap);
      }),
      filter(action => action !== undefined),

      tap(action => {
        console.log("action", action)
      }),

      // State Reduction with Scan
      scan((currentState, action) => {
        return conversationReducer(currentState, action as ConversationAction);
      }, reducerState.value), // so that we respect the initial state

      filter(() => isMounted),

      tap(finalState => {
        setRunningConversationMap(finalState.runningConversationMap);
        setActiveRunningConversation(finalState.activeRunningConversation);
      }),
    ).subscribe(reducerState);


    return () => {
      console.log("manager teardown!")
      subscription.unsubscribe();
      reducerState.complete();
      reducerState.value.runningConversationMap.forEach(({conversation}) => teardownConversation(conversation));

      isMounted = false;
    }
  }, [])

  // This useEffect is for handling the case where the user navigates directly to a conversation, ie deep linking
  useEffect(() => {
    if (!activeRunningConversation) return;

    const routerStream: Subject<RouterState> = (window as any).$app.routerStream;

    const subscription = routerStream.pipe(
      debounceTime(0), // debounce so that we're not queueing a history correction on top of a totally different nav event
      filter(event => {
        const { historyAction, location: eventLocation } = event;
        const eventSearch = eventLocation.search;
        const state: NavigateState | null = eventLocation.state ?? null;
        const eventConversationUuid = state?.activeConversation ?? null;
        const eventParams = new URLSearchParams(eventSearch);
        const eventLeafNodeHash = eventParams.get('ln') ?? null;

        return !eventConversationUuid && !!eventLeafNodeHash && historyAction === "POP";
      }),
      tap(() => navConversation(navigate, activeRunningConversation, true)),
    ).subscribe();

    return () => {
      subscription.unsubscribe();
    }
  }, [activeRunningConversation, navigate])

  useEffect(() => {
    if (!activeRunningConversation) return;

    const subscription = observeNewMessages(activeRunningConversation.conversation, false)
      .pipe(
        debounceTime(0), // only ever process the last message
        tap(_message => {
          navConversation(navigate, activeRunningConversation, true);
        })
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [activeRunningConversation, navConversation, navigate]);

  const goBack = useCallback(() => {
    if (!activeRunningConversation) return;

    navCloseConversation(navigate, activeRunningConversation);
    navRoot(navigate, true);
  }, [navigate, activeRunningConversation]);

  const minimize = useCallback(() => {
    if (!activeRunningConversation) return;

    navRoot(navigate);
  }, [navigate, activeRunningConversation]);

  const openMessage = useCallback((message: MessageDB) => {
    if (activeRunningConversation) {
      navRemix(navigate, activeRunningConversation.conversation, {hash: message.hash});
    }
    else {
      navMessage(navigate, message);
    }
  }, [navigate, activeRunningConversation]);

  const openSha = useCallback(async (sha: string) => {
    const message = await db.getMessageByHash(sha);
    if (!message) return;

    openMessage(message);
  }, [db, openMessage]);

  const switchToConversation = useCallback((runningConversation: RunningConversation) => {
    const message = getLastMessage(runningConversation.conversation);
    if (!message) return; // TODO: bit of an edge case of when a conversation is empty, just skipping over it for now
    // TODO: it may be possible to work around this issue by making the conversation messages typed to be non-empty, then we could always asssume there is a last message
    // at time of writing, removing this guard would have the effect of it sending them to the root. instead we're nooping

    navConversation(navigate, runningConversation);
  }, [navigate, navConversation]);

  const changeModel = useCallback((model: string) => {
    if (!activeRunningConversation) return;

    navRemix(navigate, activeRunningConversation.conversation, {model});
  }, [activeRunningConversation, navRemix, navigate]);

  const changeFunctions = useCallback((updatedFunctions: FunctionOption[]) => {
    if (!activeRunningConversation) return;

    navRemix(navigate, activeRunningConversation.conversation, {updatedFunctions});
  }, [activeRunningConversation, navRemix, navigate]);

  return {
    activeRunningConversation,
    runningConversations,
    goBack,
    minimize,
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions,
  };
}
