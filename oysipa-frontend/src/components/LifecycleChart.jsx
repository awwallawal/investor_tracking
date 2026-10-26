import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Link,
} from '@mui/material';
import ChartCard from './ui/ChartCard';

const LifecycleChart = ({ data }) => {
  const navigate = useNavigate();

  // The projects list filtered to one status (lifecycleStatus is the API parameter).
  const hrefFor = (status) => `/projects?lifecycleStatus=${encodeURIComponent(status)}`;

  const handleRowClick = (status) => {
    if (status) navigate(hrefFor(status));
  };

  // The status is a real link (keyboard reachable; Ctrl/Cmd-click opens a new tab).
  const handleLinkClick = (event, status) => {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(hrefFor(status));
  };

  // The API provides an array of objects with `status` and `count`.
  const filteredData = data ? data.filter(item => item.status) : [];

  return (
    <ChartCard title="Projects by Status" subtitle="Click a status to see its projects">
      <TableContainer sx={{ overflowX: 'auto' }}>
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
                    <Link href={hrefFor(item.status)} underline="hover" onClick={(e) => handleLinkClick(e, item.status)}>
                      {item.status}
                    </Link>
                  </TableCell>
                  <TableCell align="right" className="tabular-nums" sx={{ fontWeight: 600 }}>{item.count}</TableCell>
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
    </ChartCard>
  );
};

export default LifecycleChart;