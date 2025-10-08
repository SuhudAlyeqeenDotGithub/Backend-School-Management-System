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
      socket.on("joinOrgRoom", ({ organisationId, accountName }: any) => {
        console.log(`${accountName} connected to org room: ${organisationId}`);
        if (!organisationId) return;
        socket.join(organisationId);
      });
    });

    io.on("disconnect", () => {});
  };

  const databaseWatcher = () => {
    const collectionOnQueue = new Set<string>();
    const changeStream = mongoose.connection.watch([], {
      fullDocument: "updateLookup"
    });

    changeStream.on("change", (change) => {
      const changeOperation = change.operationType;
      if (changeOperation === "delete") return;
      const changeExist = "ns" in change && change.ns && "coll" in change.ns && change.ns.coll;
      const organisationIdExists =
        "fullDocument" in change && change.fullDocument && "organisationId" in change.fullDocument;
      if (changeExist && organisationIdExists) {
        const collection = change.ns?.coll;
        const organisationId = change.fullDocument.organisationId.toString();
        if (!collectionOnQueue.has(collection)) {
          collectionOnQueue.add(collection);
          setTimeout(() => {
            io.to(organisationId).emit("databaseChange", {
              collection,
              fullDocument: change.fullDocument,
              changeOperation
            });
            console.log(`Emitted to org ${organisationId} on collection ${collection}`);
            collectionOnQueue.delete(collection);
          }, 200);
        }
      }
    });
  };

  return {
    socketHandler,
    databaseWatcher
  };
};

export default handleWebSocket;
