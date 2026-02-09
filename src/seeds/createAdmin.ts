import bcrypt from "bcryptjs";
import { connectDB } from "../database/mongodb";
import { UserModel } from "../models/user.model";
import { v4 as uuidv4 } from "uuid";

/**
 * Create an admin user
 * Run this script to create an initial admin account
 * Usage: npm run seed (if configured in package.json)
 */
async function createAdmin() {
  try {
    await connectDB();

    // Check if admin already exists
    const adminExists = await UserModel.findOne({ email: "admin@pairup.com" });
    if (adminExists) {
      console.log("✅ Admin already exists with email: admin@pairup.com");
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    // Create admin user
    const admin = new UserModel({
      uid: uuidv4(),
      firstname: "Admin",
      lastname: "User",
      email: "admin@pairup.com",
      number: "1234567890",
      password: hashedPassword,
      authProvider: "local",
      role: "admin",
    });

    await admin.save();

    console.log("✅ Admin user created successfully!");
    console.log("📧 Email: admin@pairup.com");
    console.log("🔐 Password: Admin@123");
    console.log("\n⚠️  IMPORTANT: Change this password after first login!");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error creating admin:", error.message);
    process.exit(1);
  }
}

createAdmin();
