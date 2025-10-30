import express from "express";
const router = express.Router();
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/adminControllers/rolesController";
import { getUsers, createUser, updateUser, deleteUser } from "../controllers/adminControllers/usersControllers";
import { getActivityLogs, getLastActivityLog } from "../controllers/adminControllers/activityLogs";

// admin roles endpoints
router.get("/admin/roles", getRoles);
router.post("/admin/roles", createRole);
router.put("/admin/roles", updateRole);
router.delete("/admin/roles", deleteRole);

// admin users endpoints
router.get("/admin/users", getUsers);
router.post("/admin/users", createUser);
router.put("/admin/users", updateUser);
router.delete("/admin/users", deleteUser);

// admin activity logs endpoints
router.get("/admin/activitylogs", getActivityLogs);
router.get("/admin/lastactivitylog", getLastActivityLog);

export default router;
