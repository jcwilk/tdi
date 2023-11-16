# Tree Driven Interaction with GPT prototype

This is a Pages-only SPA prototype for a more comprehensive flow of building software function-by-function via code-guided interactions with GPT.

It can be visited at [jcwilk.github.io/tdi](https://jcwilk.github.io/tdi) - It requires your GPT api key which it stores in LocalStorage. Use at your own risk.

Blog post - https://jcwilk.com/tree-driven-interaction-vision-and-upcoming-features/

Example gifs of usage (some of the interfaces have been minorly adjusted, see the bulletpoints below for an up to date description)

![tdi_jokes_v1_sped_up](https://github.com/jcwilk/tdi/assets/39782/8f2bd775-5b08-4b02-a9d5-f51908882558)

![tdi_setup_sped_up_optimized](https://github.com/jcwilk/tdi/assets/39782/c4dce2fd-cd06-4ede-9d2e-bd52f5188a95)

## Interface description (included in the greeting message)

### Top Left Close/Minimize

- **Close Button (X)**: Closes the current conversation and prevents further message persistence from taking place.
- **Minimize Button (_)**: Minimizes the conversation, keeping it running in the background.
- **Conversation List Page**: After minimizing or closing a conversation you're able to see the currently running conversations, the pinned conversations, and a list of leaf node messages in the conversation tree which can be reified into conversations. All of these can be clicked to load it into a new conversation.

### Top Right Conversation Management Buttons and Pausing

- **Share Button**: Share your conversation on ShareGPT anonymously. Options include various manners of escaping/converting for optimal sharing.
- **Edit JSON Button**: Opens a JSON editor for the conversation, compatible with the OpenAI API schema. Import or export conversations for use with other systems.
- **Functions Selector (Sigma Icon)**: Choose which functions the AI has access to by opening a modal with available options.
  - Searching by message contents or recursive summary of the conversation up to the point of the message - can also limit to to only results under a certain message address.
  - Append a new message reply to either an existing message by SHA or to the root.
  - Misc functions useful for testing/debugging such as native alerts, prompts, and throwing errors - useful for understanding how different parts of the system behave.
- **Toggle (Pause/Run)**: Pause the conversation to make edits without AI responses, or run to continue engaging with the AI assistant.

### Bottom Message Entry and Sending

- **Message Field**: Type your messages here.
- **Send Button**: Click to send your typed message.
- **Voice Entry (Microphone Button)**: Record your message, click again to finish recording. Upon completion, it will be transcribed and sent.
- **Auto-Scroll Checkbox**: Keep your view at the end of the conversation or uncheck to manually navigate through the conversation history.

### Message List for Current Conversation Path
- **Message Contents**
  - **Role Icon**: Indicate the source of the message (system, assistant, user, or function).
  - **Sister Messages Indicator (Bottom Left Edge of Each Message)**: It shows the number of alternative replies to the parent message, allowing lateral navigation in the conversation tree. Omitted if there are no sister messages. Click this to view the different messages.
- **Message Tools (Bottom Right Edge of Each Message)**:
  - **Delete Button**: Removes a message via creating a new conversation path without it.
  - **Edit Button**: Edits a message via rebasing the conversation into a new path with the change.
  - **Pin Button**: Pins a message, storing the path up to that message on the OpenAI server under your account for cross-device access. Clicking again will remove the pin.
  - **Copy Button**: Copies the message content to the clipboard.
  - **Message Info Button**: Displays misc metadata such as summary of path to the message, created time, parent address, etc.
  - **Emoji Address**: An emoji digest of the message's address, clickable to navigate directly to that point in the conversation.
  - **Copy Address Button**: Copies the full hex SHA hash of the message address for referencing in replies - these SHA hashes will always appear as emoji digests in messages, except for when in the text entry field.
- **Downwards Navigation Arrows**: If there are messages further down in the tree from your last message then downward arrows will appear.
  - **Single Downward Arrow**: Just go to the most recent reply to the last message in this conversation.
  - **Double Downward Arrows**: Open a modal showing all the leaf messages below the last message in this conversation.

## TDI Legacy

If you're looking for or are curious about the history of this project, or are interested in a workflow/step/test oriented interface rather than a more open-ended chat
interface, then go over and check out [github.com/jcwilk/tdi_legacy](https://github.com/jcwilk/tdi_legacy) formerly called "Test Driven Interactions". There's a gif there
illustrating how it works and is also running as a freely available Github Pages site.

## How to run

`npm run dev` - run dev server

If you'd like to build under prod mode to test locally:

`npm run build` - build for prod

But this shouldn't be necessary since you can just use Pages!
