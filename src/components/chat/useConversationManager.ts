import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Subject, concatMap, debounceTime, filter, scan, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, ConversationMode, createConversation, getLastMessage, isConversationMode, observeNewMessages, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/aiAgent';
import { useLocation, useNavigate, NavigateFunction } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { RouterState } from '@remix-run/router';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import { v4 as uuidv4 } from 'uuid';

type NavigateState = {
  activeConversation: string | null; // uuid
};

function buildParticipatedConversation(db: ConversationDB, messages: MessageDB[], model: ConversationMode = "gpt-3.5-turbo", functions: string[] = []): Conversation {
  const functionOptions = getAllFunctionOptions().filter(f => functions.includes(f.name));

  return addAssistant(createConversation(messages, model, functionOptions), db);
}

type ConversationAction =
  | { type: 'SET_ACTIVE'; payload: RunningConversation }
  | { type: 'ADD_ACTIVE'; payload: Conversation }
  | { type: 'SET_INACTIVE' }
  | { type: 'SET_CORRECTED' }
  ;

type ConversationState = {
  runningConversationMap: Map<string, RunningConversation>,
  activeRunningConversation: RunningConversation | null,
  needsCorrection: boolean,
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
      return {...state, activeRunningConversation: null, needsCorrection: false};
    case 'SET_CORRECTED':
      return {...state, needsCorrection: false};
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
}

function navRoot(navigate: NavigateFunction, replace: boolean = false) {
  navigate('?', { replace: replace, state: {} as NavigateState });
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

function navRemix(navigate: NavigateFunction, activeConversation: Conversation, remixParams: {model?: string, updatedFunctions?: FunctionOption[], hash?: string}) {
  const {model, updatedFunctions, hash} = remixParams;

  const newNavParams = conversationToSearchParams(activeConversation);

  if (model) newNavParams.set('model', model);
  if (updatedFunctions) newNavParams.set('functions', JSON.stringify(updatedFunctions.map(f => f.name)));
  if (hash) newNavParams.set('ln', hash);

  navigate(`?${newNavParams.toString()}`, { state: {} as NavigateState });
}

// NB: Hoisted this out of the useEffect and ditched the isMounted check for simplicity
async function handleNavEvent(db: ConversationDB, event: RouterState, currentRunningConversations: Map<string, RunningConversation>): Promise<ConversationAction | undefined> {
  const { historyAction, location: eventLocation } = event;
  const { search: eventSearch, state } = eventLocation;
  const eventConversationUuid = state?.activeConversation ?? null;
  const eventParams = new URLSearchParams(eventSearch);
  const eventLeafNodeHash = eventParams.get('ln') ?? null;
  const processReplace = !!state?.processReplace;

  console.log("handleNavEvent", event)

  if (state === null) {
    // from my testing and understanding, this can never be detected because we set up the listener after we get to the page
    // so if we detect it, something about my understanding is wrong so might be worth investigating
    // Also, we immediately replace their entry url with a stateful one, so this should never happen even from back navigating
    console.error("Unexpected new page navigation detection!", event)
    //return;
  }

  if (historyAction === "REPLACE" && !processReplace) {
    // no-op, this was just done to align the URL
    return { type: 'SET_CORRECTED' };
  }

  if (eventConversationUuid) {
    const runningConversation = currentRunningConversations.get(eventConversationUuid);
    if (runningConversation) {
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
      return { type: 'ADD_ACTIVE', payload: conversation };
    }
  }

  return { type: 'SET_INACTIVE' };
}

export function useConversationsManager(db: ConversationDB) {
  const navigate = useNavigate();

  const [activeRunningConversation, setActiveRunningConversation] = useState<RunningConversation | null>(null);
  const [runningConversationMap, setRunningConversationMap] = useState<Map<string, RunningConversation>>(new Map<string, RunningConversation>());

  const runningConversations = useMemo(() => {
    return Array.from(runningConversationMap.values());
  }, [runningConversationMap]);

  // this is just for the cleanup function so it can tear them all down
  const runningConversationsRef = useRef(runningConversationMap);

  console.log("activeRunningConversation", activeRunningConversation)
  console.log("runningConversationMap", runningConversationMap)

  // The value of this state is only read from the prevValue of the setter
  const [_correctedHistory, setCorrectedHistory] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true

    const routerStream: Subject<RouterState> = (window as any).$app.routerStream;

    const subscription = routerStream.pipe(
      // Step 1: Mapping and filtering nav events to actions
      concatMap(async event => {
        return await handleNavEvent(db, event, runningConversationsRef.current);
      }),
      filter(action => action !== undefined),

      tap(action => {
        console.log("action", action)
      }),

      // Step 2: State Reduction with Scan
      scan((currentState, action) => {
        return conversationReducer(currentState, action as ConversationAction);
      }, { runningConversationMap, activeRunningConversation, needsCorrection: true }), // so that we respect the initial state of the useState hooks

      // Step 3: Side effects
      tap(finalState => {
        console.log("finalState", finalState)
        if (!isMounted) return;

        // Handling for the case where we need to correct the history on page load
        if (finalState.needsCorrection && finalState.activeRunningConversation) {
          const closureConvo = finalState.activeRunningConversation;
          setCorrectedHistory(prevValue => {
            if (prevValue) return prevValue;

            navRoot(navigate, true);
            navConversation(navigate, closureConvo);
            return true;
          })
        }

        setRunningConversationMap(finalState.runningConversationMap);
        runningConversationsRef.current = finalState.runningConversationMap;
        setActiveRunningConversation(finalState.activeRunningConversation);
      })
    ).subscribe();

    return () => {
      subscription.unsubscribe();

      isMounted = false;
    }
  }, [db])

  useEffect(() => {
    console.log("manager setup!")
    return () => {
      console.log("manager teardown!", runningConversationsRef.current)
      runningConversationsRef.current.forEach(({conversation}) => teardownConversation(conversation))
    }
  }, [])

  useEffect(() => {
    if (!activeRunningConversation) return;

    const subscription = observeNewMessages(activeRunningConversation.conversation, false)
      .pipe(
        debounceTime(0), // only ever process the last message
        tap(message => {
          navConversation(navigate, activeRunningConversation, true);
        })
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [activeRunningConversation, navConversation, navigate]);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const openMessage = useCallback((message: MessageDB) => {
    if (!activeRunningConversation) return;

    navRemix(navigate, activeRunningConversation.conversation, {hash: message.hash});
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
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions,
  };
}
