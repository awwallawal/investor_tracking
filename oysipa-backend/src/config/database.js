const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  const uri = process.env.NODE_ENV === 'test' 
    ? process.env.MONGO_URI_TEST 
    : process.env.MONGO_URI;

  if (!uri) {
    const env = process.env.NODE_ENV || 'development';
    console.error(`MongoDB URI for ${env} environment not found. Please set it in your .env file.`);
    throw new Error('Database URI not found');
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    console.log(`MongoDB connected successfully to ${process.env.NODE_ENV || 'development'} database.`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error; // Throw error instead of exiting
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected successfully.');
  } catch (error) {
    console.error('MongoDB disconnection failed:', error.message);
    throw error;
  }
};

module.exports = { connectDB, disconnectDB };
