import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { createParticipant } from '../../chat/participantSubjects';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { emojiSha } from '../../chat/emojiSha';
import { ReplaySubject, tap } from 'rxjs';
import { FunctionOption } from '../../openai_api';

const db = new ConversationDB();

type NavigateState = {
  activeConversation: string | null; // uuid
};

function pluckLast<T>(subject: ReplaySubject<T>): T | null {
  let lastValue: T | null = null;
  const subscription = subject.subscribe((value) => {
    lastValue = value;
  });
  subscription.unsubscribe();
  return lastValue;
}

function buildParticipatedConversation(messages: MessageDB[], model: string = "gpt-3.5-turbo") {
  return addAssistant(addParticipant(createConversation(messages), createParticipant('user')), model)
}

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);

  const [runningConversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  const stateConversation: string | null = location.state?.activeConversation ?? null;
  const activeConversation: Conversation | null = stateConversation ? runningConversations.get(stateConversation) ?? null : null;

  const currentLeafHash = (() => {
    const paramLeafHash = params.get('ln');
    if (!activeConversation) return paramLeafHash;

    const lastMessage = pluckLast(activeConversation.outgoingMessageStream);
    if (lastMessage) return lastMessage.hash;

    return paramLeafHash;
  })()

  console.log("stateConversation", stateConversation)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  const handleLeafMessageSelect = async (leafMessage: MessageDB, uuid: string = "") => {
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", emojiSha(initialLeafHash, 5), initialLeafHash, "|"+uuid+"|")

    if (!runningConversations.has(uuid)) {
      const conversationFromDb = await db.getConversationFromLeaf(initialLeafHash);
      console.log('conversation', conversationFromDb);

      const conversation = buildParticipatedConversation(conversationFromDb);
      setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, conversation))
      uuid = conversation.id;
    }

    const navigateState: NavigateState = {
      activeConversation: uuid
    };
    console.log("navigateState", navigateState)

    navigate(`?ln=${initialLeafHash}`, { state: navigateState });
  };

  useEffect(() => {
    if (currentLeafHash && !activeConversation) {
      db.getMessageByHash(currentLeafHash).then(message => {
        navigate("?", {replace: true, state: {}})

        if (message) {
          handleLeafMessageSelect(message);
        }
      });
    }

    return () => {
      runningConversations.forEach(conversation => teardownConversation(conversation))
    }
  }, []);

  const handleLeafMessageClose = () => {
    navigate(-1); // Will revert to the previous URL
  };

  const handleModelChange = (conversation: Conversation, model: string) => {
    const messages: MessageDB[] = [];

    conversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const newConversation = buildParticipatedConversation(messages, model);
    newConversation.id = conversation.id; // TODO: this is a hack to keep the same uuid - I feel dirty and I'm sorry, I'll come back to it.
    setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, newConversation));
    teardownConversation(conversation);
  }

  const handleFunctionsChange = (conversation: Conversation, updatedFunctions: FunctionOption[]) => {
    const messages: MessageDB[] = [];

    // TODO: desperate need of refactoring but trying to get to working behavior first
    conversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const conversationWithoutAssistant = addParticipant(createConversation(messages), createParticipant('user'));
    conversationWithoutAssistant.functions = updatedFunctions;
    const newConversation = addAssistant(conversationWithoutAssistant, 'gpt-3.5-turbo'); // TODO: need to keep track of the model in a better way somehow
    newConversation.id = conversation.id; // TODO: this is a hack to keep the same uuid - I feel dirty and I'm sorry, I'll come back to it.
    setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, newConversation));
    teardownConversation(conversation);
  }


  if (!activeConversation) {
    const runningLeafMessages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningConversations) {
      // subscribe to the convo and add each last message to the runningLeafHashes, then immediately unsubscribe.

      const lastOne = pluckLast(conversation.outgoingMessageStream);

      if(lastOne) runningLeafMessages.push({uuid, message: lastOne});
    };
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <ConversationModal
      key={activeConversation.id}
      conversation={activeConversation}
      initialGptModel={"gpt-3.5-turbo"}
      onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: { activeConversation: activeConversation.id }}) }}
      onClose={handleLeafMessageClose}
      onOpenNewConversation={handleLeafMessageSelect}
      onNewModel={model => handleModelChange(activeConversation, model)}
      onFunctionsChange={handleFunctionsChange}
    />
  );
};

export default Client;
