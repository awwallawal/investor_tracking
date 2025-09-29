import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
} from '@mui/material';

const LifecycleChart = ({ data }) => {
  const navigate = useNavigate();

  // The API provides `status`, let's use that.
  const handleRowClick = (status) => {
    if (status) {
      // Fix: Use lifecycleStatus to match the backend API parameter
      navigate(`/projects?lifecycleStatus=${status}`);
    }
  };

  // The API provides an array of objects with `status` and `count`.
  const filteredData = data ? data.filter(item => item.status) : [];

  return (
    <Box sx={{ width: '100%', mt: 3 }}>
      <Typography variant="h6" gutterBottom component="div">
        Projects by Status
      </Typography>
      <TableContainer component={Paper}>
        <Table aria-label="projects by lifecycle status">
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell align="right">Count</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <TableRow
                  key={item.status}
                  onClick={() => handleRowClick(item.status)}
                  hover
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell component="th" scope="row">
                    {item.status}
                  </TableCell>
                  <TableCell align="right">{item.count}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No project data available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LifecycleChart;