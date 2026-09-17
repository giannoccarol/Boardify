//! Scorciatoie globali native su Wayland via XDG portal GlobalShortcuts.
//! Solo Linux+Wayland (KDE lo implementa; global-hotkey usa grab X11 che lì
//! non arrivano). Niente sudo/privilegi: il portale chiede approvazione una
//! volta sola, poi ricorda. Degrada con stato leggibile se assente.

use std::collections::HashMap;
use std::time::Duration;

use tauri::Manager;

/// Id D-Bus della nostra shortcut shelf (stabile tra sessioni: il backend
/// ricorda il binding e non ridialoga).
pub const SHELF_SHORTCUT_ID: &str = "boardify-shelf";

/// Mappa "Ctrl+Super+A" / "Alt+A" in trigger portal ("CTRL+SUPER+A", "ALT+A").
/// Pura e testabile; se il backend non gradisce, il dialogo permette comunque
/// la scelta manuale e lo stato mostra il trigger effettivo.
pub fn portal_trigger(shortcut: &str) -> String {
    shortcut
        .split('+')
        .map(|p| {
            let t = p.trim();
            match t.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => "CTRL".to_string(),
                "alt" => "ALT".to_string(),
                "shift" => "SHIFT".to_string(),
                "super" | "meta" | "win" | "cmd" | "command" => "SUPER".to_string(),
                _ => t.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn fail(app: &tauri::AppHandle, detail: String) {
    if let Ok(mut st) = app
        .state::<crate::AppState>()
        .shortcut_status
        .lock()
    {
        st.shelf_bound = false;
        st.detail = detail;
    }
}

fn bound(app: &tauri::AppHandle, detail: String) {
    if let Ok(mut st) = app
        .state::<crate::AppState>()
        .shortcut_status
        .lock()
    {
        st.shelf_bound = true;
        st.detail = detail;
    }
}

/// Risposta portal (response, results): 0 = ok.
async fn await_response(
    conn: &zbus::Connection,
    request: zbus::zvariant::OwnedObjectPath,
) -> Result<(u32, HashMap<String, zbus::zvariant::OwnedValue>), String> {
    use futures_util::StreamExt;
    let proxy = zbus::Proxy::new(
        conn,
        "org.freedesktop.portal.Desktop",
        request,
        "org.freedesktop.portal.Request",
    )
    .await
    .map_err(|e| format!("portal: {e}"))?;
    let mut stream = proxy
        .receive_signal("Response")
        .await
        .map_err(|e| format!("portal: {e}"))?;
    let msg = stream
        .next()
        .await
        .ok_or_else(|| "portal: nessuna risposta".to_string())?;
    msg.body()
        .deserialize::<(u32, HashMap<String, zbus::zvariant::OwnedValue>)>()
        .map_err(|e| format!("portal: {e}"))
}

async fn run_once(app: tauri::AppHandle, generation: u64) -> Result<(), String> {
    let alive = || {
        crate::portal_generation()
            .load(std::sync::atomic::Ordering::SeqCst)
            == generation
    };
    let conn = tokio::time::timeout(Duration::from_secs(8), zbus::Connection::session())
        .await
        .map_err(|_| "portal: bus non raggiungibile".to_string())?
        .map_err(|e| format!("portal: {e}"))?;
    let proxy = zbus::Proxy::new(
        &conn,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.GlobalShortcuts",
    )
    .await
    .map_err(|e| format!("portal assente ({e}): usa click tray o scorciatoia di sistema su lancio app"))?;

    // Il backend ricorda i binding per app: sessione fresca a ogni avvio, dialogo solo la prima volta.
    let token = || uuid::Uuid::new_v4().simple().to_string();
    let mut opts = HashMap::new();
    opts.insert(
        "handle_token",
        zbus::zvariant::Value::from(token()),
    );
    opts.insert(
        "session_handle_token",
        zbus::zvariant::Value::from(token()),
    );
    let req: zbus::zvariant::OwnedObjectPath = tokio::time::timeout(
        Duration::from_secs(10),
        proxy.call("CreateSession", &(opts,)),
    )
    .await
    .map_err(|_| "portal: CreateSession senza risposta".to_string())?
    .map_err(|e| format!("portal: {e}"))?;
    let (code, results) = await_response(&conn, req).await?;
    if code != 0 {
        return Err(format!("portal: sessione rifiutata ({code})"));
    }
    let session: String = results
        .get("session_handle")
        .and_then(|v| String::try_from(v.clone()).ok())
        .ok_or_else(|| "portal: sessione senza handle".to_string())?;
    if !alive() {
        return Ok(());
    }

    let shelf = app
        .state::<crate::AppState>()
        .watch
        .lock()
        .map(|w| w.shelf_shortcut.clone())
        .unwrap_or_default();
    let mut info = HashMap::new();
    info.insert(
        "description",
        zbus::zvariant::Value::from("Apri/chiudi Boardify Shelf"),
    );
    info.insert(
        "preferred_trigger",
        zbus::zvariant::Value::from(portal_trigger(&shelf)),
    );
    let req: zbus::zvariant::OwnedObjectPath = proxy
        .call(
            "BindShortcuts",
            &(
                zbus::zvariant::ObjectPath::try_from(session.clone())
                    .map_err(|e| format!("portal: {e}"))?,
                vec![(SHELF_SHORTCUT_ID.to_string(), info)],
                "",
                HashMap::<&str, zbus::zvariant::Value>::new(),
            ),
        )
        .await
        .map_err(|e| format!("portal: {e}"))?;
    // Il dialogo di approvazione richiede l'utente: timeout lungo, poi stato chiaro.
    let (code, results) = tokio::time::timeout(Duration::from_secs(180), await_response(&conn, req))
        .await
        .map_err(|_| "portal: approvazione scaduta, riapri l'app per riprovare".to_string())??;
    if code != 0 {
        return Err("portal: binding rifiutato, usa click tray o scorciatoia di sistema".to_string());
    }
    // Trigger effettivo (l'utente può averlo cambiato nel dialogo).
    let mut detail = format!("portal: {}", portal_trigger(&shelf));
    if let Some(descs) = results.get("shortcuts").and_then(|v| {
        <Vec<(String, HashMap<String, zbus::zvariant::OwnedValue>)>>::try_from(v.clone()).ok()
    }) {
        for (id, map) in descs {
            if id == SHELF_SHORTCUT_ID {
                if let Some(t) = map
                    .get("trigger_description")
                    .and_then(|v| String::try_from(v.clone()).ok())
                {
                    detail = format!("portal: {t}");
                }
            }
        }
    }
    bound(&app, detail.clone());

    use futures_util::StreamExt;
    let mut stream = proxy
        .receive_signal("Activated")
        .await
        .map_err(|e| format!("portal: {e}"))?;
    while let Some(msg) = stream.next().await {
        if !alive() {
            return Ok(());
        }
        let Ok((sh, id, _ts, _o)) = msg
            .body()
            .deserialize::<(
                zbus::zvariant::OwnedObjectPath,
                String,
                u64,
                HashMap<String, zbus::zvariant::OwnedValue>,
            )>() else {
            continue;
        };
        if sh.to_string() == session && id == SHELF_SHORTCUT_ID {
            let state = app.state::<crate::AppState>();
            let go = state
                .watch
                .lock()
                .map(|w| w.shortcuts_enabled && w.notch_enabled)
                .unwrap_or(false);
            if go {
                crate::toggle_window(&app, "shelf");
            }
        }
    }
    Ok(())
}

/// Avvia (o riavvia con nuova generazione) il loop portal. Idempotente.
pub fn spawn_portal_loop(app: tauri::AppHandle) {
    let generation = crate::portal_generation().fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    if let Ok(mut st) = app.state::<crate::AppState>().shortcut_status.lock() {
        st.backend = "portal".to_string();
        st.shelf_bound = false;
        st.detail = "portal: connessione…".to_string();
    }
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_once(app.clone(), generation).await {
            // Solo l'ultima generazione scrive lo stato finale.
            if crate::portal_generation().load(std::sync::atomic::Ordering::SeqCst) == generation {
                fail(&app, e);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trigger_mapping_covers_modifiers_and_keeps_keys() {
        assert_eq!(portal_trigger("Ctrl+Super+A"), "CTRL+SUPER+A");
        assert_eq!(portal_trigger("Alt+A"), "ALT+A");
        assert_eq!(portal_trigger("Ctrl+Shift+L"), "CTRL+SHIFT+L");
        assert_eq!(portal_trigger("ctrl+meta+Return"), "CTRL+SUPER+Return");
        assert_eq!(portal_trigger("  Alt + F2 "), "ALT+F2");
    }
}
