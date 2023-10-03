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
import { editConversation, pruneConversation } from '../../chat/messagePersistence';

type NavigateState = {
  activeConversation?: string; // uuid
  processReplace?: boolean,
  closeConversation?: boolean,
  replaceConversation?: boolean,
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
      teardownConversation(action.payload.conversation);

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

function navMessage(navigate: NavigateFunction, message: MessageDB, replace: boolean = false, model: ConversationMode = "paused") {
  const params = new URLSearchParams();

  params.append("ln", message.hash);
  params.append("model", model);

  navigate(`?${params.toString()}`, { replace, state: { processReplace: true } as NavigateState });
}

function navConversation(navigate: NavigateFunction, runningConversation: RunningConversation, replace: boolean = false) {
  const params = conversationToSearchParams(runningConversation.conversation);

  navigate(`?${params.toString()}`, { replace, state: { activeConversation: runningConversation.id } as NavigateState });
}

type RemixParams = {
  model?: ConversationMode
  updatedFunctions?: FunctionOption[]
  hash?: string
}

// if existing convo is paused then we want to replace the existing convo (both via nav and via state)
// if existing convo is not paused then we want to push the new convo via nav into a new state
function navRemix(navigate: NavigateFunction, activeConversation: RunningConversation, remixParams: RemixParams) {
  const {model, updatedFunctions, hash} = remixParams;

  const newNavParams = conversationToSearchParams(activeConversation.conversation);

  if (model) newNavParams.set('model', model);
  if (updatedFunctions) newNavParams.set('functions', JSON.stringify(updatedFunctions.map(f => f.name)));
  if (hash) newNavParams.set('ln', hash);

  if (activeConversation.conversation.model === "paused") {
    navigate(`?${newNavParams.toString()}`, { replace: true, state: { processReplace: true, replaceConversation: true, activeConversation: activeConversation.id } as NavigateState });
  }
  else {
    navigate(`?${newNavParams.toString()}`, { state: {} as NavigateState });
  }
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
  const replaceConversation = state?.replaceConversation ?? false;
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

  if (eventConversationUuid && !replaceConversation) { // we want replaceConversation to lead to creating a new convo below
    const runningConversation = currentRunningConversations.get(eventConversationUuid);
    if (runningConversation) {
      if (closeConversation) {
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
      // Mapping and flattening nav events to actions
      concatMap(async event => {
        // This is a bit of a hack to get around the fact that we can't await in a scan
        // I'm basically thinking of it as a paper-thin middleware to handle async precusory reads

        // It's important to fetch this value here, inside the async function, so that it has
        // the current value on each invocation of the function. That way there won't ever be
        // a race condition vs the reducerState value getting updated since everything after this
        // until and including the `subscribe` is synchronous.
        const runningConversationMap = reducerState.value.runningConversationMap;
        return await handleNavEvent(db, event, runningConversationMap);
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
  // we want to make sure that the history is corrected with the right convo id so that the back button works as expected
  // otherwise it would keep creating new conversations every time we re-popped the history
  // The reason why we're setting up a listener and not just doing it once is because they may have triggered a series of
  // queued history events, and we want to make sure that we're replacing the right one so we're only reacting to the
  // most recent one with a debounce, which means we'll intentionally miss it if there's further events on its heels.
  // but that's okay because if they come back to it in the history then it will still trigger this hook to correct it.
  // if they don't come back to that history event, then it's okay because no harm done
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

  const openMessage = useCallback((message: MessageDB, model: ConversationMode = "paused") => {
    if (activeRunningConversation) {
      const remixParams: RemixParams = {hash: message.hash, model};
      navRemix(navigate, activeRunningConversation, remixParams);
    }
    else {
      navMessage(navigate, message, false, model);
    }
  }, [navigate, activeRunningConversation]);

  const switchToConversation = useCallback((runningConversation: RunningConversation) => {
    const message = getLastMessage(runningConversation.conversation);
    if (!message) return; // TODO: bit of an edge case of when a conversation is empty, just skipping over it for now
    // TODO: it may be possible to work around this issue by making the conversation messages typed to be non-empty, then we could always asssume there is a last message
    // at time of writing, removing this guard would have the effect of it sending them to the root. instead we're nooping

    navConversation(navigate, runningConversation);
  }, [navigate, navConversation]);

  const changeModel = useCallback((model: ConversationMode) => {
    if (!activeRunningConversation) return;

    navRemix(navigate, activeRunningConversation, {model});
  }, [activeRunningConversation, navRemix, navigate]);

  const changeFunctions = useCallback((updatedFunctions: FunctionOption[]) => {
    if (!activeRunningConversation) return;

    navRemix(navigate, activeRunningConversation, {updatedFunctions});
  }, [activeRunningConversation, navRemix, navigate]);

  //////////
  // The below commands are expected to drop the new convo into "paused" - the above commands are not
  //////////
  const editMessage = useCallback(async (messageToEdit: MessageDB, newContent: string) => {
    if (!activeRunningConversation) return;

    const messagesUpToEdit = await db.getConversationFromLeaf(messageToEdit.hash);
    if (messagesUpToEdit.length === 0) return;

    const lastMessage = getLastMessage(activeRunningConversation.conversation);
    if (!lastMessage) return;

    const newLeafMessage = await editConversation(lastMessage, messageToEdit, {role: messageToEdit.role, content: newContent});
    if(newLeafMessage.hash === lastMessage.hash) return;

    openMessage(newLeafMessage); // TODO: add a new special replace existing convo action when the convo is paused
  }, [db, activeRunningConversation, openMessage]);

  const pruneMessage = useCallback(async (message: MessageDB) => {
    console.log("test", activeRunningConversation, activeRunningConversation && getLastMessage(activeRunningConversation.conversation))
    if (!activeRunningConversation) return;

    const lastMessage = getLastMessage(activeRunningConversation.conversation);
    if (!lastMessage) return;

    const newLeafMessage = await pruneConversation(lastMessage, [message.hash]);
    if(newLeafMessage.hash == lastMessage.hash) return;

    openMessage(newLeafMessage); // TODO: same as above
  }, [activeRunningConversation, openMessage]);

  const openSha = useCallback(async (sha: string) => {
    const message = await db.getMessageByHash(sha);
    if (!message) return;

    console.log("openSha", message)

    openMessage(message);
  }, [db, openMessage]);

  return {
    activeRunningConversation,
    runningConversations,
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
