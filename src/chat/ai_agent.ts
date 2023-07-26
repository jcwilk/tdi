// a series of functions that will be used to create an AI agent

import { Subject, debounceTime, filter, takeUntil } from "rxjs";
import { Conversation, Message, addParticipant } from "./conversation";
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from "./participantSubjects";
import { getChatCompletion } from "../openai_api";
import { ChatMessage } from "../scenarios";

const systemMessage: ChatMessage = {
  role: "system",
  content: "You are a conversationalist. Your job is to converse with the user and hide the fact that you are an AI. Your prose, grammar, spelling, typing, etc should all be consistent with typical chat casual discourse within the constraints of needing to put your entire response into one message to send each time. DO NOT use perfect grammar, use typical chatroom quality typing."
}

//returns an object with a conversation and a participant
export function addAssistant(conversation: Conversation): { conversation: Conversation, assistant: Participant } {
  const assistant = createParticipant("assistant");
  const addedConvo = addParticipant(conversation, assistant);

  const rawMessages = new Subject<Message>();
  subscribeWhileAlive(assistant, addedConvo.outgoingMessageStream$, rawMessages);

  const messages: Message[] = [];
  rawMessages.subscribe({
    next: (message) => {
      messages.push(message);
    }
  });

  const gptTrigger = new Subject<Message>();

  // filter out messages that are from the assistant and then debounce
  const debouncedFilteredOutput = rawMessages.pipe(
    filter(({ participantId }) => participantId !== assistant.id ),
    debounceTime(500)
  );
  subscribeWhileAlive(assistant, debouncedFilteredOutput, gptTrigger);

  gptTrigger.subscribe({
    next: async (message) => {
      const typingStream = new Subject<string>();
      const sendingStream = new Subject<void>();

      const completion = getChatCompletion(
        [systemMessage, ...(messages.map(({ role, content }) => ({ role, content })))],
        0.3,
        partialText => typingStream.next(partialText)
      );

      typingStream.pipe(
        takeUntil(gptTrigger)
      ).subscribe({
        next: (partialText) => typeMessage(assistant, partialText)
      });

      sendingStream.pipe(
        takeUntil(gptTrigger)
      ).subscribe({
        next: () => sendMessage(assistant)
      });

      await completion;
      sendingStream.next();
    }
  });

  return { conversation: addedConvo, assistant };
}
