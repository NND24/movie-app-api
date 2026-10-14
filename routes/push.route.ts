import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { cronCheck, getPublicKey, sendTest, status, subscribe, unsubscribe } from "../controllers/push.controller";

const pushRouter = express.Router();

pushRouter.get("/push/public-key", getPublicKey);
pushRouter.get("/push/status", isAuthenticated, status);
pushRouter.post("/push/subscribe", isAuthenticated, subscribe);
pushRouter.post("/push/unsubscribe", isAuthenticated, unsubscribe);
pushRouter.post("/push/test", isAuthenticated, sendTest);
pushRouter.post("/push/check", cronCheck);

export default pushRouter;
