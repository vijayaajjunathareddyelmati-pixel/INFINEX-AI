
// ------------------------------
// INFINEX AI - Account management
// ------------------------------

const API = "/api";

// Get an HTML element by its ID.
function getElement(id) {
    return document.getElementById(id);
}

// Display a message.
function showMessage(message, color = "#38bdf8") {
    const messageBox = getElement("message");

    if (messageBox) {
        messageBox.textContent = message;
        messageBox.style.color = color;
    }
}

// ------------------------------
// CREATE ACCOUNT
// ------------------------------

const signupForm = getElement("signupForm");

if (signupForm) {

    signupForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = getElement("name").value.trim();
        const email = getElement("email").value.trim();
        const password = getElement("password").value;

        if (!name || !email || !password) {
            showMessage("Please fill in all fields.", "#ef4444");
            return;
        }

        showMessage("Creating your account...");

        try {

            const response = await fetch(API + "/auth/signup", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                showMessage(
                    data.error || "Could not create your account.",
                    "#ef4444"
                );
                return;
            }

            showMessage("Account created successfully! Redirecting...");

            setTimeout(function () {
                window.location.href = "index.html";
            }, 1000);

        } catch (error) {

            console.error("Signup error:", error);

            showMessage(
                "Server connection failed. Please try again.",
                "#ef4444"
            );
        }

    });

}

// ------------------------------
// LOGIN
// ------------------------------

const loginForm = getElement("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = getElement("email").value.trim();
        const password = getElement("password").value;

        if (!email || !password) {
            showMessage("Please enter your email and password.", "#ef4444");
            return;
        }

        showMessage("Logging in...");

        try {

            const response = await fetch(API + "/auth/login", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                showMessage(
                    data.error || "Invalid email or password.",
                    "#ef4444"
                );
                return;
            }

            showMessage("Login successful! Redirecting...");

            setTimeout(function () {
                window.location.href = "index.html";
            }, 800);

        } catch (error) {

            console.error("Login error:", error);

            showMessage(
                "Server connection failed. Please try again.",
                "#ef4444"
            );
        }

    });

}
