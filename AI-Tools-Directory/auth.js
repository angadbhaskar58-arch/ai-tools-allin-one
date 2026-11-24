const authGate = document.getElementById("authGate");
const memberSite = document.getElementById("memberSite");
const authTabs = document.querySelector(".auth-tabs");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");
const paymentMessage = document.getElementById("paymentMessage");
const membershipPanel = document.getElementById("membershipPanel");
const accountPanel = document.getElementById("accountPanel");
const accountEmail = document.getElementById("accountEmail");
const googleSignIn = document.getElementById("googleSignIn");
const forgotPassword = document.getElementById("forgotPassword");
const checkoutButton = document.getElementById("checkoutButton");
const logoutButton = document.getElementById("logoutButton");
const memberLogout = document.getElementById("memberLogout");

let supabase;
let mode = "login";
let currentSession;
let config;

function setMessage(element, message, type) {
    element.textContent = message;
    element.classList.toggle("error", type === "error");
    element.classList.toggle("success", type === "success");
}

function setMode(nextMode) {
    mode = nextMode;
    const signingUp = mode === "signup";
    document.getElementById("loginTab").classList.toggle("active", !signingUp);
    document.getElementById("signupTab").classList.toggle("active", signingUp);
    document.getElementById("loginTab").setAttribute("aria-selected", String(!signingUp));
    document.getElementById("signupTab").setAttribute("aria-selected", String(signingUp));
    authTitle.textContent = signingUp ? "Create your account" : "Welcome back";
    authSubtitle.textContent = signingUp
        ? "Create an account to continue to All In On AI."
        : "Log in to continue to All In On AI.";
    authSubmit.textContent = signingUp ? "Create account" : "Log in";
    authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    setMessage(authMessage, "", "");
}

function setBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.textContent = label;
}

async function requestApi(path, token, options) {
    const headers = new Headers(options && options.headers ? options.headers : {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options && options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...options, headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Request failed. Please try again.");
    }
    return payload;
}

function showPaywall(session) {
    currentSession = session;
    authGate.hidden = false;
    memberSite.hidden = true;
    authTabs.hidden = true;
    authForm.hidden = true;
    googleSignIn.hidden = true;
    forgotPassword.hidden = true;
    membershipPanel.hidden = false;
    accountPanel.hidden = false;
    authTitle.textContent = "You’re almost in";
    authSubtitle.textContent = "Complete your one-time membership payment to unlock the directory.";
    accountEmail.textContent = session.user.email || "Signed in";
    setMessage(authMessage, "", "");
}

async function showMemberSite(session) {
    currentSession = session;
    const token = session.access_token;
    const { active } = await requestApi("/api/access", token);
    if (!active) {
        showPaywall(session);
        return;
    }
    const tools = await requestApi("/api/tools", token);
    window.loadMemberTools(tools);
    authGate.hidden = true;
    memberSite.hidden = false;
    memberLogout.hidden = false;
}

async function handleSession(session) {
    currentSession = session;
    if (!session) {
        authGate.hidden = false;
        memberSite.hidden = true;
        authTabs.hidden = false;
        authForm.hidden = false;
        googleSignIn.hidden = false;
        forgotPassword.hidden = false;
        membershipPanel.hidden = true;
        accountPanel.hidden = true;
        if (memberLogout) memberLogout.hidden = true;
        setMode("login");
        return;
    }
    try {
        await showMemberSite(session);
    } catch (error) {
        authGate.hidden = false;
        memberSite.hidden = true;
        memberLogout.hidden = true;
        setMessage(authMessage, error.message, "error");
    }
}

async function loadRazorpayCheckout() {
    if (window.Razorpay) return;
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
        document.head.appendChild(script);
    });
}

async function startCheckout() {
    if (!currentSession) return;
    setBusy(checkoutButton, true, "Preparing secure checkout…");
    setMessage(paymentMessage, "", "");
    try {
        await loadRazorpayCheckout();
        const order = await requestApi("/api/orders", currentSession.access_token, {
            method: "POST",
            body: JSON.stringify({})
        });
        const checkout = new window.Razorpay({
            key: config.razorpayKeyId,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            name: "All In On AI",
            description: "One-time directory membership",
            prefill: { email: currentSession.user.email },
            theme: { color: "#635bff" },
            handler: async (payment) => {
                setBusy(checkoutButton, true, "Verifying payment…");
                try {
                    await requestApi("/api/payments/verify", currentSession.access_token, {
                        method: "POST",
                        body: JSON.stringify(payment)
                    });
                    await showMemberSite(currentSession);
                } catch (error) {
                    setMessage(paymentMessage, error.message, "error");
                    setBusy(checkoutButton, false, "Pay ₹299 securely");
                }
            },
            modal: {
                ondismiss: () => setBusy(checkoutButton, false, "Pay ₹299 securely")
            }
        });
        checkout.open();
    } catch (error) {
        setMessage(paymentMessage, error.message, "error");
        setBusy(checkoutButton, false, "Pay ₹299 securely");
    }
}

async function initialize() {
    try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok) throw new Error("Login and payment services are not configured yet.");
        config = await response.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey || !config.razorpayKeyId) {
            throw new Error("Login and payment services are not configured yet.");
        }
        const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
        supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

        document.getElementById("loginTab").addEventListener("click", () => setMode("login"));
        document.getElementById("signupTab").addEventListener("click", () => setMode("signup"));

        authForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            setBusy(authSubmit, true, mode === "signup" ? "Creating account…" : "Logging in…");
            setMessage(authMessage, "", "");
            try {
                const credentials = { email: authEmail.value.trim(), password: authPassword.value };
                const result = mode === "signup"
                    ? await supabase.auth.signUp({
                        ...credentials,
                        options: { emailRedirectTo: window.location.origin }
                    })
                    : await supabase.auth.signInWithPassword(credentials);
                if (result.error) {
                    setMessage(authMessage, result.error.message, "error");
                    return;
                }
                if (mode === "signup" && !result.data.session) {
                    setMessage(authMessage, "Check your email to confirm your account, then log in.", "success");
                    return;
                }
                await handleSession(result.data.session);
            } catch (error) {
                setMessage(authMessage, error.message, "error");
            } finally {
                setBusy(authSubmit, false, mode === "signup" ? "Create account" : "Log in");
            }
        });

        googleSignIn.addEventListener("click", async () => {
            setBusy(googleSignIn, true);
            try {
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: window.location.origin }
                });
                if (error) throw error;
            } catch (error) {
                setMessage(authMessage, error.message, "error");
                setBusy(googleSignIn, false);
            }
        });

        forgotPassword.addEventListener("click", async () => {
            const email = authEmail.value.trim();
            if (!email) {
                setMessage(authMessage, "Enter your email address first.", "error");
                authEmail.focus();
                return;
            }
            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin
                });
                setMessage(authMessage, error ? error.message : "Password reset instructions sent.", error ? "error" : "success");
            } catch (error) {
                setMessage(authMessage, error.message, "error");
            }
        });

        checkoutButton.addEventListener("click", startCheckout);
        const signOut = async () => {
            const { error } = await supabase.auth.signOut();
            if (error) setMessage(authMessage, error.message, "error");
        };
        logoutButton.addEventListener("click", signOut);
        memberLogout.addEventListener("click", signOut);
        supabase.auth.onAuthStateChange((_event, session) => {
            void handleSession(session);
        });
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        await handleSession(data.session);
    } catch (error) {
        setMessage(authMessage, error.message, "error");
        authSubmit.disabled = true;
        googleSignIn.disabled = true;
        checkoutButton.disabled = true;
    }
}

document.getElementById("memberLogout").hidden = true;
setMode("login");
void initialize();
