import express from "express";
const router = express.Router();
import {} from "../controllers/accountControllers";
import { accessTokenChecker, refreshTokenChecker } from "../middleware/checkAccess";
import { getRoles, createRole } from "../controllers/adminController/rolesController";

router.get("/admin/getroles", getRoles);
router.post("/admin/createRole", createRole);

export default router;
