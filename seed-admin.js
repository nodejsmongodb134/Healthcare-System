require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const adminEmail = 'admin@example.com';
    const existing = await User.findOne({ email: adminEmail });

    if (existing) {
      console.log('⚠️ Admin already exists:', existing.email);
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);

    const admin = new User({
      name: 'System Administrator',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
      profileComplete: true
    });

    await admin.save();
    console.log('✅ Admin created successfully!');
    console.log('📧 Email: admin@example.com');
    console.log('🔑 Password: Admin@123');
    console.log('⚠️ Please change the password after first login.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();