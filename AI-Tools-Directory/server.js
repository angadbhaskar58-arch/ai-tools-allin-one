import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";

const requiredEnvironment = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET"
];
const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]);

if (missingEnvironment.length) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseOrigin = new URL(supabaseUrl).origin;
const amountPaise = 29900;
const currency = "INR";
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
const app = express();
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many payment attempts. Please wait and try again." }
});

app.disable("x-powered-by");
app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            connectSrc: ["'self'", supabaseOrigin, "https://api.razorpay.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            formAction: ["'self'", "https://api.razorpay.com"],
            frameAncestors: ["'none'"],
            frameSrc: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
            imgSrc: ["'self'", "data:", "https://www.google.com"],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]
        }
    }
}));

async function getAuthenticatedUser(req, res, next) {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer ([^\s]+)$/);
    if (!match) {
        res.status(401).json({ error: "Please sign in to continue." });
        return;
    }

    try {
        const { data, error } = await supabase.auth.getUser(match[1]);
        if (error || !data.user) {
            res.status(401).json({ error: "Your session has expired. Please sign in again." });
            return;
        }
        req.user = data.user;
        next();
    } catch (error) {
        next(error);
    }
}

async function hasMembership(userId) {
    const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

function isValidSignature(message, signature, secret) {
    if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac("sha256", secret).update(message).digest();
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function grantMembership(order, paymentId) {
    const { error: orderError } = await supabase
        .from("payment_orders")
        .update({ status: "paid", payment_id: paymentId })
        .eq("order_id", order.order_id);
    if (orderError) throw orderError;

    const { error: membershipError } = await supabase
        .from("memberships")
        .upsert({
            user_id: order.user_id,
            order_id: order.order_id,
            payment_id: paymentId
        }, { onConflict: "user_id" });
    if (membershipError) throw membershipError;
}

app.post(
    "/api/webhooks/razorpay",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res, next) => {
        try {
            const signature = req.get("x-razorpay-signature");
            if (!Buffer.isBuffer(req.body) ||
                !isValidSignature(req.body, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
                res.status(400).json({ error: "Invalid webhook signature." });
                return;
            }

            const event = JSON.parse(req.body.toString("utf8"));
            if (event.event !== "payment.captured") {
                res.status(200).json({ received: true });
                return;
            }

            const payment = event.payload?.payment?.entity;
            if (!payment?.id || !payment.order_id || payment.status !== "captured") {
                res.status(400).json({ error: "Invalid captured payment event." });
                return;
            }

            const { data: order, error } = await supabase
                .from("payment_orders")
                .select("*")
                .eq("order_id", payment.order_id)
                .maybeSingle();
            if (error) throw error;
            if (!order) {
                res.status(404).json({ error: "Payment order was not found." });
                return;
            }
            if (payment.amount !== order.amount || payment.currency !== order.currency ||
                order.amount !== amountPaise || order.currency !== currency) {
                res.status(400).json({ error: "Payment amount or currency did not match." });
                return;
            }

            await grantMembership(order, payment.id);
            res.status(200).json({ received: true });
        } catch (error) {
            next(error);
        }
    }
);

app.use(express.json({ limit: "16kb" }));

app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

app.get("/api/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
        supabaseUrl,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
});

app.get("/api/access", getAuthenticatedUser, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ active: await hasMembership(req.user.id) });
});

app.get("/api/tools", getAuthenticatedUser, async (req, res) => {
    if (!await hasMembership(req.user.id)) {
        res.status(403).json({ error: "A verified one-time membership is required." });
        return;
    }

    const { data, error } = await supabase
        .from("tools")
        .select("category,name,description,url,pricing,domain")
        .order("position", { ascending: true });
    if (error) throw error;

    const grouped = {};
    for (const tool of data) {
        if (!grouped[tool.category]) grouped[tool.category] = [];
        grouped[tool.category].push({
            name: tool.name,
            desc: tool.description,
            url: tool.url,
            pricing: tool.pricing,
            domain: tool.domain
        });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(grouped);
});

app.post("/api/orders", paymentLimiter, getAuthenticatedUser, async (req, res) => {
    if (await hasMembership(req.user.id)) {
        res.status(409).json({ error: "This account already has access." });
        return;
    }

    const receipt = `aio_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const order = await razorpay.orders.create({
        amount: amountPaise,
        currency,
        receipt,
        payment_capture: 1,
        notes: { user_id: req.user.id }
    });
    const { error } = await supabase.from("payment_orders").insert({
        order_id: order.id,
        user_id: req.user.id,
        amount: amountPaise,
        currency,
        status: "created"
    });
    if (error) throw error;

    res.status(201).json({ id: order.id, amount: amountPaise, currency });
});

app.post("/api/payments/verify", paymentLimiter, getAuthenticatedUser, async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (![orderId, paymentId, signature].every(value => typeof value === "string" && value.length > 0)) {
        res.status(400).json({ error: "Payment details are incomplete." });
        return;
    }

    const { data: order, error } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
    if (error) throw error;
    if (!order || order.user_id !== req.user.id) {
        res.status(404).json({ error: "Payment order was not found for this account." });
        return;
    }
    if (order.amount !== amountPaise || order.currency !== currency ||
        !isValidSignature(`${orderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET)) {
        res.status(400).json({ error: "Payment verification failed." });
        return;
    }

    let payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.amount !== amountPaise || payment.currency !== currency) {
        res.status(400).json({ error: "Payment does not match this order." });
        return;
    }
    if (payment.status === "authorized") {
        payment = await razorpay.payments.capture(paymentId, amountPaise, currency);
    }
    if (payment.status !== "captured") {
        res.status(409).json({ error: "Payment is not captured yet. Please wait and try again." });
        return;
    }

    await grantMembership(order, paymentId);
    res.json({ active: true });
});

app.get("/", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/index.html", (_req, res) => res.redirect(302, "/"));
app.get("/style.css", (_req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/site.js", (_req, res) => res.sendFile(path.join(__dirname, "site.js")));
app.get("/auth.js", (_req, res) => res.sendFile(path.join(__dirname, "auth.js")));
app.use((_req, res) => res.status(404).json({ error: "Not found." }));

app.use((error, _req, res, next) => {
    console.error("Request failed", error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Service is temporarily unavailable." });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
    console.log(`All In On AI server listening on port ${port}.`);
});
