import express from "express";
const router = express.Router();
import { getRoles, createRole, updateRole, deleteRole } from "../controllers/adminControllers/rolesController";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  updateOrgSettings
} from "../controllers/adminControllers/usersControllers";
import { getActivityLogs, getLastActivityLog } from "../controllers/adminControllers/activityLogs";
import {
  chargeOldBills,
  getBillings,
  getSubscription,
  prepareLastBills,
  getOrganisations,
  chargeLastBills
} from "../controllers/adminControllers/billing";
import { checkSubscription } from "../middleware/checkAccess";

// admin roles endpoints
router.get("/admin/roles", checkSubscription, getRoles);
router.post("/admin/roles", checkSubscription, createRole);
router.put("/admin/roles", checkSubscription, updateRole);
router.delete("/admin/roles", checkSubscription, deleteRole);

// admin users endpoints
router.get("/admin/users", checkSubscription, getUsers);
router.post("/admin/users", checkSubscription, createUser);
router.put("/admin/users", checkSubscription, updateUser);
router.delete("/admin/users", checkSubscription, deleteUser);

// admin activity logs endpoints
router.get("/admin/activitylogs", checkSubscription, getActivityLogs);
router.get("/admin/lastactivitylog", checkSubscription, getLastActivityLog);

// admin setting endopoints
router.post("/admin/settings", checkSubscription, updateOrgSettings);

// admin billing endopoints
router.get("/admin/billings", getBillings);
router.get("/admin/billing/subscription", getSubscription);

// owner prepare bills endpoint
router.post("/admin/billing/preparelastbills", chargeLastBills);
router.post("/admin/billing/chargeoldbills", chargeOldBills);
router.get("/admin/billing/organisations", getOrganisations);

export default router;
