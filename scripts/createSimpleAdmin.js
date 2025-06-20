const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const createSimpleAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin1@mebit.io' });
    
    if (existingAdmin) {
      console.log('Admin user already exists, updating...');
      
      // Update existing admin
      existingAdmin.password = 'admin1'; // This will be hashed by the User model pre-save hook
      existingAdmin.role = 'super_admin';
      existingAdmin.name = 'Super Admin';
      existingAdmin.loginAttempts = 0;
      existingAdmin.lockedUntil = null;
      existingAdmin.sessionTimeout = 24 * 60; // 24 hours in minutes
      
      await existingAdmin.save();
      console.log('✅ Admin user updated successfully!');
    } else {
      // Create new admin user
      const adminUser = await User.create({
        email: 'admin1@mebit.io',
        password: 'admin1', // This will be automatically hashed by the User model
        name: 'Super Admin',
        role: 'super_admin',
        loginAttempts: 0,
        lockedUntil: null,
        sessionTimeout: 24 * 60, // 24 hours in minutes
        isEmailVerified: true
      });

      console.log('✅ Admin user created successfully!');
    }

    console.log('\n🔑 Admin Credentials:');
    console.log('Email: admin1@mebit.io');
    console.log('Password: admin1');
    console.log('\n🚀 You can now login to the admin panel at:');
    console.log('http://localhost:3000/admin/login');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run the script
createSimpleAdmin(); 