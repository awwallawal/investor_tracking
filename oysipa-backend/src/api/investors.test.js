const request = require('supertest');
const express = require('express');
const Investor = require('../models/InvestorModel'); // fixed path (lowercase)
const investorRouter = require('./investors');   // your router file is singular: api/investor.js

const app = express();
app.use(express.json());
app.use('/api/investors', investorRouter);

// Mock the Investor model
jest.mock('../models/InvestorModel');

describe('Investor API', () => {
  it('should create a new investor', async () => {
    // Mock return value for Investor.create
    Investor.create.mockResolvedValue({
      _id: 'mockId123',
      investorName: 'Test Investor',
      sector: 'Financial services',
      countryOfOrigin: 'USA'
    });

    const res = await request(app)
      .post('/api/investors')
      .set('Authorization', `Bearer ${global.portalAdminToken}`) // DG/Admin: any investor; Staff: create (auto-assigned) and edit only their assigned investors
      .send({
        investorName: 'Test Investor',
        sector: 'Financial services',
        countryOfOrigin: 'USA',
        leadSource: 'Other'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('investorName', 'Test Investor');
  });

  it('should update an existing investor', async () => {
    const investorId = 'mockId123';
    const updatedData = { sector: 'Technology and ICT' };
    const existingInvestor = {
      _id: investorId,
      investorName: 'Test Investor',
      sector: 'Financial services',
      countryOfOrigin: 'USA'
    };
    const updatedInvestor = { ...existingInvestor, ...updatedData };

    Investor.findByIdAndUpdate.mockResolvedValue(updatedInvestor);

    const res = await request(app)
      .put(`/api/investors/${investorId}`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`) // DG/Admin: any investor; Staff: create (auto-assigned) and edit only their assigned investors
      .send(updatedData);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('sector', 'Technology and ICT');
  });
});
