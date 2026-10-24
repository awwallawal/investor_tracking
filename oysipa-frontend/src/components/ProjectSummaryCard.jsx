import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { Link } from 'react-router-dom'; // Assuming react-router-dom is used for navigation

const ProjectSummaryCard = ({ project }) => {
  return (
    <Card
      sx={{
        minWidth: 275,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        '&:hover': {
          boxShadow: 6,
        },
      }}
    >
      <CardContent>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          Investor: {project.investor ? project.investor.investorName : 'N/A'}
        </Typography>
        <Typography variant="h5" component="div">
          {project.projectTitle}
        </Typography>
        <Typography sx={{ mb: 1.5 }} color="text.secondary">
          Status: {project.lifecycleStatus?.name || 'N/A'}
        </Typography>
      </CardContent>
      <Box sx={{ p: 2, pt: 0 }}>
        <Link to={`/projects/${project._id}`} style={{ textDecoration: 'none' }}>
          <Typography variant="button" color="primary">
            View Details
          </Typography>
        </Link>
      </Box>
    </Card>
  );
};

export default ProjectSummaryCard;