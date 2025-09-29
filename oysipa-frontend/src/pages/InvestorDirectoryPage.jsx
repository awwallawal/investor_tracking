import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import InvestorForm from '../components/InvestorForm';
import apiClient from '../api/api';

const InvestorDirectoryPage = () => {
    const [investors, setInvestors] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);

    const fetchInvestors = async () => {
        try {
            const response = await apiClient.get('/api/investors');
            setInvestors(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    };

    useEffect(() => {
        fetchInvestors();
    }, []);

    const handleSave = () => {
      setIsFormOpen(false);
      fetchInvestors(); // Re-fetch investors to update the list
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4">Investor Directory</Typography>
                <Button variant="contained" onClick={() => setIsFormOpen(true)}>
                    Register New Investor
                </Button>
            </Box>
            <InvestorForm
              open={isFormOpen}
              onClose={() => setIsFormOpen(false)}
              onSave={handleSave}
            />
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Sector</TableCell>
                        <TableCell>Country</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {investors.map(investor => (
                        <TableRow hover key={investor._id}>
                            <TableCell>
                                <Link to={`/investors/${investor._id}`}>{investor.investorName}</Link>
                            </TableCell>
                            <TableCell>{investor.sector}</TableCell>
                            <TableCell>{investor.countryOfOrigin}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Container>
    );
};

export default InvestorDirectoryPage;
