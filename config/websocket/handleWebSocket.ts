import { Server, Socket } from "socket.io";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import * as cookie from "cookie";

declare module "socket.io" {
  interface Socket {
    userToken?: any;
  }
}

const handleWebSocket = (io: Server) => {
  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie;
      if (!cookies) throw new Error("No Cookies");

      const parsed = cookie.parse(cookies);
      const accessToken = parsed.accessToken;
      if (!accessToken) throw new Error("No Access Token");

      const decoded = await new Promise((resolve, reject) => {
        jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET_KEY as string, (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded);
        });
      });

      socket.userToken = decoded;

      next();
    } catch (err: any) {
      next(err);
    }
  });

  const socketHandler = () => {
    io.on("connection", (socket) => {
      socket.on("joinOrgRoom", ({ organisationId }: any) => {
        if (!organisationId) return;
        socket.join(organisationId);
      });
    });

    io.on("disconnect", () => {});
  };

  const databaseWatcher = () => {
    const queue = new Set<string>();
    const changeStream = mongoose.connection.watch([], {
      fullDocument: "updateLookup"
    });

    changeStream.on("change", (change) => {
      if (change.operationType === "delete") return;
      const collection = "ns" in change && change.ns && "coll" in change.ns && change.ns.coll;

      if (collection === "studentdayattendancetemplates" || collection === "studentsubjectattendancetemplates") return;

      const organisationIdExists =
        "fullDocument" in change && change.fullDocument && "organisationId" in change.fullDocument;

      const organisationId = organisationIdExists ? change.fullDocument?.organisationId?.toString() : null;
      const fullDocument = "fullDocument" in change ? change.fullDocument : null;
      const fullDocumentId = "fullDocument" in change ? change.fullDocument?._id : null;

      if (!collection || !organisationId) return;

      const queueKey = `${collection}-${organisationId}-${fullDocumentId}`;

      if (queue.has(queueKey)) {
        return;
      }

      queue.add(queueKey);

      setTimeout(() => {
        io.to(organisationId).emit("databaseChange", {
          collection,
          fullDocument,
          changeOperation: change.operationType
        });

        queue.delete(queueKey);
      }, 200);
    });
  };

  return {
    socketHandler,
    databaseWatcher
  };
};

export default handleWebSocket;
