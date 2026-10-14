import mongoose, { Document, Model, Schema } from "mongoose";

// A browser (device) that asked for push notifications, as given by PushManager.subscribe().
export interface PushSubscriptionDoc extends Document {
  user: mongoose.Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  // Consecutive failed sends; the subscription is dropped when the push service rejects it.
  failures: number;
  lastSentAt?: Date;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    failures: { type: Number, default: 0 },
    lastSentAt: { type: Date },
  },
  { timestamps: true }
);

const pushSubscriptionModel: Model<PushSubscriptionDoc> = mongoose.model("PushSubscription", pushSubscriptionSchema);

export default pushSubscriptionModel;
