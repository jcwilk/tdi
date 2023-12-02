<h1 align="center">
  <br>
  <a href="https://jcwilk.github.io/tdi"><img src="img/full_favicon_200.png" alt="Tree Driven Interaction" width="200"></a>
  <br>
  Tree Driven Interaction
  <br>
</h1>

<h4 align="center">A GPT-4 Turbo chat client for generating, composing, and running plugins on demand with <a href="https://rxjs.dev/" target="_blank">RxJS</a>.</h4>

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

## Functions available to AI Assistant

Click the button to the left of the function name in the app interface for parameter details. A brief summary of each function is included below for convenience.

### direct_message_embedding_search

Return the N message addresses where the embedding of their content has the closest cosine similarity to that of the query. Requires API key to generate embedding.

### summary_message_embedding_search

Return the N message addresses where the embedding of their recursive summary has the closest cosine similarity to that of the query. Requires API key to generate embedding.

### append_user_reply

Add a reply containing specified content to a specified parent message by address. Unlike the chat interface, embeddings, recursive summary, and further assistant replies will not automatically be generated and must be manually activated if needed. Role can be overridden.

### conversation_completion

Activate the AI Assistant for one reply to the specified message address and returns the address of the new message, if one is generated. The AI assistant only replies to `user` and `system` messages, so if the specified message address is `function` or `assistant` then the function call will return without emitting events or creating new message branches. Requires API key for the completion behavior.

### generate_dynamic_function

Takes in the body of a JavaScript function and a list of dependencies which can then be accessed via `dependencies[name_or_hash](parameters)`. `input` is available as an RxJS.Observable<string>. Returns the address of the new function message.

### compose_dynamic_functions

Similar to generate_dynamic_function but specifically for nesting function calls. e.g. if you pass a, b, c as parameters it would be equivalent to passing them as dependencies to generate_dynamic_function with a function body of: `return dependencies['a']( dependencies['b']( dependencies['c'](input) ) )`

### invoke_dynamic_function

Pass a function message address which was generated by either `generate_dynamic_function` or `compose_dynamic_functions` and the input which should be either a string or array of strings since those are the only two string-encodable data formats which can be converted to an `Observable<string>`.

### get_message_property

A very important function for building meta tooling. Takes in a message address and a property name. Supports the following properties:
* `role` - user, assistant, system, or function
* `content` - the content of the message
* `parentHash` - the address of the parent
* `timestamp` - stringified integer representation
* `hash` - basically echoes back the address you passed in, useful for verifying an address exists
* `children` - their SHAs each in its own event
* `siblings` - their SHAs each in its own event
* `summary` - recursive summary representing the conversation path from root to the specified message
* `functionResults` - EMPTY if not a completed function message, otherwise each result's content gets returned in separate events
* `functionDependencies` - each in its own event
* `embedding` - EMPTY if no embedding, stringified floats each in their own event if present
* `summaryEmbedding` - same behavior as 'embedding' but for the recursive summary

### recursively_summarize_path

Useful in tandem with `generate_user_reply` for generating embeddings and recursive summarizations for all messages between root and the passed address. Requires API key.

### jsonp_data_retrevial

Pass a URL and the system will append the callback parameter automatically and if successfully retrieved, return the JSON received. Typically a function will be generated as a wrapper around this and then invoked and composed from there.

### cors_data_retrevial

Similar to `jsonp_data_retrevial` but uses a plain old fetch which depends on the endpoint permitting CORS.

### alert, prompt, error

These are mostly included as simple ways to test manual invocation. These will not work with dynamic functions since dynamic function code runs in a web worker and doesn't have access to the window.

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
* It's a bit short on some conversation settings like which model to use. I currently have it limited to GPT-4-turbo because it's so much better than everyting and only marginally more expensive than GPT-3.5-turbo.
* It requires a paid OpenAI account in order to get an API key before you can do anything with it. This is sometimes behind a waitlist, if you are unable to sign up and want to try the app feel free to contact me for a temporary API key (if I know you of course, lol)

## TDI Legacy

If you're looking for or are curious about the history of this project, or are interested in a more rigidly structured workflow/step/test oriented interface rather than a more open-ended chat
interface, then go over and check out [github.com/jcwilk/tdi_legacy](https://github.com/jcwilk/tdi_legacy). There's a gif there
illustrating how it works and is also running as a freely available Github Pages site.
