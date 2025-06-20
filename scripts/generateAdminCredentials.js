const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('../models/User');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Generate random string
const generateRandomString = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Generate complex password
const generateComplexPassword = (length) => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Main function to generate admin credentials
const generateAdminCredentials = async () => {
  try {
    await connectDB();

    // Check if super admin already exists
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      console.log('❌ Super admin already exists!');
      console.log(`Email: ${existingAdmin.email}`);
      console.log('Use the existing admin account or delete it first.');
      process.exit(1);
    }

    // Generate credentials
    const username = generateRandomString(16);
    const password = generateComplexPassword(24);
    const email = `admin_${username}@mebit.io`;

    // Create admin user
    const adminUser = await User.create({
      email,
      password,
      name: 'Super Admin',
      role: 'super_admin',
      sessionTimeout: 24 * 60, // 24 hours in minutes
      createdAt: new Date(),
      lastLogin: null
    });

    // Display credentials
    console.log('\n🎉 ADMIN CREDENTIALS GENERATED SUCCESSFULLY!\n');
    console.log('=' .repeat(50));
    console.log('ADMIN DASHBOARD CREDENTIALS');
    console.log('=' .repeat(50));
    console.log(`👤 Username: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`🌐 Access URL: /admin/dashboard`);
    console.log(`🆔 User ID: ${adminUser._id}`);
    console.log(`📅 Created: ${adminUser.createdAt.toLocaleString()}`);
    console.log(`⏱️  Session Timeout: 24 hours`);
    console.log('=' .repeat(50));
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('• Store these credentials securely');
    console.log('• Change the password after first login');
    console.log('• Only share with authorized personnel');
    console.log('• Enable multi-factor authentication');
    console.log('• Monitor admin activity regularly');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Save these credentials to a secure location');
    console.log('2. Access the admin dashboard using the URL above');
    console.log('3. Complete the initial security setup');
    console.log('4. Configure admin preferences');
    console.log('5. Review audit logs regularly');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating admin credentials:', error);
    process.exit(1);
  }
};

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('\n📖 ADMIN CREDENTIALS GENERATOR');
  console.log('=' .repeat(40));
  console.log('This script generates secure admin credentials for the MacroMind platform.');
  console.log('\nUsage:');
  console.log('  node generateAdminCredentials.js');
  console.log('\nOptions:');
  console.log('  --help, -h     Show this help message');
  console.log('  --force, -f    Force generate (delete existing admin)');
  console.log('\nSecurity Features:');
  console.log('• 16-character random username');
  console.log('• 24-character complex password');
  console.log('• BCrypt password hashing');
  console.log('• Session timeout protection');
  console.log('• Audit logging enabled');
  console.log('\n');
  process.exit(0);
}

if (args.includes('--force') || args.includes('-f')) {
  // Force mode - delete existing admin first
  connectDB().then(async () => {
    try {
      const deleted = await User.deleteMany({ role: 'super_admin' });
      console.log(`🗑️  Deleted ${deleted.deletedCount} existing admin account(s)`);
      await generateAdminCredentials();
    } catch (error) {
      console.error('❌ Error in force mode:', error);
      process.exit(1);
    }
  });
} else {
  // Normal mode
  generateAdminCredentials();
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Admin credential generation cancelled.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Admin credential generation terminated.');
  process.exit(0);
}); 