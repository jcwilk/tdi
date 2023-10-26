import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Conversation, ConversationMode, createConversation, getLastMessage, observeNewMessages, observeTypingUpdates, teardownConversation } from "../../chat/conversation";
import { ConversationDB, ConversationMessages, LeafPath, MessageDB } from '../../chat/conversationDb';
import { BehaviorSubject, EMPTY, Observable, Subject, Subscription, catchError, concat, concatMap, debounceTime, distinct, filter, finalize, from, lastValueFrom, map, merge, mergeMap, of, reduce, scan, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs';
import { FunctionOption } from '../../openai_api';
import { addAssistant } from '../../chat/aiAgent';
import { v4 as uuidv4 } from 'uuid';
import { observeNew } from '../../chat/rxjsUtilities';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { useLiveQuery } from 'dexie-react-hooks';

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

export async function buildParticipatedConversation(db: ConversationDB, messages: ConversationMessages, model: ConversationMode = "gpt-3.5-turbo", functionOptions: FunctionOption[] = []): Promise<Conversation> {
  const conversation = await createConversation(db, messages, model, functionOptions);
  console.log("test5.5")
  return addAssistant(conversation, db);
}

function createConversationSlot(id: string, messagesStore: ConversationDB): ConversationSlot {
  console.log("creating slot", id)
  const currentConversation = new BehaviorSubject<RunningConversation | undefined>(undefined);

  currentConversation.subscribe((runningConversation) => console.log("currentConvoUpdated", id, runningConversation));

  const asyncSwitchedInput = new Subject<Observable<Conversation>>();

  asyncSwitchedInput.pipe(
    /* /// The below clusterfuck is to make certain that we teardown conversations we're not using /// */

    // pair the observable up with an index so we can detect out-of-order responses
    scan((acc, innerObservable) => [acc[0] + 1, innerObservable] as [number, Observable<Conversation>], [0, new Subject<Conversation>().asObservable()] as [number, Observable<Conversation>]),
    mergeMap(([index, conversationObservable]) => conversationObservable.pipe(map(conversation => [index, conversation] as [number, Conversation]))),

    // scan for out-of-order messages - if we get one then teardown the conversation and don't emit it
    scan(([lastIndex, _lastConversation], [index, conversation]) => {
      if (index < lastIndex) {
        teardownConversation(conversation);
        return [lastIndex, undefined] as [number, undefined];
      }

      return [index, conversation] as [number, Conversation];
    }, [-1, undefined] as [number, Conversation | undefined]),
    map(([_index, conversation]) => conversation),

    // filter out removed conversations
    filter((conversation): conversation is Conversation => conversation !== undefined),

    // events that get here are legit, so teardown the old value if it exists
    tap(conversation => currentConversation.value && currentConversation.value.conversation !== conversation && teardownConversation(currentConversation.value.conversation)),

    // make sure to teardown the conversation when the slot gets torndown as well
    finalize(() => currentConversation.value && teardownConversation(currentConversation.value.conversation)),

    /* /// end teardown management clusterfuck /// */

    map(conversation => ({id, conversation} as RunningConversation)),
    tap(runningConversation => console.log("tap check", runningConversation)),
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
          // TODO: somewhere around here might be a good place to do message reprocessing, if we want messages to not be immutable
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

export function getStores() {
  const conversationStore = useContext(ConversationStoreContext);
  const messagesStore = useContext(MessageStoreContext);

  if (!conversationStore || !messagesStore) {
    throw new Error('useConversationStore must be used within a ConversationStoreProvider and a MessageStoreProvider');
  }

  return {conversationStore, messagesStore};
}

// This is for monitoring and interacting with a single conversation slot
// Using it will induce a new conversation slot if one does not exist for the given key
export function useConversationSlot(key: string) {
  const {conversationStore, messagesStore} = getStores();

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
  const {conversationStore} = getStores();

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

function observeTypingReplies(conversationStore: BehaviorSubject<ConversationStore>, filterFunction: (messageToUpdate: MessageDB) => boolean) {
  return conversationStore.pipe(
    mergeMap(conversationStore => conversationStoreToRunningConversations(conversationStore)),
    distinct(({conversation}) => conversation),
    mergeMap(runningConversation => {
      const typingUpdates = observeTypingUpdates(runningConversation.conversation, "assistant").pipe(
        withLatestFrom(observeNewMessages(runningConversation.conversation, true)),
        catchError(() => EMPTY),
        filter(([typing, messageToUpdate]) => {
          return filterFunction(messageToUpdate) || typing.length === 0;
        }),
        map(([typing, _message]) => {
          return {typing, runningConversation} as const;
        })
      )

      return concat(typingUpdates, of({typing: "", runningConversation} as const));
    }),

    scan((acc, {typing, runningConversation}) => {
      const newAcc = {...acc};
      if (typing.length > 0) {
        newAcc[runningConversation.id] = {typing, runningConversation};
      } else {
        delete newAcc[runningConversation.id];
      }

      return newAcc;
    }, {} as Record<string, {typing: string, runningConversation: RunningConversation}>),
  )
}

export function useTypingWatcher(referenceMessage: MessageDB, relationship: "children" | "siblings") {
  const {conversationStore} = getStores();

  const [mapping, setMapping] = useState<Record<string, {typing: string, runningConversation: RunningConversation}>>({});

  const filterFunction = relationship === "children"
    ? (messageToUpdate: MessageDB) => messageToUpdate.hash === referenceMessage.hash
    : (messageToUpdate: MessageDB) => messageToUpdate.hash === referenceMessage.parentHash;

  useEffect(() => {
    const subscription = observeTypingReplies(conversationStore, filterFunction).pipe(
      tap(setMapping)
    ).subscribe();

    return () => {
      subscription.unsubscribe();
    }
  }, [conversationStore, referenceMessage, relationship]);

  return mapping;
}

function insertSortedByTimestamp(paths: SummarizedLeafPath[], path: SummarizedLeafPath): SummarizedLeafPath[] {
  const index = paths.findIndex(({message}) => message.timestamp < path.message.timestamp);
  if (index === -1) {
    return [...paths, path];
  }
  else {
    return [...paths.slice(0, index), path, ...paths.slice(index)];
  }
}

export type SummarizedLeafPath = {
  message: MessageDB,
  summary: string | null,
  pathLength: number
}

export function useLeafMessageTracker(root: MessageDB | null): SummarizedLeafPath[] {
  const [leafPaths, setLeafPaths] = useState<SummarizedLeafPath[]>([]);
  const { messagesStore } = getStores();
  const runningNewQuery = new Subject<void>;

  // TODO: generalize this into a useLiveQueryEffect hook? Could be super useful
  // for other database-dependent streaming UIs if it comes up again
  useLiveQuery(() => {
    runningNewQuery.next();

    const observable = messagesStore.getLeafMessagesFrom(root).pipe(
      mergeMap<LeafPath,Promise<SummarizedLeafPath>>(async ({message, pathLength}) => {
        const summaryRecord = await messagesStore.getSummaryByHash(message.hash);
        const summary = summaryRecord?.summary ?? null;
        return {message, pathLength, summary}
      }),

      // while it's still running, only update the UI with prior-unfound messages
      tap(tappedPath => setLeafPaths(paths => {
        return (paths.findIndex(({message}) => message.hash === tappedPath.message.hash) === -1)
          ?
          insertSortedByTimestamp(paths, tappedPath)
          :
          paths
      })),

      // if a new query gets triggered, we want to abort this one so it stops processing
      takeUntil(runningNewQuery),

      // if and when the query is able to finish completely, we want to replace the UI with all messages found in this run
      // so that stale messages from prior queries will get removed
      reduce((acc, path) => insertSortedByTimestamp(acc, path), [] as SummarizedLeafPath[]),
      tap(aggregatedMessages => {
        setLeafPaths(aggregatedMessages);
      })
    );

    return lastValueFrom(observable);
  }, [root]);

  return leafPaths;
};

