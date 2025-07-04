import express from "express";
import errorHandler from "./middleware/errorMiddleware";
import connectDatabase from "./config/db";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import cookieParser from "cookie-parser";
import accountRoutes from "./routes/accountRoutes";
import adminRoutes from "./routes/adminRoutes";
import staffRoutes from "./routes/staffRoutes";
import { accessTokenChecker } from "./middleware/checkAccess";

const app = express();
const PORT = process.env.PORT || 5000;

connectDatabase();
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/alyeqeenschoolapp/api/", accountRoutes);
app.use("/alyeqeenschoolapp/api/", accessTokenChecker, adminRoutes);
app.use("/alyeqeenschoolapp/api/", accessTokenChecker, staffRoutes);

app.use(errorHandler);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
