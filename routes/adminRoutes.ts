import express from "express";
const router = express.Router();
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/adminControllers/rolesController";
import { getUsers, createUser, updateUser, deleteUser } from "../controllers/adminControllers/usersControllers";
import { getSignedUrlForStaffProfile } from "../controllers/googleCloudStorage/staffSignedURL";

// admin roles endpoints
router.get("/admin/getroles", getRoles);
router.post("/admin/createrole", createRole);
router.put("/admin/updaterole", updateRole);
router.delete("/admin/deleterole", deleteRole);

// admin users endpoints
router.get("/admin/getusers", getUsers);
router.post("/admin/createuser", createUser);
router.put("/admin/updateuser", updateUser);
router.delete("/admin/deleteuser", deleteUser);

// request signed url
router.post("/signedurl", getSignedUrlForStaffProfile);

export default router;
