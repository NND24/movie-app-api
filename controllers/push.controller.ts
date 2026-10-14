import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import pushSubscriptionModel from "../models/pushSubscription.model";
import { pushConfigured, sendToUser } from "../utils/push";
import { checkReleases, lastCheckReport } from "../utils/releaseChecker";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

// GET /push/public-key — the VAPID public key browsers subscribe with.
export const getPublicKey = (_req: Request, res: Response) => {
  res.json({ enabled: pushConfigured(), publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
};

// POST /push/subscribe { subscription: PushSubscriptionJSON } — this device, for the logged-in user.
export const subscribe = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pushConfigured()) return next(new ErrorHandler("Máy chủ chưa bật thông báo đẩy", 503));
    const sub = req.body.subscription;
    const endpoint = str(sub?.endpoint);
    const p256dh = str(sub?.keys?.p256dh, 200);
    const auth = str(sub?.keys?.auth, 100);
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return next(new ErrorHandler("Đăng ký thông báo không hợp lệ", 400));
    // An endpoint belongs to one browser; if another account used it, it moves to this one.
    await pushSubscriptionModel.updateOne(
      { endpoint },
      { $set: { user: req.user?._id, keys: { p256dh, auth }, userAgent: str(req.headers["user-agent"], 300), failures: 0 } },
      { upsert: true }
    );
    const devices = await pushSubscriptionModel.countDocuments({ user: req.user?._id });
    res.json({ subscribed: true, devices });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /push/unsubscribe { endpoint }
export const unsubscribe = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pushSubscriptionModel.deleteOne({ endpoint: str(req.body.endpoint), user: req.user?._id });
    res.json({ subscribed: false });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// GET /push/status?endpoint= — whether this device is registered, and how many devices are.
export const status = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoint = str(req.query.endpoint);
    const [devices, mine] = await Promise.all([
      pushSubscriptionModel.countDocuments({ user: req.user?._id }),
      endpoint ? pushSubscriptionModel.exists({ endpoint, user: req.user?._id }) : null,
    ]);
    res.json({ enabled: pushConfigured(), devices, thisDevice: !!mine });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /push/test — a sample notification to all of the user's devices.
export const sendTest = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sent = await sendToUser(req.user!._id, {
      title: "dMovie đã sẵn sàng 🎬",
      body: "Bạn sẽ nhận thông báo ở đây khi phim hay truyện bạn theo dõi có tập, chương mới.",
      url: "/theo-doi",
      tag: "test",
    });
    if (!sent) return next(new ErrorHandler("Chưa có thiết bị nào nhận được thông báo", 400));
    res.json({ sent });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /push/check — runs the release check now. For an external scheduler (e.g. cron-job.org),
// which also wakes a sleeping free server: header x-cron-secret must equal CRON_SECRET.
export const cronCheck = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers["x-cron-secret"] !== secret) return next(new ErrorHandler("Forbidden", 401));
  res.json(await checkReleases());
});

// POST /admin/push/check — same, for admins (GET returns the last report).
export const adminCheck = CatchAsyncError(async (_req: Request, res: Response) => {
  res.json(await checkReleases());
});

export const adminLastReport = (_req: Request, res: Response) => {
  res.json(lastCheckReport());
};
