import { useEffect, useCallback, useReducer, useMemo, useState, useRef } from 'react';
import { Subject, debounceTime, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { createParticipant } from '../../chat/participantSubjects';
import { NavigationType, useLocation, useNavigate, useNavigationType, createBrowserRouter, NavigateFunction } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { pluckAll, pluckLast, subscribeUntilFinalized } from '../../chat/rxjsUtilities';
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
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_CONVERSATION'; payload: Conversation }
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
    case 'ADD_CONVERSATION':
      if (state.runningConversations.has(action.payload.id)) throw new Error(`Conversation with id ${action.payload.id} already exists!`);

      return {...state, runningConversations: new Map(state.runningConversations).set(action.payload.id, action.payload)};
    case 'UPDATE_CONVERSATION':
      if (!state.runningConversations.has(action.payload.id)) throw new Error(`Conversation with id ${action.payload.id} does not exist!`);

      return {...state, runningConversations: new Map(state.runningConversations).set(action.payload.id, action.payload)};
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
  const [{runningConversations, activeConversation}, dispatch] = useReducer(conversationReducer, {runningConversations: new Map<string, Conversation>(), activeConversation: null});

  const runningConversationsRef = useRef(runningConversations);
  useEffect(() => {
    runningConversationsRef.current = runningConversations;
  }, [runningConversations]);

  console.log("paramLeafHash", paramLeafHash)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  const [correctedHistory, setCorrectedHistory] = useState<boolean>(false);

  const navStream = useMemo(() => new Subject<RouterState>(), []);

  const navParams = useMemo(() => pickSearchParams(['ln', 'model', 'functions'], params), [location.search]);

  useEffect(() => {
    let isMounted = true

    const navStreamSubscription = navStream.subscribe(async (event) => {
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
        const runningConversation = runningConversations.get(eventConversationUuid);
        if (runningConversation) {
          dispatch({ type: 'SET_ACTIVE', payload: runningConversation });

          return;
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
          dispatch({ type: 'SET_ACTIVE', payload: conversation });
          return;
        }
      }

      dispatch({ type: 'SET_INACTIVE' });
    })

    return () => {
      navStreamSubscription.unsubscribe();

      isMounted = false;
    }
  }, [navStream, runningConversations])
  // TODO: this still doesn't seem quite right, runningConversations may be able to get stale in rare cases of many navigations
  // maybe I shouldn't be using useReducer? maybe I could use pipe operators to avoid needing to use the render cycle to update the state?

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
  }, [activeConversation]);

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

    // TODO: implement navRemix - also adjust all navigations so that they include the model and functions
    // ideally figure out a way to do this in such a way that it's not horrible to add more parameters in the future
    // I keep going back and forth about whether this should be a normal function or useCallback... maybe it's not a
    // good use of time to put so much effort into avoiding re-renders? would probably mean that we could simplify the
    // code a lot since they could just manage their own dependencies and then each of these could list them as a dependency
    // it'll be important to have the REPLACE actions include this as well. Maybe there could be a function which takes in
    // a conversation and returns the non-standard parameters so we don't have to include default values in there?
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
    openConversation, // sha, uuid
    changeModel, // uuid, model
    changeFunctions, // uuid, functions
  };
}

// const messages = pluckAll(activeConversation.outgoingMessageStream);
// const newConversation = buildParticipatedConversation(messages, model);

// const newConversationIdCorrected = { ...newConversation, id: activeConversation.id };
// dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
// teardownConversation(activeConversation);

// const messages = pluckAll(activeConversation.outgoingMessageStream);
// const conversationWithoutAssistant = addParticipant(createConversation(messages), createParticipant('user'));
// conversationWithoutAssistant.functions = updatedFunctions;
// const newConversation = addAssistant(conversationWithoutAssistant, 'gpt-3.5-turbo');

// // TODO: this is a hack to be able to replace the conversation, rather than add a new one
// const newConversationIdCorrected = { ...newConversation, id: activeConversation.id };
// dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
// teardownConversation(activeConversation);
