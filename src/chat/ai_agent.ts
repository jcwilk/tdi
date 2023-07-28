// a series of functions that will be used to create an AI agent

import { BehaviorSubject, Observable, Subject, debounceTime, filter, map, scan, startWith, takeUntil } from "rxjs";
import { Conversation, Message, addParticipant } from "./conversation";
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from "./participantSubjects";
import { ChatMessage } from "../scenarios";
import { chatCompletionStreams } from "./chatStreams";

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

  const messages = new BehaviorSubject<ChatMessage[]>([]);

  rawMessages.pipe(
    map(({ role, content }) => ({ role, content })),
    scan((acc: ChatMessage[], message: ChatMessage) => [...acc, message], [systemMessage])
  ).subscribe(messages);

  subscribeWhileAlive(assistant, addedConvo.outgoingMessageStream, rawMessages);

  const gptTrigger = new Subject<Message>();

  // filter out messages that are from the assistant and then debounce
  const debouncedFilteredOutput = rawMessages.pipe(
    filter(({ participantId }) => participantId !== assistant.id ),
    debounceTime(500)
  );
  subscribeWhileAlive(assistant, debouncedFilteredOutput, gptTrigger);


  const assistantConvoTyping = new BehaviorSubject<string>("");
  addedConvo.typingAggregationOutput.pipe(map((typingAggregation) => typingAggregation.get(assistant.id) || "")).subscribe(assistantConvoTyping);

  gptTrigger.subscribe({
    next: async (message) => {
      const interruptedMessage = assistantConvoTyping.value;

      if (interruptedMessage) {
        // TODO: if there's an interrupted message more than N characters long, then instead of just
        // doing this chat completion for the next message, first do a function calling mechanism call
        // to GPT-3.5 to determine whether we should continue the interrupted message or not.

        // Depending on whether continuation is recommended, either add a system message at the end
        // of the messages array to compel GPT to continue the interrupted message, or if it wasn't recommended
        // then discard the interrupted message and generate the next message from scratch.
      }
      else {
        typeAndSendNewMessage(assistant, messages.value, rawMessages.pipe(map(() => {})));
      }
    }
  });

  return { conversation: addedConvo, assistant };
}

function typeAndSendNewMessage(assistant: Participant, messages: ChatMessage[], cancelStream: Observable<void>) {
  const completionPackage = chatCompletionStreams(
    messages,
    0.1,
    "gpt-4",
    cancelStream
  )

  completionPackage.typingStream.subscribe({
    next: (partialText) => typeMessage(assistant, partialText)
  });

  completionPackage.sendingStream.subscribe({
    next: () => sendMessage(assistant)
  });
}
