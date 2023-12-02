<h1 align="center">
  <br>
  <a href="https://jcwilk.github.io/tdi"><img src="img/full_favicon_200.png" alt="Tree Driven Interaction" width="200"></a>
  <br>
  Tree Driven Interaction
  <br>
</h1>

<h4 align="center">A client-side-only GPT-4 Turbo chat client for generating, composing, and running plugins on demand with <a href="https://rxjs.dev/" target="_blank">RxJS</a>.</h4>

<p align="center">
  <a href="https://youtu.be/P20n5-dAyOA">Launch video</a> •
  <a href="https://jcwilk.com/tree-driven-interaction-vision-and-upcoming-features/">Blog post</a> •
  <a href="https://sharegpt.com/c/11L1odS">Fixing Functions</a>
</p>

## Key Features

* Client-side only, running on GitHub pages - easy and free to fork and run yourself, keeps your data private
* Rigorous PushState integration for nimble flitting between conversation paths and deep linking
* Individually addressable messages with a novel EmojiSha (👃🍣🏐🏓🐹) visual representation of message addresses
* Pinning and syncing between devices piggy-backing on the OpenAI Files API so their key is the only one you need (but you can still explore the app without it)
* Extensive list of functions available to the AI Assistant with a lean interface for toggling which it has access to
* Ability to manually invoke all functions available to the Assistant
* Generation, storage, and invocation of JavaScript functions in the context of the conversation they came from - no more one-time-use, server-side-only functions
* WebWorker isolation of dynamic function invocation
* JSONP and CORS support for retrieving arbitrary API data
* Automatic recursive summarization and embeddings generated for both the message and summary useful for doing conceptual searches
* Introspective abilities for the AI Assistant to be able to search and extend its own conversation tree

## Example gifs of usage

Some of the interfaces have been minorly adjusted, see the bulletpoints below for an up to date description

![tdi_jokes_v1_sped_up](https://github.com/jcwilk/tdi/assets/39782/8f2bd775-5b08-4b02-a9d5-f51908882558)

![tdi_setup_sped_up_optimized](https://github.com/jcwilk/tdi/assets/39782/c4dce2fd-cd06-4ede-9d2e-bd52f5188a95)

## Interface description (included in the greeting message)

### Top Left Close/Minimize

- **Close Button (X)**: Closes the current conversation and prevents further message persistence from taking place.
- **Minimize Button (_)**: Minimizes the conversation, keeping it running in the background.
- **Conversation List Page**: After minimizing or closing a conversation you're able to see the currently running conversations, the pinned conversations, and a list of leaf node messages in the conversation tree which can be reified into conversations. All of these can be clicked to load it into a new conversation.

### Top Right Conversation Management Buttons and Pausing

- **API Key Entry/Removal**: Set your OpenAI API key here. Not required to explore the app, but highly suggested in order to enjoy its benefits.
- **Share Button**: Share your conversation on ShareGPT anonymously. Options include various manners of escaping/converting for optimal sharing.
- **Edit JSON Button**: Opens a JSON editor for the conversation, compatible with the OpenAI API schema. Import or export conversations for use with other systems.
- **Functions Selector (Sigma Icon)**: Choose which functions the AI has access to by opening a modal with available options.
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

## How to run

`npm run dev` - run dev server

If you'd like to build under prod mode to test locally:

`npm run build` - build for prod

But this shouldn't be necessary since you can just use Pages!

## Known Issues

* It tends to not work well in multiple tabs at once on mobile because of how I'm using IndexedDB/Dexie.js, however it's a better UX to just use forward/back nav between different conversations within the same tab IMO, especially on mobile. The way to fix this issue IIUC would be to move the indexeddb access to a shared web worker and interface with it through events but there's a long list of higher priority features.
* It's a bit short on some conversation settings like which model to use (I currently have it limited to GPT-4-turbo because it's so much better than everyting and only marginally more expensive than GPT-3.5-turbo), termperature, p-value, etc, etc - being able to adjust these things doesn't really help me build and test out the tree management infrastructure so they haven't been a priority, but it would be quite trivial to add them, so feel free to open an issue if you need them and I could throw a couple hours at it and see where it ends up. In the interim, you can also try using the excellent [BetterChatGPT](https://github.com/ztjhz/BetterChatGPT) to handle a particular conversation path which might require very specific model settings, and then use the JSON editor feature to import the conversation back to your TDI tree afterwards.
* It requires a paid OpenAI account in order to get an API key before you can do anything with it. This is sometimes behind a waitlist, if you are unable to sign up and want to try the app feel free to contact me for a temporary API key (if I know you of course, lol)

## TDI Legacy

If you're looking for or are curious about the history of this project, or are interested in a more rigidly structured workflow/step/test oriented interface rather than a more open-ended chat
interface, then go over and check out [github.com/jcwilk/tdi_legacy](https://github.com/jcwilk/tdi_legacy). There's a gif there
illustrating how it works and is also running as a freely available Github Pages site.
