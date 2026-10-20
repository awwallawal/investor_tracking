import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardActionArea, CardContent, Typography } from '@mui/material';

// One headline number on a dashboard; clickable when navigateTo is given.
const KpiWidget = ({ title, value, navigateTo }) => {
  const navigate = useNavigate();

  const content = (
    <CardContent>
      <Typography variant="body2" color="text.secondary" component="h2">
        {title}
      </Typography>
      <Typography variant="h4" component="p" sx={{ fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
        {value}
      </Typography>
    </CardContent>
  );

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      {navigateTo ? (
        <CardActionArea onClick={() => navigate(navigateTo)} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : content}
    </Card>
  );
};

export default KpiWidget;
