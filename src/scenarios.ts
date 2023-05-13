export type ChatMessage = {
  role: string,
  content: string
};

export type ChatStep = ChatMessage[]

export type TDITestStep = { test: string; code: string };

export type TDIStep = {
  description: string;
  depends: string[];
  input: {
    [key: string]: string;
  };
  completion: {
    [key: string]: string;
  };
  chat: {
    [key: string]: ChatStep;
  };
  test: {
    [key: string]: TDITestStep
  }
};

export type StrategySpec = string | TDITestStep | ChatStep

export const generateEmptyStepSpec = (): TDIStep => {
  return {
    description: "",
    depends: [],
    input: {},
    completion: {},
    test: {},
    chat: {}
  };
}

export const BasicTDISteps: TDIStep[] = [
  {
      "description": "Write new step",
      "depends": [
        "new_step_description"
      ],
      "input": {
        "new_step_description": ""
      },
      completion: {},
      test: {},
      "chat": {
        "_new_step": [
          {
            "role": "system",
            "content": "You are a step building machine. You produce steps along the following format:\n\n```\n{\n  \"temperature\": 1,\n  \"spec\": {\n    \"description\": \"Generate Examples \",\n    \"depends\": [\n      \"contrived_input\"\n    ],\n    \"input\": {\n      \"contrived_input\": \"\"\n    },\n    \"completion\": {\n      \"contrived_output\": \"Given the following request:\\n\\n```\\n/contrived_input\\n```\\n\\nPlease produce or describe example instances of the problem being described.\\n\\nSure! Here's some examples:\\n\"\n    },\n    \"chat\": {\n      \"other_contrived_output\": [\n        {\n          \"role\": \"system\",\n          \"content\": \"You are a title writer. The titles you write should be a short, descriptive name for the tool and useful for identifying it in a list of similar tools. The title should be at most a single sentence, and should not include any special characters or punctuation and should omit the ending punctuation.\"\n        },\n        {\n          \"role\": \"user\",\n          \"content\": \"Given the following problem:\\n\\n```\\nI have a folder full of a ton of files and I need to find something in one of them but I don't know which.\\n```\\n\\nPlease provide a title for the tool used to solve this solution.\"\n        },\n        {\n          \"role\": \"assistant\",\n          \"content\": \"File Searcher\"\n        },\n        {\n          \"role\": \"user\",\n          \"content\": \"Given the following problem:\\n\\n```\\n/contrived_input\\n```\\n\\nPlease provide a title for the tool used to solve this solution.\"\n        }\n      ]\n    },\n    \"test\": {}\n  }\n}\n```\n\nThe above example outputs three different variables at once which is unusual but is serving as an example of step capability.\n\nSummary of strategies:\n`input` - this is useful for establishing a text field for user entry, concatenating values together as literals rather than trying to feed them into a completion, and copying values between fields.\n`completion` - this is a simple completion operation where the text will get completed to a stop condition. This uses GPT-3.5 which is lower quality but may be adequate for simple completions.\n`chat` - this is a chat-based completion with GPT-4. This strategy should be preferred for most completion tasks, unless a high speed strategy is asked for, in which case `completion` should be used. It is more complex but much more capable. Include an example interaction in the messages for the purposes of serving as a few shot prompt, and the last message should always be a `user` message with any variables needed interpolated in since this message will be the actual conceptual user prompt that the `assistant` will be replying to with the completion's next message.\n\nGenerally speaking, there shouldn't be two strategies outputting to the same key, but sometimes it can be useful to have an empty `input` so there's a text field to enter text into. Empty `input` strategies won't overwrite a field with a value.\n\nAll output templates can have variables interpolated into them by prefacing the variable with a slash. All variables interpolated in this way must be listed in the `depends` array.\n\n`temperature` should be set to between `0.0` and `1.0`, lower for more deterministic which is better for code and technical things, higher for more entropy which is better for creative things.\n\nThe user will ask for a problem to be solved and you should design a step in this format to solve the task as concisely and effectively as possible, however make sure to include all the context in the strategy which is required to understand the problem. If they're asking to make a step which produces steps or workflows then the workflow structure and its description should be included as well, summarizing if appropriate."
          },
          {
            "role": "user",
            "content": "Please build a step according to the following request:\n\n```\nChange the long form text contents of `fake_stored_variable` to have a ruder tone and please generate the results as quickly as possible.\n``` "
          },
          {
            "role": "assistant",
            "content": "{\n  \"temperature\": 0.7,\n  \"spec\": {\n    \"description\": \"Ruder\",\n    \"depends\": [\n      \"fake_stored_variable\"\n    ],\n    \"input\": {\n      \"fake_stored_variable\": \"\"\n    },\n    \"completion\": {\n      \"fake_stored_variable\": \"Please make the following text ruder using a more aggressive tone and more hostile wording:\\n\\n###\\n\\n/fake_stored_variable\\n\\n###\\n\\nOk! Here it is:\\n\"\n    },\n    \"test\": {},\n    \"chat\": {}\n    }\n  }\n}"
          },
          {
            "role": "user",
            "content": "Please build a step according to the following request:\n\n```\nConcatenate field `example_lollipop` with field `example_lollipop_eater`\n```"
          },
          {
            "role": "assistant",
            "content": "{\n      \"temperature\": 0,\n      \"spec\": {\n        \"description\": \"Combine lollipop with eater\",\n        \"depends\": [\"example_lollipop\", \"example_lollipop_eater\"],\n        \"input\": {\n          \"results\": \"/example_lollipop/example_lollipop_eater\"\n        },\n        \"completion\": {},\n        \"test\": {},\n        \"chat\": {}\n      }\n    }"
          },
          {
            "role": "user",
            "content": "Write me a very short poem based on the `contrived_poem` field."
          },
          {
            "role": "assistant",
            "content": "{\n  \"temperature\": 0.9,\n  \"spec\": {\n    \"description\": \"Short Poem\",\n    \"depends\": [\n      \"contrived_poem\"\n    ],\n    \"input\": {},\n    \"completion\": {},\n    \"chat\": {\n      \"short_poem\": [\n        {\n          \"role\": \"system\",\n          \"content\": \"You are a poet. Your task is to write a very short poem based on the given input. The poem should be creative and capture the essence of the input.\"\n        },\n        {\n          \"role\": \"user\",\n          \"content\": \"Given the following input:\\n\\n```\\nThe moon shines bright\\n```\\n\\nPlease write a very short poem.\"\n        },\n        {\n          \"role\": \"assistant\",\n          \"content\": \"Moon's radiant light,\\nGuides us through the night,\\nA beacon so bright.\"\n        },\n        {\n          \"role\": \"user\",\n          \"content\": \"Given the following input:\\n\\n```\\n/contrived_poem\\n```\\n\\nPlease write a very short poem.\"\n        }\n      ]\n    },\n    \"test\": {}\n  }\n}"
          },
          {
            "role": "user",
            "content": "Please build a step according to the following request:\n\n```\n/new_step_description\n```"
          }
        ]
      }
  },
  {
      "description": "Correct Email",
      "depends": [
        "input_email"
      ],
      "input": {
        "input_email": ""
      },
      "chat": {
        "corrected_email": [
          {
            "role": "system",
            "content": "You are an email editor. Your task is to correct the grammar, punctuation, and spelling of an email while maintaining the tone and formality suitable for reasonably close coworkers. Make as few changes as possible to achieve this."
          },
          {
            "role": "user",
            "content": "Given the following email:\n\n```\nHey there, I just wnted to let ya kno that the report you asked for is done. You can find it in the shared folder. Let me kno if u need anythin else.\n```\n\nPlease correct the email."
          },
          {
            "role": "assistant",
            "content": "Hey there, I just wanted to let you know that the report you asked for is done. You can find it in the shared folder. Let me know if you need anything else."
          },
          {
            "role": "user",
            "content": "Given the following email:\n\n```\n/input_email\n```\n\nPlease correct the email."
          }
        ]
      },
      "completion": {},
      "test": {}
    },
  {
      "description": "Copy Corrected Email",
      "depends": [
        "corrected_email"
      ],
      "input": {
        "input_email": "/corrected_email"
      },
      "completion": {},
      "test": {},
      "chat": {}
    }
];
