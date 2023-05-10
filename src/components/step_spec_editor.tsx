import { TDIStep } from "../scenarios";
import { KeyValuePairs, Step } from "../step";
import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  Stack,
} from "@mui/material";
import FullScreenPopup from "./full_screen_popup";
import KeyValueEditor from "./key_value_editor";
import TestsEditor from "./tests_editor";
import DependsEditor from "./depends_editor";
import ChatsEditor from "./chats_editor";

type TDIStepEditorProps = {
  step: Step;
  dependentData: KeyValuePairs;
  open: boolean;
  onClose: () => void;
};

const TDIStepEditor: React.FC<TDIStepEditorProps> = ({
  step,
  dependentData,
  open,
  onClose,
}) => {
  const [spec, setSpec] = useState<TDIStep>(step.getSpec());

  const setStepSpec = (newSpec: TDIStep) => {
    step.setSpec(newSpec, dependentData)
  }

  useEffect(() => {
    const handleUpdate = () => {
      setSpec(step.getSpec());
    };

    step.subscribe(handleUpdate);

    return () => {
      step.unsubscribe(handleUpdate);
    };
  }, [step]);

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpec = { ...spec, description: e.target.value };
    setStepSpec(newSpec);
  };

  return (
    <FullScreenPopup title="TDI Step Editor" open={open} onClose={onClose}>
      <Box sx={{ p: 2 }}>
        <Stack spacing={1}>
          <TextField
            fullWidth
            multiline
            label="Description"
            value={spec.description}
            onChange={handleDescriptionChange}
          />
          <DependsEditor
            depends={spec.depends}
            onDependsChange={(newDepends) => {
              const newSpec = { ...spec, depends: newDepends };
              setStepSpec(newSpec);
            }}
          />
          <KeyValueEditor
            title="Input"
            keyValuePairs={spec.input}
            onKeyValuePairsChange={(newInput) => {
              const newSpec = { ...spec, input: newInput };
              setStepSpec(newSpec);
            }}
          />
          <KeyValueEditor
            title="Completion"
            keyValuePairs={spec.completion}
            onKeyValuePairsChange={(newCompletion) => {
              const newSpec = { ...spec, completion: newCompletion };
              setStepSpec(newSpec);
            }}
          />
          <ChatsEditor
            chats={spec.chat}
            onChatsChange={(newChats) => {
              const newSpec = { ...spec, chat: newChats };
              setStepSpec(newSpec);
            }}
          />
          <TestsEditor
            tests={spec.test}
            onTestsChange={(newTests) => {
              const newSpec = { ...spec, test: newTests };
              setStepSpec(newSpec);
            }}
          />
        </Stack>
      </Box>
    </FullScreenPopup>
  );
};

export default TDIStepEditor;


