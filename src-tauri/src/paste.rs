//! Auto-paste opt-in (deroga AGENTS.md): Ctrl+V sintetico dopo un copy riuscito.
//! Default OFF ovunque. Su Wayland senza portal/libei niente iniezione:
//! il chiamante mostra fallback copy+toast. Niente sudo, niente privilegi.

use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};

/// Messaggio di fallback quando l'iniezione non è disponibile.
/// Pura così è testabile senza display (la pressione vera richiede un server grafico).
pub fn unavailable_reason(is_wayland: bool) -> Option<&'static str> {
    if is_wayland {
        Some("Auto-paste non supportato su Wayland: premi Ctrl+V")
    } else {
        None
    }
}

pub fn paste_ctrl_v() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if crate::is_wayland_session() {
        return Err(unavailable_reason(true).unwrap_or("non supportato").into());
    }
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Control, Press).map_err(|e| e.to_string())?;
    let press = enigo.key(Key::Unicode('v'), Click).map_err(|e| e.to_string());
    let _ = enigo.key(Key::Control, Release);
    press.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wayland_reports_fallback_while_x11_and_windows_allow_paste() {
        assert_eq!(
            unavailable_reason(true),
            Some("Auto-paste non supportato su Wayland: premi Ctrl+V")
        );
        assert_eq!(unavailable_reason(false), None);
    }
}
