use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::Manager;

struct StoreState {
    database: PathBuf,
    documents: PathBuf,
}

fn connection(state: &StoreState) -> Result<Connection, String> {
    Connection::open(&state.database).map_err(|error| error.to_string())
}

fn initialise_store(state: &StoreState) -> Result<(), String> {
    fs::create_dir_all(&state.documents).map_err(|error| error.to_string())?;
    let db = connection(state)?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            metadata TEXT NOT NULL,
            blob_mime TEXT NOT NULL,
            thumb_mime TEXT,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );",
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn safe_id(id: &str) -> Result<&str, String> {
    if !id.is_empty()
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        Ok(id)
    } else {
        Err("identifiant de document invalide".into())
    }
}

fn decode_data_url(value: &Value) -> Result<(String, Vec<u8>), String> {
    let mime = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("application/octet-stream")
        .to_string();
    let data_url = value
        .get("dataUrl")
        .and_then(Value::as_str)
        .ok_or("contenu de fichier absent")?;
    let encoded = data_url
        .split_once(',')
        .map(|(_, data)| data)
        .ok_or("contenu de fichier invalide")?;
    let bytes = BASE64.decode(encoded).map_err(|error| error.to_string())?;
    Ok((mime, bytes))
}

fn encode_data_url(mime: &str, bytes: &[u8]) -> Value {
    serde_json::json!({
        "type": mime,
        "dataUrl": format!("data:{};base64,{}", mime, BASE64.encode(bytes))
    })
}

#[tauri::command]
fn save_snapshot(state: tauri::State<'_, StoreState>, contents: String) -> Result<(), String> {
    let db = connection(&state)?;
    db.execute(
        "INSERT INTO settings(key, value, updated_at) VALUES('application', ?1, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=unixepoch()",
        params![contents],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_snapshot(state: tauri::State<'_, StoreState>) -> Result<Option<String>, String> {
    let db = connection(&state)?;
    let mut query = db
        .prepare("SELECT value FROM settings WHERE key='application'")
        .map_err(|error| error.to_string())?;
    match query.query_row([], |row| row.get(0)) {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn put_document(state: tauri::State<'_, StoreState>, item: String) -> Result<(), String> {
    let mut value: Value = serde_json::from_str(&item).map_err(|error| error.to_string())?;
    let id = safe_id(
        value
            .get("id")
            .and_then(Value::as_str)
            .ok_or("identifiant absent")?,
    )?
    .to_string();
    let blob_value = value
        .as_object_mut()
        .and_then(|object| object.remove("blob"))
        .ok_or("fichier absent")?;
    let thumb_value = value
        .as_object_mut()
        .and_then(|object| object.remove("thumb"));
    let (blob_mime, blob) = decode_data_url(&blob_value)?;
    let (thumb_mime, thumb) = match thumb_value {
        Some(value) if !value.is_null() => {
            let (mime, bytes) = decode_data_url(&value)?;
            (Some(mime), Some(bytes))
        }
        _ => (None, None),
    };

    fs::write(state.documents.join(format!("{id}.bin")), blob)
        .map_err(|error| error.to_string())?;
    let thumb_path = state.documents.join(format!("{id}.thumb"));
    if let Some(bytes) = thumb {
        fs::write(&thumb_path, bytes).map_err(|error| error.to_string())?;
    } else if thumb_path.exists() {
        fs::remove_file(&thumb_path).map_err(|error| error.to_string())?;
    }

    let db = connection(&state)?;
    db.execute(
        "INSERT INTO documents(id, metadata, blob_mime, thumb_mime, updated_at)
         VALUES(?1, ?2, ?3, ?4, unixepoch())
         ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata, blob_mime=excluded.blob_mime,
         thumb_mime=excluded.thumb_mime, updated_at=unixepoch()",
        params![id, value.to_string(), blob_mime, thumb_mime],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_documents(state: tauri::State<'_, StoreState>) -> Result<String, String> {
    let db = connection(&state)?;
    let mut query = db
        .prepare(
            "SELECT id, metadata, blob_mime, thumb_mime FROM documents ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = query
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut documents = Vec::new();
    for row in rows {
        let (id, metadata, blob_mime, thumb_mime) = row.map_err(|error| error.to_string())?;
        let mut value: Value =
            serde_json::from_str(&metadata).map_err(|error| error.to_string())?;
        let blob = fs::read(state.documents.join(format!("{id}.bin")))
            .map_err(|error| error.to_string())?;
        value["blob"] = encode_data_url(&blob_mime, &blob);
        if let Some(mime) = thumb_mime {
            let bytes = fs::read(state.documents.join(format!("{id}.thumb")))
                .map_err(|error| error.to_string())?;
            value["thumb"] = encode_data_url(&mime, &bytes);
        } else {
            value["thumb"] = Value::Null;
        }
        documents.push(value);
    }
    serde_json::to_string(&documents).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_document(state: tauri::State<'_, StoreState>, id: String) -> Result<(), String> {
    let id = safe_id(&id)?;
    let db = connection(&state)?;
    db.execute("DELETE FROM documents WHERE id=?1", params![id])
        .map_err(|error| error.to_string())?;
    for suffix in ["bin", "thumb"] {
        let path = state.documents.join(format!("{id}.{suffix}"));
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn clear_documents(state: tauri::State<'_, StoreState>) -> Result<(), String> {
    let db = connection(&state)?;
    db.execute("DELETE FROM documents", [])
        .map_err(|error| error.to_string())?;
    if state.documents.exists() {
        for entry in fs::read_dir(&state.documents).map_err(|error| error.to_string())? {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.is_file() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn export_backup(contents: String) -> Result<Option<String>, String> {
    let destination = rfd::FileDialog::new()
        .set_title("Sauvegarder toutes les données IA4-NEURO")
        .set_file_name("sauvegarde-ia4-neuro.json")
        .add_filter("Sauvegarde IA4-NEURO", &["json"])
        .save_file();

    let Some(path) = destination else {
        return Ok(None);
    };
    fs::write(&path, contents).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn import_backup() -> Result<Option<String>, String> {
    let source = rfd::FileDialog::new()
        .set_title("Restaurer une sauvegarde IA4-NEURO")
        .add_filter("Sauvegarde IA4-NEURO", &["json"])
        .pick_file();

    let Some(path) = source else { return Ok(None) };
    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let application_data = app.path().app_data_dir()?;
            let state = StoreState {
                database: application_data.join("ia4-neuro.sqlite3"),
                documents: application_data.join("documents"),
            };
            initialise_store(&state).map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            export_backup,
            import_backup,
            save_snapshot,
            load_snapshot,
            put_document,
            list_documents,
            delete_document,
            clear_documents
        ])
        .run(tauri::generate_context!())
        .expect("impossible de lancer IA4-NEURO");
}
