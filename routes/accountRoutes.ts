import express from "express";
const router = express.Router();
import { signupOrgAccount, signinAccount, resetPasswordSendEmail } from "../controllers/accountControllers";

router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signin", signinAccount);
router.post("/orgaccount/resetpassword", resetPasswordSendEmail);

export default router;
