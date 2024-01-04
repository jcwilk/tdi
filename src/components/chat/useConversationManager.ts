import { useEffect, useCallback, useMemo, useState } from 'react';
import { BehaviorSubject, concatMap, debounceTime, filter, from, tap } from 'rxjs';
import { ConversationDB, PersistedMessage } from '../../chat/conversationDb';
import { Conversation, ConversationMode, Message, getLastMessage, isConversationMode, observeNewMessages } from '../../chat/conversation';
import { useNavigate, NavigateFunction, useLocation } from 'react-router-dom';
import { FunctionOption } from '../../openai_api';
import { RouterState } from '@remix-run/router';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import { editConversation, pruneConversation, reprocessMessagesStartingFrom } from '../../chat/messagePersistence';
import { ParticipantRole } from '../../chat/participantSubjects';
import { ConversationSpec, RunningConversation, conversationToSpec, useConversationSlot } from './useConversationStore';
import { concatTap } from '../../chat/rxjsUtilities';
import { mirrorPinsToDB } from '../../chat/convoPinning';
import usePinSyncing from './usePinSyncing';

type NavigateState = {
  activeConversation?: string; // uuid
};

const defaultGreetingMessages: [Message, ...Message[]] = [
  {
    "role": "system",
    "content": "You are a general purpose AI assistant. Maintain a direct and concise tone throughout your interactions. Avoid the use of filler words, politeness phrases, and apologies to ensure your responses are concise and direct. Your priority should be to deliver the most relevant information first, making your responses poignant and impactful. Precision and specificity in your language are key to clear and easy comprehension."
  },
  {
    "role": "assistant",
    "content": "## Welcome to Tree Driven Interaction\n\nThis AI chat application organizes conversations into a tree structure, enhancing your ability to manage and build upon interactions. Below is a guide to the interface and its features.\n\n### Top Left Close/Minimize\n\n- **Close Button (X)**: Closes the current conversation and prevents further message persistence from taking place.\n- **Minimize Button (_)**: Minimizes the conversation, keeping it running in the background.\n- **Conversation List Page**: After minimizing or closing a conversation you're able to see the currently running conversations, the pinned conversations, and a list of leaf node messages in the conversation tree which can be reified into conversations. All of these can be clicked to load it into a new conversation.\n\n### Top Right Conversation Management Buttons and Pausing\n\n- **Share Button**: Share your conversation on ShareGPT anonymously. Options include various manners of escaping/converting for optimal sharing.\n- **Edit JSON Button**: Opens a JSON editor for the conversation, compatible with the OpenAI API schema. Import or export conversations for use with other systems.\n- **Functions Selector (Sigma Icon)**: Choose which functions the AI has access to by opening a modal with available options.\n  - Searching by message contents or recursive summary of the conversation up to the point of the message - can also limit to to only results under a certain message address.\n  - Append a new message reply to either an existing message by SHA or to the root.\n  - Misc functions useful for testing/debugging such as native alerts, prompts, and throwing errors - useful for understanding how different parts of the system behave.\n- **Toggle (Pause/Run)**: Pause the conversation to make edits without AI responses, or run to continue engaging with the AI assistant.\n\n### Bottom Message Entry and Sending\n\n- **Message Field**: Type your messages here.\n- **Send Button**: Click to send your typed message.\n- **Voice Entry (Microphone Button)**: Record your message, click again to finish recording. Upon completion, it will be transcribed and sent.\n- **Auto-Scroll Checkbox**: Keep your view at the end of the conversation or uncheck to manually navigate through the conversation history.\n\n### Message List for Current Conversation Path\n- **Message Contents**\n  - **Role Icon**: Indicate the source of the message (system, assistant, user, or function).\n  - **Sister Messages Indicator (Bottom Left Edge of Each Message)**: It shows the number of alternative replies to the parent message, allowing lateral navigation in the conversation tree. Omitted if there are no sister messages. Click this to view the different messages.\n- **Message Tools (Bottom Right Edge of Each Message)**:\n  - **Delete Button**: Removes a message via creating a new conversation path without it.\n  - **Edit Button**: Edits a message via rebasing the conversation into a new path with the change.\n  - **Pin Button**: Pins a message, storing the path up to that message on the OpenAI server under your account for cross-device access. Clicking again will remove the pin.\n  - **Copy Button**: Copies the message content to the clipboard.\n  - **Message Info Button**: Displays misc metadata such as summary of path to the message, created time, parent address, etc.\n  - **Emoji Address**: An emoji digest of the message's address, clickable to navigate directly to that point in the conversation.\n  - **Copy Address Button**: Copies the full hex SHA hash of the message address for referencing in replies - these SHA hashes will always appear as emoji digests in messages, except for when in the text entry field.\n- **Downwards Navigation Arrows**: If there are messages further down in the tree from your last message then downward arrows will appear.\n  - **Single Downward Arrow**: Just go to the most recent reply to the last message in this conversation.\n  - **Double Downward Arrows**: Open a modal showing all the leaf messages below the last message in this conversation.\n\nNote that PushState is rigorously implemented throughout conversation switching behaviors and users are strongly recommended to use forward/back buttons when jumping between conversations.\n\n### Getting Started\n\nThis system is designed to make conversations with AI more intuitive and dynamic. You can now start asking questions about the system, and the AI assistant is equipped to provide intelligent responses. If you need further assistance, simply ask, and the AI will guide you through the features and usage of the tool.\n\nRemember, each conversation represents a path through the tree of dialogues, allowing for a structured and efficient interaction experience.\n\nIf you'd like to get rid of this explanation message, simply click the address of the system message or click the delete icon on this message to start a new fork from there."
  }
]

function navIndex(navigate: NavigateFunction) {
  navigate('?index=true');
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

async function loadDefaultGreetingConversationSpec(): Promise<ConversationSpec> {
  const results = await reprocessMessagesStartingFrom(new ConversationDB, "gpt-4", defaultGreetingMessages);
  const leafMessage = results[results.length - 1].message;
  return {
    tail: leafMessage,
    model: "gpt-4",
    functions: []
  }
}

async function routerStateToConversationSpec(db: ConversationDB, routerState: RouterState): Promise<ConversationSpec | undefined> {
  const eventSearch = routerState.location.search;
  const eventParams = new URLSearchParams(eventSearch);
  const eventLeafNodeHash = eventParams.get('ln') ?? null;
  if (!eventLeafNodeHash) return loadDefaultGreetingConversationSpec();

  const message = await db.getMessageByHash(eventLeafNodeHash);
  if (!message) return loadDefaultGreetingConversationSpec();

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
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const index = queryParams.get('index');

  const isIndexTrue = index === 'true';

  // Hack for getting access to the stream of nav events. Might be more appropriate to use a context for this.
  // However, I've already spent too much time on the navigation system so I'm exercising some restraint.
  const routerStream: BehaviorSubject<RouterState> = (window as any).$app.routerStream;

  const [activeConversationId, setActiveConversationId] = useState<string>(routerStateToSlotId(routerStream.value));

  const { runningConversation, setConversation, closeConversation, getNewSlot } = useConversationSlot(activeConversationId);

  const [leafMessage, setLeafMessage] = useState<PersistedMessage | undefined>(undefined);

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

  const closeConvo = useCallback(() => {
    if (runningConversation) closeConversation();

    navIndex(navigate);
  }, [navigate, closeConversation, runningConversation]);

  const minimize = useCallback(() => {
    navIndex(navigate);
  }, [navigate]);

  const remix = useCallback(async (changedParams: {model?: ConversationMode, functions?: FunctionOption[], tail?: PersistedMessage}) => {
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

  const openMessage = useCallback(async (message: PersistedMessage) => {
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

  const editMessage = useCallback(async (messageToEdit: PersistedMessage, newContent: string, newRole: ParticipantRole) => {
    if (!runningConversation) return;

    const lastMessage = getLastMessage(runningConversation.conversation);

    const newLeafMessage = await editConversation(runningConversation.conversation.model, lastMessage, messageToEdit, {role: newRole, content: newContent});
    if(newLeafMessage.hash === lastMessage.hash) return;

    await openMessage(newLeafMessage);
  }, [openMessage, runningConversation]);

  const pruneMessage = useCallback(async (message: PersistedMessage) => {
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
    closeConvo,
    minimize,
    editMessage,
    pruneMessage,
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions,
    isIndexTrue
  };
}
