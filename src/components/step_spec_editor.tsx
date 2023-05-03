import { TDIStep } from "../scenarios"
import { Step } from "../step"
import React, { useState, useEffect } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
} from '@mui/material';
import BoxPopup from './box_popup'
import FullScreenPopup from './full_screen_popup';

type TDIStepEditorProps = {
  step: Step;
  open: boolean;
  onClose: () => void;
};

const TDIStepEditor: React.FC<TDIStepEditorProps> = ({ step, open, onClose }) => {
  const [openEditor, setOpenEditor] = useState('');
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

  const handleClickOpen = (fieldId: string) => {
    setOpenEditor(fieldId);
  };

  const handleClose = (key: string, text: string) => {
    spec.description = text;
    step.setSpec(spec);
    setOpenEditor('');
  };

  const properties = [
    { title: 'Input', content: spec.input },
    { title: 'Completion', content: spec.completion },
    { title: 'Test', content: spec.test },
  ];

  return (
    <FullScreenPopup
      open={open}
      onClose={() => onClose()}
      title={`Edit Step: ${spec.description}`}
    >
      <Box sx={{ p: 2 }}>
        <Typography>Description:</Typography>
        <Box onClick={() => handleClickOpen('description')}>
          {spec.description}
        </Box>
        <BoxPopup
          fieldId="description"
          openEditor={openEditor}
          onClose={(text: string) => handleClose('description', text)}
          description={spec.description}
          text={spec.description}
          fieldName="description"
        />

      </Box>
    </FullScreenPopup>
  );
};

export default TDIStepEditor;

// {properties.map(({ title, content }) => (
//   Object.entries(content || {}).map(([key, value]) => (
//     <div key={`${title}-${key}`}>
//       <Typography>{`${title} - ${key}`}</Typography>
//       <Box onClick={() => handleClickOpen(`${title}-${key}`)}>
//         {value}
//       </Box>
//       <BoxPopup
//         fieldId={`${title}-${key}`}
//         openEditor={openEditor}
//         onClose={(text: string) => handleClose(step, key, text)}
//         description={step.description}
//         text={value}
//         fieldName={key}
//       />
//     </div>
//   ))
// ))}
