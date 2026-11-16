
const $ = id => document.getElementById(id);

async function submitForm(formId, endpoint) {
  $(formId).addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data = Object.fromEntries(form.entries());
    $("message").textContent = "Please wait...";

    try {
      const r = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data)
      });

      const result = await r.json();
      $("message").textContent = result.message || result.error;

      if (r.ok) location.href = "/";
    } catch {
      $("message").textContent = "Connection failed. Try again.";
    }
  });
}

if ($("signupForm")) submitForm("signupForm", "signup");
if ($("loginForm")) submitForm("loginForm", "login");
