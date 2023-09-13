import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Subject, concatMap, debounceTime, filter, scan, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/aiAgent';
import { createParticipant } from '../../chat/participantSubjects';
import { useLocation, useNavigate, NavigateFunction } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { pluckLast, subscribeUntilFinalized } from '../../chat/rxjsUtilities';
import { Router, RouterState } from '@remix-run/router';
import { getAllFunctionOptions } from '../../chat/functionCalling';

type NavigateState = {
  activeConversation: string | null; // uuid
};

const db = new ConversationDB();

function buildParticipatedConversation(messages: MessageDB[], model: string = "gpt-3.5-turbo", functions: string[] = []): Conversation {
  const functionOptions = getAllFunctionOptions().filter(f => functions.includes(f.name));

  return addAssistant(addParticipant(createConversation(messages, model, functionOptions), createParticipant('user')));
}

function pickSearchParams(keys: string[], searchParams: URLSearchParams): URLSearchParams {
  const newSearchParams = new URLSearchParams();

  for (const key of keys) {
    const value = searchParams.getAll(key);
    if (value.length) {
      for (const val of value) {
        newSearchParams.append(key, val);
      }
    }
  }

  return newSearchParams;
}

type ConversationAction =
  | { type: 'SET_ACTIVE'; payload: Conversation } // uuid
  | { type: 'SET_INACTIVE' }
  ;

type ConversationState = {
  runningConversations: Map<string, Conversation>,
  activeConversation: Conversation | null
};

// TODO: remove unused actions after we're done sorting out model/function changes
function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  console.log("dispatch!", action, state)
  switch (action.type) {
    case 'SET_ACTIVE':
      const tentativeConversation = state.runningConversations.get(action.payload.id) ?? null;
      if (tentativeConversation) {
        return {...state, activeConversation: tentativeConversation};
      }
      else {
        return {...state, activeConversation: action.payload, runningConversations: new Map(state.runningConversations).set(action.payload.id, action.payload)};
      }
    case 'SET_INACTIVE':
      return {...state, activeConversation: null};
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
}

function navRoot(navigate: NavigateFunction, replace: boolean = false) {
  navigate('?', { replace: replace, state: {} as NavigateState });
}

function navConversation(navigate: NavigateFunction, conversation: Conversation, replace: boolean = false) {
  const lastMessage = pluckLast(conversation.outgoingMessageStream);
  if (!lastMessage) {
    console.error("Empty conversation!", conversation)
    return
  }

  const params = new URLSearchParams();
  params.append("ln", lastMessage.hash);
  params.append("model", conversation.model);
  params.append("functions", JSON.stringify(conversation.functions.map(f => f.name)));

  navConversationByUuidOrSha(navigate, conversation.id, params, replace);
}

function navConversationByUuidOrSha(navigate: NavigateFunction, uuid: string | null, params: URLSearchParams, replace: boolean = false) {
  navigate(`?${params.toString()}`, { replace, state: { activeConversation: uuid } as NavigateState });
}

export function useConversationsManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const paramLeafHash = params.get('ln');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const [runningConversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  // this is just for the cleanup function so it can tear them all down
  const runningConversationsRef = useRef(runningConversations);

  console.log("paramLeafHash", paramLeafHash)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  const [correctedHistory, setCorrectedHistory] = useState<boolean>(false);
  const navStream = useMemo(() => new Subject<RouterState>(), []);
  const navParams = useMemo(() => pickSearchParams(['ln', 'model', 'functions'], params), [location.search]);

  useEffect(() => {
    let isMounted = true

    const handleNavEvent = async (event: RouterState, currentRunningConversations: Map<string, Conversation>): Promise<ConversationAction | undefined> => {
      const { historyAction, location: eventLocation } = event;
      const { search: eventSearch, state } = eventLocation;
      const eventConversationUuid = state?.activeConversation ?? null;
      const eventParams = new URLSearchParams(eventSearch);
      const eventLeafNodeHash = eventParams.get('ln') ?? null;

      if (state === null) {
        // from my testing and understanding, this can never be detected because we set up the listener after we get to the page
        // so if we detect it, something about my understanding is wrong so might be worth investigating
        // Also, we immediately replace their entry url with a stateful one, so this should never happen even from back navigating
        console.error("Unexpected new page navigation detection!", event)
        return;
      }

      if (historyAction === "REPLACE") {
        // no-op, this was just done to align the URL
        return;
      }

      if (eventConversationUuid) {
        const runningConversation = currentRunningConversations.get(eventConversationUuid);
        if (runningConversation) {
          return { type: 'SET_ACTIVE', payload: runningConversation };
        }
      }

      if (eventLeafNodeHash) {
        const message = await db.getMessageByHash(eventLeafNodeHash);
        if (!isMounted) return;

        if (message) {
          const conversationFromDb = await db.getConversationFromLeaf(message.hash);
          if (!isMounted) return;

          const functionNames = JSON.parse(eventParams.get('functions') ?? '[]');
          const model = eventParams.get('model') ?? 'gpt-3.5-turbo';

          const conversation = buildParticipatedConversation(conversationFromDb, model, functionNames);
          return { type: 'SET_ACTIVE', payload: conversation };
        }
      }

      return { type: 'SET_INACTIVE' };
    }

    // Step 1: Mapping to Actions
    const actionsObservable = navStream.pipe(
      concatMap(async event => {
        return await handleNavEvent(event, runningConversationsRef.current);
      }),
      filter(action => action !== undefined)
    );

    // Step 2: State Reduction with Scan
    const stateObservable = actionsObservable.pipe(
      scan((currentState, action) => {
        return conversationReducer(currentState, action as ConversationAction);
      }, { runningConversations, activeConversation }) // so that we respect the initial state of the useState hooks
    );

    // Step 3: Subscription and Cleanup
    const subscription = stateObservable.subscribe(finalState => {
      if (!isMounted) return;

      setRunningConversations(finalState.runningConversations);
      runningConversationsRef.current = finalState.runningConversations;
      setActiveConversation(finalState.activeConversation);
    });

    return () => {
      subscription.unsubscribe();

      isMounted = false;
    }
  }, [navStream])

  useEffect(() => {
    const router: Router = (window as any).$app.router;
    let isMounted = true

    router.subscribe((event) => {
      if(!isMounted) return;

      console.log("new nav event!", event);

      navStream.next(event);
    })

    return () => {
      isMounted = false;
    }
  }, [navStream])

  useEffect(() => {
    return () => {
      console.log("manager teardown!", runningConversationsRef.current)
      runningConversationsRef.current.forEach(conversation => teardownConversation(conversation))
    }
  }, [])

  useEffect(() => {
    console.log("active conversation changed!", activeConversation)

    if (activeConversation) {
      navConversation(navigate, activeConversation, true);
    }
    else {
      navRoot(navigate, true);
    }
  }, [activeConversation, navConversation, navRoot, navigate])

  useEffect(() => {
    if (correctedHistory) return;

    navRoot(navigate, true);

    if (paramLeafHash) {
      navConversationByUuidOrSha(navigate, null, navParams);
    }

    setCorrectedHistory(true);
  }, [correctedHistory, setCorrectedHistory, navigate, navRoot, navConversationByUuidOrSha, paramLeafHash]);

  useEffect(() => {
    if (!activeConversation) return;

    const newMessages = new Subject<MessageDB>();

    const forwarderSubscription = subscribeUntilFinalized(activeConversation.outgoingMessageStream, newMessages);

    const subscription = newMessages
      .pipe(
        debounceTime(0), // only ever process the last message
        tap(message => {
          navConversation(navigate, activeConversation, true);
        })
      )
      .subscribe();

    return () => {
      forwarderSubscription.unsubscribe();
      subscription.unsubscribe();
    };
  }, [activeConversation, navConversation, navigate]);

  const navRemix = useCallback((remixParams: {model?: string, updatedFunctions?: FunctionOption[]}) => {
    if (!activeConversation) return;

    const {model, updatedFunctions} = remixParams;

    const newNavParams = new URLSearchParams(navParams);

    if (model) newNavParams.set('model', model);

    if (updatedFunctions) newNavParams.set('functions', JSON.stringify(updatedFunctions.map(f => f.name)));

    navigate(`?${newNavParams.toString()}`, { state: {} as NavigateState });
  }, [activeConversation, navParams]);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const openConversation = useCallback((newLeafHash: string, uuid: string | null = null) => {
    const newNavParams = new URLSearchParams(navParams);
    newNavParams.set('ln', newLeafHash);

    navConversationByUuidOrSha(navigate, uuid, newNavParams);
    console.log("NAVIGATING", uuid, newNavParams)
  }, [navigate, navConversationByUuidOrSha, navParams]);

  const changeModel = useCallback((model: string) => {
    if (!activeConversation) return;

    navRemix({model});
  }, [activeConversation, navRemix]);

  const changeFunctions = useCallback((updatedFunctions: FunctionOption[]) => {
    if (!activeConversation) return;

    navRemix({updatedFunctions});
  }, [activeConversation, navRemix]);

  return {
    activeConversation,
    runningConversations,
    goBack,
    openConversation,
    changeModel,
    changeFunctions,
  };
}
