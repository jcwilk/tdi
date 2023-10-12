import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Conversation, ConversationMode, createConversation, getLastMessage, teardownConversation } from "../../chat/conversation";
import { ConversationDB, ConversationMessages, MessageDB } from '../../chat/conversationDb';
import { BehaviorSubject, Observable, Subject, Subscription, debounceTime, filter, from, map, merge, of, switchMap, tap } from 'rxjs';
import { FunctionOption } from '../../openai_api';
import { addAssistant } from '../../chat/aiAgent';
import { v4 as uuidv4 } from 'uuid';
import { observeNew } from '../../chat/rxjsUtilities';

export type RunningConversation = {
  conversation: Conversation,
  id: string
}

type ConversationStore = {
  [key: string]: ConversationSlot | undefined;
};

type ConversationSlot = {
  id: string
  currentConversation: BehaviorSubject<RunningConversation | undefined>
  dispatchNewConvo: (conversationSpec: ConversationSpec | Promise<ConversationSpec>, overwrite?: boolean) => Promise<Conversation>,
  teardown: () => void
}

export type ConversationSpec = {
  model?: ConversationMode,
  functions?: FunctionOption[],
  tail: MessageDB
}

export const MessageStoreContext = createContext<ConversationDB | undefined>(undefined);

// Provider for MessageDB
const MessageStoreProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const messageDB = new ConversationDB();

  return (
    <MessageStoreContext.Provider value={messageDB}>
      {children}
    </MessageStoreContext.Provider>
  );
};

export const ConversationStoreContext = createContext<BehaviorSubject<ConversationStore> | undefined>(undefined);

const ConversationStoreProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const conversationStoreSubject = new BehaviorSubject<ConversationStore>({});

  return (
    <ConversationStoreContext.Provider value={conversationStoreSubject}>
      {children}
    </ConversationStoreContext.Provider>
  );
}

export const MessageAndConversationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <MessageStoreProvider>
      <ConversationStoreProvider>
        {children}
      </ConversationStoreProvider>
    </MessageStoreProvider>
  );
}

function buildParticipatedConversation(db: ConversationDB, messages: ConversationMessages, model: ConversationMode = "gpt-3.5-turbo", functionOptions: FunctionOption[] = []): Conversation {
  return addAssistant(createConversation(messages, model, functionOptions), db);
}

function createConversationSlot(id: string, messagesStore: ConversationDB): ConversationSlot {
  console.log("creating slot", id)
  const currentConversation = new BehaviorSubject<RunningConversation | undefined>(undefined);

  currentConversation.subscribe((runningConversation) => console.log("currentConvoUpdated", id, runningConversation));

  const asyncSwitchedInput = new Subject<Observable<Conversation>>();

  asyncSwitchedInput.pipe(
    switchMap((conversationObservable) => conversationObservable),
    map(conversation => ({id, conversation} as RunningConversation)),
    tap((runningConversation) => currentConversation.value && currentConversation.value.conversation !== runningConversation.conversation && teardownConversation(currentConversation.value.conversation)),
    tap((runningConversation) => console.log("tap check", runningConversation)),
  ).subscribe(currentConversation);

  return {
    id,
    currentConversation,
    dispatchNewConvo: (conversationSpec: ConversationSpec | Promise<ConversationSpec>, overwrite: boolean = false) => {
      console.log("dispatch", conversationSpec)
      let promise = ((conversationSpec instanceof Promise) ? conversationSpec : Promise.resolve(conversationSpec)).then(resolvedSpec => {
          console.log("resolvedSpec", resolvedSpec)
          return messagesStore.getConversationFromLeafMessage(resolvedSpec.tail).then(conversation => [conversation, resolvedSpec] as [ConversationMessages, ConversationSpec]);
        }).then(([messages, resolvedSpec]) => {
          console.log("messages", messages)
          if (!overwrite && currentConversation.value) {
            return currentConversation.value.conversation;
          }

          return buildParticipatedConversation(messagesStore, messages, resolvedSpec.model, resolvedSpec.functions);
        });

      promise.then((conversation) => console.log("conversation", conversation));

      asyncSwitchedInput.next(from(promise));

      return promise;
    },
    teardown: () => {
      currentConversation.complete();
      asyncSwitchedInput.complete();
    }
  };
}

export function conversationToSpec(conversation: Conversation): ConversationSpec {
  const lastMessage = getLastMessage(conversation);

  return {
    model: conversation.model,
    functions: conversation.functions,
    tail: lastMessage
  };
}

function getOrCreateSlot(conversationStore: BehaviorSubject<ConversationStore>, key: string, messagesStore: ConversationDB): ConversationSlot {
  let storedSlot = conversationStore.value[key];
  if (!storedSlot) {
    storedSlot = createConversationSlot(key, messagesStore);
    conversationStore.next({ ...conversationStore.value, [key]: storedSlot})
  }
  return storedSlot;
}

// This is for monitoring and interacting with a single conversation slot
// Using it will induce a new conversation slot if one does not exist for the given key
export function useConversationSlot(key: string) {
  const conversationStore = useContext(ConversationStoreContext);
  const messagesStore = useContext(MessageStoreContext);

  if (!conversationStore || !messagesStore) {
    throw new Error('useConversationStore must be used within a ConversationStoreProvider and a MessageStoreProvider');
  }

  const [runningConversation, setRunningConversation] = useState<RunningConversation | undefined>(undefined);

  console.log("conversationStore", conversationStore, conversationStore.value)
  const conversationSlot = getOrCreateSlot(conversationStore, key, messagesStore);

  useEffect(() => {
    const subscription = conversationSlot.currentConversation.pipe(
      tap(setRunningConversation),
      tap((runningConversation) => console.log("tap check 2", conversationSlot, runningConversation))
    ).subscribe();

    console.log("new slot!", conversationSlot)

    return () => {
      subscription.unsubscribe();
    }
  }, [conversationSlot]);

  const setConversation = useCallback(async (conversationSpec: ConversationSpec | Promise<ConversationSpec>, key?: string, overwrite: boolean = false) => {
    if (key === undefined) {
      key = conversationSlot.id;
      overwrite = true;
    }

    const thisSlot = getOrCreateSlot(conversationStore, key, messagesStore);
    const conversation = await thisSlot.dispatchNewConvo(conversationSpec, overwrite);

    return { id: key, conversation } as RunningConversation;
  }, [conversationSlot, conversationStore]);

  const closeConversation = useCallback(() => {
    delete conversationStore.value[conversationSlot.id];
    conversationSlot.teardown();
  }, [conversationSlot, conversationStore]);

  const getNewSlot = useCallback(async (spec: ConversationSpec | Promise<ConversationSpec>) => {
    const key = uuidv4();
    const newSlot = getOrCreateSlot(conversationStore, key, messagesStore);
    const conversation = await newSlot.dispatchNewConvo(spec);
    return { id: key, conversation } as RunningConversation;
  }, [conversationStore])

  return {
    runningConversation,
    setConversation,
    closeConversation,
    getNewSlot
  };
}

function conversationStoreToRunningConversations(conversationStore: ConversationStore): RunningConversation[] {
  return Object.values(conversationStore)
    .filter((conversationSlot): conversationSlot is ConversationSlot => conversationSlot !== undefined)
    .map(conversationSlot => conversationSlot.currentConversation.value)
    .filter((maybeRunningConversation): maybeRunningConversation is RunningConversation => maybeRunningConversation !== undefined);
}

// This is for monitoring all conversation slots in the form of RunningConversations
export function useConversationStore() {
  const conversationStore = useContext(ConversationStoreContext);
  const messagesStore = useContext(MessageStoreContext);

  if (!conversationStore || !messagesStore) {
    throw new Error('useConversationStore must be used within a ConversationStoreProvider and a MessageStoreProvider');
  }

  const [runningConversations, setRunningConversations] = useState<RunningConversation[]>(conversationStoreToRunningConversations(conversationStore.value));

  useEffect(() => {
    let subscription: Subscription | undefined;

    const setupSubscription = () => {
      const slotObservers = Object.values(conversationStore.value)
        .filter((conversationSlot): conversationSlot is ConversationSlot => conversationSlot !== undefined)
        .map(conversationSlot => observeNew(conversationSlot.currentConversation));

      const observers = [...slotObservers, observeNew(conversationStore)]
      subscription = merge(observers).pipe(
        debounceTime(0),
        tap(() => {
          setRunningConversations(conversationStoreToRunningConversations(conversationStore.value));
          subscription && subscription.unsubscribe();
          subscription = undefined;
          setupSubscription();
        })
      ).subscribe();
    }
    setupSubscription();

    return () => {
      subscription && subscription.unsubscribe();
    }
  }, [conversationStore]);

  return runningConversations;
}

