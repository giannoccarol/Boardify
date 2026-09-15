//! Cattura schermo su Windows (GDI, solo monitor primario).
//! Niente dipendenze extra: `BitBlt` dallo screen DC in un buffer RGBA.

use std::path::PathBuf;

/// Cattura il monitor primario in PNG e restituisce il percorso salvato.
#[cfg(target_os = "windows")]
pub fn capture_primary() -> Result<PathBuf, String> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let w = GetSystemMetrics(SM_CXSCREEN);
        let h = GetSystemMetrics(SM_CYSCREEN);
        if w <= 0 || h <= 0 {
            return Err("dimensioni schermo non valide".into());
        }
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("contesto schermo non disponibile".into());
        }
        let mem = CreateCompatibleDC(Some(screen));
        if mem.is_invalid() {
            ReleaseDC(None, screen);
            return Err("contesto memoria non disponibile".into());
        }
        let out = (|| {
            let bmp = CreateCompatibleBitmap(screen, w, h);
            if bmp.is_invalid() {
                return None;
            }
            let old = SelectObject(mem, bmp.into());
            BitBlt(mem, 0, 0, w, h, Some(screen), 0, 0, SRCCOPY).ok()?;
            let n = (w as usize) * (h as usize) * 4;
            let mut bgra = vec![0u8; n];
            let mut info = BITMAPINFO::default();
            info.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
            info.bmiHeader.biWidth = w;
            info.bmiHeader.biHeight = -h; // top-down
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB.0;
            let lines = GetDIBits(
                mem,
                bmp,
                0,
                h as u32,
                Some(bgra.as_mut_ptr() as *mut core::ffi::c_void),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(mem, old);
            let _ = DeleteObject(bmp.into());
            if lines == 0 {
                return None;
            }
            for px in bgra.chunks_exact_mut(4) {
                px.swap(0, 2); // BGRA → RGBA
            }
            let img = image::RgbaImage::from_raw(w as u32, h as u32, bgra)?;
            let path = crate::db::images_dir().join("screen-ocr.png");
            std::fs::create_dir_all(path.parent()?).ok()?;
            img.save(&path).ok()?;
            Some(path)
        })();
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        out.ok_or_else(|| "cattura schermo fallita".to_string())
    }
}
