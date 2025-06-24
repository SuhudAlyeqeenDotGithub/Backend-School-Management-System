import express from "express";
const router = express.Router();
import {} from "../controllers/accountControllers";
import { accessTokenChecker, refreshTokenChecker } from "../middleware/checkAccess";
import { getRoles, createRole, updateRole } from "../controllers/adminController/rolesController";

router.get("/admin/getroles", getRoles);
router.post("/admin/createrole", createRole);
router.put("/admin/updaterole", updateRole);

export default router;
