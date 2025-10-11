
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const LifecycleStatus = require('../models/LifecycleStatusModel');

const statuses = [
  { name: 'Idea', order: 1, description: 'Initial idea phase.' },
  { name: 'Research', order: 2, description: 'Research and due diligence phase.' },
  { name: 'Planning', order: 3, description: 'Planning and structuring the investment.' },
  { name: 'Execution', order: 4, description: 'Execution of the investment.' },
  { name: 'Monitoring', order: 5, description: 'Ongoing monitoring of the investment.' },
  { name: 'Closed', order: 6, description: 'The investment is closed or exited.' },
];

const seedDB = async () => {
  await connectDB();

  try {
    await LifecycleStatus.deleteMany({});
    console.log('Lifecycle statuses cleared.');

    await LifecycleStatus.insertMany(statuses);
    console.log('Lifecycle statuses seeded.');

  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
};

seedDB();
