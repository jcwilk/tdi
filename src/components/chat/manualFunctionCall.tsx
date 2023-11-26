import React, { useMemo, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, TextField, Typography, TypographyProps } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { FunctionParameter, callFunction, functionSpecs } from '../../chat/functionCalling';
import { Conversation } from '../../chat/conversation';
import { FunctionOption } from '../../openai_api';
import { ConversationDB } from '../../chat/conversationDb';

interface ManualFunctionCallDialogProps {
  defaultParameters?: { [key: string]: string };
  functionOption: FunctionOption;
  conversation: Conversation;
  onRun: () => void;
  onClose: () => void;
}

interface ManualFunctionCallButtonProps {
  defaultParameters?: { [key: string]: string };
  functionOption: FunctionOption;
  conversation: Conversation;
  onRun: () => void;
}

function functionOptionToParameters(functionOption: FunctionOption): FunctionParameter[] {
  const spec = functionSpecs.find(spec => spec.name === functionOption.name);
  if (!spec) throw new Error('Function not found: ' + functionOption.name);
  return spec.parameters;
}

const ManualFunctionCallDialog: React.FC<ManualFunctionCallDialogProps> = ({ defaultParameters, functionOption, conversation, onRun, onClose }) => {
  const [parameters, setParameters] = useState<{ [key: string]: any }>(defaultParameters || {});
  const [error, setError] = useState<string>('');

  const functionParameters = useMemo(() => functionOptionToParameters(functionOption), [functionOption]);

  const handleParameterChange = (paramName: string, paramType: string, value: string) => {
    let parsedValue: string | string[] = value;
    if (paramType === 'array') parsedValue = value.split(',').map(s => s.trim());

    setParameters(prevParams => ({ ...prevParams, [paramName]: parsedValue }));
  };

  const handleSubmit = async () => {
    try {
      await callFunction(conversation, { name: functionOption.name, parameters }, new ConversationDB());
      onRun();
    } catch (error: unknown) {
      setError('Error executing function: ' + String(error));
    }
  };

  const renderInputField = (param: FunctionParameter) => (
    <TextField
      key={param.name}
      margin="dense"
      fullWidth
      variant="standard"
      id={param.name}
      label={param.name}
      type={param.type === 'number' ? 'number' : 'text'}
      helperText={param.description}
      FormHelperTextProps={{ sx: { whiteSpace: 'pre-wrap' } }}
      value={parameters[param.name] || ''}
      onChange={(e) => handleParameterChange(param.name, param.type, e.target.value)}
    />
  );

  return (
    <>
      <DialogTitle id="form-dialog-title">{functionOption.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ whiteSpace: 'pre-wrap' }}>
          {functionOption.description}
        </DialogContentText>
        {functionParameters.map(renderInputField)}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">Cancel</Button>
        <Button onClick={handleSubmit} color="primary">Run</Button>
      </DialogActions>
      {error && <DialogContentText color="error">{error}</DialogContentText>}
    </>
  );
};

export const ManualFunctionCallButton: React.FC<ManualFunctionCallButtonProps> = ({ defaultParameters, functionOption, conversation, onRun }) => {
  const [open, setOpen] = useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  const handleRun = () => {
    handleClose();
    onRun();
  };

  return (
    <>
      <IconButton onClick={handleOpen}>
        <PlayCircleOutlineIcon />
      </IconButton>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="form-dialog-title"
        TransitionProps={{ unmountOnExit: true }}
      >
        <ManualFunctionCallDialog
          defaultParameters={defaultParameters}
          functionOption={functionOption}
          conversation={conversation}
          onRun={handleRun}
          onClose={handleClose}
        />
      </Dialog>
    </>
  );
};
