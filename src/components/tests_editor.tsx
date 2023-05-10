import React from "react";
import {
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { v4 as uuidv4 } from "uuid";
import { TDITestStep } from "../scenarios";

type TestsEditorProps = {
  tests: { [key: string]: TDITestStep };
  onTestsChange: (tests: { [key: string]: TDITestStep }) => void;
};

const TestsEditor: React.FC<TestsEditorProps> = ({
  tests,
  onTestsChange,
}) => {
  const [inputKeys, setInputKeys] = React.useState<{ [key: string]: string }>(
    Object.fromEntries(Object.keys(tests).map((key) => [key, uuidv4()]))
  );

  const handleInputChange = (
    key: string,
    value: string,
    field: "key" | "code" | "test"
  ) => {
    const newTests = { ...tests };
    if (field === "key") {
      newTests[value] = newTests[key];
      delete newTests[key];

      setInputKeys((prevInputKeys) => {
        const newInputKeys = { ...prevInputKeys };
        newInputKeys[value] = prevInputKeys[key];
        delete newInputKeys[key];
        return newInputKeys;
      });
    } else {
      newTests[key][field] = value;
    }
    onTestsChange(newTests);
  };

  const handleAdd = () => {
    const newKey = "";
    onTestsChange({ ...tests, [newKey]: { test: "", code: "" } });
  };

  const handleDelete = (key: string) => {
    const newTests = { ...tests };
    delete newTests[key];
    onTestsChange(newTests);
  };

  const renderTest = (key: string, test: string, code: string) => {
    const uuid = inputKeys[key];

    return (
      <Stack spacing={1} direction="row" key={uuid}>
        <TextField
          label="Key"
          value={key}
          onChange={(e) => handleInputChange(key, e.target.value, "key")}
        />
        <TextField
          label="Test"
          value={test}
          onChange={(e) => handleInputChange(key, e.target.value, "test")}
        />
        <TextField
          label="Code"
          value={code}
          onChange={(e) => handleInputChange(key, e.target.value, "code")}
        />
        <IconButton
          onClick={() => handleDelete(key)}
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    );
  };

  return (
    <>
      <Typography variant="h6">Tests</Typography>
      {tests &&
        Object.entries(tests).map(([key, { test, code }]) => (
          renderTest(key, test, code)
        ))}
      <Stack direction="row" spacing={1}>
        <Button onClick={handleAdd} startIcon={<AddIcon />}>
          Add Test
        </Button>
      </Stack>
    </>
  );
};

export default TestsEditor;
