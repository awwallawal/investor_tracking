const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./config/database');
const User = require('./models/User');
const authRoutes = require('./api/auth');
const userRoutes = require('./api/users');
const investorRoutes = require('./api/investors');
const projectRoutes = require('./api/projects'); // Import project routes
const interactionRoutes = require('./api/interactions');
const lifecycleStatusRoutes = require('./api/lifecyclestatuses');
const staffRoutes = require('./api/staff');
const adminRoutes = require('./api/admin');
const evidenceRoutes = require('./api/evidence');

const app = express();

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL, // Should be set in your Render environment
  'http://localhost:5173',
  //'https://investor-tracking.vercel.app' // Explicitly allow Vercel deployment
].filter(Boolean); // Removes any falsy values (e.g., if FRONTEND_URL is not set)

const corsOptions = {
  origin: allowedOrigins,
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));
app.use(express.json());

// Seed DB (only in main app, not tests)
const seedDatabase = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('No users found. Seeding database...');
      await User.create({
        name: 'DG Admin',
        email: process.env.ADMIN_EMAIL || 'dg@oysipa.com',
        password: process.env.ADMIN_PASSWORD || 'password123',
        role: 'Director-General',
        status: 'active',
      });
      await User.create({
        name: 'Portal Admin User',
        email: 'pa@oysipa.com',
        password: 'password123',
        role: 'Portal-Admin',
        status: 'active',
      });
      await User.create({
        name: 'Staff User',
        email: 'staff@oysipa.com',
        password: 'password123',
        role: 'Staff',
        status: 'active',
      });
      console.log('Database seeded with initial Director-General, Portal-Admin, and Staff users.');
    }
  } catch (error) {
    console.error('Error seeding database:', error.message);
  }
};

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/projects', projectRoutes); // Mount project routes
app.use('/api/interactions', interactionRoutes); // Mount interaction routes
app.use('/api/lifecycle-statuses', lifecycleStatusRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/evidence', evidenceRoutes);

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      seedDatabase();
    });
  });
}

module.exports = app; // for testing
