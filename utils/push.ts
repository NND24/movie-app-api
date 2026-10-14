import webpush from "web-push";
import mongoose from "mongoose";
import pushSubscriptionModel, { PushSubscriptionDoc } from "../models/pushSubscription.model";

export interface PushPayload {
  title: string;
  body: string;
  // Page opened when the notification is clicked.
  url: string;
  image?: string;
  // Notifications with the same tag replace each other (one per movie / manga).
  tag?: string;
}

let configured: boolean | null = null;

// Web Push needs the VAPID key pair from the environment (see .env).
export const pushConfigured = () => {
  if (configured === null) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (configured) webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }
  return configured;
};

// Sends to one device; removes it when the push service says it no longer exists.
const sendOne = async (sub: PushSubscriptionDoc, payload: PushPayload) => {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      JSON.stringify(payload),
      { TTL: 24 * 60 * 60, urgency: "normal" }
    );
    await pushSubscriptionModel.updateOne({ _id: sub._id }, { $set: { failures: 0, lastSentAt: new Date() } });
    return true;
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await pushSubscriptionModel.deleteOne({ _id: sub._id });
    } else {
      const updated = await pushSubscriptionModel.findOneAndUpdate({ _id: sub._id }, { $inc: { failures: 1 } }, { new: true });
      if (updated && updated.failures >= 10) await pushSubscriptionModel.deleteOne({ _id: sub._id });
    }
    return false;
  }
};

// Sends to every device of a user; returns how many accepted it.
export const sendToUser = async (userId: mongoose.Types.ObjectId | string, payload: PushPayload) => {
  if (!pushConfigured()) return 0;
  const subs = await pushSubscriptionModel.find({ user: userId });
  const results = await Promise.all(subs.map((s) => sendOne(s, payload)));
  return results.filter(Boolean).length;
};
