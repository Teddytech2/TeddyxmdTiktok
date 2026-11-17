const $ = (id) => document.getElementById(id);
let mode = "login";
let currentUser = null;

function showToast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}
function setMode(next) {
  mode = next;
  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("authTitle").textContent = mode === "login" ? "Sign in" : "Create your account";
  $("authSubtitle").textContent = mode === "login" ? "Access your automation workspace." : "Set up your private TEDDY-XMD workspace.";
  $("authSubmit").innerHTML = mode === "login" ? 'Sign in <span>↗</span>' : 'Create account <span>↗</span>';
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("authMessage").textContent = "";
}
$("loginTab").onclick = () => setMode("login");
$("registerTab").onclick = () => setMode("register");

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function showDashboard(data) {
  currentUser = data.user;
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("userEmail").textContent = data.user.email; $("userRole").textContent = data.user.role.toUpperCase();
  const p = data.user.preferences || {};
  [["autoStoryView","storyViewState"],["autoStoryReact","storyReactState"],["autoLike","autoLikeState"]].forEach(([key,state]) => {
    const input = document.querySelector(`[data-pref="${key}"]`);
    input.checked = Boolean(p[key]); input.disabled = false;
    $(state).textContent = p[key] ? "Saved · not running" : "Off";
  });
  const connected = data.accounts && data.accounts.some(a => a.status === "connected");
  $("accountStatus").textContent = connected ? "Connected" : "Not connected";
  $("connectText").textContent = data.integration.tiktokOAuthConfigured
    ? "Developer credentials detected. The approved OAuth connection flow still needs to be enabled."
    : "TikTok Login Kit is not configured yet. You can prepare your workspace while developer access is pending.";
  $("connectBtn").textContent = "Connection setup ↗";
}
document.querySelectorAll("[data-pref]").forEach((input) => {
  input.addEventListener("change", async () => {
    const key = input.dataset.pref;
    const desired = input.checked;
    input.disabled = true;
    try {
      const result = await api("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: desired })
      });
      const stateId = key === "autoStoryView" ? "storyViewState" : key === "autoStoryReact" ? "storyReactState" : "autoLikeState";
      $(stateId).textContent = result.preferences[key] ? "Saved · not running" : "Off";
      showToast("Preference saved. This does not perform TikTok actions.");
    } catch (error) {
      input.checked = !desired;
      showToast(error.message);
    } finally {
      input.disabled = false;
    }
  });
});

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("authSubmit"); button.disabled = true; $("authMessage").textContent = "";
  try {
    const data = await api(`/api/auth/${mode === "login" ? "login" : "register"}`, { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
    const me = await api("/api/me"); showDashboard(me);
  } catch (error) { $("authMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("logoutBtn").onclick = async () => {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
  $("appView").classList.add("hidden"); $("authView").classList.remove("hidden"); $("password").value = ""; setMode("login");
};
$("connectBtn").onclick = () => showToast("This build has no supported TikTok Story connection. No password or session-cookie workaround is used.");
$("accountsNav").onclick = () => { $("accountSection").scrollIntoView({ behavior: "smooth" }); showToast("TikTok Story monitoring is not exposed by the official developer API."); };

(async function init() {
  try { const data = await api("/api/me"); showDashboard(data); }
  catch (_) { $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); }
})();