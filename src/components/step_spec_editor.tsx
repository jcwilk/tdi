import { TDIStep } from "../scenarios";
import { Step } from "../step";
import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Stack,
} from "@mui/material";
import FullScreenPopup from "./full_screen_popup";
import KeyValueEditor from "./key_value_editor";
import TestsEditor from "./tests_editor";
import DependsEditor from "./depends_editor";

type TDIStepEditorProps = {
  step: Step;
  open: boolean;
  onClose: () => void;
};

const TDIStepEditor: React.FC<TDIStepEditorProps> = ({
  step,
  open,
  onClose,
}) => {
  const [spec, setSpec] = useState<TDIStep>(step.getSpec());

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
    setSpec(newSpec);
    step.setSpec(newSpec);
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
              step.setSpec(newSpec);
            }}
          />
          <KeyValueEditor
            title="Input"
            keyValuePairs={spec.input}
            onKeyValuePairsChange={(newInput) => {
              const newSpec = { ...spec, input: newInput };
              step.setSpec(newSpec);
            }}
          />
          <KeyValueEditor
            title="Completion"
            keyValuePairs={spec.completion}
            onKeyValuePairsChange={(newCompletion) => {
              const newSpec = { ...spec, completion: newCompletion };
              step.setSpec(newSpec);
            }}
          />
          <TestsEditor
            tests={spec.test}
            onTestsChange={(newTests) => {
              const newSpec = { ...spec, test: newTests };
              step.setSpec(newSpec);
            }}
          />
        </Stack>
      </Box>
    </FullScreenPopup>
  );
};

export default TDIStepEditor;


