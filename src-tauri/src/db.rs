//! SQLite locale: clips + FTS5 + categorie. Nessun cloud.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRow {
    pub id: String,
    pub kind: String,
    pub text: Option<String>,
    pub image_path: Option<String>,
    pub color_hex: Option<String>,
    pub file_paths_json: Option<String>,
    pub source_app: String,
    pub window_title: String,
    pub hash: String,
    pub is_favorite: bool,
    pub is_sensitive: bool,
    pub ocr_text: Option<String>,
    pub copy_count: i64,
    pub categories_json: Option<String>,
    pub created_at: String,
    pub is_pinned: bool,
    pub inline_shortcut: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Space {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub query_json: String,
    pub is_smart: bool,
    pub count: i64,
}

/// Riga di backup JSON v1: stabile tra versioni, `v` per future migrazioni.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipBackup {
    pub v: u32,
    pub kind: String,
    pub text: Option<String>,
    pub color_hex: Option<String>,
    pub image_path: Option<String>,
    pub file_paths_json: Option<String>,
    pub source_app: String,
    pub window_title: String,
    pub hash: String,
    pub is_sensitive: bool,
    pub copy_count: i64,
    pub created_at: String,
}

fn io_err(e: std::io::Error) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
        Some(e.to_string()),
    )
}

fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SmartQuery {    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    search: Option<String>,
    #[serde(default)]
    favorites_only: Option<bool>,
}

pub struct Db {
    conn: Connection,
}

fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let d = base.join("boardify");
    std::fs::create_dir_all(d.join("images")).ok();
    d
}
pub fn images_dir() -> PathBuf {
    data_dir().join("images")
}

/// Chiave SQLCipher (32 byte hex): OS credential store, fallback file 0600.
/// Windows-compat: solo std::fs + keyring (Secret Service / Credential Manager).
fn db_key_hex() -> String {
    const SERVICE: &str = "boardify";
    const USER: &str = "db-key";
    if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
        if let Ok(k) = entry.get_password() {
            let k = k.trim().to_string();
            if k.len() >= 32 && k.chars().all(|c| c.is_ascii_hexdigit()) {
                return k;
            }
        }
        // Genera 32 byte via sha256(uuid1+uuid2) — uuid usa getrandom cross-platform.
        use sha2::{Digest, Sha256};
        let raw = format!("{}{}{}", Uuid::new_v4(), Uuid::new_v4(), Utc::now().to_rfc3339());
        let mut h = Sha256::new();
        h.update(raw.as_bytes());
        let hex = format!("{:x}", h.finalize());
        if entry.set_password(&hex).is_ok() {
            return hex;
        }
    }
    // Fallback: file data_dir/db.key (creato una volta, niente log della chiave).
    let kf = data_dir().join("db.key");
    if let Ok(s) = std::fs::read_to_string(&kf) {
        let s = s.trim().to_string();
        if s.len() >= 32 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            return s;
        }
    }
    use sha2::{Digest, Sha256};
    let raw = format!("{}{}{}", Uuid::new_v4(), Uuid::new_v4(), Utc::now().to_rfc3339());
    let mut h = Sha256::new();
    h.update(raw.as_bytes());
    let hex = format!("{:x}", h.finalize());
    let _ = std::fs::write(&kf, &hex);
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&kf, std::fs::Permissions::from_mode(0o600));
    }
    hex
}

fn apply_key(conn: &Connection, hex: &str) -> SqlResult<()> {
    // Hex-only interpolato: niente injection possibile (validato in db_key_hex).
    debug_assert!(hex.len() >= 32 && hex.chars().all(|c| c.is_ascii_hexdigit()));
    conn.execute_batch(&format!("PRAGMA key = \"x'{hex}'\";"))?;
    // Migrazione versioni SQLCipher vecchie; su DB plain fallisce e il chiamante gestisce.
    let _ = conn.execute_batch("PRAGMA cipher_migrate;");
    Ok(())
}

fn probe(conn: &Connection) -> SqlResult<()> {
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })?;
    Ok(())
}

/// Apre senza chiave e in sola lettura: true solo se è un DB plain leggibile.
fn is_plain_db(path: &std::path::Path) -> bool {
    let Ok(conn) = Connection::open(path) else { return false };
    let _ = conn.execute_batch("PRAGMA query_only = ON;");
    probe(&conn).is_ok()
}

fn sidecar(path: &std::path::Path, ext: &str) -> std::path::PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(ext);
    std::path::PathBuf::from(s)
}

impl Db {
    #[cfg(test)]
    pub fn in_memory() -> SqlResult<Self> {
        let db = Self { conn: Connection::open_in_memory()? };
        db.migrate()?;
        Ok(db)
    }

    pub fn open() -> SqlResult<Self> {
        // Chiave risolta UNA volta per avvio: riusarla ovunque evita di cifrare
        // con una chiave e riaprire con un'altra (DB illeggibile al 2° avvio).
        let hex = db_key_hex();
        Self::open_at(&data_dir().join("clips.db"), Some(hex.as_str()))
    }

    /// `key=None` = DB plain (solo test + check pre-migrazione). Mai in produzione.
    fn open_at(path: &std::path::Path, key: Option<&str>) -> SqlResult<Self> {
        let fresh = !path.exists();
        let conn = Connection::open(path)?;
        if let Some(hex) = key {
            apply_key(&conn, hex)?;
        }
        // Se il file era plain (pre-SQLCipher), la prima query fallisce con
        // "file is not a database": backup + export cifrato, poi riapri.
        let conn = match probe(&conn) {
            Ok(_) => conn,
            Err(_) if !fresh && key.is_some() => {
                drop(conn);
                Self::migrate_plain_to_encrypted(path, key.unwrap_or(""))?
            }
            Err(e) => return Err(e),
        };
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Migra un DB plain a cifrato. Rifiuta tutto ciò che non è plain leggebile
    /// così un file già cifrato/corroto non viene mai sovrascritto (niente spirale).
    fn migrate_plain_to_encrypted(path: &std::path::Path, hex: &str) -> SqlResult<Connection> {
        if !is_plain_db(path) {
            let bak = path.with_extension("db.plain.bak");
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTADB),
                Some(format!(
                    "DB illeggibile (né cifrato valido né plain). Backup intatto: {}",
                    bak.display()
                )),
            ));
        }
        let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let bak = parent.join("clips.db.plain.bak");
        if !bak.exists() {
            std::fs::copy(path, &bak).map_err(io_err)?;
        }
        Self::encrypt_plain_file(path, hex)?;
        // Sidecar del vecchio plain (wal/shm/journal): orfani e velenosi per il
        // file cifrato, vanno rimossi dopo la rename.
        for ext in ["-wal", "-shm", "-journal"] {
            let _ = std::fs::remove_file(sidecar(path, ext));
        }
        let conn = Connection::open(path)?;
        apply_key(&conn, hex)?;
        probe(&conn).map_err(|_| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTADB),
                Some(format!(
                    "Migrazione fallita, originale intatto in: {}. Ripristinalo e riprova.",
                    bak.display()
                )),
            )
        })?;
        Ok(conn)
    }

    /// Cifra un DB plain esistente: ATTACH + sqlcipher_export (documentato SQLCipher).
    fn encrypt_plain_file(path: &std::path::Path, hex: &str) -> SqlResult<()> {
        let tmp = path.with_extension("encrypted.tmp");
        let _ = std::fs::remove_file(&tmp);
        // WAL orfano e corrotto (crash): riprova senza, single-instance esclude
        // scrittori concorrenti quindi niente dati altrui da perdere.
        let mut plain = Connection::open(path);
        if plain.is_err() {
            for ext in ["-wal", "-shm", "-journal"] {
                let _ = std::fs::remove_file(sidecar(path, ext));
            }
            plain = Connection::open(path);
        }
        let plain = plain?;
        // Scarica il WAL nel main così l'export vede tutte le righe.
        let _ = plain.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        // Percorso con ' escapato per SQL (Windows usa \ ma niente ' nei nostri path tipici).
        let tmp_s = tmp.to_string_lossy().replace('\'', "''");
        plain.execute_batch(&format!(
            "ATTACH DATABASE '{tmp_s}' AS encrypted KEY \"x'{hex}'\";\nSELECT sqlcipher_export('encrypted');\nDETACH DATABASE encrypted;"
        ))?;
        drop(plain);
        std::fs::rename(&tmp, path).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(e.to_string()),
            )
        })?;
        Ok(())
    }

    fn migrate(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            r#"
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'text',
                text TEXT,
                image_path TEXT,
                color_hex TEXT,
                file_paths_json TEXT,
                source_app TEXT NOT NULL DEFAULT 'Unknown',
                window_title TEXT NOT NULL DEFAULT '',
                hash TEXT NOT NULL DEFAULT '',
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_sensitive INTEGER NOT NULL DEFAULT 0,
                ocr_text TEXT,
                copy_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_kind ON clips(kind);
            CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
            CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
                text, ocr_text, source_app, window_title,
                content='clips', content_rowid='rowid'
            );
            CREATE TRIGGER IF NOT EXISTS clips_ai AFTER INSERT ON clips BEGIN
                INSERT INTO clips_fts(rowid, text, ocr_text, source_app, window_title)
                VALUES (new.rowid, new.text, new.ocr_text, new.source_app, new.window_title);
            END;
            CREATE TRIGGER IF NOT EXISTS clips_ad AFTER DELETE ON clips BEGIN
                INSERT INTO clips_fts(clips_fts, rowid, text, ocr_text, source_app, window_title)
                VALUES ('delete', old.rowid, old.text, old.ocr_text, old.source_app, old.window_title);
            END;
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#6366f1'
            );
            CREATE TABLE IF NOT EXISTS clip_categories (
                clip_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                PRIMARY KEY (clip_id, category_id)
            );
            CREATE TABLE IF NOT EXISTS clip_flags (
                clip_id TEXT PRIMARY KEY,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                inline_shortcut TEXT
            );
            CREATE TABLE IF NOT EXISTS reminders (
                clip_id TEXT PRIMARY KEY,
                remind_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                notified INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(remind_at);
            CREATE TABLE IF NOT EXISTS spaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                icon TEXT NOT NULL DEFAULT '',
                query_json TEXT NOT NULL DEFAULT '',
                is_smart INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS clip_spaces (
                clip_id TEXT NOT NULL,
                space_id TEXT NOT NULL,
                PRIMARY KEY (clip_id, space_id)
            );
            CREATE INDEX IF NOT EXISTS idx_clip_spaces_space ON clip_spaces(space_id);
            CREATE INDEX IF NOT EXISTS idx_clip_spaces_clip ON clip_spaces(clip_id);
            CREATE TRIGGER IF NOT EXISTS clips_au AFTER UPDATE ON clips BEGIN
                INSERT INTO clips_fts(clips_fts, rowid, text, ocr_text, source_app, window_title)
                VALUES ('delete', old.rowid, old.text, old.ocr_text, old.source_app, old.window_title);
                INSERT INTO clips_fts(rowid, text, ocr_text, source_app, window_title)
                VALUES (new.rowid, new.text, new.ocr_text, new.source_app, new.window_title);
            END;
            "#,
        )?;
        // Tassonomia smart: una categoria per ogni cosa che gestiamo.
        // Vedi .agents/skills/clip-taxonomy/SKILL.md prima di aggiungere/rimuovere voci.
        for (name, color) in [
            ("History", "#8b8b8b"),
            ("Snippet", "#10b981"),
            ("Link", "#a855f7"),
            ("QR Code", "#06b6d4"),
            ("Email", "#ec4899"),
            ("Template", "#eab308"),
            ("Video", "#ef4444"),
            ("Colors", "#3b82f6"),
            ("Assets", "#f59e0b"),
            ("File", "#94a3b8"),
        ] {
            self.conn.execute(
                "INSERT OR IGNORE INTO categories (id, name, color) VALUES (?1, ?2, ?3)",
                params![Uuid::new_v4().to_string(), name, color],
            )?;
        }
        // Rinominati storici (Prompts->Snippet, Inspirations->Link): unisci se il nuovo nome esiste già.
        for (old, new) in [("Prompts", "Snippet"), ("Inspirations", "Link")] {
            let new_exists: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM categories WHERE name=?1",
                params![new],
                |r| r.get(0),
            )?;
            if new_exists > 0 {
                self.conn.execute(
                    "INSERT OR IGNORE INTO clip_categories (clip_id, category_id)
                     SELECT cc.clip_id, n.id
                     FROM clip_categories cc
                     JOIN categories o ON o.id = cc.category_id AND o.name = ?2
                     JOIN categories n ON n.name = ?1",
                    params![new, old],
                )?;
                self.conn.execute(
                    "DELETE FROM clip_categories WHERE category_id IN (SELECT id FROM categories WHERE name=?1)",
                    params![old],
                )?;
                self.conn.execute("DELETE FROM categories WHERE name=?1", params![old])?;
            } else {
                self.conn.execute(
                    "UPDATE categories SET name=?1 WHERE name=?2",
                    params![new, old],
                )?;
            }
        }
        // Backfill sicuri solo per kind (niente euristiche su vecchi testi): vecchi link -> Link/QR Code/Video.
        self.conn.execute(
            "INSERT OR IGNORE INTO clip_categories (clip_id, category_id)
             SELECT c.id, (SELECT id FROM categories WHERE name='QR Code')
             FROM clips c WHERE c.kind='link'",
            [],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO clip_categories (clip_id, category_id)
             SELECT c.id, (SELECT id FROM categories WHERE name='Video')
             FROM clips c WHERE c.kind='link'
               AND (c.text LIKE '%youtube%' OR c.text LIKE '%youtu.be%' OR c.text LIKE '%vimeo%'
                    OR c.text LIKE '%.mp4%' OR c.text LIKE '%.mov%' OR c.text LIKE '%.webm%')",
            [],
        )?;
        Ok(())
    }

    fn row_map(row: &rusqlite::Row) -> rusqlite::Result<ClipRow> {
        let id: String = row.get(0)?;
        // categorie aggregate via subquery JSON
        Ok(ClipRow {
            id,
            kind: row.get(1)?,
            text: row.get(2)?,
            image_path: row.get(3)?,
            color_hex: row.get(4)?,
            file_paths_json: row.get(5)?,
            source_app: row.get(6)?,
            window_title: row.get(7)?,
            hash: row.get(8)?,
            is_favorite: row.get::<_, i64>(9)? != 0,
            is_sensitive: row.get::<_, i64>(10)? != 0,
            ocr_text: row.get(11)?,
            copy_count: row.get(12)?,
            categories_json: None, // riempito dopo
            created_at: row.get(13)?,
            is_pinned: false,
            inline_shortcut: None,
            remind_at: None,
        })
    }

    fn with_categories(&self, mut rows: Vec<ClipRow>) -> SqlResult<Vec<ClipRow>> {
        for r in rows.iter_mut() {
            let mut stmt = self.conn.prepare(
                "SELECT c.name FROM categories c JOIN clip_categories cc ON cc.category_id=c.id WHERE cc.clip_id=?1",
            )?;
            let names: Vec<String> = stmt
                .query_map(params![r.id], |row| row.get(0))?
                .filter_map(|x| x.ok())
                .collect();
            r.categories_json = Some(serde_json::to_string(&names).unwrap_or("[]".into()));
            if let Ok(mut st) = self.conn.prepare(
                "SELECT is_pinned, inline_shortcut FROM clip_flags WHERE clip_id=?1",
            ) {
                if let Ok(mut q) = st.query(params![r.id]) {
                    if let Ok(Some(row)) = q.next() {
                        r.is_pinned = row.get::<_, i64>(0).unwrap_or(0) != 0;
                        r.inline_shortcut = row.get(1).ok();
                    }
                }
            }
            if let Ok(remind) = self.conn.query_row(
                "SELECT remind_at FROM reminders WHERE clip_id=?1",
                params![r.id],
                |row| row.get::<_, String>(0),
            ) {
                r.remind_at = Some(remind);
            }
        }
        Ok(rows)
    }

    pub fn insert_text(
        &self,
        kind: &str,
        text: &str,
        source_app: &str,
        window_title: &str,
        hash: &str,
        is_sensitive: bool,
        color_hex: Option<&str>,
        image_path: Option<&str>,
    ) -> SqlResult<(ClipRow, bool)> {
        if let Some(existing) = self.by_hash(hash)? {
            let newest: Option<String> = self
                .conn
                .query_row("SELECT id FROM clips ORDER BY created_at DESC LIMIT 1", [], |r| r.get(0))
                .ok();
            if newest.as_ref() == Some(&existing.id) && existing.source_app == source_app && existing.window_title == window_title
                && image_path.is_none_or(|p| existing.image_path.as_deref() == Some(p)) {
                return Ok((self.get(&existing.id)?.unwrap(), false));
            }
            self.conn.execute(
                "UPDATE clips SET copy_count = copy_count + 1, created_at = ?1,
                 source_app = CASE WHEN ?3 != 'Unknown' THEN ?3 ELSE source_app END,
                 window_title = CASE WHEN ?3 != 'Unknown' THEN ?4 ELSE window_title END,
                 image_path = COALESCE(?5, image_path) WHERE id = ?2",
                params![Utc::now().to_rfc3339(), existing.id, source_app, window_title, image_path],
            )?;
            return Ok((self.get(&existing.id)?.unwrap(), true));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO clips (id, kind, text, image_path, color_hex, source_app, window_title, hash, is_sensitive, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, kind, text, image_path, color_hex, source_app, window_title, hash, is_sensitive as i64, now],
        )?;
        // auto-assegna History + faccette smart (stessa tassonomia del seed sopra)
        let mut extras = vec!["History"];
        match kind {
            "color" => extras.push("Colors"),
            "image" => extras.push("Assets"),
            "file" => extras.push("File"),
            "code" => extras.push("Snippet"),
            "link" => {
                extras.push("Link");
                extras.push("QR Code");
                if crate::detect::is_video_url(text) {
                    extras.push("Video");
                }
            }
            _ => {
                if crate::detect::is_email(text) {
                    extras.push("Email");
                }
                if crate::detect::is_template(text) {
                    extras.push("Template");
                }
                if crate::detect::is_qr_payload(text) {
                    extras.push("QR Code");
                }
                if crate::detect::is_video_url(text) {
                    extras.push("Video");
                }
            }
        }
        for name in extras {
            if let Ok(Some(cat)) = self.category_by_name(name) {
                let _ = self.conn.execute(
                    "INSERT OR IGNORE INTO clip_categories (clip_id, category_id) VALUES (?1,?2)",
                    params![id, cat.id],
                );
            }
        }
        Ok((self.get(&id)?.unwrap(), true))
    }

    /// Clip kind=file: text = anteprima leggibile, file_paths_json = path reali.
    pub fn insert_files(
        &self,
        display: &str,
        files_json: &str,
        hash: &str,
        source_app: &str,
        window_title: &str,
    ) -> SqlResult<(ClipRow, bool)> {
        if files_json.trim().is_empty() || hash.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName("file non validi".into()));
        }
        if let Some(existing) = self.by_hash(hash)? {
            let newest: Option<String> = self
                .conn
                .query_row("SELECT id FROM clips ORDER BY created_at DESC LIMIT 1", [], |r| r.get(0))
                .ok();
            if newest.as_ref() == Some(&existing.id) && existing.source_app == source_app {
                return Ok((self.get(&existing.id)?.unwrap(), false));
            }
            self.conn.execute(
                "UPDATE clips SET copy_count = copy_count + 1, created_at = ?1,
                 source_app = CASE WHEN ?3 != 'Unknown' THEN ?3 ELSE source_app END,
                 window_title = CASE WHEN ?3 != 'Unknown' THEN ?4 ELSE window_title END,
                 text = ?5, file_paths_json = ?6 WHERE id = ?2",
                params![Utc::now().to_rfc3339(), existing.id, source_app, window_title, display, files_json],
            )?;
            return Ok((self.get(&existing.id)?.unwrap(), true));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO clips (id, kind, text, file_paths_json, source_app, window_title, hash, is_sensitive, created_at)
             VALUES (?1,'file',?2,?3,?4,?5,?6,0,?7)",
            params![id, display, files_json, source_app, window_title, hash, now],
        )?;
        for name in ["History", "File"] {
            if let Ok(Some(cat)) = self.category_by_name(name) {
                let _ = self.conn.execute(
                    "INSERT OR IGNORE INTO clip_categories (clip_id, category_id) VALUES (?1,?2)",
                    params![id, cat.id],
                );
            }
        }
        Ok((self.get(&id)?.unwrap(), true))
    }

    pub fn by_hash(&self, hash: &str) -> SqlResult<Option<ClipRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,kind,text,image_path,color_hex,file_paths_json,source_app,window_title,hash,is_favorite,is_sensitive,ocr_text,copy_count,created_at FROM clips WHERE hash=?1 LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![hash], Self::row_map)?;
        Ok(rows.next().transpose()?.map(|mut r| {
            r.categories_json = Some("[]".into());
            r
        }))
    }

    pub fn get(&self, id: &str) -> SqlResult<Option<ClipRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,kind,text,image_path,color_hex,file_paths_json,source_app,window_title,hash,is_favorite,is_sensitive,ocr_text,copy_count,created_at FROM clips WHERE id=?1",
        )?;
        let mut rows = stmt.query_map(params![id], Self::row_map)?;
        if let Some(r) = rows.next().transpose()? {
            Ok(Some(self.with_categories(vec![r])?.remove(0)))
        } else {
            Ok(None)
        }
    }

    pub fn list(&self, limit: i64, kind: Option<&str>, category: Option<&str>, fav: bool) -> SqlResult<Vec<ClipRow>> {
        let mut sql = String::from(
            "SELECT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at FROM clips c",
        );
        let mut clauses = Vec::new();
        if category.is_some() {
            sql.push_str(" JOIN clip_categories cc ON cc.clip_id=c.id JOIN categories cat ON cat.id=cc.category_id");
        }
        if fav {
            clauses.push("c.is_favorite=1".to_string());
        }
        if let Some(k) = kind {
            if k != "all" {
                clauses.push(format!("c.kind='{}'", k.replace('\'', "")));
            }
        }
        if let Some(cat) = category {
            if cat != "all" {
                clauses.push(format!("cat.name='{}'", cat.replace('\'', "")));
            }
        }
        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY COALESCE((SELECT is_pinned FROM clip_flags WHERE clip_id=c.id),0) DESC, c.created_at DESC LIMIT ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows: Vec<ClipRow> = stmt
            .query_map(params![limit], Self::row_map)?
            .filter_map(|x| x.ok())
            .collect();
        self.with_categories(rows)
    }

    pub fn search(&self, q: &str, limit: i64) -> SqlResult<Vec<ClipRow>> {
        let q = q.trim();
        if q.is_empty() {
            return self.list(limit, None, None, false);
        }
        // FTS5 + fallback LIKE
        let fts_q = q
            .split_whitespace()
            .map(|w| format!("\"{}\"*", w.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");
        let like = format!("%{}%", q);
        let mut stmt = self.conn.prepare(
            "SELECT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at
             FROM clips_fts f JOIN clips c ON c.rowid=f.rowid LEFT JOIN clip_flags fl ON fl.clip_id=c.id
             WHERE clips_fts MATCH ?1 OR fl.inline_shortcut LIKE ?2 ORDER BY rank LIMIT ?3",
        )?;
        let rows: Vec<ClipRow> = stmt
            .query_map(params![fts_q, like, limit], Self::row_map)?
            .filter_map(|x| x.ok())
            .collect();
        if !rows.is_empty() {
            return self.with_categories(rows);
        }
        let mut stmt2 = self.conn.prepare(
            "SELECT id,kind,text,image_path,color_hex,file_paths_json,source_app,window_title,hash,is_favorite,is_sensitive,ocr_text,copy_count,created_at FROM clips
             WHERE text LIKE ?1 OR ocr_text LIKE ?1 OR source_app LIKE ?1 OR window_title LIKE ?1 OR color_hex LIKE ?1
             OR id IN (SELECT clip_id FROM clip_flags WHERE inline_shortcut LIKE ?1) ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows2: Vec<ClipRow> = stmt2
            .query_map(params![like, limit], Self::row_map)?
            .filter_map(|x| x.ok())
            .collect();
        self.with_categories(rows2)
    }

    pub fn toggle_favorite(&self, id: &str) -> SqlResult<bool> {
        self.conn.execute("UPDATE clips SET is_favorite = 1 - is_favorite WHERE id=?1", params![id])?;
        let r = self.get(id)?.map(|x| x.is_favorite).unwrap_or(false);
        Ok(r)
    }

    pub fn delete(&self, id: &str) -> SqlResult<()> {
        // rimuovi immagine dal disco
        if let Some(row) = self.get(id)? {
            if let Some(p) = row.image_path {
                let path = p.strip_prefix("asset://localhost/").unwrap_or(&p);
                let _ = std::fs::remove_file(path);
            }
        }
        self.conn.execute("DELETE FROM clip_categories WHERE clip_id=?1", params![id])?;
        self.conn.execute("DELETE FROM clip_flags WHERE clip_id=?1", params![id])?;
        self.conn.execute("DELETE FROM reminders WHERE clip_id=?1", params![id])?;
        self.conn.execute("DELETE FROM clip_spaces WHERE clip_id=?1", params![id])?;
        self.conn.execute("DELETE FROM clips WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn clear(&self) -> SqlResult<()> {
        self.conn.execute("DELETE FROM clip_categories", [])?;
        self.conn.execute("DELETE FROM reminders", [])?;
        self.conn.execute("DELETE FROM clip_spaces", [])?;
        self.conn.execute("DELETE FROM clips", [])?;
        let _ = std::fs::remove_dir_all(images_dir());
        let _ = std::fs::create_dir_all(images_dir());
        Ok(())
    }

    pub fn bump_copy(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("UPDATE clips SET copy_count = copy_count + 1 WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn categories(&self) -> SqlResult<Vec<Category>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.name, c.color, COUNT(cc.clip_id) FROM categories c LEFT JOIN clip_categories cc ON cc.category_id=c.id GROUP BY c.id ORDER BY c.name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                count: row.get(3)?,
            })
        })?;
        Ok(rows.filter_map(|x| x.ok()).collect())
    }

    pub fn category_by_name(&self, name: &str) -> SqlResult<Option<Category>> {
        let mut stmt = self.conn.prepare("SELECT id,name,color,0 FROM categories WHERE name=?1")?;
        let mut rows = stmt.query_map(params![name], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                count: row.get(3)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn create_category(&self, name: &str, color: Option<&str>) -> SqlResult<Category> {
        let id = Uuid::new_v4().to_string();
        let color = color.unwrap_or("#6366f1");
        self.conn.execute(
            "INSERT INTO categories (id,name,color) VALUES (?1,?2,?3) ON CONFLICT(name) DO UPDATE SET color=excluded.color",
            params![id, name.trim(), color],
        )?;
        let c = self.category_by_name(name.trim())?.unwrap();
        Ok(c)
    }

    pub fn assign_category(&self, clip_id: &str, category_id: &str, assign: bool) -> SqlResult<()> {
        if assign {
            self.conn.execute(
                "INSERT OR IGNORE INTO clip_categories (clip_id, category_id) VALUES (?1,?2)",
                params![clip_id, category_id],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM clip_categories WHERE clip_id=?1 AND category_id=?2",
                params![clip_id, category_id],
            )?;
        }
        Ok(())
    }

    pub fn stats(&self) -> SqlResult<serde_json::Value> {
        let total: i64 = self.conn.query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))?;
        let mut stmt = self.conn.prepare("SELECT kind, COUNT(*) FROM clips GROUP BY kind")?;
        let by_kind: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .filter_map(|x| x.ok())
            .collect();
        let fav: i64 = self.conn.query_row("SELECT COUNT(*) FROM clips WHERE is_favorite=1", [], |r| r.get(0))?;
        let now: DateTime<Utc> = Utc::now();
        let _ = now;
        let by_kind: std::collections::BTreeMap<String, i64> = by_kind.into_iter().collect();
        Ok(serde_json::json!({ "total": total, "byKind": by_kind, "favorites": fav }))
    }

    pub fn toggle_pin(&self, id: &str) -> SqlResult<bool> {
        let current: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE((SELECT is_pinned FROM clip_flags WHERE clip_id=?1), 0)",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let next = if current == 0 { 1 } else { 0 };
        self.conn.execute(
            "INSERT INTO clip_flags (clip_id, is_pinned) VALUES (?1, ?2)
             ON CONFLICT(clip_id) DO UPDATE SET is_pinned=excluded.is_pinned",
            params![id, next],
        )?;
        Ok(next == 1)
    }

    pub fn set_inline_shortcut(&self, id: &str, shortcut: Option<&str>) -> SqlResult<()> {
        match shortcut {
            Some(s) => {
                self.conn.execute(
                    "INSERT INTO clip_flags (clip_id, inline_shortcut) VALUES (?1, ?2)
                     ON CONFLICT(clip_id) DO UPDATE SET inline_shortcut=excluded.inline_shortcut",
                    params![id, s],
                )?;
            }
            None => {
                self.conn.execute(
                    "UPDATE clip_flags SET inline_shortcut=NULL WHERE clip_id=?1",
                    params![id],
                )?;
            }
        }
        Ok(())
    }

    fn parse_remind_at(raw: &str) -> SqlResult<String> {
        let dt = chrono::DateTime::parse_from_rfc3339(raw.trim())
            .map_err(|_| rusqlite::Error::InvalidParameterName("data non valida".into()))?;
        Ok(dt.with_timezone(&Utc).to_rfc3339())
    }

    pub fn set_reminder(&self, clip_id: &str, remind_at: &str) -> SqlResult<ClipRow> {
        let when = Self::parse_remind_at(remind_at)?;
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE id=?1",
            params![clip_id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO reminders (clip_id, remind_at, created_at, notified)
             VALUES (?1, ?2, ?3, 0)
             ON CONFLICT(clip_id) DO UPDATE SET remind_at=excluded.remind_at, notified=0",
            params![clip_id, when, now],
        )?;
        self.get(clip_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn clear_reminder(&self, clip_id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM reminders WHERE clip_id=?1", params![clip_id])?;
        Ok(())
    }

    pub fn snooze_reminder(&self, clip_id: &str, minutes: i64) -> SqlResult<ClipRow> {
        let mins = minutes.clamp(5, 60 * 24 * 7);
        let when = (Utc::now() + chrono::Duration::minutes(mins)).to_rfc3339();
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM reminders WHERE clip_id=?1",
            params![clip_id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.conn.execute(
            "UPDATE reminders SET remind_at=?1, notified=0 WHERE clip_id=?2",
            params![when, clip_id],
        )?;
        self.get(clip_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn list_reminders(&self) -> SqlResult<Vec<ClipRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at
             FROM clips c JOIN reminders r ON r.clip_id=c.id ORDER BY r.remind_at ASC LIMIT 50",
        )?;
        let rows: Vec<ClipRow> = stmt
            .query_map([], Self::row_map)?
            .filter_map(|x| x.ok())
            .collect();
        self.with_categories(rows)
    }

    /// Clip scaduti non ancora notificati (remind_at <= now). Il chiamante
    /// notifica e poi chiama `mark_notified` così ogni scadenza suona una volta sola.
    pub fn due_reminders(&self, now_rfc3339: &str) -> SqlResult<Vec<ClipRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at
             FROM clips c JOIN reminders r ON r.clip_id=c.id
             WHERE r.remind_at <= ?1 AND r.notified=0 ORDER BY r.remind_at ASC LIMIT 10",
        )?;
        let rows: Vec<ClipRow> = stmt
            .query_map(params![now_rfc3339], Self::row_map)?
            .filter_map(|x| x.ok())
            .collect();
        self.with_categories(rows)
    }

    pub fn mark_notified(&self, clip_id: &str) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE reminders SET notified=1 WHERE clip_id=?1",
            params![clip_id],
        )?;
        Ok(())
    }

    pub fn update_text(&self, id: &str, new_text: &str) -> SqlResult<ClipRow> {
        let t = new_text.trim();
        if t.is_empty() || t.chars().count() > 100_000 {
            return Err(rusqlite::Error::InvalidParameterName("vuoto/troppo grande".into()));
        }
        let existing = self.get(id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        // Solo clip testuali: immagini/file hanno payload binario o path, non testo libero.
        if existing.kind == "image" || existing.kind == "file" || existing.image_path.is_some() {
            return Err(rusqlite::Error::InvalidParameterName("solo clip di testo".into()));
        }
        if existing.text.as_deref().unwrap_or("") == t {
            return Ok(existing);
        }
        let kind = crate::detect::detect_kind(t).to_string();
        let color = crate::detect::extract_color(t);
        let sensitive = crate::detect::is_sensitive(t);
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(t.as_bytes());
        let hash = format!("{:x}", h.finalize())[..16].to_string();
        self.conn.execute(
            "UPDATE clips SET text=?1, kind=?2, color_hex=?3, is_sensitive=?4, hash=?5 WHERE id=?6",
            params![t, kind, color, sensitive as i64, hash, id],
        )?;
        // Ricalcola solo le faccette smart, le custom dell'utente restano.
        // Stessa tassonomia di insert_text/migrate: History sempre + kind/faccette.
        let mut extras = vec!["History"];
        match kind.as_str() {
            "color" => extras.push("Colors"),
            "image" => extras.push("Assets"),
            "file" => extras.push("File"),
            "code" => extras.push("Snippet"),
            "link" => {
                extras.push("Link");
                extras.push("QR Code");
                if crate::detect::is_video_url(t) {
                    extras.push("Video");
                }
            }
            _ => {
                if crate::detect::is_email(t) {
                    extras.push("Email");
                }
                if crate::detect::is_template(t) {
                    extras.push("Template");
                }
                if crate::detect::is_qr_payload(t) {
                    extras.push("QR Code");
                }
                if crate::detect::is_video_url(t) {
                    extras.push("Video");
                }
            }
        }
        self.conn.execute(
            "DELETE FROM clip_categories WHERE clip_id=?1 AND category_id IN
             (SELECT id FROM categories WHERE name IN
              ('History','Snippet','Link','QR Code','Email','Template','Video','Colors','Assets','File'))",
            params![id],
        )?;
        for name in extras {
            if let Ok(Some(cat)) = self.category_by_name(name) {
                let _ = self.conn.execute(
                    "INSERT OR IGNORE INTO clip_categories (clip_id, category_id) VALUES (?1,?2)",
                    params![id, cat.id],
                );
            }
        }
        Ok(self.get(id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?)
    }

    pub fn set_ocr(&self, id: &str, ocr: &str) -> SqlResult<()> {
        self.conn
            .execute("UPDATE clips SET ocr_text=?1 WHERE id=?2", params![ocr, id])?;
        Ok(())
    }

    pub fn prune_unused(&self, days: i64) -> SqlResult<usize> {
        if days <= 0 {
            return Ok(0);
        }
        let cutoff = (Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        let n = self.conn.execute(
            "DELETE FROM clips WHERE created_at < ?1 AND is_favorite=0
             AND id NOT IN (SELECT clip_id FROM clip_flags WHERE is_pinned=1)
             AND id NOT IN (SELECT clip_id FROM reminders)",
            params![cutoff],
        )?;
        let _ = self.conn.execute(
            "DELETE FROM reminders WHERE clip_id NOT IN (SELECT id FROM clips)",
            [],
        );
        let _ = self.conn.execute(
            "DELETE FROM clip_spaces WHERE clip_id NOT IN (SELECT id FROM clips)",
            [],
        );
        Ok(n)
    }

    /// Tiene solo gli `max` clip recenti. Esenti: preferiti, pinnati, con reminder.
    pub fn prune_by_count(&self, max: i64) -> SqlResult<usize> {
        if max <= 0 {
            return Ok(0);
        }
        let n = self.conn.execute(
            "DELETE FROM clips WHERE id IN (
               SELECT id FROM clips
               WHERE is_favorite = 0
                 AND id NOT IN (SELECT clip_id FROM clip_flags WHERE is_pinned = 1)
                 AND id NOT IN (SELECT clip_id FROM reminders)
               ORDER BY created_at DESC LIMIT -1 OFFSET ?1
             )",
            params![max],
        )?;
        let _ = self.conn.execute(
            "DELETE FROM clip_categories WHERE clip_id NOT IN (SELECT id FROM clips)",
            [],
        );
        let _ = self.conn.execute(
            "DELETE FROM reminders WHERE clip_id NOT IN (SELECT id FROM clips)",
            [],
        );
        let _ = self.conn.execute(
            "DELETE FROM clip_spaces WHERE clip_id NOT IN (SELECT id FROM clips)",
            [],
        );
        Ok(n)
    }

    // ── Export / Import / Backup (JSON v1 + copia DB, niente cloud) ──

    pub fn export_json(&self) -> SqlResult<String> {
        let mut stmt = self.conn.prepare(
            "SELECT kind,text,color_hex,image_path,file_paths_json,source_app,window_title,hash,is_sensitive,copy_count,created_at
             FROM clips ORDER BY created_at",
        )?;
        let items: Vec<ClipBackup> = stmt
            .query_map([], |row| {
                Ok(ClipBackup {
                    v: 1,
                    kind: row.get(0)?,
                    text: row.get(1)?,
                    color_hex: row.get(2)?,
                    image_path: row.get(3)?,
                    file_paths_json: row.get(4)?,
                    source_app: row.get(5)?,
                    window_title: row.get(6)?,
                    hash: row.get(7)?,
                    is_sensitive: row.get::<_, i64>(8)? != 0,
                    copy_count: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })?
            .filter_map(|x| x.ok())
            .collect();
        serde_json::to_string(&items)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
    }

    /// Ritorna (importati, saltati). Idempotente sul contenuto: i duplicati via
    /// hash fanno bump in insert_text/insert_files e contano come importati.
    pub fn import_json(&self, raw: &str) -> SqlResult<(usize, usize)> {
        let items: Vec<ClipBackup> = serde_json::from_str(raw)
            .map_err(|_| rusqlite::Error::InvalidParameterName("JSON non valido".into()))?;
        if items.len() > 50_000 {
            return Err(rusqlite::Error::InvalidParameterName("backup troppo grande".into()));
        }
        let (mut imported, mut skipped) = (0usize, 0usize);
        for it in items {
            if it.hash.trim().is_empty() || it.kind.trim().is_empty() {
                skipped += 1;
                continue;
            }
            let r = match it.kind.as_str() {
                "file" => match it.file_paths_json {
                    Some(fp) if !fp.trim().is_empty() => self.insert_files(
                        it.text.as_deref().unwrap_or("file"),
                        &fp,
                        &it.hash,
                        &it.source_app,
                        &it.window_title,
                    ),
                    _ => {
                        skipped += 1;
                        continue;
                    }
                },
                "image" => match it.image_path {
                    // Path assoluti di un'altra macchina: niente clip fantasma.
                    Some(p) if std::path::Path::new(&p).exists() => self.insert_text(
                        "image",
                        it.text.as_deref().unwrap_or("[Immagine]"),
                        &it.source_app,
                        &it.window_title,
                        &it.hash,
                        it.is_sensitive,
                        None,
                        Some(&p),
                    ),
                    _ => {
                        skipped += 1;
                        continue;
                    }
                },
                k => {
                    let t = it.text.as_deref().unwrap_or("").trim();
                    if t.is_empty() {
                        skipped += 1;
                        continue;
                    }
                    self.insert_text(
                        k,
                        t,
                        &it.source_app,
                        &it.window_title,
                        &it.hash,
                        it.is_sensitive,
                        it.color_hex.as_deref(),
                        None,
                    )
                }
            };
            match r {
                Ok(_) => imported += 1,
                Err(_) => skipped += 1,
            }
        }
        Ok((imported, skipped))
    }

    /// Backup coerente sotto chiave (VACUUM INTO mantiene la cifratura) + immagini.
    pub fn backup_now(&self) -> SqlResult<std::path::PathBuf> {
        self.backup_to(&data_dir().join("backups"), &images_dir())
    }
    fn backup_to(&self, dest: &std::path::Path, images_src: &std::path::Path) -> SqlResult<std::path::PathBuf> {
        let ts = Utc::now().format("%Y%m%d-%H%M%S");
        let dir = dest.join(format!("boardify-backup-{ts}"));
        std::fs::create_dir_all(dir.join("images")).map_err(io_err)?;
        let db_path = dir.join("clips.db");
        let esc = db_path.to_string_lossy().replace('\'', "''");
        self.conn
            .execute_batch(&format!("VACUUM INTO '{esc}';"))?;
        if images_src.is_dir() {
            copy_dir(images_src, &dir.join("images")).map_err(io_err)?;
        }
        Ok(dir)
    }

    // ── Spaces: manuali (assign esplicito) + smart (query_json dinamica) ──

    fn parse_smart(q: &str) -> SmartQuery {
        let t = q.trim();
        if t.is_empty() {
            return SmartQuery::default();
        }
        serde_json::from_str::<SmartQuery>(t).unwrap_or_default()
    }

    pub fn create_space(
        &self,
        name: &str,
        icon: Option<&str>,
        query_json: Option<&str>,
        is_smart: bool,
    ) -> SqlResult<Space> {
        let clean = name.trim();
        if clean.is_empty() || clean.chars().count() > 40 {
            return Err(rusqlite::Error::InvalidParameterName("nome non valido".into()));
        }
        let icon = icon.unwrap_or("").trim();
        if icon.chars().count() > 16 {
            return Err(rusqlite::Error::InvalidParameterName("icona non valida".into()));
        }
        let q = query_json.unwrap_or("").trim().to_string();
        if is_smart && !q.is_empty() {
            // Deve essere un oggetto JSON valido: niente query opache che rompono space_clips.
            let v: serde_json::Value = serde_json::from_str(&q)
                .map_err(|_| rusqlite::Error::InvalidParameterName("query non valida".into()))?;
            if !v.is_object() {
                return Err(rusqlite::Error::InvalidParameterName("query non valida".into()));
            }
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO spaces (id,name,icon,query_json,is_smart,created_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(name) DO UPDATE SET icon=excluded.icon, query_json=excluded.query_json, is_smart=excluded.is_smart",
            params![id, clean, icon, if is_smart { q } else { String::new() }, is_smart as i64, now],
        )?;
        self.space_by_name(clean)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn space_by_name(&self, name: &str) -> SqlResult<Option<Space>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,icon,query_json,is_smart FROM spaces WHERE name=?1",
        )?;
        let mut rows = stmt.query_map(params![name], |row| {
            Ok(Space {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                query_json: row.get(3)?,
                is_smart: row.get::<_, i64>(4)? != 0,
                count: 0,
            })
        })?;
        if let Some(s) = rows.next().transpose()? {
            Ok(Some(self.with_space_count(s)?))
        } else {
            Ok(None)
        }
    }

    fn with_space_count(&self, mut s: Space) -> SqlResult<Space> {
        if s.is_smart {
            s.count = self.count_smart(&s.query_json).unwrap_or(0);
        } else {
            s.count = self.conn.query_row(
                "SELECT COUNT(*) FROM clip_spaces WHERE space_id=?1",
                params![s.id],
                |r| r.get(0),
            ).unwrap_or(0);
        }
        Ok(s)
    }

    pub fn list_spaces(&self) -> SqlResult<Vec<Space>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,icon,query_json,is_smart FROM spaces ORDER BY name",
        )?;
        let rows: Vec<Space> = stmt.query_map([], |row| {
            Ok(Space {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                query_json: row.get(3)?,
                is_smart: row.get::<_, i64>(4)? != 0,
                count: 0,
            })
        })?.filter_map(|x| x.ok()).collect();
        rows.into_iter().map(|s| self.with_space_count(s)).collect()
    }

    pub fn delete_space(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM clip_spaces WHERE space_id=?1", params![id])?;
        self.conn.execute("DELETE FROM spaces WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn assign_space(&self, clip_id: &str, space_id: &str, assign: bool) -> SqlResult<()> {
        // Solo spazi manuali: gli smart si risolvono da query_json, assegnarli è un no-op errore.
        let smart: Option<i64> = self.conn.query_row(
            "SELECT is_smart FROM spaces WHERE id=?1",
            params![space_id],
            |r| r.get(0),
        ).ok();
        if smart == Some(1) {
            return Err(rusqlite::Error::InvalidParameterName("spazio smart: niente assign".into()));
        }
        let clip_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE id=?1", params![clip_id], |r| r.get(0),
        )?;
        if clip_exists == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        if assign {
            self.conn.execute(
                "INSERT OR IGNORE INTO clip_spaces (clip_id, space_id) VALUES (?1,?2)",
                params![clip_id, space_id],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM clip_spaces WHERE clip_id=?1 AND space_id=?2",
                params![clip_id, space_id],
            )?;
        }
        Ok(())
    }

    fn count_smart(&self, query_json: &str) -> SqlResult<i64> {
        let q = Self::parse_smart(query_json);
        if let Some(cat) = q.category.as_deref().filter(|s| !s.trim().is_empty()) {
            let like = q.search.as_deref().unwrap_or("").trim();
            if like.is_empty() && q.kind.as_deref().unwrap_or("all") == "all" && !q.favorites_only.unwrap_or(false) {
                return self.conn.query_row(
                    "SELECT COUNT(*) FROM clip_categories cc JOIN categories c ON c.id=cc.category_id WHERE c.name=?1",
                    params![cat], |r| r.get(0),
                );
            }
        }
        Ok(self.list_smart(&q, 100_000)?.len() as i64)
    }

    fn list_smart(&self, q: &SmartQuery, limit: i64) -> SqlResult<Vec<ClipRow>> {
        // Filtri combinabili: kind + favorites + category + search (LIKE, niente FTS qui per semplicità).
        let mut sql = String::from(
            "SELECT DISTINCT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at FROM clips c",
        );
        let mut clauses: Vec<String> = Vec::new();
        if q.category.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
            sql.push_str(" JOIN clip_categories cc ON cc.clip_id=c.id JOIN categories cat ON cat.id=cc.category_id");
        }
        if let Some(k) = q.kind.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s != "all") {
            clauses.push(format!("c.kind='{}'", k.replace('\'', "")));
        }
        if q.favorites_only.unwrap_or(false) {
            clauses.push("c.is_favorite=1".to_string());
        }
        if let Some(cat) = q.category.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s != "all") {
            clauses.push(format!("cat.name='{}'", cat.replace('\'', "")));
        }
        // search salvato solo se non vuoto; escaping LIKE con replace mirato.
        let like_opt = q.search.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY c.created_at DESC LIMIT ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows: Vec<ClipRow> = if let Some(like) = like_opt {
            // Applica search in memoria sul LIKE per non complicare i params con la JOIN.
            let all: Vec<ClipRow> = stmt.query_map(params![limit * 5], Self::row_map)?.filter_map(|x| x.ok()).collect();
            let needle = like.to_lowercase();
            all.into_iter().filter(|r| {
                r.text.as_deref().unwrap_or("").to_lowercase().contains(&needle)
                    || r.source_app.to_lowercase().contains(&needle)
                    || r.window_title.to_lowercase().contains(&needle)
            }).take(limit as usize).collect()
        } else {
            stmt.query_map(params![limit], Self::row_map)?.filter_map(|x| x.ok()).collect()
        };
        self.with_categories(rows)
    }

    pub fn space_clips(&self, space_id: &str, limit: i64) -> SqlResult<Vec<ClipRow>> {
        let (q, smart): (String, i64) = self.conn.query_row(
            "SELECT query_json,is_smart FROM spaces WHERE id=?1",
            params![space_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if smart != 0 {
            return self.list_smart(&Self::parse_smart(&q), limit);
        }
        let mut stmt = self.conn.prepare(
            "SELECT c.id,c.kind,c.text,c.image_path,c.color_hex,c.file_paths_json,c.source_app,c.window_title,c.hash,c.is_favorite,c.is_sensitive,c.ocr_text,c.copy_count,c.created_at
             FROM clips c JOIN clip_spaces cs ON cs.clip_id=c.id WHERE cs.space_id=?1 ORDER BY c.created_at DESC LIMIT ?2",
        )?;
        let rows: Vec<ClipRow> = stmt.query_map(params![space_id, limit], Self::row_map)?.filter_map(|x| x.ok()).collect();
        self.with_categories(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recopy_updates_source_without_losing_favorites_or_categories() {
        let db = Db::in_memory().unwrap();
        let (first, _) = db.insert_text("text", "Fixture", "firefox", "Old", "same", false, None, None).unwrap();
        db.toggle_favorite(&first.id).unwrap();
        db.insert_text("text", "Other", "firefox", "", "other", false, None, None).unwrap();
        let (again, fresh) = db.insert_text("text", "Fixture", "google-chrome", "New", "same", false, None, None).unwrap();
        assert!(fresh);
        assert_eq!(again.id, first.id);
        assert_eq!(again.source_app, "google-chrome");
        assert_eq!(again.window_title, "New");
        assert!(again.is_favorite);
        assert_eq!(again.categories_json, first.categories_json);
        let (unknown, _) = db.insert_text("text", "Fixture", "Unknown", "", "same", false, None, None).unwrap();
        assert_eq!(unknown.source_app, "google-chrome");
    }

    #[test]
    fn reminders_roundtrip_due_and_snooze() {
        let db = Db::in_memory().unwrap();
        let (clip, _) = db.insert_text("text", "Paga bolletta", "firefox", "", "rem1", false, None, None).unwrap();
        // data non valida
        assert!(db.set_reminder(&clip.id, "non-una-data").is_err());
        // clip inesistente
        assert!(db.set_reminder("missing", &Utc::now().to_rfc3339()).is_err());
        let past = (Utc::now() - chrono::Duration::minutes(1)).to_rfc3339();
        let row = db.set_reminder(&clip.id, &past).unwrap();
        assert_eq!(row.remind_at.as_deref(), Some(past.as_str()));
        let due = db.due_reminders(&Utc::now().to_rfc3339()).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, clip.id);
        db.mark_notified(&clip.id).unwrap();
        assert!(db.due_reminders(&Utc::now().to_rfc3339()).unwrap().is_empty());
        // lo stesso clip resta in lista finché non viene cancellato il reminder
        assert_eq!(db.list_reminders().unwrap().len(), 1);
        let snoozed = db.snooze_reminder(&clip.id, 30).unwrap();
        assert!(snoozed.remind_at.is_some());
        // di nuovo due dopo lo snooze? no, è nel futuro
        assert!(db.due_reminders(&Utc::now().to_rfc3339()).unwrap().is_empty());
        db.clear_reminder(&clip.id).unwrap();
        assert!(db.list_reminders().unwrap().is_empty());
        assert!(db.get(&clip.id).unwrap().unwrap().remind_at.is_none());
    }

    #[test]
    fn deleting_clip_clears_its_reminder() {        let db = Db::in_memory().unwrap();
        let (clip, _) = db.insert_text("text", "Da ricordare", "firefox", "", "rem2", false, None, None).unwrap();
        let future = (Utc::now() + chrono::Duration::hours(1)).to_rfc3339();
        db.set_reminder(&clip.id, &future).unwrap();
        db.delete(&clip.id).unwrap();
        assert!(db.list_reminders().unwrap().is_empty());
    }

    #[test]
    fn export_import_roundtrip_preserves_clips() {
        let db = Db::in_memory().unwrap();
        db.insert_text("text", "Ciao mondo", "firefox", "", "exp1", false, None, None).unwrap();
        db.insert_files("a.txt", "[\"/tmp/boardify-a.txt\"]", "exp2", "nautilus", "").unwrap();
        db.insert_text("code", "fn main() {}", "vscode", "", "exp3", false, None, None).unwrap();
        let json = db.export_json().unwrap();
        assert!(json.contains("Ciao mondo"));
        db.clear().unwrap();
        assert_eq!(db.list(100, None, None, false).unwrap().len(), 0);
        let (imported, skipped) = db.import_json(&json).unwrap();
        assert_eq!((imported, skipped), (3, 0));
        assert_eq!(db.list(100, None, None, false).unwrap().len(), 3);
        // JSON malformato e backup gigante rifiutati
        assert!(db.import_json("non json").is_err());
        let files: Vec<String> = db.list(100, Some("file"), None, false).unwrap()
            .into_iter().filter_map(|r| r.file_paths_json).collect();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn backup_to_writes_encrypted_db_copy() {        let db = Db::in_memory().unwrap();
        db.insert_text("text", "da salvare", "firefox", "", "bak1", false, None, None).unwrap();
        let dest = std::env::temp_dir().join(format!("boardify-backup-test-{}", uuid::Uuid::new_v4()));
        // images_src vuota: copia solo il DB, niente dati reali toccati
        let empty_img = dest.join("empty-images");
        std::fs::create_dir_all(&empty_img).unwrap();
        let out = db.backup_to(&dest, &empty_img).unwrap();
        assert!(out.join("clips.db").exists());
        std::fs::remove_dir_all(&dest).unwrap();
    }

    /// Regressione panico NotADatabase all'avvio su DB plain pre-SQLCipher:
    /// migra preservando i dati, cifra, e le riaperture restano stabili.
    #[test]
    fn plain_db_migrates_to_encrypted_and_reopens_idempotently() {
        let dir = std::env::temp_dir().join(format!("boardify-migrate-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("clips.db");
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        // Simula installazione pre-SQLCipher: DB plain con righe, chiuso.
        {
            let db = Db::open_at(&path, None).unwrap();
            db.insert_text("text", "riga da preservare", "firefox", "", "mig1", false, None, None).unwrap();
            db.insert_text("link", "https://example.com", "firefox", "", "mig2", false, None, None).unwrap();
        }
        assert!(is_plain_db(&path));
        // Primo avvio con chiave: migra e preserva tutto.
        {
            let db = Db::open_at(&path, Some(key)).unwrap();
            let rows = db.list(100, None, None, false).unwrap();
            assert_eq!(rows.len(), 2);
            assert!(rows.iter().any(|r| r.text.as_deref() == Some("riga da preservare")));
        }
        // Ora è cifrato: senza chiave non si apre più...
        assert!(!is_plain_db(&path));
        assert!(Db::open_at(&path, None).is_err());
        // ...e con la chiave si riapre sempre (niente spirale di ri-migrazione).
        {
            let db = Db::open_at(&path, Some(key)).unwrap();
            assert_eq!(db.list(100, None, None, false).unwrap().len(), 2);
        }
        // Chiave sbagliata: errore chiaro, file intatto, la chiave giusta funziona ancora.
        assert!(Db::open_at(
            &path,
            Some("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
        )
        .is_err());
        assert_eq!(
            Db::open_at(&path, Some(key)).unwrap().list(100, None, None, false).unwrap().len(),
            2
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// WAL orfano corrotto accanto a un plain valido: la migrazione lo scarta e preserva i dati.
    #[test]
    fn corrupt_wal_sidecar_does_not_block_migration() {
        let dir = std::env::temp_dir().join(format!("boardify-wal-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("clips.db");
        let key = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        {
            let db = Db::open_at(&path, None).unwrap();
            db.insert_text("text", "sopravvivo al wal", "firefox", "", "wal1", false, None, None).unwrap();
        }
        // Sidecar spazzatura come dopo un crash: main db integro, WAL illeggibile.
        let mut wal = path.as_os_str().to_owned();
        wal.push("-wal");
        std::fs::write(&wal, b"garbage-not-a-wal").unwrap();
        let db = Db::open_at(&path, Some(key)).unwrap();
        let rows = db.list(100, None, None, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].text.as_deref(), Some("sopravvivo al wal"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prune_by_count_keeps_newest_and_exempts_protected() {
        let db = Db::in_memory().unwrap();
        for i in 0..5 {
            db.insert_text("text", &format!("clip {i}"), "firefox", "", &format!("cnt{i}"), false, None, None).unwrap();
        }
        let (fav, _) = db.insert_text("text", "preferito", "firefox", "", "cntfav", false, None, None).unwrap();
        db.toggle_favorite(&fav.id).unwrap();
        // 5 normali, ne tiene 3 → ne elimina 2; il preferito è esente
        assert_eq!(db.prune_by_count(3).unwrap(), 2);
        let rest = db.list(100, None, None, false).unwrap();
        // 3 recenti + 1 preferito esente
        assert_eq!(rest.len(), 4);
        assert!(rest.iter().any(|c| c.id == fav.id));
        assert_eq!(db.prune_by_count(0).unwrap(), 0);
    }

    #[test]
    fn sqlcipher_is_active() {
        // SQLCipher attivo: PRAGMA cipher_version ritorna una riga non vuota.
        let db = Db::in_memory().unwrap();
        let v: String = db.conn.query_row("PRAGMA cipher_version;", [], |r| r.get(0)).unwrap_or_default();
        assert!(!v.trim().is_empty(), "SQLCipher non attivo (cipher_version vuota)");
    }

    #[test]
    fn spaces_manual_assign_and_smart_resolve() {
        let db = Db::in_memory().unwrap();
        let (a, _) = db.insert_text("text", "hello spaces", "firefox", "", "sp1", false, None, None).unwrap();
        let (b, _) = db.insert_text("link", "https://example.com/video.mp4", "firefox", "", "sp2", false, None, None).unwrap();
        // Manuale: crea, assegna, lista, unassign, delete.
        let manual = db.create_space("Lavoro", Some("💼"), None, false).unwrap();
        assert!(!manual.is_smart);
        db.assign_space(&a.id, &manual.id, true).unwrap();
        let clips = db.space_clips(&manual.id, 10).unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].id, a.id);
        db.assign_space(&a.id, &manual.id, false).unwrap();
        assert!(db.space_clips(&manual.id, 10).unwrap().is_empty());
        // nome non valido / clip mancante
        assert!(db.create_space("  ", None, None, false).is_err());
        assert!(db.assign_space("missing", &manual.id, true).is_err());
        // Smart: query_json su kind=link risolve senza assign.
        let smart = db.create_space("Video", Some("🎬"), Some(r#"{"kind":"link","search":"example"}"#), true).unwrap();
        assert!(smart.is_smart);
        // assign su smart deve fallire
        assert!(db.assign_space(&b.id, &smart.id, true).is_err());
        let got = db.space_clips(&smart.id, 10).unwrap();
        assert!(got.iter().any(|c| c.id == b.id));
        assert!(!got.iter().any(|c| c.id == a.id));
        // query non valida rifiutata
        assert!(db.create_space("Bad", None, Some("non-json"), true).is_err());
        // list_spaces con count
        db.assign_space(&b.id, &manual.id, true).unwrap();
        let all = db.list_spaces().unwrap();
        assert!(all.iter().any(|s| s.name == "Lavoro" && s.count == 1));
        assert!(all.iter().any(|s| s.name == "Video" && s.count >= 1));
        // delete pulisce le join
        db.delete(&b.id).unwrap();
        assert!(db.space_clips(&manual.id, 10).unwrap().is_empty());
        db.delete_space(&manual.id).unwrap();
        assert!(db.list_spaces().unwrap().iter().all(|s| s.id != manual.id));
    }
}
