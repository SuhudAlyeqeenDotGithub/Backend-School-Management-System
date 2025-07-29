import mongoose from "mongoose";
import { StaffContract } from "../models/staff/contracts";

const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string);
    console.log(`MongoDB database connected to ${conn.connection.host}`);
    await StaffContract.init();
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Unknown error:", error);
    }
    process.exit(1);
  }
};

export default connectDatabase;
