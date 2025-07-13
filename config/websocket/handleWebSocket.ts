import { Server } from "socket.io";
import mongoose from "mongoose";

const handleWebSocket = (io: Server) => {
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
            io.to(organisationId).emit("databaseChange", collection);
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
