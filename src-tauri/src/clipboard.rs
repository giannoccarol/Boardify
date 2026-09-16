//! Prepare a clip for copying without silently replacing an image with text.
use crate::{db::ClipRow, watcher::Snapshot};
use arboard::ImageData;

pub fn content(clip: &ClipRow) -> Result<Snapshot, String> {
    if let Some(json) = &clip.file_paths_json {
        let strs: Vec<String> = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let paths: Vec<std::path::PathBuf> = strs
            .into_iter()
            .filter(|s| std::path::Path::new(s).exists())
            .map(std::path::PathBuf::from)
            .collect();
        if paths.is_empty() {
            return Err("File non più disponibili".into());
        }
        return Ok(Snapshot::Files(paths));
    }
    if let Some(path) = &clip.image_path {
        let rgba = image::open(path)
            .map_err(|e| format!("Immagine non leggibile: {e}"))?
            .to_rgba8();
        return Ok(Snapshot::Image(ImageData {
            width: rgba.width() as usize,
            height: rgba.height() as usize,
            bytes: rgba.into_raw().into(),
        }));
    }
    let text = clip.text.as_ref().ok_or("Contenuto non disponibile")?;
    // Raster data URLs captured as text are also valid image clips.
    if clip.kind == "image" && text.trim().starts_with("data:image/") {
        let (header, data) = text.trim().split_once(',').ok_or("Immagine non valida")?;
        if header.ends_with(";base64") {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|e| e.to_string())?;
            let rgba = image::load_from_memory(&bytes)
                .map_err(|e| e.to_string())?
                .to_rgba8();
            return Ok(Snapshot::Image(ImageData {
                width: rgba.width() as usize,
                height: rgba.height() as usize,
                bytes: rgba.into_raw().into(),
            }));
        }
    }
    Ok(Snapshot::Text(text.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    #[test]
    fn missing_image_returns_error_instead_of_copying_placeholder_text() {
        let db = Db::in_memory().unwrap();
        let path = std::env::temp_dir().join(format!("missing-{}.png", uuid::Uuid::new_v4()));
        let (row, _) = db
            .insert_text(
                "image",
                "[Immagine 64x64]",
                "firefox",
                "",
                "missing",
                false,
                None,
                path.to_str(),
            )
            .unwrap();
        assert!(content(&row).is_err());
    }
    #[test]
    fn saved_image_round_trip_preserves_pixels() {        let db = Db::in_memory().unwrap();
        let path =
            std::env::temp_dir().join(format!("boardify-copy-test-{}.png", uuid::Uuid::new_v4()));
        let rgba = image::RgbaImage::from_raw(2, 1, vec![255, 0, 0, 40, 0, 128, 255, 255]).unwrap();
        rgba.save(&path).unwrap();
        let (row, _) = db
            .insert_text(
                "image",
                "[Immagine 2x1]",
                "firefox",
                "",
                "image",
                false,
                None,
                path.to_str(),
            )
            .unwrap();
        let Snapshot::Image(copy) = content(&row).unwrap() else {
            panic!("must copy pixels")
        };
        assert_eq!((copy.width, copy.height), (2, 1));
        assert_eq!(&*copy.bytes, rgba.as_raw());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn files_round_trip_through_content() {
        let db = Db::in_memory().unwrap();
        let dir = std::env::temp_dir().join(format!("boardify-content-files-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("doc.txt");
        std::fs::write(&a, b"doc").unwrap();
        let json = serde_json::to_string(&vec![a.to_string_lossy().to_string()]).unwrap();
        let (row, _) = db
            .insert_files("doc.txt", &json, "cafef00d12345678", "nautilus", "")
            .unwrap();
        assert_eq!(row.kind, "file");
        let Snapshot::Files(paths) = content(&row).unwrap() else {
            panic!("must copy files")
        };
        assert_eq!(paths, vec![a]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn missing_files_return_error_instead_of_copying_text() {
        let db = Db::in_memory().unwrap();
        let json = serde_json::to_string(&vec![format!(
            "/nonexistent-boardify-{}.txt",
            uuid::Uuid::new_v4()
        )])
        .unwrap();
        let (row, _) = db
            .insert_files("sparito.txt", &json, "bead1234bead1234", "explorer", "")
            .unwrap();
        assert!(content(&row).is_err());
    }
}
