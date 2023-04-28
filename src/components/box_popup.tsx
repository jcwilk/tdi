import React, { useState } from "react";
import Modal from '@mui/material/Modal';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface BoxPopupProps {
  openEditor: string;
  onClose: (text: string) => void;
  onSubmit: (text: string) => void;
  onSubmitText: string;
  description: string;
  text: string;
  fieldId: string;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  pt: 2,
  px: 4,
  pb: 3,
};

export default function BoxPopup({
  fieldId,
  text,
  openEditor,
  onClose,
  onSubmit,
  onSubmitText,
  description
}: BoxPopupProps) {
  const [textValue, setTextValue] = useState(text);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextValue(e.target.value);
  };

  return (
    <Modal
      open={fieldId === openEditor}
      onClose={() => onClose(textValue)}
      aria-labelledby="modal-modal-title"
    >
      <Box sx={style}>
        <Typography id="modal-modal-title" variant="h6" component="h2">
          { description }
        </Typography>
        <TextField
          multiline
          rows={10}
          value={textValue}
          variant="outlined"
          fullWidth
          onChange={handleChange}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => onSubmit(textValue)}
        >
          {onSubmitText}
        </Button>
      </Box>
    </Modal>
  );
}
