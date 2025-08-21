import express from "express";
import errorHandler from "./middleware/errorMiddleware.ts";
import connectDatabase from "./config/db.ts";
import { trackComputeSeconds, trackResponseSize } from "./middleware/resourceUsageTracker.ts";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import accountRoutes from "./routes/accountRoutes.ts";
import adminRoutes from "./routes/adminRoutes.ts";
import staffRoutes from "./routes/staffRoutes.ts";
import timelineRoutes from "./routes/timelineRoutes.ts";
import { accessTokenChecker } from "./middleware/checkAccess.ts";
import { Server } from "socket.io";
import handleWebSocket from "./config/websocket/handleWebSocket.ts";
import { fetchAccount } from "./controllers/accountControllers.ts";

const app = express();
const PORT = process.env.PORT || 5000;

connectDatabase();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const { socketHandler, databaseWatcher } = handleWebSocket(io);

socketHandler();
databaseWatcher();

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

app.use(accessTokenChecker);
app.use(trackComputeSeconds);
app.use(trackResponseSize);

app.get("/alyeqeenschoolapp/api/orgaccount/fetchaccount", fetchAccount);
app.use("/alyeqeenschoolapp/api/", adminRoutes);
app.use("/alyeqeenschoolapp/api/", staffRoutes);
app.use("/alyeqeenschoolapp/api/timeline/", timelineRoutes);

app.use(errorHandler);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
