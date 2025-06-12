import express from "express";
const router = express.Router();
import { signupOrgAccount, signinAccount } from "../controllers/accountControllers";

router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signin", signinAccount);

export default router;
