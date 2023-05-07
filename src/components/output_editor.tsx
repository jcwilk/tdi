import React, { useState } from 'react';
import {
  Box,
  Chip,
} from '@mui/material';
import BoxPopup from './box_popup';
import styles from './css/step_editors.module.css';

interface StepEditorProps {
  keyName: string;
  text: string;
  setOutputData: (key: string, value: string) => void
}

export default function OutputEditor({ keyName, text, setOutputData }: StepEditorProps) {
  const [openEditor, setOpenEditor] = useState("")
  const fieldId = `output-${keyName}`

  const handleClickOpen = () => {
    setOpenEditor(fieldId);
  };

  const handleClose = (text: string) => {
    setOutputData(keyName, text);
    setOpenEditor("");
  };

  const renderChips = () => {
    return <Box style={{ float: "right" }}>
      <Chip
        className={styles.fieldStatusChip}
        variant="outlined"
        color={text ? "primary" : "warning"}
        size="small"
        label={keyName}
      />
    </Box>
  }

  return (
    <>
      <Box onClick={() => handleClickOpen()} className={styles.textDisplayBox}>
        {renderChips()}
        {text}
      </Box>
      <BoxPopup
        fieldId={fieldId}
        openEditor={openEditor}
        onClose={handleClose}
        description={`Editing ${keyName}`}
        text={text}
        fieldName={keyName}
      />
    </>
  );
}
