import { useEffect, useCallback, useReducer, useMemo, useState } from 'react';
import { Subject, debounceTime, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { createParticipant } from '../../chat/participantSubjects';
import { NavigationType, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { pluckLast, subscribeUntilFinalized } from '../../chat/rxjsUtilities';

type NavigateState = {
  activeConversation: string | null; // uuid
};

const db = new ConversationDB();

function buildParticipatedConversation(messages: MessageDB[], model: string = "gpt-3.5-turbo") {
  return addAssistant(addParticipant(createConversation(messages), createParticipant('user')), model);
}

type ConversationAction =
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_CONVERSATION'; payload: Conversation }
  | { type: 'SET_ACTIVE'; payload: string } // uuid
  | { type: 'SET_INACTIVE' }
  ;

type ConversationState = {
  runningConversations: Map<string, Conversation>,
  activeConversation: Conversation | null
};

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
      const tentativeConversation = state.runningConversations.get(action.payload) ?? null;
      if (!tentativeConversation) throw new Error(`Conversation with id ${action.payload} does not exist!`);

      return {...state, activeConversation: tentativeConversation};
    case 'SET_INACTIVE':
      return {...state, activeConversation: null};
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
}

/*

TODO: halfway through a refactor of merging together nav state management and conversation management.

Going back and forth on which part should be responsible for what, so far...
* running conversations and active conversation are both part of the reducer state, which is the main source of truth
* only changes in nav state can induce a dispatch (TODO - still one exception to this with changing model/functions but that will get turned into a nav action soon)
* a series of command functions will be returned to Client like [note: paraphrased] goBack, goToSha, switchModel(fast/slow), setFunctions(functions), etc
* command functions will generally induce a nav state change, which will trigger a dispatch, which will then change the state to be rendered

*/

export function useConversationsManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const navType: NavigationType = useNavigationType();

  const navStateUUID: string | null = location.state?.activeConversation ?? null;

  const paramLeafHash = params.get('ln');
  const [{runningConversations, activeConversation}, dispatch] = useReducer(conversationReducer, {runningConversations: new Map<string, Conversation>(), activeConversation: null});

  console.log("paramLeafHash", paramLeafHash)
  console.log("navStateUUID", navStateUUID)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  // these don't need to be memoized becaues they're only used internally and don't depend on anything
  function navRoot(replace: boolean = false) {
    navigate('?', { replace: replace, state: {} });
  }

  function navConversation(conversation: Conversation, replace: boolean = false) {
    const lastMessage = pluckLast(conversation.outgoingMessageStream);
    if (!lastMessage) {
      console.error("Empty conversation!", conversation)
      return
    }

    navConversationByUuidOrSha(conversation.id, lastMessage.hash, replace);
  }

  function navConversationByUuidOrSha(uuid: string | null, sha: string, replace: boolean = false) {
    navigate(`?ln=${sha}`, { replace, state: { activeConversation: uuid } });
  }

  useEffect(() => {
    return () => {
      console.log("manager teardown!")
      runningConversations.forEach(conversation => teardownConversation(conversation))
    }
  }, [])

  useEffect(() => {
    console.log("useEffect!", [location, navType, navStateUUID, paramLeafHash], runningConversations, activeConversation)
    let isMounted = true;

    function handleLoadFromLeaf(leafHash: string) {
      return db.getMessageByHash(leafHash).then(async message => {
        if (!message || !isMounted) {
          console.error("message retrieval aborted!", message, isMounted)
          throw new Error();
        }

        const conversationFromDb = await db.getConversationFromLeaf(message.hash);
        if (!isMounted) {
          console.error("message got unmounted before it could get switched to!", message)
          throw new Error();
        }

        const conversation = buildParticipatedConversation(conversationFromDb);
        dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
        dispatch({ type: 'SET_ACTIVE', payload: conversation.id });
        return conversation;
      });
    }

    function handlePushStateNavigation() {
      if (!paramLeafHash) {
        dispatch({ type: 'SET_INACTIVE' });
        return
      }

      if (navStateUUID) {
        const runningConversation = runningConversations.get(navStateUUID);
        if (runningConversation) {
          dispatch({ type: 'SET_ACTIVE', payload: runningConversation.id });
          navConversation(runningConversation, true);

          return
        }
      }

      handleLoadFromLeaf(paramLeafHash)
        .then(conversation => {
          if(!isMounted) return;

          navConversation(conversation, true);
        });
    }

    if (navType === "POP") { // forward/back history actions or a new page load
      if (location.state === null) {
        console.log("NAVIGATE - new page load", location, paramLeafHash, navStateUUID, runningConversations, activeConversation);

        if (paramLeafHash) {
          handleLoadFromLeaf(paramLeafHash).then(conversation => {
            if(!isMounted) return;

            navRoot(true);
            navConversation(conversation);
          })
          .catch(e => {
            console.error("message retrieval failed!", e)
            if(!isMounted) return;

            navRoot(true);
          })
        }
        else {
          dispatch({ type: 'SET_INACTIVE' });
        }
      }
      else {
        console.log("NAVIGATE - forward/back history actions or reload", location, navStateUUID, runningConversations, activeConversation);

        handlePushStateNavigation();
      }
    }
    else if (navType === "PUSH") { // pushState-based forward navigation to new url
      console.log("NAVIGATE - pushState-based forward navigation to new url", location, navStateUUID, runningConversations, activeConversation);

      handlePushStateNavigation();
    }
    else if (navType === "REPLACE") { // pushState-based replace navigation to replace current history entry with new url
      console.log("NAVIGATE - replace", location, navStateUUID, runningConversations, activeConversation);
      // no-op, this was just done to align the URL
    }

    return () => {
      isMounted = false
    }
  }, [location, navType, navStateUUID, paramLeafHash]);

  useEffect(() => {
    if (!activeConversation) return;

    const newMessages = new Subject<MessageDB>();

    const forwarderSubscription = subscribeUntilFinalized(activeConversation.outgoingMessageStream, newMessages);

    const subscription = newMessages
      .pipe(
        debounceTime(0), // only ever process the last message
        tap(message => {
          if (message.hash !== paramLeafHash) {
            navConversation(activeConversation, true);
          }
        })
      )
      .subscribe();

    return () => {
      forwarderSubscription.unsubscribe();
      subscription.unsubscribe();
    };
  }, [activeConversation, paramLeafHash]);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const openConversation = useCallback((newLeafHash: string, uuid: string | null = null) => {
    navConversationByUuidOrSha(uuid, newLeafHash);
    console.log("NAVIGATING", uuid, newLeafHash)
  }, [navigate]);

  const changeModel = useCallback((model: string) => {
    if (!activeConversation) return;

    const messages: MessageDB[] = [];

    activeConversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const newConversation = buildParticipatedConversation(messages, model);
    const newConversationIdCorrected = { ...newConversation, id: activeConversation.id };
    dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
    teardownConversation(activeConversation);
  }, [activeConversation]);

  const changeFunctions = useCallback((updatedFunctions: FunctionOption[]) => {
    if (!activeConversation) return;

    const messages: MessageDB[] = [];

    activeConversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const conversationWithoutAssistant = addParticipant(createConversation(messages), createParticipant('user'));
    conversationWithoutAssistant.functions = updatedFunctions;
    const newConversation = addAssistant(conversationWithoutAssistant, 'gpt-3.5-turbo');

    // TODO: this is a hack to be able to replace the conversation, rather than add a new one
    const newConversationIdCorrected = { ...newConversation, id: activeConversation.id };
    dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
    teardownConversation(activeConversation);
  }, [activeConversation]);

  return {
    activeConversation,
    runningConversations,
    goBack,
    openConversation, // sha, uuid
    changeModel, // uuid, model
    changeFunctions, // uuid, functions
  };
}
