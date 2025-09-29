const mongoose = require('mongoose');
const Investor = require('./InvestorModel');


describe('Investor Model', () => {
  it('should fail to create an investor without a required name', async () => {
    const investor = new Investor({ sector: 'Tech' });

    let error;
    try {
      await investor.save();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.investorName).toBeDefined();
  });

  it('should fail to create an investor with non-unique name', async () => {
    const data = { investorName: 'Unique Investor', sector: 'Agriculture', countryOfOrigin: 'Nigeria' };
    await new Investor(data).save();

    const duplicate = new Investor(data);

    let error;
    try {
      await duplicate.save();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe(11000); // Mongo duplicate key error
  });
});
