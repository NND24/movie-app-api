import express from "express";
import { isAdmin, isAuthenticated } from "../middlewares/auth";
import {
  bulkModerateComments,
  deleteUser,
  getAdminStats,
  listComments,
  listUsers,
  setUserBanned,
  setUserRole,
} from "../controllers/admin.controller";

const adminRouter = express.Router();

// Every /admin route needs a logged-in admin.
adminRouter.use("/admin", isAuthenticated, isAdmin);

adminRouter.get("/admin/stats", getAdminStats);
adminRouter.get("/admin/users", listUsers);
adminRouter.put("/admin/users/:id/role", setUserRole);
adminRouter.put("/admin/users/:id/ban", setUserBanned);
adminRouter.delete("/admin/users/:id", deleteUser);
adminRouter.get("/admin/comments", listComments);
adminRouter.put("/admin/comments/bulk", bulkModerateComments);

export default adminRouter;
