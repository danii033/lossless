const msgEl    = document.getElementById("msg")
const loginBtn = document.getElementById("loginBtn")
 
// Your OAuth client ID
const CLIENT_ID = "582613352242-hdrf9s9ovggr1s71edgvkq5k425c76r0.apps.googleusercontent.com"
 
loginBtn.addEventListener("click", () => {
  msgEl.textContent = "Opening Google sign-in…"
  loginBtn.disabled = true
 
  // Build the Google OAuth URL manually.
  // "prompt=select_account" forces Google to always show the account picker,
  // regardless of which account is signed into Chrome.
  const redirectUrl = chrome.identity.getRedirectURL()
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id",     CLIENT_ID)
  authUrl.searchParams.set("response_type", "token")
  authUrl.searchParams.set("redirect_uri",  redirectUrl)
  authUrl.searchParams.set("scope",         "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile")
  authUrl.searchParams.set("prompt",        "select_account")
 
  // launchWebAuthFlow opens a proper Google sign-in window.
  // Unlike getAuthToken, it is not tied to the Chrome profile account,
  // so users can pick any Google account they want.
  chrome.identity.launchWebAuthFlow(
    { url: authUrl.toString(), interactive: true },
    async (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        msgEl.textContent = "Sign-in failed: " + (chrome.runtime.lastError?.message || "cancelled")
        loginBtn.disabled = false
        return
      }
 
      // Google returns the access token in the URL hash fragment
      // e.g. https://...#access_token=TOKEN&token_type=Bearer&...
      const params = new URLSearchParams(new URL(responseUrl).hash.slice(1))
      const token  = params.get("access_token")
 
      if (!token) {
        msgEl.textContent = "Sign-in failed: no token returned"
        loginBtn.disabled = false
        return
      }
 
      try {
        // Use the token to get the user's profile from Google
        const res  = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: "Bearer " + token } }
        )
        const info = await res.json()
 
        const payload = {
          uid:         info.sub,
          displayName: info.name  || "",
          email:       info.email || ""
        }
 
        await chrome.storage.local.set({ losslessUser: payload })
 
        msgEl.textContent      = `Logged in as ${payload.displayName}. You can close this tab.`
        loginBtn.style.display = "none"
 
      } catch (err) {
        msgEl.textContent = "Error: " + (err.message || "unknown")
        loginBtn.disabled = false
        console.error(err)
      }
    }
  )
})