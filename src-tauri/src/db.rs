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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: i64,
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

impl Db {
    pub fn open() -> SqlResult<Self> {
        let path = data_dir().join("clips.db");
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
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
            if newest.as_ref() == Some(&existing.id) {
                return Ok((self.get(&existing.id)?.unwrap(), false));
            }
            self.conn.execute(
                "UPDATE clips SET copy_count = copy_count + 1, created_at = ?1 WHERE id = ?2",
                params![Utc::now().to_rfc3339(), existing.id],
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
        self.conn.execute("DELETE FROM clips WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn clear(&self) -> SqlResult<()> {
        self.conn.execute("DELETE FROM clip_categories", [])?;
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
             AND id NOT IN (SELECT clip_id FROM clip_flags WHERE is_pinned=1)",
            params![cutoff],
        )?;
        Ok(n)
    }
}
