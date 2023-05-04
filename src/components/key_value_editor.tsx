import React from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { v4 as uuidv4 } from "uuid";
import BoxPopup from './box_popup';
import styles from './css/step_spec_editor.module.css';

type KeyValueEditorProps = {
  title: string;
  keyValuePairs: { [key: string]: string };
  onKeyValuePairsChange: (keyValuePairs: { [key: string]: string }) => void;
};

const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  title,
  keyValuePairs,
  onKeyValuePairsChange,
}) => {
  const [openEditor, setOpenEditor] = React.useState('')
  const [inputKeys, setInputKeys] = React.useState<{ [key: string]: string }>(
    Object.fromEntries(Object.keys(keyValuePairs).map((key) => [key, uuidv4()]))
  );

  const handleInputChange = (key: string, value: string, newKey: boolean) => {
    const newKeyValuePairs = { ...keyValuePairs };
    if (newKey) {
      delete newKeyValuePairs[key];
      newKeyValuePairs[value] = keyValuePairs[key];

      // Update inputKeys state
      setInputKeys((prevInputKeys) => {
        const newInputKeys = { ...prevInputKeys };
        newInputKeys[value] = prevInputKeys[key];
        delete newInputKeys[key];
        return newInputKeys;
      });
    } else {
      newKeyValuePairs[key] = value;
    }
    onKeyValuePairsChange(newKeyValuePairs);
  };

  const handleAdd = () => {
    const key = "new_key"
    const value = ""
    setInputKeys((prevInputKeys) => {
      const newInputKeys = { ...prevInputKeys };
      newInputKeys[value] = prevInputKeys[key];
      delete newInputKeys[key];
      return newInputKeys;
    });
    onKeyValuePairsChange({ ...keyValuePairs, [key]: value });
  };

  const handleClickOpen = (fieldId: string) => {
    setOpenEditor(fieldId);
  };

  const handleDelete = (key: string) => {
    const newKeyValuePairs = { ...keyValuePairs };
    delete newKeyValuePairs[key];
    onKeyValuePairsChange(newKeyValuePairs);
  };

  const handleClose = (key: string, text: string) => {
    handleInputChange(key, text, false)
    setOpenEditor("");
  };

  const renderPair = (key: string, value: string) => {
    const uuid = inputKeys[key];
    const valueFieldId = `${uuid || "blank"}-value`;

    return (
      <Stack spacing={1} direction="row" key={uuid}>
        <TextField
          label="Key"
          value={key}
          onChange={(e) =>
            handleInputChange(key, e.target.value, true)
          }
        />
          <Box onClick={() => handleClickOpen(valueFieldId)} className={styles.textDisplayBox}>
            {value}
          </Box>
          <BoxPopup
            fieldId={valueFieldId}
            openEditor={openEditor}
            onClose={(text: string) => handleClose(key, text)}
            description={title}
            text={value}
            fieldName={key}
          />
        <IconButton
          onClick={() => handleDelete(key)}
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    )
  }

  return (
    <>
      <Typography variant="h6">{title}</Typography>
      {keyValuePairs &&
        Object.entries(keyValuePairs).map(([key, value]) => (
          renderPair(key, value)
        ))}
      <Stack direction="row" spacing={1}>
        <Button onClick={handleAdd} startIcon={<AddIcon />}>
          Add {title}
        </Button>
      </Stack>
    </>
  );
};

export default KeyValueEditor;
