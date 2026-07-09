//! Native "X Live" viewer for the desktop build.
//!
//! Opens x.com in a native webview window using the user's own logged-in X
//! session — free, no API key, no Nitter, no syndication rate limit (it's just
//! the real website). One reusable window navigates between handles; sign in
//! once and every handle inherits the session.
//!
//! Uses only stable Tauri APIs (WebviewWindowBuilder + eval), mirroring the
//! existing open_youtube_login_window pattern.

use reqwest::Url;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const X_LIVE_LABEL: &str = "x-live";

// Light chrome-strip so the window shows the timeline column, not X's full nav.
const X_STRIP_JS: &str = r#"
(function () {
  function inject() {
    if (document.getElementById('xlive-strip') || !document.head) return false;
    var s = document.createElement('style');
    s.id = 'xlive-strip';
    s.textContent =
      '[data-testid="sidebarColumn"]{display:none!important}' +
      '[data-testid="primaryColumn"]{width:100%!important;max-width:100%!important}';
    document.head.appendChild(s);
    return true;
  }
  if (!inject()) {
    document.addEventListener('DOMContentLoaded', inject);
    try { new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }
})();
"#;

/// Validate a handle and build its x.com URL (relative only — never arbitrary).
fn handle_url(handle: &str) -> Result<Url, String> {
    let h = handle.trim().trim_start_matches('@').trim_start_matches('/');
    if h.is_empty() || h.len() > 40 || !h.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Invalid X handle".into());
    }
    Url::parse(&format!("https://x.com/{h}")).map_err(|e| e.to_string())
}

fn open_or_navigate(app: &AppHandle, url: Url, title: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(X_LIVE_LABEL) {
        // {:?} renders the &str as a quoted, escaped JS string literal.
        win.eval(&format!("location.assign({:?})", url.as_str()))
            .map_err(|e| format!("navigate failed: {e}"))?;
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(app, X_LIVE_LABEL, WebviewUrl::External(url))
        .title(title)
        .inner_size(500.0, 820.0)
        .min_inner_size(380.0, 520.0)
        .resizable(true)
        .initialization_script(X_STRIP_JS)
        .build()
        .map_err(|e| format!("Failed to create X window: {e}"))?;

    #[cfg(not(target_os = "macos"))]
    let _ = win.remove_menu();
    Ok(())
}

/// Open (or navigate the existing) X Live window to a specific handle.
#[tauri::command]
pub fn x_open_handle(app: AppHandle, handle: String) -> Result<(), String> {
    let url = handle_url(&handle)?;
    let clean = handle.trim().trim_start_matches('@');
    open_or_navigate(&app, url, &format!("@{clean} — X Live"))
}

/// Open the X sign-in page in the same window; the session then persists for
/// every handle opened afterwards.
#[tauri::command]
pub fn x_sign_in(app: AppHandle) -> Result<(), String> {
    let url = Url::parse("https://x.com/login").map_err(|e| e.to_string())?;
    open_or_navigate(&app, url, "Sign in to X")
}

#[cfg(test)]
mod tests {
    use super::handle_url;

    #[test]
    fn valid_handles_resolve() {
        assert_eq!(handle_url("mybmc").unwrap().as_str(), "https://x.com/mybmc");
        assert_eq!(handle_url("@NammaBESCOM").unwrap().as_str(), "https://x.com/NammaBESCOM");
    }

    #[test]
    fn invalid_handles_rejected() {
        assert!(handle_url("").is_err());
        assert!(handle_url("evil.com/path").is_err());
        assert!(handle_url("a/b").is_err());
        assert!(handle_url("has space").is_err());
    }
}
