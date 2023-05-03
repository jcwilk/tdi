import React, { forwardRef } from "react";
import { Dialog, AppBar, Toolbar, IconButton, Typography, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";

interface FullScreenPopupProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitText?: string;
  onSubmit?: () => void;
  children: React.ReactNode;
}

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function FullScreenPopup({
  open,
  onClose,
  title,
  submitText,
  onSubmit,
  children,
}: FullScreenPopupProps) {
  return (
    <div>
      <Dialog fullScreen open={open} onClose={onClose} TransitionComponent={Transition}>
        <AppBar sx={{ position: "relative" }}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {title}
            </Typography>
            {submitText && onSubmit && (
              <Button autoFocus color="inherit" onClick={onSubmit}>
                {submitText}
              </Button>
            )}
          </Toolbar>
        </AppBar>
        {children}
      </Dialog>
    </div>
  );
}
