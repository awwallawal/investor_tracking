import React, { useId } from 'react';
import {
  Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';

// The one dialog layout of every form (story 11.16): title, a short help line,
// the fields (grouped with FormSection), and the actions with the primary
// action last (on the right). Full screen on phones, with a Close button in
// the title. The help line describes the dialog (aria-describedby).
// `actions`: the buttons, Cancel first and the primary button last.
const FormDialog = ({
  open, onClose, title, help, children, actions, maxWidth = 'sm', contentRef, paperProps,
}) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const helpId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={maxWidth}
      fullScreen={phone}
      aria-describedby={help ? helpId : undefined}
      slotProps={paperProps ? { paper: paperProps } : undefined}
    >
      <DialogTitle sx={{ pb: help ? 0.5 : 1, overflowWrap: 'anywhere', ...(phone && { pr: 7 }) }}>{title}</DialogTitle>
      {/* Full screen on phones: no backdrop to tap, so a close button by the
          title (outside it, so the dialog's name stays the title). */}
      {phone && onClose && (
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      )}
      <DialogContent ref={contentRef}>
        {help && (
          <Typography id={helpId} variant="body2" color="text.secondary" sx={{ mb: 2 }}>{help}</Typography>
        )}
        {children}
      </DialogContent>
      {actions && (
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1, flexWrap: 'wrap', borderTop: `1px solid ${theme.palette.divider}` }}>
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
};

// A group of fields under a small heading.
export const FormSection = ({ title, children, first = false }) => (
  <Box component="section" aria-label={title} sx={{ mt: first ? 0 : 2.5 }}>
    {title && (
      <Typography variant="overline" component="h3" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {title}
      </Typography>
    )}
    {children}
  </Box>
);

export default FormDialog;
