import express from "express";
const router = express.Router();
import { signupOrgAccount, signinOrgAccount } from "../controllers/acountControllers";

router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signIn", signinOrgAccount);

export default router;
