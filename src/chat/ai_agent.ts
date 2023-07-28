// a series of functions that will be used to create an AI agent

import { Subject, debounceTime, filter, takeUntil } from "rxjs";
import { Conversation, Message, addParticipant } from "./conversation";
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from "./participantSubjects";
import { getChatCompletion } from "../openai_api";
import { ChatMessage } from "../scenarios";

const systemMessage: ChatMessage = {
  role: "system",
  content: `
You are an AI conversationalist. Your job is to converse with the user. Your prose, grammar, spelling, typing, etc should all be consistent with typical instant messaging discourse within the constraints of needing to put your entire response into one message to send each time. Use natural grammar rather than perfect grammar.
  `
}

//returns an object with a conversation and a participant
export function addAssistant(conversation: Conversation): { conversation: Conversation, assistant: Participant } {
  const assistant = createParticipant("assistant");
  const addedConvo = addParticipant(conversation, assistant);

  const rawMessages = new Subject<Message>();
  subscribeWhileAlive(assistant, addedConvo.outgoingMessageStream, rawMessages);

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

      const interruptedMessage = addedConvo.typingAggregationOutput.value.get(assistant.id);

      const conversationMessages = messages.map(({ role, content }) => ({ role, content }));

      // TODO: if there's an interrupted message more than N characters long, then instead of just
      // doing this chat completion for the next message, first do a function calling mechanism call
      // to GPT-3.5 to determine whether we should continue the interrupted message or not.

      // Depending on whether continuation is recommended, either add a system message at the end
      // of the messages array to compel GPT to continue the interrupted message, or if it wasn't recommended
      // then discard the interrupted message and generate the next message from scratch.

      const completion = getChatCompletion(
        conversationMessages,
        0.3,
        partialText => typingStream.next(partialText)
      );

      typingStream.pipe(
        takeUntil(rawMessages)
      ).subscribe({
        next: (partialText) => typeMessage(assistant, partialText)
      });

      sendingStream.pipe(
        takeUntil(rawMessages)
      ).subscribe({
        next: () => sendMessage(assistant)
      });

      await completion;
      sendingStream.next();
    }
  });

  return { conversation: addedConvo, assistant };
}
