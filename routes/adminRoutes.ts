import express from "express";
const router = express.Router();
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/adminController/rolesController";
import { getUsers } from "../controllers/adminController/usersControllers";

// admin roles endpoints
router.get("/admin/getroles", getRoles);
router.post("/admin/createrole", createRole);
router.put("/admin/updaterole", updateRole);
router.delete("/admin/deleterole", deleteRole);

// admin users endpoints
router.get("/admin/getusers", getUsers);

export default router;
