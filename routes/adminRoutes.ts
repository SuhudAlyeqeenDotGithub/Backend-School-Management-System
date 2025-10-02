import express from "express";
const router = express.Router();
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/adminControllers/rolesController";
import { getUsers, createUser, updateUser, deleteUser } from "../controllers/adminControllers/usersControllers";

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

export default router;
